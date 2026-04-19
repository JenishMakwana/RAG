from qdrant_client.http import models as rest
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from .session import engine
from .base_class import Base
from ..core.config import settings
# Import all models to ensure they are registered with Base
from ..models.user import User
from ..models.document import Document
from ..models.chat import ChatSession, ChatMessage
import sqlalchemy as sa
import datetime

def safe_migrate():
    """Add new columns to existing tables without destroying data."""
    with engine.connect() as conn:
        inspector = sa.inspect(engine)
        
        # Documents migration
        existing_doc_cols = [c['name'] for c in inspector.get_columns('documents')]
        if 'chunk_count' not in existing_doc_cols:
            conn.execute(sa.text("ALTER TABLE documents ADD COLUMN chunk_count INTEGER"))
        if 'embed_time_seconds' not in existing_doc_cols:
            conn.execute(sa.text("ALTER TABLE documents ADD COLUMN embed_time_seconds REAL"))
            
        # Users migration
        existing_user_cols = [c['name'] for c in inspector.get_columns('users')]
        if 'is_active' not in existing_user_cols:
            conn.execute(sa.text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        if 'email' not in existing_user_cols:
            conn.execute(sa.text("ALTER TABLE users ADD COLUMN email TEXT UNIQUE"))
            
        conn.commit()

def init_sqlite():
    Base.metadata.create_all(bind=engine)
    try:
        safe_migrate()
    except Exception as e:
        print(f"Migration note: {e}")

def get_qdrant_client():
    if settings.QDRANT_PATH == ":memory:":
         return QdrantClient(":memory:")
    return QdrantClient(path=settings.QDRANT_PATH)

q_client = get_qdrant_client()

COLLECTION_NAME = settings.COLLECTION_NAME

def init_qdrant():
    global q_client
    if not q_client.collection_exists(COLLECTION_NAME):
        q_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=rest.VectorParams(size=768, distance=rest.Distance.COSINE),
        )
    
    # Run a lightweight backfill check for older documents
    try:
        backfill_missing_metadata()
    except Exception as e:
        print(f"Backfill error: {e}")

def backfill_missing_metadata():
    """Detects documents with missing total_pages/timestamp and repairs them."""
    global q_client
    offset = None
    doc_stats = {} # filename -> max_page
    points_to_fix = []
    
    # 1. Scan for missing data
    while True:
        res, offset = q_client.scroll(
            collection_name=COLLECTION_NAME,
            limit=100,
            offset=offset,
            with_payload=True,
            with_vectors=False
        )
        for p in res:
            meta = p.payload.get("metadata", {})
            fname = meta.get("filename")
            page = meta.get("page")
            if fname:
                if fname not in doc_stats: doc_stats[fname] = 0
                if page and isinstance(page, int) and page > doc_stats[fname]:
                    doc_stats[fname] = page
                
                if "total_pages" not in meta or "ingestion_timestamp" not in meta:
                    points_to_fix.append(p)
        if offset is None: break

    if not points_to_fix:
        return

    print(f"Repairing metadata for {len(points_to_fix)} chunks...")
    now = datetime.datetime.now().isoformat()
    for p in points_to_fix:
        meta = p.payload.get("metadata", {}).copy()
        fname = meta.get("filename")
        if "total_pages" not in meta:
            meta["total_pages"] = doc_stats.get(fname, meta.get("page", 1))
        if "ingestion_timestamp" not in meta:
            meta["ingestion_timestamp"] = now
            
        q_client.set_payload(
            collection_name=COLLECTION_NAME,
            payload={"metadata": meta},
            points=[p.id]
        )

def get_vector_store(embeddings):
    return QdrantVectorStore(
        client=q_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,
    )
