import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ... import deps
from ....core.config import settings
from ....models.user import User
from ....models.chat import ChatSession, ChatMessage
from ....schemas.chat import ChatQuery
from ....services.rag_service import rag_service
from ....db.init_db import q_client, COLLECTION_NAME, get_vector_store
from ....db.session import SessionLocal
from qdrant_client.http import models as rest
from ....services.tts import get_tts_wav, stream_tts_wav_chunks
import re
from pydantic import BaseModel

router = APIRouter()

class SpeakRequest(BaseModel):
    text: str

async def build_chat_title(query: str) -> str:
    cleaned = re.sub(r"\s+", " ", query or "").strip()
    if not cleaned: return "New Chat"
    try:
        from langchain_core.messages import HumanMessage
        prompt = f"Short title (2-5 words) for: {cleaned}"
        messages = [HumanMessage(content=prompt)]
        response = await rag_service.llm.ainvoke(messages)
        return response.content.strip().strip('"').strip("'")[:60]
    except:
        return cleaned[:30] + "..."

@router.get("/sessions")
def list_sessions(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    user_id_str = str(current_user.id)
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id_str).order_by(ChatSession.created_at.desc()).all()
    return {"sessions": [{"id": s.id, "title": s.title, "date": s.created_at} for s in sessions]}

@router.get("/history/{session_id}")
def get_history(session_id: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    user_id_str = str(current_user.id)
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == user_id_str,
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.timestamp.asc()).all()
    
    # Also fetch linked documents
    from ....models.document import Document
    docs = db.query(Document).filter(
        Document.user_id == user_id_str,
        Document.session_id == session_id
    ).all()
    
    return {
        "history": [{"role": m.role, "text": m.content, "sources": json.loads(m.sources) if m.sources else []} for m in messages],
        "documents": [{"filename": d.filename, "chunks": d.chunk_count} for d in docs]
    }

class ChatQuery(BaseModel):
    query: str
    session_id: str
    filename: Optional[str] = None
    filenames: Optional[List[str]] = None

