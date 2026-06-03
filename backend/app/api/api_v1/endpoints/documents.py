import uuid
import os
import time
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
from langchain_core.documents import Document as LCDocument
from ... import deps
from ....core.config import settings
from ....db.init_db import q_client, COLLECTION_NAME, get_vector_store
from ....models.user import User
from ....models.document import Document
from ....services.pdf_processor import process_pdf
from ....services.rag_service import rag_service
from qdrant_client.http import models as rest

router = APIRouter()

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), 
    session_id: str = Form(None),
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
):
    query = db.query(Document).filter(
        Document.user_id == str(current_user.id),
        Document.filename == file.filename
    )
    if session_id:
        query = query.filter(Document.session_id == session_id)
    else:
        query = query.filter(Document.session_id == None)
        
    if query.first():
        raise HTTPException(status_code=409, detail=f"Document '{file.filename}' already indexed.")

    temp_path = f"temp_{uuid.uuid4()}_{file.filename}"
    with open(temp_path, "wb") as buffer:
        buffer.write(await file.read())
    
    start_time = time.time()
    try:
        chunks = process_pdf(temp_path, current_user.id, file.filename, session_id)
        if not chunks:
            raise HTTPException(status_code=400, detail="No text extracted")
        
        # Legal Audit
        text_sample = "\n".join([c["text"] for c in chunks[:3]])
        if not rag_service.validate_is_legal(text_sample):
            raise HTTPException(status_code=400, detail="Not a legal document")
        
        vector_store = get_vector_store(rag_service.embeddings)
        docs = [LCDocument(page_content=c["text"], metadata=c["metadata"]) for c in chunks]
        vector_store.add_documents(docs)
        
        embed_time = time.time() - start_time
        new_doc = Document(
            user_id=str(current_user.id), 
            filename=file.filename, 
            session_id=session_id,
            chunk_count=len(chunks),
            embed_time_seconds=round(embed_time, 2)
        )
        db.add(new_doc)
        db.commit()
        return {
            "message": f"Successfully indexed {file.filename}",
            "chunks": len(chunks),
            "time": round(embed_time, 2)
        }
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.get("/")
def get_user_documents(db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    from ....models.chat import ChatSession
    
    # Efficiently join Document and ChatSession to avoid N+1 queries (lookup speed-up)
    query_results = db.query(Document, ChatSession.title).outerjoin(
        ChatSession, Document.session_id == ChatSession.id
    ).filter(Document.user_id == str(current_user.id)).all()
    
    results = []
    for doc, chat_title in query_results:
        results.append({
            "id": doc.id,
            "filename": doc.filename,
            "date": doc.upload_date,
            "session_id": doc.session_id,
            "session_title": chat_title or "Direct Upload",
            "chunks": doc.chunk_count or 0,
            "embed_time": doc.embed_time_seconds or 0
        })
    return {"documents": results}

@router.get("/session/{session_id}")
def get_session_documents(
    session_id: str, 
    db: Session = Depends(deps.get_db), 
    current_user: User = Depends(deps.get_current_active_user)
):
    docs = db.query(Document).filter(
        Document.user_id == str(current_user.id),
        Document.session_id == session_id
    ).all()
    return {
        "documents": [{"filename": d.filename, "chunks": d.chunk_count} for d in docs]
    }

@router.delete("/{filename}")
def delete_document(filename: str, db: Session = Depends(deps.get_db), current_user: User = Depends(deps.get_current_active_user)):
    # Find all variants (different sessions) of this filename for this user
    docs = db.query(Document).filter(Document.user_id == str(current_user.id), Document.filename == filename).all()
    if not docs:
        raise HTTPException(status_code=404, detail="Document not found")
        
    for doc in docs:
        db.delete(doc)
    db.commit()
    
    q_client.delete(
        collection_name=COLLECTION_NAME,
        points_selector=rest.Filter(
            must=[
                rest.FieldCondition(key="metadata.user_id", match=rest.MatchValue(value=str(current_user.id))),
                rest.FieldCondition(key="metadata.filename", match=rest.MatchValue(value=filename))
            ]
        )
    )
    return {"message": f"Deleted all instances of {filename}"}
