import torch
from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq
import threading

class SpeechModelManager:
    def __init__(self):
        self._stt_processor = None
        self._stt_model = None
        self._tts_pipeline = None
        self._lock = threading.Lock()
        self._warmed_up = False

    def warmup_models(self):
        """Pre-downloads and warms up models in memory."""
        with self._lock:
            if self._warmed_up:
                return

            print("Global Model Manager: Starting warmup...")
            self._load_stt_model()
            self._load_tts_pipeline()

            # Optional: do a dummy generation to actually trigger weights
            self._warmup_stt()
            self._warmup_tts()

            self._warmed_up = True
            print("Global Model Manager: Warmup complete.")

    def _load_stt_model(self):
        if self._stt_model is not None and self._stt_processor is not None:
            return

        print("Loading openai/whisper-medium STT...")
        
        # Whisper: use GPU if available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32

        processor = AutoProcessor.from_pretrained("openai/whisper-medium")
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            "openai/whisper-medium",
            torch_dtype=dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True
        )
        model.to(device)

        self._stt_processor = processor
        self._stt_model = model

    def _warmup_stt(self):
        print("Warming up STT...")
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            # Create a dummy audio tensor of 1 second (16kHz)
            dummy_audio = torch.zeros(16000, dtype=torch.float32).numpy()
            inputs = self._stt_processor(dummy_audio, sampling_rate=16000, return_tensors="pt")
            input_features = inputs.input_features.to(device, dtype=dtype)
            
            # Dummy generate
            with torch.no_grad():
                self._stt_model.generate(input_features)
            print("STT warmed up.")
        except Exception as e:
            print(f"STT Warmup failed: {e}")

    def _load_tts_pipeline(self):
        if self._tts_pipeline is not None:
            return

        print("Loading Kokoro-82M TTS...")
        from kokoro import KPipeline
        try:
            # Kokoro usually runs on CPU efficiently, but you can pass device if supported by KPipeline
            self._tts_pipeline = KPipeline(lang_code='a')
        except TypeError:
            self._tts_pipeline = KPipeline(repo_id="hexgrad/Kokoro-82M", lang_code='a')

    def _warmup_tts(self):
        print("Warming up TTS Engine...")
        try:
            # Single very short generation to trigger model weights loading
            list(self._tts_pipeline("Warmup.", voice="af_sarah", speed=1.0))
            print("TTS Engine warmed up.")
        except Exception as e:
            print(f"TTS Warmup failed: {e}")

    def get_stt_processor(self):
        if self._stt_processor is None:
            self._load_stt_model()
        return self._stt_processor

    def get_stt_model(self):
        if self._stt_model is None:
            self._load_stt_model()
        return self._stt_model

    def get_tts_pipeline(self):
        if self._tts_pipeline is None:
            self._load_tts_pipeline()
        return self._tts_pipeline

speech_model_manager = SpeechModelManager()
