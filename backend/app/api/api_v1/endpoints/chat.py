import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from ... import deps
from ....core.config import settings
from ....models.user import User
from ....models.chat import ChatSession, ChatMessage
from ....schemas.chat import ChatQuery
from ....services.rag_service import rag_service
from ....db.init_db import get_vector_store
from ....db.session import SessionLocal
from qdrant_client.http import models as rest
from ....services.tts import get_tts_wav
import re
from pydantic import BaseModel

router = APIRouter()

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
def list_sessions(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    user_id_str = str(current_user.id)
    sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id_str).order_by(ChatSession.created_at.desc()).all()
    return {"sessions": [{"id": s.id, "title": s.title, "date": s.created_at} for s in sessions]}

@router.get("/history/{session_id}")
def get_history(session_id: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    messages = db.query(ChatMessage).filter(
        ChatMessage.user_id == str(current_user.id),
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.timestamp.asc()).all()
    return {
        "history": [{"role": m.role, "text": m.content, "sources": json.loads(m.sources) if m.sources else []} for m in messages]
    }

@router.post("/")
async def query_chat(chat_data: ChatQuery, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    session = db.query(ChatSession).filter(ChatSession.id == chat_data.session_id).first()
    if not session:
        title = await build_chat_title(chat_data.query)
        session = ChatSession(id=chat_data.session_id, user_id=str(current_user.id), title=title)
        db.add(session)
        db.commit()

    db.add(ChatMessage(user_id=str(current_user.id), session_id=chat_data.session_id, role="user", content=chat_data.query))
    db.commit()

    vector_store = get_vector_store(rag_service.embeddings)
    user_id_f = rest.FieldCondition(key="metadata.user_id", match=rest.MatchValue(value=str(current_user.id)))
    
    if chat_data.filename:
        filters = rest.Filter(must=[user_id_f, rest.FieldCondition(key="metadata.filename", match=rest.MatchValue(value=chat_data.filename))])
    else:
        filters = rest.Filter(must=[user_id_f, rest.FieldCondition(key="metadata.session_id", match=rest.MatchValue(value=chat_data.session_id))])

    search_result = vector_store.search(query=chat_data.query, search_type="mmr", k=settings.SEARCH_K, fetch_k=settings.FETCH_K, filter=filters)
    
    if not search_result:
        async def empty_gen():
            yield "No documents found."
            with SessionLocal() as final_db:
                final_db.add(ChatMessage(user_id=str(current_user.id), session_id=chat_data.session_id, role="assistant", content="No documents found.", sources="[]"))
                final_db.commit()
        return StreamingResponse(empty_gen(), media_type="text/plain")

    candidates = [doc.page_content for doc in search_result]
    scores = rag_service.rerank_results(chat_data.query, candidates)
    scored_hits = sorted(zip(search_result, scores), key=lambda x: x[1], reverse=True)[:settings.RERANK_TOP_K]
    
    context_list = [f"[Source: {d.metadata.get('filename')}, Page: {d.metadata.get('page')}]\n{d.page_content}" for d, s in scored_hits]
    sources_data = [{"file": d.metadata.get('filename'), "page": d.metadata.get('page')} for d, s in scored_hits]

    async def response_generator():
        full_answer = ""
        async for chunk in rag_service.generate_answer_stream(chat_data.query, context_list):
            full_answer += chunk
            yield chunk
        with SessionLocal() as final_db:
            final_db.add(ChatMessage(user_id=str(current_user.id), session_id=chat_data.session_id, role="assistant", content=full_answer, sources=json.dumps(sources_data)))
            final_db.commit()

    return StreamingResponse(response_generator(), media_type="text/plain")

@router.delete("/session/{session_id}")
def delete_session(session_id: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_user)):
    user_id_str = str(current_user.id)
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id, ChatMessage.user_id == user_id_str).delete()
    db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.user_id == user_id_str).delete()
    db.commit()
    return {"message": "Session deleted"}

class SpeakRequest(BaseModel):
    text: str

@router.post("/speak")
async def speak(request: SpeakRequest):
    audio_bytes = get_tts_wav(request.text)
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate audio")
    from fastapi import Response
    return Response(content=audio_bytes, media_type="audio/wav")
