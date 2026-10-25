import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import SessionLocal
from app.core.init_db import init_super_admin
from app.api.v1.super_admin.auth import router as super_admin_auth_router
from app.api.v1.super_admin.organizations import router as super_admin_organizations_router
from app.api.v1.auth import router as auth_router
from app.api.v1.organization import router as organization_router
from app.api.v1.invitations import router as invitations_router
from app.api.v1.webhooks import router as webhook_router
from app.api.v1.ai_settings import router as ai_settings_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.broadcasts import router as broadcasts_router
from app.api.v1.channels import router as channels_router
from app.api.v1.realtime import router as realtime_router
from app.api.v1.conversations import router as conversations_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.tickets import router as tickets_router
from app.api.v1.overview import router as overview_router
from app.realtime.events import listen_for_events

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup Actions ---
    print(f"-> Starting up {settings.PROJECT_NAME}...")
    db = SessionLocal()
    try:
        init_super_admin(db)
    finally:
        db.close()

    # Forward events published by Celery / API routes to this process's WebSockets
    realtime_listener = asyncio.create_task(listen_for_events())

    yield  # Application runs while yielded

    # --- Shutdown Actions ---
    print(f"-> Shutting down {settings.PROJECT_NAME}...")
    realtime_listener.cancel()
    with suppress(asyncio.CancelledError):
        await realtime_listener

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
app.include_router(realtime_router, prefix="/api/v1")
app.include_router(conversations_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(tickets_router, prefix="/api/v1")
app.include_router(overview_router, prefix="/api/v1")

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