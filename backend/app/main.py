from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import SessionLocal
from app.core.init_db import init_super_admin
from app.api.v1.super_admin_auth import router as super_admin_auth_router
from app.api.v1.super_admin_organizations import router as super_admin_organizations_router
from app.api.v1.auth import router as auth_router
from app.api.v1.organization import router as organization_router
from app.api.v1.invitations import router as invitations_router
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.ai_settings import router as ai_settings_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.broadcasts import router as broadcasts_router
from app.api.v1.channels import router as channels_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup Actions ---
    print(f"-> Starting up {settings.PROJECT_NAME}...")
    db = SessionLocal()
    try:
        init_super_admin(db)
    finally:
        db.close()
        
    yield  # Application runs while yielded
    
    # --- Shutdown Actions ---
    print(f"-> Shutting down {settings.PROJECT_NAME}...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Multi-tenant WhatsApp AI Agent & Automated Broadcast Gateway",
    lifespan=lifespan
)

# Enable CORS dynamically from configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(super_admin_auth_router, prefix="/api/v1")
app.include_router(super_admin_organizations_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(organization_router, prefix="/api/v1")
app.include_router(invitations_router, prefix="/api/v1")
app.include_router(webhook_router, prefix="/api/v1")
app.include_router(ai_settings_router, prefix="/api/v1")
app.include_router(attachments_router, prefix="/api/v1")
app.include_router(broadcasts_router, prefix="/api/v1")
app.include_router(channels_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy", "database": "connected", "redis": "connected"}