// Helper to check if the current hostname is a local loopback or private network address
const isLocalHost = () => {
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    // Private IPv4 ranges (RFC 1918)
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    // mDNS local hostnames
    /\.local$/.test(hostname)
  );
};

// Dynamic backend URL to support local development and production Hugging Face Space
const BASE_URL = isLocalHost()
  ? `http://${window.location.hostname}:8001`
  : 'https://jenishmakwana-rag.hf.space';

// Helper to parse error details and attach status code
async function handleResponseError(response, defaultMsg) {
  let errorMsg = defaultMsg;
  try {
    const errorData = await response.json();
    errorMsg = errorData.detail || errorMsg;
  } catch (e) {
    // Ignore JSON parsing errors for non-JSON responses
  }
  const err = new Error(errorMsg);
  err.status = response.status;
  throw err;
}

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
    await handleResponseError(response, 'Login failed');
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
    await handleResponseError(response, 'Registration failed');
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
    await handleResponseError(response, 'Failed to fetch documents');
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
    await handleResponseError(response, 'Upload failed');
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
    await handleResponseError(response, 'Delete failed');
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
    await handleResponseError(response, 'Chat query failed');
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
    await handleResponseError(response, 'Failed to fetch chat sessions');
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
    await handleResponseError(response, 'Failed to fetch chat history');
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
    await handleResponseError(response, 'Failed to fetch session documents');
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
    await handleResponseError(response, 'Failed to delete chat session');
  }

  return await response.json();
}

export async function transcribeVoice(token, audioBlob) {
  const formData = new FormData();
  // Name the file 'recording.webm' so backend knows how to save it
  formData.append('file', audioBlob, 'recording.webm');

  const response = await fetch(`${BASE_URL}/voice/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    await handleResponseError(response, 'Failed to transcribe audio');
  }

  return await response.json();
}

export async function getTtsAudio(token, text, signal) {
  const response = await fetch(`${BASE_URL}/chat/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text }),
    signal
  });

  if (!response.ok) {
    await handleResponseError(response, 'TTS request failed');
  }

  return response;
}

