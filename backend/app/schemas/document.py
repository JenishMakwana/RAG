from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class DocumentBase(BaseModel):
    filename: str
    session_id: Optional[str] = None

class DocumentCreate(DocumentBase):
    user_id: str

class Document(DocumentBase):
    upload_date: datetime

    class Config:
        from_attributes = True
