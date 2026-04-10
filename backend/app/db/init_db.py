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

def init_sqlite():
    Base.metadata.create_all(bind=engine)

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

def get_vector_store(embeddings):
    return QdrantVectorStore(
        client=q_client,
        collection_name=COLLECTION_NAME,
        embedding=embeddings,
    )
