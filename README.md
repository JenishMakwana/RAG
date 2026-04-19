# Legal Case Law RAG Assistant ⚖️

A professional, high-performance Retrieval-Augmented Generation (RAG) platform tailored for legal researchers. This application combines state-of-the-art LLMs with a proprietary legal search engine to provide precise, citation-backed analysis of case law.

## 🌟 Key Features

- **Legal-Specific RAG**: High-fidelity retrieval utilizing **Qdrant** and specialized legal embeddings (`InCaseLawBERT`).
- **Parent-Child Chunking**: Maintains document context while allowing for granular retrieval of specific legal clauses.
- **Premium Voice Experience**:
  - **Seamless TTS Highlighting**: Real-time "karaoke-style" word highlighting synchronized with audio playback.
  - **Kokoro-82M Engine**: Ultra-natural, low-latency speech generation.
  - **Citation Filtering**: Audio automatically skips citations and Markdown symbols for a clean listening experience.
- **Streaming Intelligence**: Multi-document analysis with real-time response streaming and deterministic citations.
- **Modern Architecture**:
  - **Backend**: FastAPI with async execution and JWT security.
  - **Frontend**: React-based Glassmorphism UI with persistent session management.

## 🛠️ Technology Stack

- **Python**: 3.12.10
- **Vector Store**: Qdrant (Persistent Storage)
- **Frameworks**: FastAPI, React.js (Vite)
- **AI Models**: Gemini 2.0/2.5, Groq (Llama 3), Ollama
- **Audio Stack**: Kokoro-82M (TTS), Qwen-ASR (Speech Recognition)

## 🚀 Getting Started

### Prerequisites
- Python 3.12+
- Node.js & npm
- Qdrant Instance (Local or Cloud)

### 1. Backend Setup
1. Create and activate a virtual environment:
   ```bash
   python -m venv myenv
   myenv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Configure your keys:
   - Copy `.env.example` to `.env`.
   - Fill in your `GEMINI_API_KEY` or `GROQ_API_KEY`.
4. Run the server:
   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

### 2. Frontend Setup
1. Navigate to the frontend:
   ```bash
   cd frontend-react
   ```
2. Install & Start:
   ```bash
   npm install
   npm run dev
   ```

## 📂 Project Organization
- `/backend`: FastAPI source code and local data/vector storage.
- `/frontend-react`: React application source and styling.
- `/requirements.txt`: Unified dependency list with critical version locks.
- `/.env.example`: Clean template for environment configuration.

---
**License**: Internal Project / Proprietary
