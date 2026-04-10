import re

def clean_filename(filename: str) -> str:
    """Strips the temp_UUID_ prefix from legacy filenames."""
    if filename.startswith("temp_") and len(filename) > 42:
        parts = filename.split("_", 2)
        if len(parts) > 2:
            return parts[2]
    return filename

def build_chat_title_fallback(query: str) -> str:
    cleaned = re.sub(r"\s+", " ", query or "").strip()
    cleaned = cleaned.rstrip("?.!,:;")
    words = cleaned.split(" ")
    short_words = words[:8]
    title = " ".join(short_words)
    if len(words) > 8 or len(cleaned) > len(title):
        title = f"{title}..."
    return title[:60]
