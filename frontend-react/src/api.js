const BASE_URL = 'http://localhost:8000';

export async function login(email, password) {
  const formData = new URLSearchParams();
  formData.append('username', email); // OAuth2 expects 'username' field
  formData.append('password', password);

  const response = await fetch(`${BASE_URL}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Login failed');
  }

  return await response.json();
}

export async function register(username, email, password) {
  const response = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, email, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Registration failed');
  }

  return await response.json();
}

export async function fetchDocuments(token) {
  const response = await fetch(`${BASE_URL}/documents/`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }

  return await response.json();
}

export async function uploadDocument(token, file, sessionId = null) {
  const formData = new FormData();
  formData.append('file', file);
  if (sessionId) {
    formData.append('session_id', sessionId);
  }

  const response = await fetch(`${BASE_URL}/documents/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return await response.json();
}

export async function deleteDocument(token, filename) {
  const response = await fetch(`${BASE_URL}/documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Delete failed');
  }

  return await response.json();
}

export async function chatQuery(token, query, sessionId, filename = null, filenames = null) {
  const response = await fetch(`${BASE_URL}/chat/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      session_id: sessionId,
      filename,
      filenames
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Chat query failed');
  }

  // Return the raw response so the UI can read the stream
  return response;
}

export async function fetchChatSessions(token) {
  const response = await fetch(`${BASE_URL}/chat/sessions`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch chat sessions');
  }

  return await response.json();
}

export async function fetchChatHistory(token, sessionId) {
  const response = await fetch(`${BASE_URL}/chat/history/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch chat history');
  }

  return await response.json();
}

export async function fetchSessionDocuments(token, sessionId) {
  const response = await fetch(`${BASE_URL}/documents/session/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch session documents');
  }

  return await response.json();
}

export async function deleteChatSession(token, sessionId) {
  const response = await fetch(`${BASE_URL}/chat/session/${sessionId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete chat session');
  }

  return await response.json();
}

// Voice API functions
export async function startVoiceRecording(token) {
  const response = await fetch(`${BASE_URL}/voice/start`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to start recording');
  }

  return await response.json();
}

export async function stopVoiceRecording(token) {
  const response = await fetch(`${BASE_URL}/voice/stop`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to stop recording');
  }

  return await response.json();
}

export async function getTtsAudio(token, text) {
  const response = await fetch(`${BASE_URL}/chat/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'TTS request failed');
  }

  return await response.blob();
}
