import warnings
import threading
import queue
import time
import io
import numpy as np
import sounddevice as sd
import re

warnings.filterwarnings("ignore")


_kokoro_pipeline = None
_qwen_tts_model = None

def clean_text_for_speech(text: str) -> str:
    """Removes citations and other non-spoken markers from text."""
    if not text:
        return ""
    # Remove [Source: ..., Page: ...] patterns
    text = re.sub(r'\[\s*Source:[^\]]*\]', '', text)
    # Remove [Source: ..., Page: ...] with optional parentheses
    text = re.sub(r'\(\s*Source:[^)]*\)', '', text)
    # Remove [1], [2], etc.
    text = re.sub(r'\[\d+\]', '', text)
    # Remove (1), (2), etc.
    text = re.sub(r'\(\d+\)', '', text)
    # Remove any extra whitespace created
    text = re.sub(r'\s+', ' ', text).strip()
    return text

class AudioPlayer:
    def __init__(self):
        self.queue = queue.Queue()
        self.stop_event = threading.Event()
        self.is_playing = False
        self._thread = None

    def _play_loop(self):
        while not self.stop_event.is_set():
            try:
                # Use a timeout to occasionally check the stop_event
                audio, sr = self.queue.get(timeout=0.5)
                if audio is not None:
                    try:
                        
                        self.is_playing = True
                        sd.play(audio, sr)
                        # We need a way to wait for playback OR stop
                        # sd.wait() blocks everything, so we'll poll sd.get_stream().active
                        while sd.get_stream().active and not self.stop_event.is_set():
                            time.sleep(0.1)
                        
                        if self.stop_event.is_set():
                            sd.stop()
                    except ImportError:
                        print("sounddevice not installed, local playback skipped")
                    
                    self.queue.task_done()
                    self.is_playing = False
            except queue.Empty:
                if self.stop_event.is_set():
                    break
                continue
        
        self.is_playing = False
        # Clear the queue
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
                self.queue.task_done()
            except queue.Empty:
                break

    def start(self):
        self.stop_event.clear()
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(target=self._play_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self.stop_event.set()
        try:
            
            sd.stop()
        except ImportError:
            pass
        if self._thread:
            self._thread.join(timeout=1)
        self.is_playing = False

    def add_to_queue(self, audio, sr):
        self.queue.put((audio, sr))

_player = AudioPlayer()

def get_kokoro_pipeline():
    global _kokoro_pipeline
    if _kokoro_pipeline is None:
        from kokoro import KPipeline
        _kokoro_pipeline = KPipeline(repo_id="hexgrad/Kokoro-82M", lang_code='a')
    return _kokoro_pipeline

def get_qwen_tts_model():
    global _qwen_tts_model
    if _qwen_tts_model is None:
        import torch
        from qwen_tts import Qwen3TTSModel
        
        # Use float16 for better memory efficiency and speed if CUDA is available
        dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        print(f"Initializing Qwen3-TTS (dtype={dtype})...")
        _qwen_tts_model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            device_map="auto",  # Let accelerate handle optimal placement
            dtype=dtype,                      
            attn_implementation="eager",
        )
    return _qwen_tts_model

def generate_audio(text):
    text = clean_text_for_speech(text)
    model = get_qwen_tts_model()
    wavs, sr = model.generate_custom_voice(
        text=[text],
        language=["english"],          
        speaker=["sohee"],    
        instruct=None    
    )
    _player.start()
    _player.add_to_queue(wavs[0], sr)

def audio_generate(text):
    text = clean_text_for_speech(text)
    pipeline = get_kokoro_pipeline()
    voice = "af_sarah"   

    # Start the player thread
    _player.start()
    
    # 🔊 Generate chunks asynchronously
    generator = pipeline(text, voice=voice)

    for i, (gs, ps, audio) in enumerate(generator):
        if _player.stop_event.is_set():
            break
        print(f"Chunk {i} ready and queued")
        _player.add_to_queue(audio, 24000)

def get_tts_wav(text):
    text = clean_text_for_speech(text)
    pipeline = get_kokoro_pipeline()
    voice = "af_sarah"   
    
    # Generate all chunks
    generator = pipeline(text, voice=voice)
    all_chunks = []
    for gs, ps, audio in generator:
        all_chunks.append(audio)
    
    if not all_chunks:
        return None
        
    # Concatenate all chunks
    full_audio = np.concatenate(all_chunks)
    
    # Write to BytesIO buffer as WAV
    buffer = io.BytesIO()
    import soundfile as sf
    sf.write(buffer, full_audio, 24000, format='WAV')
    buffer.seek(0)
    return buffer.read()

def stop_audio():
    _player.stop()

def is_audio_playing():
    return _player.is_playing or not _player.queue.empty()


if __name__ == "__main__":
    audio_generate("She said she would be here by noon.")
    # wavs, sr = generate_audio("She said she would be here by noon.")
    