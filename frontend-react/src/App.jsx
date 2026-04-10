import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
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
  const [username, setUsername] = useState(localStorage.getItem('rag_username') || '');
  const [messages, setMessages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(generateId());
  const [refreshSessions, setRefreshSessions] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleLoginSuccess = (newToken, newUsername) => {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem('rag_token', newToken);
    localStorage.setItem('rag_username', newUsername);
  };

  const handleLogout = () => {
    setToken('');
    setUsername('');
    setMessages([]);
    localStorage.removeItem('rag_token');
    localStorage.removeItem('rag_username');
  };

  const handleNewChat = () => {
    setCurrentSessionId(generateId());
    setMessages([]);
  };

  const handleSelectSession = (sessionId) => {
    setCurrentSessionId(sessionId);
  };

  if (!token) {
    return <Auth onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      {isUploading && (
        <div className="loading-overlay">
          <div className="loader-ring"></div>
          <p>Processing and Embedding Documents...</p>
        </div>
      )}
      <div className={`App ${isUploading ? 'blurred' : ''}`}>
        <Sidebar 
          token={token} 
          username={username}
          onLogout={handleLogout} 
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          setIsUploading={setIsUploading}
          currentSessionId={currentSessionId}
          refreshSessions={refreshSessions}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
        />
        <ChatWindow 
          token={token} 
          messages={messages} 
          setMessages={setMessages} 
          sessionId={currentSessionId}
          onFirstMessage={() => setRefreshSessions(prev => prev + 1)}
          setIsUploading={setIsUploading}
          onUploadSuccess={() => setRefreshSessions(prev => prev + 1)}
          isSidebarCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
        />
      </div>
    </>
  );
}

export default App;
