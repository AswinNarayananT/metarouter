import os
from datetime import datetime, timezone
import httpx
from google.genai import errors as genai_errors
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.config import settings
from app.core.redis_client import redis_client
from app.models.ai_chat import KnowledgeDocument, KnowledgeChunk
from app.services.vector_service import extract_pdf_pages, chunk_pages, embed_documents, KnowledgeDocumentError

RETRY_BASE_SECONDS = 30
RETRY_MARKER_GRACE_SECONDS = 120
LOCK_SECONDS = 900  # Longer than processing a 10 MB PDF; released as soon as the task finishes
NO_TEXT_ERROR = "No readable text found — this looks like a scanned PDF. Upload a PDF with selectable text."


def knowledge_retry_marker_key(document_id: int) -> str:
    return f"kb:retry:{document_id}"


def _is_retryable(exc: Exception) -> bool:
    # Gemini overloaded / rate limited, or the network dropped: try again later
    if isinstance(exc, genai_errors.ServerError) or isinstance(exc, httpx.TransportError):
        return True
    return isinstance(exc, genai_errors.APIError) and exc.code == 429


@celery_app.task(name="process_knowledge_document_task", bind=True, max_retries=3)
def process_knowledge_document_task(self, document_id: int):
    db = SessionLocal()
    lock_key = f"kb:lock:{document_id}"
    locked = False
    try:
        # 1. Only a document still processing continues (a rerun or duplicate task does nothing)
        document = db.query(KnowledgeDocument).filter(KnowledgeDocument.id == document_id).first()
        if not document or document.status != "processing":
            return

        # Only one worker processes a document at a time (the sweeper may queue it again)
        locked = bool(redis_client.set(lock_key, 1, nx=True, ex=LOCK_SECONDS))
        if not locked:
            return

        if not document.storage_path:
            _mark_failed(db, document, "The PDF file is no longer stored. Upload it again.")
            return

        # 2. Read the pages and cut them into chunks
        try:
            pages = extract_pdf_pages(os.path.join(settings.KNOWLEDGE_STORAGE_PATH, document.storage_path))
        except KnowledgeDocumentError as exc:
            _mark_failed(db, document, str(exc))
            return
        except FileNotFoundError:
            _mark_failed(db, document, "The PDF file is no longer stored. Upload it again.")
            return

        chunks = chunk_pages(pages, settings.KNOWLEDGE_CHUNK_SIZE, settings.KNOWLEDGE_CHUNK_OVERLAP)
        if not chunks:
            document.page_count = len(pages)
            _mark_failed(db, document, NO_TEXT_ERROR)
            return

        # 3. Embed with Gemini (temporary errors retry 30s, 60s, 120s)
        try:
            embeddings = embed_documents([c["content"] for c in chunks])
        except Exception as exc:
            if _is_retryable(exc) and self.request.retries < self.max_retries:
                countdown = RETRY_BASE_SECONDS * 2 ** self.request.retries
                # Tell the stuck-document sweeper a retry is already scheduled
                redis_client.set(knowledge_retry_marker_key(document.id), 1, ex=countdown + RETRY_MARKER_GRACE_SECONDS)
                raise self.retry(exc=exc, countdown=countdown)
            _mark_failed(db, document, f"Could not create the AI index for this PDF: {exc}")
            return

        # 4. Replace the document's chunks in one transaction, so the AI never sees half a document
        db.query(KnowledgeChunk).filter(KnowledgeChunk.document_id == document.id).delete()
        for chunk, embedding in zip(chunks, embeddings):
            db.add(KnowledgeChunk(
                organization_id=document.organization_id,
                document_id=document.id,
                title=f"{document.file_name} · page {chunk['page']}",
                content=chunk["content"],
                embedding=embedding
            ))

        document.status = "ready"
        document.error = None
        document.page_count = len(pages)
        document.chunk_count = len(chunks)
        document.processed_at = datetime.now(timezone.utc)
        db.commit()
        redis_client.delete(knowledge_retry_marker_key(document.id))
        print(f"[KNOWLEDGE] document={document.id} ready: {len(pages)} pages, {len(chunks)} chunks")

    finally:
        # Release the lock so a scheduled retry can run
        if locked:
            redis_client.delete(lock_key)
        db.close()


def _mark_failed(db, document: KnowledgeDocument, error: str):
    document.status = "failed"
    document.error = error
    document.processed_at = datetime.now(timezone.utc)
    db.commit()
    redis_client.delete(knowledge_retry_marker_key(document.id))
    print(f"[KNOWLEDGE FAILED] document={document.id}: {error}")
