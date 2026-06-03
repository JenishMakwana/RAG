import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from ..core.config import settings

SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Ensure data directory exists for SQLite
if not settings.USE_POSTGRES:
    os_path = os.path.dirname(settings.SQLITE_DB_PATH)
    if os_path and not os.path.exists(os_path):
        os.makedirs(os_path, exist_ok=True)

connect_args = {"check_same_thread": False} if not settings.USE_POSTGRES else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
