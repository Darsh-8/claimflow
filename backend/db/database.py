from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from config.config import settings


import threading

# SQLite needs connect_args for check_same_thread
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}


class DatabaseManager:
    """Singleton Database Manager for ClaimFlow."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(DatabaseManager, cls).__new__(cls)
                cls._instance._initialize()
            return cls._instance

    def _initialize(self):
        """Initialize the SQLAlchemy engine and session factory."""
        self.engine = create_engine(
            settings.DATABASE_URL, connect_args=connect_args)
        self.SessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=self.engine)

    def get_session(self):
        """Get a new database session."""
        return self.SessionLocal()

    def get_engine(self):
        """Get the database engine."""
        return self.engine


# Backwards compatibility endpoints for existing imports (until fully refactored)
_db_manager = DatabaseManager()
engine = _db_manager.get_engine()
SessionLocal = _db_manager.SessionLocal


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency for injecting database sessions."""
    db = DatabaseManager().get_session()
    try:
        yield db
    finally:
        db.close()
