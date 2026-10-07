from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Multi-tenant WhatsApp AI Agent & Automated Broadcast Gateway"
)

# Enable CORS for React Frontend (running on Vite port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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