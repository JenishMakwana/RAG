import { useState, useEffect } from 'react';
import { 
  FileText, 
  Trash2, 
  MessageSquare, 
  Calendar, 
  Layers, 
  Clock,
  ExternalLink,
  Search
} from 'lucide-react';
import { fetchDocuments, deleteDocument } from '../api';

export default function DocsLibrary({ token, onSelectChat, onDeleteSuccess }) {
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadDocs();
  }, [token]);

  const handleDelete = async (filename) => {
    if (!confirm(`Are you sure you want to delete "${filename}" and its embeddings?`)) return;
    try {
      await deleteDocument(token, filename);
      setDocuments(prev => prev.filter(d => d.filename !== filename));
      if (onDeleteSuccess) onDeleteSuccess();
    } catch (err) {
      alert(err.message);
    }
  };

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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <tr key={doc.id || doc.filename}>
                    <td>
                      <div className="doc-primary-cell">
                        <div className="doc-icon-small">
                          <FileText size={16} />
                        </div>
                        <span className="doc-name">{doc.filename}</span>
                      </div>
                    </td>
                    <td>
                      <div className="metadata-cell">
                        <Calendar size={14} />
                        <span>{new Date(doc.date).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td>
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
                    <td>
                      <div className="metadata-cell">
                        <Layers size={14} />
                        <span>{doc.chunks} Chunks</span>
                      </div>
                    </td>
                    <td>
                      <div className="metadata-cell">
                        <Clock size={14} />
                        <span>{doc.embed_time}s</span>
                      </div>
                    </td>
                    <td>
                      <button className="delete-row-btn" onClick={() => handleDelete(doc.filename)} title="Delete Document">
                        <Trash2 size={16} />
                      </button>
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
