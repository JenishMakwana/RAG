import { useState, useEffect } from 'react';
import { 
  FileText, 
  MessageSquare, 
  Calendar, 
  Layers, 
  Clock,
  ExternalLink,
  Search
} from 'lucide-react';
import { fetchDocuments } from '../api';

export default function DocsLibrary({ token, onSelectChat, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await fetchDocuments(token);
      setDocuments(data.documents);
    } catch (err) {
      setError('Failed to load library');
      if (err.status === 401 && onLogout) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadDocs();
  }, [token, onLogout]);

  const filteredDocs = documents.filter(doc => 
    doc.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.session_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="library-container">
      <div className="library-header-actions">
        <div className="search-bar">
          <Search size={18} />
          <input 
            type="text" 
            placeholder="Search documents or chats..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="stats-header">
           <div className="stat-chip">
             <FileText size={14} />
             <span>{documents.length} Documents</span>
           </div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="library-grid-view">
        {loading ? (
          <div className="library-loader">
             <div className="loader-ring"></div>
             <p>Scanning your secure storage...</p>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="empty-library">
            <FileText size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
            <h3>No documents found</h3>
            <p>Upload documents in a chat to see them here.</p>
          </div>
        ) : (
          <div className="library-table-wrapper">
            <table className="library-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Upload Date</th>
                  <th>Source Chat</th>
                  <th>Scale</th>
                  <th>Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr key={doc.id || doc.filename}>
                    <td data-label="Document">
                      <div className="doc-primary-cell">
                        <div className="doc-icon-small">
                          <FileText size={16} />
                        </div>
                        <span className="doc-name">{doc.filename}</span>
                      </div>
                    </td>
                    <td data-label="Upload Date">
                      <div className="metadata-cell">
                        <Calendar size={14} />
                        <span>{new Date(doc.date).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td data-label="Source Chat">
                      {doc.session_id ? (
                        <button className="chat-link-btn" onClick={() => onSelectChat(doc.session_id)}>
                          <MessageSquare size={14} />
                          <span>{doc.session_title}</span>
                          <ExternalLink size={12} className="hover-only" />
                        </button>
                      ) : (
                        <span className="text-muted">No Session</span>
                      )}
                    </td>
                    <td data-label="Scale">
                      <div className="metadata-cell">
                        <Layers size={14} />
                        <span>{doc.chunks} Chunks</span>
                      </div>
                    </td>
                    <td data-label="Efficiency">
                      <div className="metadata-cell">
                        <Clock size={14} />
                        <span>{doc.embed_time}s</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
