from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class ChatQuery(BaseModel):
    query: str
    session_id: str
    filename: Optional[str] = None

class ChatMessageBase(BaseModel):
    role: str
    content: str
    sources: Optional[str] = None

class ChatMessage(ChatMessageBase):
    id: int
    user_id: str
    session_id: str
    timestamp: datetime

    class Config:
        from_attributes = True

class ChatSessionBase(BaseModel):
    id: str
    title: str

class ChatSession(ChatSessionBase):
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True
