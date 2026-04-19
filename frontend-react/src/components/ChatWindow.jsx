import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
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
            return { file, error: err.message, success: false };
          }
        })
      );

      const successful = results.filter(r => r.value && r.value.success);
      const failed = results.filter(r => (r.value && !r.value.success) || r.status === 'rejected');

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

    const { audioObj, url, text: sentenceText } = audioQueueRef.current.shift();
    audioRef.current = audioObj;
    setIsPlaying(true);

    audioObj.onplay = () => {
      setHighlightedInfo(prev => ({ 
        ...prev, 
        sentence: sentenceText,
        wordIdx: 0 
      }));
    };

    audioObj.onended = () => {
      URL.revokeObjectURL(url);
      playNextInQueue();
    };

    audioObj.play().catch(err => {
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
            
            // PRE-LOAD: Create and prime the audio object immediately
            const audioObj = new Audio(url);
            audioObj.load(); // Prime the browser buffer
            
            audioQueueRef.current.push({ audioObj, url, text: sentenceText });

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
                    renderMessageContent(m.text, i)
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
