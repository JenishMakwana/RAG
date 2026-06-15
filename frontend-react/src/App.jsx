import { useState, useEffect, useCallback } from 'react';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import DocsLibrary from './components/DocsLibrary';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import './App.css';

const generateId = () => {
  try {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2, 15);
  } catch (e) {
    return Math.random().toString(36).substring(2, 15);
  }
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('rag_token') || '');
  const [email, setEmail] = useState(localStorage.getItem('rag_email') || '');
  const [messages, setMessages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(generateId());
  const [currentView, setCurrentView] = useState('chat');
  const [sessionDocuments, setSessionDocuments] = useState([]);
  const [refreshSessions, setRefreshSessions] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleLoginSuccess = useCallback((newToken, newEmail) => {
    setToken(newToken);
    setEmail(newEmail);
    localStorage.setItem('rag_token', newToken);
    localStorage.setItem('rag_email', newEmail);
  }, []);

  const handleLogout = useCallback(() => {
    setToken('');
    setEmail('');
    setMessages([]);
    setSessionDocuments([]);
    setCurrentView('chat');
    localStorage.removeItem('rag_token');
    localStorage.removeItem('rag_email');
  }, []);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(generateId());
    setMessages([]);
    setSessionDocuments([]);
    setCurrentView('chat');
    if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
  }, []);

  const handleSelectSession = useCallback((sessionId) => {
    setCurrentSessionId(sessionId);
    setCurrentView('chat');
    if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
  }, []);

  const handleViewLibrary = useCallback(() => {
    setCurrentView('library');
    if (window.innerWidth <= 768) setIsSidebarCollapsed(true);
  }, []);

  const handleRefreshSessions = useCallback(() => {
    setRefreshSessions(prev => prev + 1);
  }, []);

  if (!token) {
    return <Auth onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <div className="App">
        <Sidebar
          token={token}
          email={email}
          onLogout={handleLogout}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          setIsUploading={setIsUploading}
          currentSessionId={currentSessionId}
          refreshSessions={refreshSessions}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          currentView={currentView}
          onViewLibrary={handleViewLibrary}
          sessionDocuments={sessionDocuments}
        />

        {!isSidebarCollapsed && (
          <div className="sidebar-backdrop" onClick={() => setIsSidebarCollapsed(true)} />
        )}

        {currentView === 'library' ? (
          <div className="library-main-container">
            <header className="chat-header">
              <div className="header-left">
                <button className="sidebar-toggle" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
                  {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
                <h1>Management Library</h1>
              </div>
            </header>
            <DocsLibrary
              token={token}
              onSelectChat={handleSelectSession}
              onLogout={handleLogout}
            />
          </div>
        ) : (
          <ChatWindow
            token={token}
            messages={messages}
            setMessages={setMessages}
            sessionId={currentSessionId}
            onFirstMessage={handleRefreshSessions}
            setIsUploading={setIsUploading}
            onUploadSuccess={handleRefreshSessions}
            isSidebarCollapsed={isSidebarCollapsed}
            setIsSidebarCollapsed={setIsSidebarCollapsed}
            sessionDocuments={sessionDocuments}
            setSessionDocuments={setSessionDocuments}
            onLogout={handleLogout}
          />
        )}
      </div>
    </>
  );
}

export default App;
