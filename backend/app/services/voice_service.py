import os
import threading
import tempfile
import wave
import pyaudio
import torch
from typing import Optional
from ..core.config import settings

SAMPLE_RATE = 16000
CHUNK = 1024
CHANNELS = 1
FORMAT = pyaudio.paInt16

class VoiceService:
    def __init__(self):
        self.frames = []
        self.is_recording = False
        self.thread = None
        self.stream = None
        self.pa = None
        self.lock = threading.Lock()
        self.thread_started = threading.Event()
        self._asr_model = None

    def start_recording(self):
        with self.lock:
            if self.is_recording:
                return {"status": "already_recording"}
            self.frames = []
            self.is_recording = True
            self.thread_started.clear()
            self.pa = pyaudio.PyAudio()
            self.stream = self.pa.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SAMPLE_RATE,
                input=True,
                frames_per_buffer=CHUNK,
            )

        def _capture():
            self.thread_started.set()
            while self.is_recording:
                try:
                    data = self.stream.read(CHUNK, exception_on_overflow=False)
                    with self.lock:
                        if self.is_recording:
                            self.frames.append(data)
                except:
                    break
            self.thread_started.set()

        self.thread = threading.Thread(target=_capture, daemon=False)
        self.thread.start()
        self.thread_started.wait(timeout=1)
        return {"status": "recording_started"}

    def stop_recording(self) -> str:
        with self.lock:
            if not self.is_recording:
                raise RuntimeError("No active recording.")
            self.is_recording = False

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2)

        with self.lock:
            if self.stream:
                self.stream.stop_stream()
                self.stream.close()
            if self.pa:
                self.pa.terminate()
            frames = list(self.frames)
            self.thread = None
            self.stream = None
            self.pa = None

        if not frames:
            raise RuntimeError("No audio captured.")
        
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        with wave.open(tmp.name, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(pyaudio.PyAudio().get_sample_size(FORMAT))
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(b"".join(frames))
        return tmp.name

    def preload_models(self):
        """Preloads ASR and TTS models into memory/GPU."""
        print(f"Loading Qwen3-ASR...")
        self._load_asr_model()
        
        print(f"Loading Kokoro TTS...")
        from .tts import warm_up_tts
        warm_up_tts()

    def _load_asr_model(self):
        if self._asr_model:
            return self._asr_model
        from qwen_asr import Qwen3ASRModel
        
        # Use float16 for better memory efficiency and speed if CUDA is available
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        print(f"Initializing Qwen3-ASR (dtype={dtype})...")
        self._asr_model = Qwen3ASRModel.from_pretrained(
            "Qwen/Qwen3-ASR-0.6B", 
            torch_dtype=dtype,
            device_map="auto"  # Let accelerate handle optimal placement
        )
        return self._asr_model

    def transcribe(self, audio_path: str) -> str:
        model = self._load_asr_model()
        result = model.transcribe(audio_path, language="English")
        if not result: return ""
        item = result[0] if isinstance(result, list) else result
        return getattr(item, 'text', str(item))

    def create_voice_router(self):
        from fastapi import APIRouter, HTTPException, UploadFile, File
        from pydantic import BaseModel
        
        router = APIRouter(prefix="/voice", tags=["voice"])
        
        class TranscriptionResponse(BaseModel):
            query: str
            status: str

        @router.post("/start")
        def voice_start():
            return self.start_recording()

        @router.post("/stop", response_model=TranscriptionResponse)
        def voice_stop():
            path = self.stop_recording()
            try:
                text = self.transcribe(path)
                return TranscriptionResponse(query=text, status="ok" if text.strip() else "no_speech")
            finally:
                os.unlink(path)

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
