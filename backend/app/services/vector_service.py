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


def process_and_store_pdf(db: Session, organization_id: int, file_path: str, title: str):
    """
    Extracts text from a large PDF, breaks it into chunks,
    generates embeddings, and saves them securely tied to the organization.
    """
    reader = PdfReader(file_path)
    full_text = ""
    for page in reader.pages:
        text = page.extract_text()
        if text:
            full_text += text + "\n"

    # Simple chunking strategy (e.g., 1000 characters per chunk with overlap)
    chunk_size = 1000
    overlap = 200
    chunks = []

    for i in range(0, len(full_text), chunk_size - overlap):
        chunk_text = full_text[i:i + chunk_size]
        if len(chunk_text.strip()) > 50: # Ignore tiny fragments
            chunks.append(chunk_text.strip())

    # Generate embeddings in batches and save chunks
    for start in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
        batch = chunks[start:start + EMBEDDING_BATCH_SIZE]
        embeddings = _embed(batch, task_type="RETRIEVAL_DOCUMENT")

        for offset, (chunk_content, vector_embedding) in enumerate(zip(batch, embeddings)):
            db.add(KnowledgeChunk(
                organization_id=organization_id,
                title=f"{title} - Part {start + offset + 1}",
                content=chunk_content,
                embedding=vector_embedding
            ))

    db.commit()

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
