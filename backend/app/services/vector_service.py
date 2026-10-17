import re
from typing import List
from pypdf import PdfReader
from sqlalchemy.orm import Session
from google import genai
from google.genai import types
from app.config import settings
from app.models.ai_chat import KnowledgeChunk

client = genai.Client(api_key=settings.GOOGLE_API_KEY)

# Max texts sent per embedding request
EMBEDDING_BATCH_SIZE = 100


def _embed(texts: List[str], task_type: str) -> List[List[float]]:
    """Embeds texts with the configured Gemini model, sized to fit the pgvector column."""
    response = client.models.embed_content(
        model=settings.GEMINI_EMBEDDING_MODEL,
        contents=texts,
        config=types.EmbedContentConfig(
            task_type=task_type,
            output_dimensionality=settings.EMBEDDING_DIMENSIONS,
        ),
    )
    return [e.values for e in response.embeddings]


class KnowledgeDocumentError(Exception):
    pass


# Natural places to end a chunk, best first
CHUNK_SEPARATORS = ["\n\n", "\n", ". ", " "]
MIN_CHUNK_CHARS = 50  # Smaller fragments (page numbers, headers) aren't worth embedding


def extract_pdf_pages(file_path: str) -> List[str]:
    # 1. Open the PDF (encrypted or broken files can't be read)
    try:
        reader = PdfReader(file_path)
        if reader.is_encrypted:
            raise KnowledgeDocumentError("This PDF is password protected. Upload a copy without a password.")
        pages = [page.extract_text() or "" for page in reader.pages]
    except KnowledgeDocumentError:
        raise
    except Exception as exc:
        raise KnowledgeDocumentError(f"The PDF could not be read: {exc}")

    # 2. Tidy the text: trailing spaces and long runs of blank lines
    cleaned = []
    for text in pages:
        lines = [line.rstrip() for line in text.splitlines()]
        cleaned.append(re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip())
    return cleaned


def chunk_pages(pages: List[str], chunk_size: int, overlap: int) -> List[dict]:
    chunks = []
    for page_number, text in enumerate(pages, start=1):
        for content in _chunk_text(text, chunk_size, overlap):
            if len(content) >= MIN_CHUNK_CHARS:
                chunks.append({"page": page_number, "content": content})
    return chunks


def _chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # 1. End at a paragraph, line, sentence or word break in the second half of the window
        if end < len(text):
            for separator in CHUNK_SEPARATORS:
                index = text.rfind(separator, start + chunk_size // 2, end)
                if index != -1:
                    end = index + len(separator)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break

        # 2. Next chunk repeats the last `overlap` characters, starting on a whole word
        next_start = max(end - overlap, start + 1)
        space = text.find(" ", next_start, end)
        start = space + 1 if space != -1 else next_start

    return chunks


def embed_documents(texts: List[str]) -> List[List[float]]:
    embeddings = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        embeddings.extend(_embed(texts[start:start + EMBEDDING_BATCH_SIZE], task_type="RETRIEVAL_DOCUMENT"))
    return embeddings


def search_tenant_knowledge(db: Session, organization_id: int, query_text: str, limit: int = 3) -> str:
    """
    Performs lightning-fast vector similarity search strictly scoped to the tenant using pgvector.
    """
    # 1. Embed incoming user question
    query_vector = _embed([query_text], task_type="RETRIEVAL_QUERY")[0]

    # 2. Query DB using pgvector cosine distance operator (<=>) strictly filtered by organization_id
    results = db.query(KnowledgeChunk).filter(
        KnowledgeChunk.organization_id == organization_id
    ).order_by(
        KnowledgeChunk.embedding.cosine_distance(query_vector)
    ).limit(limit).all()

    if not results:
        return "No specific document context found."

    return "\n\n".join([f"Source ({r.title}): {r.content}" for r in results])
