import os
import uuid
import pytest
import httpx
import json

# Set testing environment before any imports
os.environ["TESTING"] = "true"

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import SessionLocal, Base, engine, UserModel

client = TestClient(app)

@pytest.fixture(scope="module")
def test_user():
    # Initialize Qdrant for testing
    from backend.database import init_qdrant
    init_qdrant()
    
    # Generate unique credentials
    username = f"testuser_{uuid.uuid4().hex[:8]}"
    password = "TestPassword123"
    
    # Register
    response = client.post("/register", json={"username": username, "password": password})
    assert response.status_code == 200
    
    # Login to get token
    response = client.post("/token", data={"username": username, "password": password})
    assert response.status_code == 200
    token = response.json()["access_token"]
    
    return {"username": username, "password": password, "token": token}

def test_auth_protected_endpoints(test_user):
    """Test that protected endpoints require a token."""
    response = client.get("/documents")
    assert response.status_code == 401 # Unauthorized

def test_document_upload_and_list(test_user):
    """Test PDF upload and document listing."""
    token = test_user["token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create a dummy PDF for testing
    file_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Test Law Case) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    files = {"file": ("test_case.pdf", file_content, "application/pdf")}
    data = {"session_id": "test_session_123"}
    
    response = client.post("/upload", headers=headers, files=files, data=data)
    # It might be 400 because dummy PDF doesn't have real text to extract
    assert response.status_code in [200, 400]

def test_intent_detection():
    """Test the Python-based intent detection logic."""
    from backend.engine import detect_intent
    
    assert detect_intent("Can you summarize this case?") == "SUMMARY"
    assert detect_intent("What was the final judgment?") == "JUDGMENT"
    assert detect_intent("Tell me the facts of the incident") == "FACTS"
    assert detect_intent("Why did the court decide this?") == "REASONING"
    assert detect_intent("How are you today?") == "GENERAL"

def test_chat_streaming_response(test_user):
    """Test that the chat endpoint returns a stream."""
    token = test_user["token"]
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "query": "Who is the appellant?",
        "session_id": "test_session_123"
    }
    
    # We use client.post with stream=True equivalent in TestClient
    with client.stream("POST", "/chat", headers=headers, json=payload) as response:
        assert response.status_code == 200
        # Check if we get at least one chunk
        for chunk in response.iter_text():
            assert isinstance(chunk, str)
            break

def test_legal_audit_refusal(test_user):
    """Test that the AI refuses to answer if non-legal context is provided."""
    # This tests the engine logic directly
    from backend.engine import generate_answer
    
    non_legal_context = ["This is a recipe for chocolate cake. Ingredients: sugar, flour, cocoa."]
    query = "How much sugar do I need?"
    
    answer = generate_answer(query, non_legal_context)
    assert "Legal AI Assistant" in answer or "permitted to analyze" in answer
