import os
import logging
from config.database import SessionLocal
from models.models import User, UserRole
from utils.security import get_password_hash

logger = logging.getLogger(__name__)

def seed_demo_accounts():
    """Seed the database with default demo hospital and insurer accounts if they don't exist."""
    # Passwords are read from environment variables — never hardcoded
    default_pw = os.environ.get("SEED_DEFAULT_PASSWORD", "changeme_in_production")
    admin_pw   = os.environ.get("SEED_ADMIN_PASSWORD",   "changeme_in_production")

    with SessionLocal() as db:
        demo_accounts = [
            {"username": "demo_hospital",   "password": default_pw, "role": UserRole.HOSPITAL},
            {"username": "demo_hospital_2", "password": default_pw, "role": UserRole.HOSPITAL},
            {"username": "demo_insurer",    "password": default_pw, "role": UserRole.INSURER},
            {"username": "demo_insurer_2",  "password": default_pw, "role": UserRole.INSURER},
            {"username": "admin",           "password": admin_pw,   "role": UserRole.ADMIN},
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
