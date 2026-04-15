from contextlib import asynccontextmanager

from logger import get_app_logger

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.database import engine, Base, SessionLocal
from routes import claims as claims_router
from routes import auth as auth_router
from routes import users as users_router
from routes import notifications as notifications_router
from routes import hms as hms_router
from middleware.logging_middleware import RequestLoggingMiddleware

# Bootstrap the application logger (singleton — safe to call multiple times)
logger = get_app_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    # Seed Test Users
    from config.seed import seed_demo_accounts
    seed_demo_accounts()

    yield
    logger.info("Shutting down")


app = FastAPI(
    title="ClaimFlow — Document Processing Engine",
    description="MVP system for ingesting, extracting, and validating hospital claim documents.",
    version="1.0.0",
    lifespan=lifespan,
)

# Add request logging middleware
app.add_middleware(RequestLoggingMiddleware)

# CORS — allow frontend dev server (MUST be added last so it's the outermost middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router.router)
app.include_router(claims_router.router)
app.include_router(users_router.router)
app.include_router(notifications_router.router)
app.include_router(hms_router.router)


@app.get("/")
def root():
    return {
        "service": "ClaimFlow Document Processing Engine",
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