@router.post("/")
async def query_chat(chat_data: ChatQuery, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    user_id_str = str(current_user.id)
    vector_store = get_vector_store(rag_service.embeddings)
    user_id_f = rest.FieldCondition(key="metadata.user_id", match=rest.MatchValue(value=user_id_str))
    
    # 1. Broad Session Search (Selection-Aware)
    must_conditions = [user_id_f, rest.FieldCondition(key="metadata.session_id", match=rest.MatchValue(value=chat_data.session_id))]
    if chat_data.filenames and len(chat_data.filenames) > 0:
        must_conditions.append(rest.FieldCondition(key="metadata.filename", match=rest.MatchAny(any=chat_data.filenames)))
    elif chat_data.filename:
        must_conditions.append(rest.FieldCondition(key="metadata.filename", match=rest.MatchValue(value=chat_data.filename)))

    search_results = vector_store.search(
        query=chat_data.query, 
        search_type="mmr", 
        k=settings.SEARCH_K, 
        fetch_k=settings.FETCH_K,
        filter=rest.Filter(must=must_conditions)
    )
    
    if not search_results:
        async def empty_gen():
            yield "I couldn't find any relevant information across your documents to answer this question."
        return StreamingResponse(empty_gen(), media_type="text/plain")

    # 2. Handle Session & Logging
    session = db.query(ChatSession).filter(ChatSession.id == chat_data.session_id).first()
    if not session:
        title = await build_chat_title(chat_data.query)
        session = ChatSession(id=chat_data.session_id, user_id=user_id_str, title=title)
        db.add(session)
        db.commit()

    db.add(ChatMessage(user_id=user_id_str, session_id=chat_data.session_id, role="user", content=chat_data.query))
    db.commit()

    # 3. Intelligent Grouping
    # Rerank first to ensure we are only using top relevant bits across all files
    candidates = [doc.page_content for doc in search_results]
    scores = rag_service.rerank_results(chat_data.query, candidates)
    scored_hits = sorted(zip(search_results, scores), key=lambda x: x[1], reverse=True)[:settings.RERANK_TOP_K]

    # Group the top hits by filename
    grouped_hits = {}
    all_sources_data = [] # For DB storage
    consolidated_citations = {} # For final display

    for hit, score in scored_hits:
        fname = hit.metadata.get('filename', 'Unknown Document')
        page = hit.metadata.get('page')
        
        all_sources_data.append({"file": fname, "page": page})
        if fname not in consolidated_citations: consolidated_citations[fname] = set()
        if page: consolidated_citations[fname].add(page)
        
        if fname not in grouped_hits: grouped_hits[fname] = []
        grouped_hits[fname].append(f"[Page: {page}]\n{hit.page_content}")

    unique_files_found = list(grouped_hits.keys())
    is_sequential = len(unique_files_found) > 1

    async def response_generator():
        full_answer = ""
        
        for idx, fname in enumerate(unique_files_found):
            # A. Prepare section header
            header = f"### [DOCUMENT: {fname}]\n\n" if is_sequential else ""
            full_answer += header
            if header: yield header
            
            # B. Stream answer for THIS document's context
            doc_context = grouped_hits[fname]
            async for chunk in rag_service.generate_answer_stream(
                chat_data.query, 
                doc_context, 
                brief=is_sequential, 
                trace_metadata={"user_id": user_id_str, "file": fname}
            ):
                full_answer += chunk
                yield chunk
            
            # C. Separator
            if is_sequential and idx < len(unique_files_found) - 1:
                sep = "\n\n---\n\n"
                full_answer += sep
                yield sep

        # 4. Deterministic Python Citations
        citation_lines = []
        for f, pages in consolidated_citations.items():
            sorted_pages = sorted(list(pages))
            pages_str = ", ".join(map(str, sorted_pages))
            citation_lines.append(f"[Source: {f}, Pages: {pages_str}]")
        
        python_citation_str = "\n\n***\n" + "\n".join(citation_lines) if citation_lines else ""
        
        if python_citation_str:
            full_answer += python_citation_str
            yield python_citation_str

        # 5. Final Save
        with SessionLocal() as final_db:
            final_db.add(ChatMessage(user_id=user_id_str, session_id=chat_data.session_id, role="assistant", content=full_answer, sources=json.dumps(all_sources_data)))
            final_db.commit()

    return StreamingResponse(response_generator(), media_type="text/plain")

@router.delete("/session/{session_id}")
def delete_session(session_id: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    user_id_str = str(current_user.id)
    
    # 1. Cleanup Documents and Embeddings associated with this session
    from ....models.document import Document
    db.query(Document).filter(Document.session_id == session_id, Document.user_id == user_id_str).delete()
    
    q_client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=rest.Filter(
            must=[
                rest.FieldCondition(key="metadata.user_id", match=rest.MatchValue(value=user_id_str)),
                rest.FieldCondition(key="metadata.session_id", match=rest.MatchValue(value=session_id))
            ]
        )
    )

    # 2. Cleanup Messages and Session
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id_str).delete()
    db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id_str).delete()
    
    db.commit()
    return {"message": "Session and associated documents deleted"}

@router.post("/speak")
async def speak(request: Request, speak_data: SpeakRequest):
    # Sanitize text for TTS
    clean_text = speak_data.text
    clean_text = re.sub(r'#+\s+', '', clean_text)
    clean_text = re.sub(r'\*+', '', clean_text)
    clean_text = re.sub(r'_{3,}', '', clean_text)
    clean_text = re.sub(r'-{3,}', '', clean_text)
    clean_text = re.sub(r'\[Source:.*?\]', '', clean_text)
    
    # Internal stop signal for THIS specific request
    import threading
    disconnect_event = threading.Event()

    # Generator wrapper to monitor disconnection
    async def disconnect_monitor_gen():
        generator = stream_tts_wav_chunks(clean_text, disconnect_event)
        try:
            for chunk in generator:
                if await request.is_disconnected():
                    disconnect_event.set()
                    break
                yield chunk
        except Exception as e:
            disconnect_event.set()
            raise e

    return StreamingResponse(
        disconnect_monitor_gen(),
        media_type="application/x-ndjson"
    )
