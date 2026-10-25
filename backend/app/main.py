import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.database import engine, Base
from app.seed import seed_database
from app.services.sla_engine import SLAEngine
from app.services.storage_service import StorageService

# Routers
from app.routers import (
    auth, patient, tickets, evidence, ai_verify,
    departments, rooms, sla, analytics, audit, staff, system, google_reviews, nps, emails, notifications
)
from app.migrations import run_migrations

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("careops.main")

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

async def sla_background_worker():
    """Background persistent worker that scans tickets and triggers SLA escalation & reminders"""
    logger.info("CareOps Persistent SLA Engine initialized.")
    while True:
        try:
            await asyncio.to_thread(SLAEngine.run_sla_check_cycle)
        except Exception as e:
            logger.error(f"SLA background monitor exception: {e}")
        await asyncio.sleep(settings.SLA_CHECK_INTERVAL_SECONDS)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure tables exist, apply schema migrations & seed DB if fresh
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        logger.warning(f"Base.metadata.create_all notice: {e}")
    try:
        run_migrations()
        logger.info("Database migrations executed successfully.")
    except Exception as e:
        logger.error(f"Database migrations error: {e}", exc_info=True)
    try:
        seed_database()
        logger.info("Database seeding checked/executed successfully.")
    except Exception as e:
        logger.error(f"Auto-seeding error: {e}", exc_info=True)
        
    # Start persistent SLA ticker
    worker_task = asyncio.create_task(sla_background_worker())
    yield
    # Shutdown
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("CareOps backend shutdown cleanly.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Enterprise AI-Powered Hospital Service Request, SLA Monitoring & Verification Platform",
    docs_url="/docs" if settings.DEBUG_MODE else None,
    redoc_url="/redoc" if settings.DEBUG_MODE else None,
    openapi_url="/openapi.json" if settings.DEBUG_MODE else None,
    lifespan=lifespan
)

# Attach rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middlewares
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3}|.*\.vercel\.app|.*\.onrender\.com|.*\.railway\.app)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Safe file access endpoint with path traversal prevention
@app.get("/uploads/{file_path:path}")
async def serve_upload(file_path: str):
    # Sanitize: prevent directory traversal
    clean_parts = [p for p in Path(file_path).parts if p not in ("..", ".", "/", "\\")]
    if not clean_parts:
        raise HTTPException(status_code=400, detail="Invalid file path")
    
    target_path = Path(settings.UPLOAD_DIR).joinpath(*clean_parts).resolve()
    base_dir = Path(settings.UPLOAD_DIR).resolve()
    
    # Enforce directory containment
    if not str(target_path).startswith(str(base_dir)):
        raise HTTPException(status_code=403, detail="Forbidden file access")
    if not target_path.is_file() or not target_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(target_path)

# Include Routers under API_V1_STR
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(patient.router, prefix=settings.API_V1_STR)
app.include_router(tickets.router, prefix=settings.API_V1_STR)
app.include_router(evidence.router, prefix=settings.API_V1_STR)
app.include_router(ai_verify.router, prefix=settings.API_V1_STR)
app.include_router(departments.router, prefix=settings.API_V1_STR)
app.include_router(rooms.router, prefix=settings.API_V1_STR)
app.include_router(sla.router, prefix=settings.API_V1_STR)
app.include_router(analytics.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(staff.router, prefix=settings.API_V1_STR)
app.include_router(system.router, prefix=settings.API_V1_STR)
app.include_router(google_reviews.router, prefix=settings.API_V1_STR)
app.include_router(google_reviews.integrations_router, prefix=settings.API_V1_STR)
app.include_router(nps.router, prefix=settings.API_V1_STR)
app.include_router(emails.router, prefix=settings.API_V1_STR)
app.include_router(notifications.router, prefix=settings.API_V1_STR)

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CareOps AI Backend",
        "version": settings.VERSION,
        "engine": "FastAPI + SQLAlchemy + Asyncio SLA Engine + Computer Vision Analyzer"
    }

