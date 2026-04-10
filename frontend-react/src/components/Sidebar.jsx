import { useState, useEffect } from 'react';
import { 
  Plus, 
  MessageSquare, 
  Trash2, 
  FileText, 
  LogOut, 
  Gavel, 
  ChevronLeft 
} from 'lucide-react';
import { 
  fetchDocuments, 
  deleteDocument, 
  fetchChatSessions, 
  deleteChatSession 
} from '../api';

export default function Sidebar({ 
  token, 
  username, 
  onLogout, 
  onNewChat, 
  onSelectSession, 
  setIsUploading, 
  currentSessionId,
  refreshSessions,
  isCollapsed,
  setIsCollapsed
}) {
  const [documents, setDocuments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [docsData, sessionsData] = await Promise.all([
        fetchDocuments(token),
        fetchChatSessions(token)
      ]);
      setDocuments(docsData.documents);
      setSessions(sessionsData.sessions);
    } catch (err) {
      setError('Failed to load data');
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token, refreshSessions]);

  const handleDeleteDoc = async (e, filename) => {
    e.stopPropagation();
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await deleteDocument(token, filename);
      setDocuments(prev => prev.filter(doc => doc.filename !== filename));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (!confirm(`Delete this chat session?`)) return;
    try {
      await deleteChatSession(token, sessionId);
      if (sessionId === currentSessionId) {
        onNewChat();
      }
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-content">
        <div className="sidebar-header">
          <div className="user-avatar" style={{ background: 'var(--primary)', width: '32px', height: '32px' }}>
            <Gavel size={18} />
          </div>
          <h2>Case Assistant</h2>
        </div>

        <button className="new-chat-btn" onClick={onNewChat}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>

        <div className="document-list-container">
          <div className="list-section">
            <h3>Recent Chats</h3>
            <div className="sessions-list">
              {sessions.map((session) => (
                <div 
                  key={session.id} 
                  className={`session-item ${currentSessionId === session.id ? 'active' : ''}`}
                  onClick={() => onSelectSession(session.id)}
                >
                  <MessageSquare size={16} />
                  <span className="session-title">{session.title || 'Untitled Chat'}</span>
                  <button className="delete-btn" onClick={(e) => handleDeleteSession(e, session.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="list-section">
            <h3>My Library</h3>
            {error && <div className="error" style={{fontSize: '0.7rem', color: '#ef4444', padding: '0.5rem'}}>{error}</div>}
            {documents.map((doc) => (
              <div key={doc.filename} className="doc-item">
                <FileText size={16} />
                <div className="doc-info">
                  <div className="doc-name">{doc.filename}</div>
                  <div className="doc-date">{new Date(doc.date).toLocaleDateString()}</div>
                </div>
                <button className="delete-btn" onClick={(e) => handleDeleteDoc(e, doc.filename)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {username ? username[0].toUpperCase() : 'U'}
            </div>
            <div className="user-info">
              <div className="username-display">{username || 'User'}</div>
              <button className="logout-btn" onClick={onLogout}>
                Sign Out
              </button>
            </div>
            <LogOut size={16} className="text-muted" style={{ cursor: 'pointer' }} onClick={onLogout} />
          </div>
        </div>
      </div>
    </aside>
  );
}
