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

# requirements.txt is copied from the project root (build context is root)
COPY requirements.txt .

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir --no-build-isolation pyaudio && \
    pip install --no-cache-dir -r ../requirements.txt && \
    pip install --no-cache-dir --no-deps qwen-asr qwen-tts && \
    python -c " \
import glob; \
for f in glob.glob('/usr/local/lib/python3.*/site-packages/qwen_asr/**/*.py', recursive=True) + glob.glob('/usr/local/lib/python3.*/site-packages/qwen_tts/**/*.py', recursive=True): \
    with open(f, 'r') as file: \
        content = file.read() \
    if '@check_model_inputs()' in content: \
        print('Patching:', f) \
        content = content.replace('@check_model_inputs()', '# @check_model_inputs()') \
        with open(f, 'w') as file: \
            file.write(content) \
"

# Copy backend application source
COPY backend/app ./app

# Persistent data directories
RUN mkdir -p /app/app/data /app/qdrant_storage

EXPOSE 8001
EXPOSE 7860

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
