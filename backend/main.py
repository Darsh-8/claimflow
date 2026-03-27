import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine, Base, SessionLocal
from api.routes import claims as claims_router
from api.routes import auth as auth_router
from api.routes import users as users_router
from api.routes import notifications as notifications_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    # Seed Test Users
    from db.seed import seed_demo_accounts
    seed_demo_accounts()

    yield
    logger.info("Shutting down")


app = FastAPI(
    title="ClaimFlow — Document Processing Engine",
    description="MVP system for ingesting, extracting, and validating hospital claim documents.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
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
