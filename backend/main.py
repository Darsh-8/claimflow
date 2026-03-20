import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import engine, Base, SessionLocal
from api.routes import claims as claims_router
from api.routes import auth as auth_router
from api.routes import users as users_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created")

    # Seed Test Users
    from model.models import User, UserRole
    from utils.security import get_password_hash
    with SessionLocal() as db:
        # Ensure all required demo accounts are seeded
        demo_accounts = [
            {"username": "demo_hospital", "password": "password123", "role": UserRole.HOSPITAL},
            {"username": "demo_hospital_2", "password": "password123", "role": UserRole.HOSPITAL},
            {"username": "demo_insurer", "password": "password123", "role": UserRole.INSURER},
            {"username": "demo_insurer_2", "password": "password123", "role": UserRole.INSURER},
        ]

        added_any = False
        for account in demo_accounts:
            if not db.query(User).filter_by(username=account["username"]).first():
                db.add(User(
                    username=account["username"],
                    hashed_password=get_password_hash(account["password"]),
                    role=account["role"]
                ))
                added_any = True
        
        if added_any:
            db.commit()
            logger.info("Admin/Test Users seeded successfully")

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
