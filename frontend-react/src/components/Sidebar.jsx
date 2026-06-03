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
  email,
  onLogout,
  onNewChat,
  onSelectSession,
  setIsUploading,
  currentSessionId,
  refreshSessions,
  isCollapsed,
  setIsCollapsed,
  currentView,
  onViewLibrary,
  sessionDocuments
}) {
  const [sessions, setSessions] = useState([]);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const sessionsData = await fetchChatSessions(token);
      setSessions(sessionsData.sessions);
    } catch (err) {
      setError('Failed to load data');
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token, refreshSessions]);

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

        <button
          className={`library-nav-btn ${currentView === 'library' ? 'active' : ''}`}
          onClick={onViewLibrary}
        >
          <Gavel size={18} />
          <span>Docs Library</span>
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

          {sessionDocuments && sessionDocuments.length > 0 && (
            <div className="list-section">
              <h3>Active Documents</h3>
              {sessionDocuments.map((doc) => (
                <div key={doc.filename} className="doc-item academic">
                  <FileText size={16} />
                  <div className="doc-info">
                    <div className="doc-name">{doc.filename}</div>
                    {doc.chunks && <div className="doc-date">{doc.chunks} Chunks</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <div 
            className={`user-profile ${isProfileExpanded ? 'expanded' : ''}`}
            onClick={() => setIsProfileExpanded(!isProfileExpanded)}
            style={{ cursor: 'pointer' }}
          >
            <div className="user-profile-header">
              <div className="user-avatar">
                {email ? email[0].toUpperCase() : 'U'}
              </div>
              <div className="user-info-basic">
                <div className="username-display">
                  {email ? email.split('@')[0] : 'User'}
                </div>
              </div>
              <div className="expand-indicator" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                <ChevronLeft 
                  size={16} 
                  style={{ 
                    transform: isProfileExpanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform var(--transition-fast)',
                    color: 'var(--text-muted)'
                  }} 
                />
              </div>
            </div>

            {isProfileExpanded && (
              <div className="user-profile-details" onClick={(e) => e.stopPropagation()}>
                <div className="user-detail-item">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{email}</span>
                </div>
                <button className="auth-btn logout-action-btn" onClick={onLogout} style={{ marginTop: '0.5rem', padding: '0.5rem' }}>
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
