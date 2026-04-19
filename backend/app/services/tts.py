import warnings
import threading
import queue
import time
import io
import numpy as np
import sounddevice as sd
import re
import datetime

warnings.filterwarnings("ignore")


_kokoro_pipeline = None
_qwen_tts_model = None
SPEECH_SPEED = 1  # Slower than default 1.0

def clean_text_for_speech(text: str) -> str:
    """Removes citations and other non-spoken markers from text, and formats dates."""
    if not text:
        return ""
    
    # 1. Format Dates (DD.MM.YYYY -> Month Day, Year)
    date_pattern = r'\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b'
    
    def date_replacer(match):
        d_str, m_str, y_str = match.groups()
        try:
            d, m, y = int(d_str), int(m_str), int(y_str)
            dt = datetime.date(y, m, d)
            return dt.strftime("%B %d, %Y")
        except:
            return match.group(0)
    
    text = re.sub(date_pattern, date_replacer, text)

    # 2. Aggressive Source Removal
    # Matches anything in brackets/parens that looks like a PDF reference or Page citation
    source_patterns = [
        r'\[[^\]]*?(?:\.pdf|Pages?:|Source:)[^\]]*?\]',
        r'\([^)]*?(?:\.pdf|Pages?:|Source:)[^)]*?\)'
    ]
    for pattern in source_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # 3. Fix All-Caps Pronunciation (e.g., SUNITA -> Sunita)
    # TTS engines often spell out ALL CAPS words letter-by-letter. 
    # Converting words > 2 chars to Title Case fixes this.
    def to_title_case(match):
        word = match.group(0)
        if len(word) > 2:
            return word.capitalize()
        return word
    
    text = re.sub(r'\b[A-Z]{3,}\b', to_title_case, text)

    # 4. Remove standard citation markers [1], (1)
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\(\d+\)', '', text)
    
    # Cleanup extra whitespace
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
    generator = pipeline(text, voice=voice, speed=SPEECH_SPEED)

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
    generator = pipeline(text, voice=voice, speed=SPEECH_SPEED)
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

def stream_tts_wav_chunks(text, cancel_event=None):
    # Important: Do NOT clean the entire block at once. 
    # We need to keep the raw sentence for the frontend highlighter.
    pipeline = get_kokoro_pipeline()
    voice = "af_sarah"   
    # 1. Split RAW text into sentences while protecting legal abbreviations
    # Standard Python 're' doesn't support variable-width lookbehind, 
    # so we use a 'Protection' strategy.
    protected_text = text
    abbreviations = ['No', 'v', 'vs', 'Art', 'Sec', 'para', 'exh', 'cl', 'st', 'adv', 'cr', 'rev', 'app', 'spl', 'petn', 'writ', 'pil', 'scc', 'air', 'scr', 'ilr', 'guj', 'bom', 'del', 'Mr', 'Mrs', 'Ms', 'Dr', 'Justice', 'Hon', 'Honble', 'Honourable', 'Chief']
    
    # Temporarily hide the periods in abbreviations
    for abbr in abbreviations:
        # Match 'No.' but not 'No' inside a word
        protected_text = re.sub(rf'\b{abbr}\.', f'{abbr}@@@', protected_text, flags=re.IGNORECASE)
    
    # Protect Initials (e.g., D.N. Ray)
    # This matches a single capital letter followed by a period
    protected_text = re.sub(r'\b([A-Z])\.', r'\1@@@', protected_text)
    
    # Now split safely
    split_chunks = re.split(r'(?<=[.!?])\s+', protected_text)
    
    # Restore the periods and clean up
    raw_sentences = []
    for chunk in split_chunks:
        s = chunk.replace('@@@', '.').strip()
        if s:
            raw_sentences.append(s)
    
    if not raw_sentences:
        return

    import soundfile as sf
    import io
    import base64
    import json
    import threading
    import queue

    import numpy as np
    q = queue.Queue(maxsize=10)
    stop_signal = threading.Event()

    def producer():
        try:
            for s_raw in raw_sentences:
                # Check ALL stop conditions: internal stop, global stop, or client disconnect
                if stop_signal.is_set() or _player.stop_event.is_set() or (cancel_event and cancel_event.is_set()):
                    break
                
                # 2. Clean ONLY for speech engine
                s_clean = clean_text_for_speech(s_raw)
                if not s_clean:
                    continue

                generator = pipeline(s_clean, voice=voice, speed=SPEECH_SPEED)
                sentence_audio_chunks = []
                for gs, ps, audio in generator:
                    if (cancel_event and cancel_event.is_set()) or _player.stop_event.is_set():
                        break
                    sentence_audio_chunks.append(audio)
                
                if sentence_audio_chunks:
                    # Aggregate all grains of the sentence into ONE continuous array
                    # This eliminates breaks/pauses inside the sentence.
                    full_audio = np.concatenate(sentence_audio_chunks)
                    
                    buffer = io.BytesIO()
                    sf.write(buffer, full_audio, 24000, format='WAV')
                    buffer.seek(0)
                    audio_bytes = buffer.read()
                    q.put((s_raw, audio_bytes))
            q.put(None)
        except Exception as e:
            print(f"TTS Producer error: {e}")
            q.put(None)

    worker = threading.Thread(target=producer, daemon=True)
    worker.start()

    try:
        while True:
            item = q.get()
            if item is None:
                break
            
            s, audio_bytes = item
            audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            # Yield as NDJSON event with text metadata for highlighting
            yield json.dumps({"audio": audio_b64, "text": s}) + "\n"
    finally:
        stop_signal.set()
        # Drain the queue if needed
        while not q.empty():
            q.get_nowait()

def warm_up_tts():
    """Initializes the TTS pipeline with a dummy generation to remove cold-start latency."""
    print("Pre-warming TTS Engine...")
    try:
        pipeline = get_kokoro_pipeline()
        # Single very short generation to trigger model weights loading
        list(pipeline("Warmup.", voice="af_sarah", speed=1.0))
        print("TTS Engine warmed up and ready.")
    except Exception as e:
        print(f"TTS Warmup failed: {e}")

def stop_audio():
    _player.stop()

def is_audio_playing():
    return _player.is_playing or not _player.queue.empty()


if __name__ == "__main__":
    audio_generate("She said she would be here by noon.")
    # wavs, sr = generate_audio("She said she would be here by noon.")
    