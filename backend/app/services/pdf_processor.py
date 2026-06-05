import os
import re
import fitz  # PyMuPDF
import datetime
from langchain_text_splitters import RecursiveCharacterTextSplitter
from ..core.config import settings

def clean_text_block(text: str) -> str:
    if not text:
        return ""
    # Normalize unicode spaces and control characters
    text = text.replace('\xa0', ' ')
    text = text.replace('\u200b', '')
    lines = []
    for line in text.splitlines():
        cleaned = line.strip()
        if not cleaned:
            continue
        # Replace 3 or more repeating divider symbols inside lines with a single one (e.g. ------ to -)
        cleaned = re.sub(r'([=\-_*#\.\~\+\|\\/\u2014])\1{2,}', r'\1', cleaned)
        cleaned = cleaned.strip()
        # Skip lines that collapse to a single divider symbol
        if cleaned in ['=', '-', '_', '*', '#', '.', '~', '+', '|', '\\', '/', '\u2014']:
            continue
        # Remove spaces to check if it's a spacer pattern like ". . . ." or "- - - -"
        no_spaces = re.sub(r'\s+', '', cleaned)
        if re.match(r'^[=\-_*#\.\~\+\|\\/\u2014]{2,}$', no_spaces):
            continue
        # Skip page reference headers and footers
        if re.match(r'^(page\s*\d+|\d+\s*of\s*\d+)$', cleaned, re.IGNORECASE):
            continue
        # Collapse tabs and consecutive spaces
        cleaned = re.sub(r'[ \t]+', ' ', cleaned)
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)

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
    chunk_idx = 0
    ingestion_time = datetime.datetime.now().isoformat()
    try:
        with fitz.open(pdf_path) as pdf:
            total_pages = len(pdf)
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
                            cleaned_block = clean_text_block(block[4])
                            if cleaned_block:
                                page_text += cleaned_block + "\n\n"

                if not page_text.strip():
                    raw_text = page.get_text("text")
                    page_text = clean_text_block(raw_text)
                
                if not page_text.strip():
                    continue
                
                parent_chunks = parent_splitter.split_text(page_text)
                for p_chunk in parent_chunks:
                    child_chunks = child_splitter.split_text(p_chunk)
                    for c_chunk in child_chunks:
                        chunk_idx += 1
                        metadata = {
                            "page": page_num,
                            "total_pages": total_pages,
                            "chunk_number": chunk_idx,
                            "user_id": str(user_id),
                            "filename": original_filename,
                            "parent_text": p_chunk,
                            "ingestion_timestamp": ingestion_time,
                            "embedding_model": settings.EMBEDDING_MODEL_NAME,
                            "chunk_size": settings.CHILD_CHUNK_SIZE,
                            "chunk_overlap": settings.CHILD_CHUNK_OVERLAP,
                            "file_type": "pdf"
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
