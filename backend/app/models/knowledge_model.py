from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from datetime import datetime, timezone
from app.database import Base

class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=True)  # Relative to KNOWLEDGE_STORAGE_PATH; null for uploads made before files were kept
    file_size = Column(Integer, nullable=True)
    sha256 = Column(String(64), nullable=True, index=True)  # Same file uploaded twice is rejected
    page_count = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="processing", server_default="processing")  # processing, ready, failed
    error = Column(Text, nullable=True)
    chunk_count = Column(Integer, nullable=False, default=0, server_default="0")
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    processing_started_at = Column(DateTime(timezone=True), nullable=True)  # Upload or Retry time; the sweeper re-queues documents stuck too long
    processed_at = Column(DateTime(timezone=True), nullable=True)

    chunks = relationship("KnowledgeChunk", back_populates="document", cascade="all, delete-orphan", passive_deletes=True)

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    document_id = Column(Integer, ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True, nullable=True)
    title = Column(String(255))
    content = Column(Text, nullable=False)
    # Vector column with dimension size matching Gemini embedding model (e.g., 768)
    embedding = Column(Vector(768), nullable=True) 
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    document = relationship("KnowledgeDocument", back_populates="chunks")
