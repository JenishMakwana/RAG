import warnings
import threading
import queue
import io
import numpy as np
import re
import datetime

warnings.filterwarnings("ignore")

SPEECH_SPEED = 1  # Slower than default 1.0

# Global event to stop any ongoing TTS generation across streams
stop_tts_event = threading.Event()

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
    source_patterns = [
        r'\[[^\]]*?(?:\.pdf|Pages?:|Source:)[^\]]*?\]',
        r'\([^)]*?(?:\.pdf|Pages?:|Source:)[^)]*?\)'
    ]
    for pattern in source_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # 3. Fix All-Caps Pronunciation
    def to_title_case(match):
        word = match.group(0)
        if len(word) > 2:
            return word.capitalize()
        return word
    
    text = re.sub(r'\b[A-Z]{3,}\b', to_title_case, text)

    # 4. Remove standard citation markers
    text = re.sub(r'\[\d+\]', '', text)
    text = re.sub(r'\(\d+\)', '', text)
    
    # Cleanup extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def get_kokoro_pipeline():
    from .model_manager import speech_model_manager
    return speech_model_manager.get_tts_pipeline()

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
    pipeline = get_kokoro_pipeline()
    voice = "af_sarah"   
    
    # Reset the global stop event at the start of a new stream
    stop_tts_event.clear()
    
    protected_text = text
    abbreviations = ['No', 'v', 'vs', 'Art', 'Sec', 'para', 'exh', 'cl', 'st', 'adv', 'cr', 'rev', 'app', 'spl', 'petn', 'writ', 'pil', 'scc', 'air', 'scr', 'ilr', 'guj', 'bom', 'del', 'Mr', 'Mrs', 'Ms', 'Dr', 'Justice', 'Hon', 'Honble', 'Honourable', 'Chief']
    
    for abbr in abbreviations:
        protected_text = re.sub(rf'\b{abbr}\.', f'{abbr}@@@', protected_text, flags=re.IGNORECASE)
    
    protected_text = re.sub(r'\b([A-Z])\.', r'\1@@@', protected_text)
    split_chunks = re.split(r'(?<=[.!?])\s+', protected_text)
    
    raw_sentences = []
    for chunk in split_chunks:
        s = chunk.replace('@@@', '.').strip()
        if s:
            raw_sentences.append(s)
    
    if not raw_sentences:
        return

    import soundfile as sf
    import base64
    import json
    
    q = queue.Queue(maxsize=10)
    local_stop_signal = threading.Event()

    def producer():
        try:
            for s_raw in raw_sentences:
                if local_stop_signal.is_set() or stop_tts_event.is_set() or (cancel_event and cancel_event.is_set()):
                    break
                
                s_clean = clean_text_for_speech(s_raw)
                if not s_clean:
                    continue

                generator = pipeline(s_clean, voice=voice, speed=SPEECH_SPEED)
                sentence_audio_chunks = []
                for gs, ps, audio in generator:
                    if (cancel_event and cancel_event.is_set()) or stop_tts_event.is_set() or local_stop_signal.is_set():
                        break
                    sentence_audio_chunks.append(audio)
                
                if sentence_audio_chunks:
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
            yield json.dumps({"audio": audio_b64, "text": s}) + "\n"
    finally:
        local_stop_signal.set()
        while not q.empty():
            try:
                q.get_nowait()
            except queue.Empty:
                break

def stop_audio():
    # Signal the generator to stop producing chunks
    stop_tts_event.set()

def is_audio_playing():
    # Deprecated for server-side logic
    return False