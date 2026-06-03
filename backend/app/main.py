from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api.api_v1.api import api_router
from .core.config import settings
from .db.init_db import init_db, init_qdrant
import uvicorn
import threading
from .services.model_manager import speech_model_manager

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    init_db()
    init_qdrant()
    # Preload ASR/TTS models in a background thread to avoid blocking startup
    threading.Thread(target=speech_model_manager.warmup_models, daemon=True).start()

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)