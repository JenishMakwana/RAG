from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from ..db.base_class import Base

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    session_id = Column(String, index=True, nullable=True)
    filename = Column(String)
    upload_date = Column(DateTime, default=datetime.utcnow)
