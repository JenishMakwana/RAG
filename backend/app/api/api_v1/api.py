from fastapi import APIRouter
from .endpoints import auth, documents, chat
from ...services.voice_service import voice_service

api_router = APIRouter()
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])

# Voice router (matching legacy structure)
api_router.include_router(voice_service.create_voice_router() if hasattr(voice_service, 'create_voice_router') else None)
