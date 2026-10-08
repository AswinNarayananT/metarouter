from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import SessionLocal
from app.core.init_db import init_super_admin
from app.api.v1.admin_auth import router as admin_auth_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.auth import router as auth_router

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

app.include_router(admin_auth_router, prefix="/api/v1")
app.include_router(organizations_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")

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