import os
from pydantic_settings import BaseSettings
from pydantic import field_validator
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = "Legal Case Law RAG"
    
    # Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "legal-rag-secret-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440 # 24 hours
    
    # RAG Search
    SEARCH_K: int = int(os.getenv("SEARCH_K", 40))
    FETCH_K: int = int(os.getenv("FETCH_K", 100))
    RERANK_TOP_K: int = int(os.getenv("RERANK_TOP_K", 15))
    
    # Models
    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "law-ai/InLegalBERT")
    RERANKER_MODEL_NAME: str = os.getenv("RERANKER_MODEL_NAME", "BAAI/bge-reranker-v2-m3")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # LLM Settings
    ACTIVE_LLM: str = os.getenv("ACTIVE_LLM", "groq").lower()
    LLM_MODEL_NAME: str = os.getenv("LLM_MODEL_NAME", "gemini-2.5-flash")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", 0.0))
    LLM_MAX_RETRIES: int = int(os.getenv("LLM_MAX_RETRIES", 5))
    
    # Groq
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL_NAME: str = os.getenv("GROQ_MODEL_NAME", "llama-3.1-8b-instant")
    
    # Database
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    SQLITE_DB_PATH: str = os.path.join(BASE_DIR, "data", "users.db")
    
    USE_POSTGRES: bool = os.getenv("USE_POSTGRES", "false").lower() == "true"
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "password")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "localhost")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "legal_rag")

    @property
    def DATABASE_URL(self) -> str:
        if self.USE_POSTGRES:
            return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        return f"sqlite:///{self.SQLITE_DB_PATH}"

    QDRANT_PATH: str = "qdrant_storage"
    COLLECTION_NAME: str = "legal_rag"
    
    # Chunking
    PARENT_CHUNK_SIZE: int = int(os.getenv("PARENT_CHUNK_SIZE", 1500))
    PARENT_CHUNK_OVERLAP: int = int(os.getenv("PARENT_CHUNK_OVERLAP", 200))
    CHILD_CHUNK_SIZE: int = int(os.getenv("CHILD_CHUNK_SIZE", 400))
    CHILD_CHUNK_OVERLAP: int = int(os.getenv("CHILD_CHUNK_OVERLAP", 100))
    
    @field_validator("SECRET_KEY")
    @classmethod
    def check_secret_key(cls, v: str) -> str:
        if v == "legal-rag-secret-2026" or len(v) < 32:
            import sys
            print(
                "\n⚠️  [SECURITY WARNING] INSECURE SECRET_KEY DETECTED!\n"
                f"Current SECRET_KEY is either the default template value or too short ({len(v)} chars).\n"
                "For production, please generate a secure 32-character hex key using:\n"
                "  python -c \"import secrets; print(secrets.token_hex(32))\"\n"
                "and set it as SECRET_KEY in your .env file.\n",
                file=sys.stderr
            )
        return v
    
    class Config:
        case_sensitive = True

settings = Settings()
