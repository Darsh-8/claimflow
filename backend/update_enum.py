from sqlalchemy import text
from config.database import engine

def main():
    with engine.connect() as conn:
        conn.execute(text("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ADMIN'"))
        conn.commit()
    print("Migration successful")

if __name__ == "__main__":
    main()
