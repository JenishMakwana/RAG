import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Send, 
  Paperclip, 
  Mic, 
  MicOff, 
  PanelLeftClose, 
  PanelLeftOpen,
  Sparkles,
  Search,
  Users,
  FileText,
  Volume2,
  VolumeX,
  ChevronRight,
  CheckCircle
} from 'lucide-react';
import { 
  chatQuery, 
  fetchChatHistory, 
  uploadDocument, 
  startVoiceRecording, 
  stopVoiceRecording,
  getTtsAudio
} from '../api';

export default function ChatWindow({ 
  token, 
  messages, 
  setMessages, 
  sessionId, 
  onFirstMessage, 
  setIsUploading,
  onUploadSuccess,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
  sessionDocuments,
  setSessionDocuments
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pendingSelectionQuery, setPendingSelectionQuery] = useState(null);

  const toggleFileSelection = (filename) => {
    setSelectedFiles(prev => {
      const exists = prev.includes(filename);
      if (exists) return prev.filter(f => f !== filename);
      return [...prev, filename];
    });
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setIsUploading(true);
    try {
      const result = await uploadDocument(token, file, sessionId);
      if (onUploadSuccess) onUploadSuccess();
      const newDoc = { filename: file.name, chunks: result.chunks };
      setSessionDocuments(prev => [...prev, newDoc]);
      // Auto-select new document additively
      setSelectedFiles(prev => [...new Set([...prev, file.name])]);
      setMessages(prev => [...prev, { role: 'assistant', text: `✅ Attached document: **${file.name}**` }]);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      setIsUploading(false);
      e.target.value = null;
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const data = await fetchChatHistory(token, sessionId);
        setMessages(data.history);
        setSessionDocuments(data.documents || []);
        setSelectedFiles([]); // Reset selection when switching chats
      } catch (err) {
        setMessages([]);
        setSessionDocuments([]);
      } finally {
        setHistoryLoading(false);
      }
    };
    if (token && sessionId) loadHistory();
  }, [token, sessionId, setMessages, setSessionDocuments]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submitQuery = async (queryText, force = false) => {
    if (!queryText.trim() || loading) return;

    // Check if we need to "ask" for document focus
    if (!force && sessionDocuments.length > 1 && selectedFiles.length === 0) {
      setPendingSelectionQuery(queryText);
      return;
    }

    const isFirstMessage = !messages.some(m => m.role === 'user');
    setMessages(prev => [...prev, { role: 'user', text: queryText }]);
    setLoading(true);

    try {
      // Send the list of selected filenames (if any)
      const filenames = selectedFiles.length > 0 ? selectedFiles : null;
      
      const response = await chatQuery(token, queryText, sessionId, null, filenames);
      const aiMessage = { role: 'assistant', text: '' };
      setMessages(prev => [...prev, aiMessage]);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { ...newMessages[newMessages.length - 1], text: fullText };
          return newMessages;
        });
      }
      
      if (isFirstMessage) onFirstMessage();
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', text: err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const queryText = input;
    if (!queryText.trim()) return;
    setInput('');
    submitQuery(queryText);
  };

  const handleConfirmSelection = () => {
    if (pendingSelectionQuery) {
      const queryToSubmit = pendingSelectionQuery;
      setPendingSelectionQuery(null);
      submitQuery(queryToSubmit, true);
    }
  };

  const toggleVoice = async () => {
    if (isRecording) {
      setIsRecording(false);
      setIsProcessingVoice(true);
      try {
        const result = await stopVoiceRecording(token);
        if (result.query) setInput(result.query);
      } catch (err) {
        alert('Voice processing failed');
      } finally {
        setIsProcessingVoice(false);
      }
    } else {
      setIsRecording(true);
      try {
        await startVoiceRecording(token);
      } catch (err) {
        setIsRecording(false);
        alert('Microphone access denied');
      }
    }
  };

  const handleSpeak = async (text, index) => {
    if (speakingIdx === index) {
      if (audioRef.current) {
        audioRef.current.pause();
        setSpeakingIdx(null);
      }
      return;
    }

    setSpeakingIdx(index);
    try {
      const blob = await getTtsAudio(token, text);
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeakingIdx(null);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (err) {
      console.error(err);
      setSpeakingIdx(null);
    }
  };

  return (
    <div className="chat-main">
      <header className="chat-header">
        <div className="header-left">
          <button 
            className="sidebar-toggle" 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <h1>Legal Case Analysis</h1>
        </div>
      </header>
      <div className="chat-messages">
        {historyLoading ? (
          <div className="welcome-screen">
             <div className="loader-ring" style={{ width: '40px', height: '40px', margin: '0 auto 1rem' }}></div>
             <p>Restoring conversation...</p>
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="welcome-screen">
                <Sparkles size={48} style={{ color: 'var(--primary)', marginBottom: '1.5rem' }} />
                <h2>How can I help you today?</h2>
                <p>Upload legal documents and I'll help you summarize, extract terms, or analyze case history.</p>
                <div className="suggestions-container">
                  <button className="suggestion-chip" onClick={() => submitQuery("Summarize the key points of this case.")}>
                    <FileText size={16} />
                    <span>Case Summary</span>
                  </button>
                  <button className="suggestion-chip" onClick={() => submitQuery("What are the legal precedents mentioned?")}>
                    <Search size={16} />
                    <span>Find Precedents</span>
                  </button>
                  <button className="suggestion-chip" onClick={() => submitQuery("Who are the primary parties in this document?")}>
                    <Users size={16} />
                    <span>Identify Parties</span>
                  </button>
                </div>
              </div>
            )}
            
            {messages.map((m, i) => (
              <div key={i} className={`message-bubble ${m.role}`}>
                <div className="message-content">
                  {m.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                  ) : m.text}
                </div>
                {m.role === 'assistant' && !m.text.startsWith('✅') && !m.text.includes('No documents found') && (
                  <button 
                    className={`speak-btn ${speakingIdx === i ? 'speaking' : ''}`}
                    onClick={() => handleSpeak(m.text, i)}
                    title="Read Aloud"
                  >
                    {speakingIdx === i ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="message-bubble assistant">
                <div className="loading-dots">Analyzing</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="chat-input-area">
        {sessionDocuments.length > 0 && pendingSelectionQuery && (
          <div className="selector-panel prompt">
            <div className="selector-header">
              <h3>Select focus for your question</h3>
              <div className="selector-pagination">
                <span>{selectedFiles.length === 0 ? 'All Documents' : `${selectedFiles.length} selected`}</span>
              </div>
            </div>
            
            <div className="selector-list">
              <div 
                className={`selector-item ${selectedFiles.length === 0 ? 'active' : ''}`}
                onClick={() => setSelectedFiles([])}
              >
                <div className="item-number">
                  {selectedFiles.length === 0 ? <CheckCircle size={16} /> : 1}
                </div>
                <div className="item-info">
                  <span className="item-name">All Documents</span>
                </div>
                <ChevronRight className="item-arrow" size={18} />
              </div>
              
              {sessionDocuments.map((doc, idx) => {
                const isActive = selectedFiles.includes(doc.filename);
                return (
                  <div 
                    key={idx} 
                    className={`selector-item ${isActive ? 'active' : ''}`}
                    onClick={() => toggleFileSelection(doc.filename)}
                  >
                    <div className="item-number">
                      {isActive ? <CheckCircle size={16} /> : idx + 2}
                    </div>
                    <div className="item-info">
                      <span className="item-name">{doc.filename}</span>
                    </div>
                    <ChevronRight className="item-arrow" size={18} />
                  </div>
                );
              })}
            </div>

            <div className="selector-footer">
               <button className="selector-confirm-btn" onClick={handleConfirmSelection}>
                 Analyze selected documents
               </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="chat-input-wrapper">
          <label className="icon-btn" title="Attach Document">
            <input type="file" accept=".pdf" style={{display: 'none'}} onChange={handleUpload} disabled={loading || uploading} />
            <Paperclip size={20} />
          </label>
          <button 
            type="button" 
            className={`icon-btn voice-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleVoice}
            disabled={loading || uploading || isProcessingVoice}
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isProcessingVoice ? "Processing voice..." : 
              selectedFiles.length > 0 ? `Searching in ${selectedFiles.length} unit${selectedFiles.length > 1 ? 's' : ''}...` :
              sessionDocuments.length > 0 ? "Searching all documents..." :
              "Ask a question about your documents..."
            }
            disabled={loading || uploading || isProcessingVoice}
          />
          <button type="submit" className="send-btn" disabled={loading || uploading || !input.trim()}>
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
