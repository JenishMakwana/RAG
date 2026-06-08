import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
const logo = "https://huggingface.co/spaces/JenishMakwana/RAG/resolve/main/frontend-react/public/logo.png";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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
  CheckCircle,
  MessageSquare,
  BrainCircuit,
  ShieldCheck,
  Scale,
  AlertCircle
} from 'lucide-react';
import { 
  chatQuery, 
  fetchChatHistory, 
  uploadDocument, 
  transcribeVoice,
  getTtsAudio
} from '../api';

// ... (existing functions)

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
  setSessionDocuments,
  onLogout
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
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pendingSelectionQuery, setPendingSelectionQuery] = useState(null);
  
  // TTS Highlighting State
  const [highlightedInfo, setHighlightedInfo] = useState({ 
    msgIdx: null, 
    sentence: null, 
    wordIdx: -1 
  });
  const highlightTimerRef = useRef(null);

  /**
   * Injects <mark> tags into raw markdown while preserving formatting.
   * This handles the core logic of 'Seamless Highlighting'
   */
  const injectHighlighting = (rawText, msgIdx) => {
    if (highlightedInfo.msgIdx !== msgIdx || !highlightedInfo.sentence) {
      return rawText;
    }

    const { sentence } = highlightedInfo;
    
    // Find the exact sentence block. 
    const sentencePos = rawText.indexOf(sentence);
    if (sentencePos === -1) return rawText;

    const highlightedSentence = `<mark class="highlight-sentence">${sentence}</mark>`;
    const before = rawText.substring(0, sentencePos);
    const after = rawText.substring(sentencePos + sentence.length);
    return before + highlightedSentence + after;
  };

  const toggleFileSelection = (filename) => {
    setSelectedFiles(prev => {
      const exists = prev.includes(filename);
      if (exists) return prev.filter(f => f !== filename);
      return [...prev, filename];
    });
  };

  const renderMessageContent = (text, msgIdx) => {
    if (!text || typeof text !== 'string') return text;
    
    const sourceMarker = '[Source:';
    let content = text;
    let source = '';

    if (text.includes(sourceMarker)) {
      const parts = text.split(sourceMarker);
      content = parts[0];
      source = sourceMarker + parts.slice(1).join(sourceMarker);
    }

    const processedContent = injectHighlighting(content, msgIdx);

    return (
      <>
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]} 
          rehypePlugins={[rehypeRaw]}
        >
          {processedContent}
        </ReactMarkdown>
        {source && (
          <div className="message-citation">
            {source}
          </div>
        )}
      </>
    );
  };

  const renderErrorMessage = (text) => {
    if (!text || typeof text !== 'string') return text;
    const lines = text.split('\n');
    const headerText = lines[0];
    const detailText = lines.slice(1).join('\n');

    return (
      <div className="error-body">
        <div className="error-header">
          <AlertCircle size={16} className="error-header-icon" />
          <span className="error-header-title">{headerText}</span>
        </div>
        {detailText && (
          <div className="error-details">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {detailText}
            </ReactMarkdown>
          </div>
        )}
      </div>
    );
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploading(true);
    setIsUploading(true);
    
    try {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          try {
            const result = await uploadDocument(token, file, sessionId);
            return { file, result, success: true };
          } catch (err) {
            return { file, error: err.message, status: err.status, success: false };
          }
        })
      );

      const successful = results.filter(r => r.value && r.value.success);
      const failed = results.filter(r => (r.value && !r.value.success) || r.status === 'rejected');

      const isUnauthorized = failed.some(r => r.value?.status === 401);
      if (isUnauthorized && onLogout) {
        onLogout();
        return;
      }

      if (successful.length > 0) {
        if (onUploadSuccess) onUploadSuccess();
        
        const newDocs = successful.map(r => ({ 
          filename: r.value.file.name, 
          chunks: r.value.result.chunks 
        }));
        
        setSessionDocuments(prev => [...prev, ...newDocs]);
        
        const successMsg = successful.length === 1 
          ? `✅ Attached document: **${successful[0].value.file.name}**`
          : `✅ Attached **${successful.length}** documents successfully.`;
        
        setMessages(prev => [...prev, { role: 'assistant', text: successMsg }]);
      }

      if (failed.length > 0) {
        const errorMsg = failed.map(r => {
          const name = r.value?.file?.name || "Unknown file";
          const error = r.value?.error || "Upload failed";
          return `- ${name}: ${error}`;
        }).join('\n');
        
        setMessages(prev => [...prev, { role: 'error', text: `Failed to upload some documents:\n${errorMsg}` }]);
      }
    } catch (err) {
      alert("An unexpected error occurred during upload.");
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
        if (err.status === 401 && onLogout) {
          onLogout();
        }
      } finally {
        setHistoryLoading(false);
      }
    };
    if (token && sessionId) loadHistory();
  }, [token, sessionId, setMessages, setSessionDocuments, onLogout]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleStartChat = () => {
    setMessages([
      {
        role: 'assistant',
        text: 'Hello! I am your Legal Case Assistant. How can I help you with your case analysis or document research today?'
      }
    ]);
  };

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
      if (err.status === 401 && onLogout) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (uploading) return;
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setIsRecording(false);
          setIsProcessingVoice(true);

          // Stop all audio tracks to release the microphone
          stream.getTracks().forEach(track => track.stop());

          try {
            const result = await transcribeVoice(token, audioBlob);
            if (result.query) setInput(result.query);
          } catch (err) {
            alert('Voice processing failed: ' + err.message);
          } finally {
            setIsProcessingVoice(false);
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        setIsRecording(false);
        alert('Microphone error: ' + (err.name || 'Unknown') + ' - ' + (err.message || err));
      }
    }
  };

  const audioQueueRef = useRef([]);
  const abortControllerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Play next item in queue
  const playNextInQueue = () => {
    if (highlightTimerRef.current) clearInterval(highlightTimerRef.current);
    
    if (audioQueueRef.current.length === 0) {
      setIsPlaying(false);
      setSpeakingIdx(null);
      setHighlightedInfo({ msgIdx: null, sentence: null, wordIdx: -1 });
      return;
    }

    const { url, text: sentenceText } = audioQueueRef.current.shift();
    setIsPlaying(true);

    // Update the single audio element's source (iOS/Mobile compatible)
    audioRef.current.src = url;
    audioRef.current.load();

    audioRef.current.onplay = () => {
      setHighlightedInfo(prev => ({ 
        ...prev, 
        sentence: sentenceText,
        wordIdx: 0 
      }));
    };

    audioRef.current.onended = () => {
      URL.revokeObjectURL(url);
      playNextInQueue();
    };

    audioRef.current.play().catch(err => {
      console.error("Playback error", err);
      playNextInQueue();
    });
  };

  const handleSpeak = async (text, index) => {
    // If clicking same button while playing, STOP everything
    if (speakingIdx === index) {
      if (audioRef.current) audioRef.current.pause();
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      
      audioQueueRef.current.forEach(item => URL.revokeObjectURL(item.url));
      audioQueueRef.current = [];
      setSpeakingIdx(null);
      setIsPlaying(false);
      setHighlightedInfo({ msgIdx: null, sentence: null, wordIdx: -1 });
      return;
    }

    // Stop current if any
    if (audioRef.current) audioRef.current.pause();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);

    audioQueueRef.current.forEach(item => URL.revokeObjectURL(item.url));
    audioQueueRef.current = [];

    // Create & unlock the single Audio element synchronously in the user gesture context
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    // Mobile browsers require a synchronous play/pause on a user gesture to lift restriction
    audioRef.current.play().then(() => {
      audioRef.current.pause();
    }).catch(() => {
      // Ignore initial play error on empty source
    });
    
    setSpeakingIdx(index);
    setHighlightedInfo({ msgIdx: index, sentence: null, wordIdx: -1 });
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await getTtsAudio(token, text, controller.signal);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let startedPlaying = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep last partial line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const { audio: b64, text: sentenceText } = JSON.parse(line);
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            // Queue only the url and text (avoiding creating new Audio elements asynchronously)
            audioQueueRef.current.push({ url, text: sentenceText });

            // If we haven't started playing, start now
            if (!startedPlaying) {
              startedPlaying = true;
              playNextInQueue();
            }
          } catch (e) {
            console.error("Error parsing audio chunk", e);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("TTS Stream error", err);
        setSpeakingIdx(null);
      }
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
                <div className="welcome-logo-container" style={{ 
                  width: '64px', 
                  height: '64px', 
                  margin: '0 auto 1.5rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  background: '#000000',
                  border: '1.5px solid rgba(168, 85, 247, 0.45)',
                  boxShadow: '0 12px 32px rgba(168, 85, 247, 0.25), inset 0 0 16px rgba(168, 85, 247, 0.2)',
                  padding: '4px',
                  borderRadius: '16px'
                }}>
                  <img src={logo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '12px' }} />
                </div>
                <h2>Legal Case Assistant</h2>
                <p className="welcome-subtitle">
                  Analyze complex case files, retrieve precise legal citations, and verify precedents securely.
                </p>

                <div className="system-pills-row">
                  <div className="system-pill">
                    <BrainCircuit size={16} className="pill-icon" />
                    <span>Always Online</span>
                  </div>
                  <div className="system-pill">
                    <Scale size={16} className="pill-icon" />
                    <span>Smart Search</span>
                  </div>
                  <div className="system-pill">
                    <ShieldCheck size={16} className="pill-icon" />
                    <span>Ironclad Privacy</span>
                  </div>
                </div>

                <button 
                  className="start-chat-btn" 
                  onClick={handleStartChat}
                >
                  <MessageSquare size={16} style={{ marginRight: '8px' }} />
                  <span>Start Chat</span>
                </button>
              </div>
            )}
            
            {messages.map((m, i) => (
              <div key={i} className={`message-bubble ${m.role}`}>
                {m.role === 'error' ? (
                  renderErrorMessage(m.text)
                ) : (
                  <div className="message-content">
                    {m.role === 'assistant' ? (
                      renderMessageContent(m.text, i)
                    ) : (
                      m.text
                    )}
                  </div>
                )}
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

      {messages.length > 0 && (
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
          {uploading && (
            <div className="embedding-status">
              <div className="mini-spinner"></div>
              <span>Processing and embedding documents... Please wait.</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="chat-input-wrapper">
            <label className="icon-btn" title="Attach Document">
              <input type="file" accept=".pdf" multiple style={{display: 'none'}} onChange={handleUpload} disabled={loading || uploading} />
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
                selectedFiles.length > 0 ? `Searching ${selectedFiles.length} doc${selectedFiles.length > 1 ? 's' : ''}...` :
                sessionDocuments.length > 0 ? "Search documents..." :
                "Ask a question..."
              }
              disabled={loading || isProcessingVoice}
            />
            <button type="submit" className="send-btn" disabled={loading || uploading || !input.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
