import os
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter
from ..core.config import settings

def process_pdf(pdf_path: str, user_id: str, original_filename: str, session_id: str = None):
    """
    Extracts text from a PDF file, ignoring margins, and returns chunks with metadata.
    """
    parent_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.PARENT_CHUNK_SIZE,
        chunk_overlap=settings.PARENT_CHUNK_OVERLAP,
        separators=["\n\n", "\n"]
    )
    child_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.CHILD_CHUNK_SIZE,
        chunk_overlap=settings.CHILD_CHUNK_OVERLAP,
        separators=["\n", ". ", " ", ""]
    )
    
    chunks_with_metadata = []
    try:
        with fitz.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf, start=1):
                page_rect = page.rect
                footer_threshold = page_rect.height * 0.97 
                header_threshold = page_rect.height * 0.03
                
                blocks = page.get_text("blocks")
                blocks.sort(key=lambda b: (b[1], b[0]))
                
                page_text = ""
                for block in blocks:
                    if block[1] > header_threshold and block[3] < footer_threshold:
                        if block[6] == 0:  # text block
                            page_text += block[4] + "\n"

                if not page_text.strip():
                    page_text = page.get_text("text")
                
                if not page_text.strip():
                    continue
                
                parent_chunks = parent_splitter.split_text(page_text)
                for p_chunk in parent_chunks:
                    child_chunks = child_splitter.split_text(p_chunk)
                    for c_chunk in child_chunks:
                        metadata = {
                            "page": page_num,
                            "user_id": str(user_id),
                            "filename": original_filename,
                            "parent_text": p_chunk
                        }
                        if session_id:
                            metadata["session_id"] = session_id
                            
                        chunks_with_metadata.append({
                            "text": c_chunk,
                            "metadata": metadata
                        })
        return chunks_with_metadata
    except Exception as e:
        print(f"Error processing PDF {pdf_path}: {e}")
        return []
