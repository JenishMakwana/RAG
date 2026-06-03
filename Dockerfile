FROM python:3.12-slim

WORKDIR /app

# System dependencies: PyAudio, psycopg2, build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    portaudio19-dev \
    libpq-dev \
    libpq5 \
    curl \
    pkg-config \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements.txt from the root
COPY requirements.txt .

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --no-build-isolation pyaudio && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --no-deps qwen-asr qwen-tts

# Copy backend application source
COPY backend/app ./app

# Create necessary directories
RUN mkdir -p /app/app/data /app/qdrant_storage

EXPOSE 8001
EXPOSE 7860

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
