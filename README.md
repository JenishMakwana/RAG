# Legal Case RAG Assistant

A premium Retrieval-Augmented Generation (RAG) application designed for legal researchers and practitioners. This tool allows users to upload legal documents (PDFs), chat with them using advanced LLMs, and interact via voice.

## 🌟 Features

- **Legal-First RAG**: High-precision retrieval using Qdrant and specialized legal embeddings.
- **Smart Intent Detection**: Automatically identifies if you are asking for a summary, judgment, facts, or legal reasoning.
- **Voice Interaction**:
  - **ASR (Speech-to-Text)**: Powered by Qwen-ASR for accurate legal terminology.
  - **TTS (Text-to-Speech)**: Integrated with Kokoro-82M for natural-sounding responses (citations are automatically filtered for a better listening experience).
- **Secure Authentication**: JWT-based login and session management.
- **Modern UI**: A responsive, dark-mode glassmorphism interface built with React.
- **Streaming Responses**: Get real-time answers as they are generated.

## 🛠️ Technology Stack

### Backend
- **Framework**: FastAPI
- **Database**: SQLite (SQLAlchemy) & Qdrant (Vector Database)
- **AI/LLM**: LangChain, Groq, Google Gemini, Ollama
- **Audio**: Kokoro-82M (TTS), Qwen-ASR (Speech Recognition)

### Frontend
- **Framework**: React.js (Vite)
- **Styling**: Vanilla CSS with modern Glassmorphism aesthetics
- **API**: Fetch API with streaming support

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js & npm
- [Qdrant](https://qdrant.tech/) (Running locally or on Cloud)

### Backend Setup
1. Clone the repository.
2. Create a virtual environment:
   ```bash
   python -m venv myenv
   source myenv/bin/activate  # On Windows: myenv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables in `.env`:
   ```env
   GEMINI_API_KEY=your_key
   GROQ_API_KEY=your_key
   QDRANT_URL=http://localhost:6333
   ```
5. Start the server:
   ```bash
   uvicorn backend.app.main:app --reload
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend-react
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## 🧪 Testing
Run the automated test suite to verify API and AI logic:
```bash
pytest tests/test_api.py
```

## 📜 License
Internal Project - All Rights Reserved.
