import os
import tempfile
from typing import Optional
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
import librosa
import torch

class VoiceService:
    def transcribe(self, audio_path: str) -> str:
        from .model_manager import speech_model_manager

        try:
            # Load audio using librosa at 16000 Hz
            audio, sr = librosa.load(audio_path, sr=16000)

            processor = speech_model_manager.get_stt_processor()
            model = speech_model_manager.get_stt_model()
            
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if torch.cuda.is_available() else torch.float32

            inputs = processor(audio, sampling_rate=16000, return_tensors="pt")
            input_features = inputs.input_features.to(device, dtype=dtype)
            
            with torch.no_grad():
                predicted_ids = model.generate(input_features)

            transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
            return transcription.strip()
        except Exception as e:
            print(f"Transcription error: {e}")
            return ""

    def create_voice_router(self):
        router = APIRouter(prefix="/voice", tags=["voice"])
        
        class TranscriptionResponse(BaseModel):
            query: str
            status: str

        @router.post("/transcribe", response_model=TranscriptionResponse)
        async def voice_transcribe(file: UploadFile = File(...)):
            suffix = os.path.splitext(file.filename or "")[1] or ".webm"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name
            try:
                text = self.transcribe(tmp_path)
                return TranscriptionResponse(query=text, status="ok" if text.strip() else "no_speech")
            finally:
                os.unlink(tmp_path)
        
        return router

voice_service = VoiceService()
