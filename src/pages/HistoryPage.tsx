import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, ArrowRight, Calendar, FileText, Link as LinkIcon, Pencil, Plus, RotateCcw, Settings, Trash2, User } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { listBusinesses, listHistory, type HistoryEntry } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: businesses } = useQuery({ queryKey: ['businesses'], queryFn: listBusinesses });
  const businessId = businesses?.[0]?.id;

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [error, setError] = React.useState<any>(null);
  
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    setIsError(false);

    try {
      if (!businessId) return;
      const newItems = await listHistory(businessId);
      setHistory(newItems || []);
      setHasMore(false);
    } catch (err: any) {
      console.error("Fetch history failed:", err);
      setIsError(true);
      setError(err);
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  React.useEffect(() => {
    if (businessId) {
      fetchHistory();
    }
  }, [businessId]);

  const handleScroll = () => {
    // No-op scroll handler as listHistory loads all/limited records at once
  };

  const filteredHistory = React.useMemo(() => {
    if (!history) return [];
    if (isAdmin) return history;

    // Filter history for current user
    return history.filter(entry => {
      // Match by userId or userEmail first
      if (entry.userId && user?.id && String(entry.userId) === String(user.id)) return true;
      if (entry.userEmail && user?.email && entry.userEmail.toLowerCase() === user.email.toLowerCase()) return true;
      
      // Fallback to userName matching if neither ID nor Email is present in log entry (for older logs)
      if (!entry.userId && !entry.userEmail && entry.userName && user?.name && entry.userName.toLowerCase() === user.name.toLowerCase()) return true;
      
      return false;
    });
  }, [history, isAdmin, user]);

  const hasActiveFilters = !isAdmin;

  React.useEffect(() => {
    // No-op effect for infinite pagination checks
  }, [filteredHistory.length, isLoading, loadingMore, hasActiveFilters, hasMore, history.length]);

  return (
    <div className="history-page" ref={containerRef} onScroll={handleScroll}>
      <div className="history-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <div className="header-title-group">
          <h1 className="header-title">History</h1>
          <p className="header-subtitle">
            {isAdmin 
              ? 'All changes and actions made across registers by all users' 
              : 'Your personal changes and actions made across registers'}
          </p>
        </div>
      </div>

      <div className="history-content">
        {isLoading ? (
          <div className="loading-state">
            <Activity size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p>Loading history...</p>
          </div>
        ) : isError ? (
          <div className="empty-state" style={{ color: '#ef4444' }}>
            <Activity size={48} className="empty-icon" />
            <p style={{ fontWeight: 600 }}>Failed to load history</p>
            <p style={{ fontSize: 13, marginTop: 4, color: '#64748b' }}>
              {(error as any)?.message || 'An unknown error occurred. Check your internet connection.'}
            </p>
          </div>
        ) : !filteredHistory || filteredHistory.length === 0 ? (
          <div className="empty-state">
            <Activity size={48} className="empty-icon" />
            <p>No history recorded yet.</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Actions like adding rows, creating registers, and editing data will appear here.</p>
          </div>
        ) : (
          <div className="history-timeline">
            {filteredHistory.map((entry: HistoryEntry) => (
              <HistoryCard key={entry.id} entry={entry} navigate={navigate} />
            ))}
          </div>
        )}
        {loadingMore && (
          <div className="loading-state" style={{ padding: '20px 0' }}>
            <Activity size={24} className="animate-spin" style={{ opacity: 0.5, marginBottom: 8, display: 'inline-block' }} />
            <p style={{ fontSize: 13, margin: 0 }}>Loading more history...</p>
          </div>
        )}
        {!loadingMore && hasMore && history.length > 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <button 
              onClick={() => fetchHistory()}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: 'white',
                color: '#64748b',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Load More
            </button>
          </div>
        )}
      </div>

      <style>{`
      .history-page {
        flex: 1;
        background: #f8fafc;
        height: 100vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }

      .history-header {
        background: white;
        padding: 24px 32px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        gap: 20px;
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .back-button {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        color: #64748b;
      }

      .back-button:hover {
        background: #f1f5f9;
        color: var(--navy);
        border-color: var(--navy);
      }

      .header-title-group .header-title {
        font-size: 20px;
        font-weight: 700;
        color: #1e293b;
        margin: 0;
      }

      .header-title-group .header-subtitle {
        font-size: 14px;
        color: #64748b;
        margin: 4px 0 0;
      }

      .history-content {
        padding: 32px;
        max-width: 900px;
        margin: 0 auto;
        width: 100%;
      }

      .history-timeline {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      .history-card {
        display: flex;
        gap: 24px;
      }

      .history-card-icon {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
      }

      .icon-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: white;
        border: 2px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        flex-shrink: 0;
      }

      .timeline-connector {
        flex: 1;
        width: 2px;
        background: #e2e8f0;
        margin: 4px 0;
        min-height: 20px;
      }

      .history-card:last-child .timeline-connector {
        display: none;
      }

      .history-card-main {
        flex: 1;
        background: white;
        border-radius: 12px;
        padding: 20px;
        border: 1px solid #e2e8f0;
        margin-bottom: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        transition: transform 0.2s, box-shadow 0.2s;
      }

      .history-card-main:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      }

      .history-card-clickable .history-card-main:hover {
        border-color: #a5b4fc;
        box-shadow: 0 4px 12px -2px rgba(99,102,241,0.2);
      }

      .history-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 8px;
      }

      .action-badge {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .timestamp {
        font-size: 12px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .history-details {
        font-size: 15px;
        color: #1e293b;
        line-height: 1.5;
        margin: 0 0 16px;
      }

      .history-details-title {
        font-size: 15px;
        color: #1e293b;
        line-height: 1.5;
        font-weight: 600;
        margin: 0 0 8px;
      }

      .history-changes-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
        margin-bottom: 16px;
      }

      .changes-table-wrapper {
        width: 100%;
        overflow-x: auto;
        margin: 12px 0;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: white;
      }

      .changes-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        text-align: left;
      }

      .changes-table th {
        background: #f8fafc;
        color: #475569;
        font-weight: 600;
        padding: 10px 14px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .changes-table td {
        padding: 10px 14px;
        border-bottom: 1px solid #f1f5f9;
        vertical-align: middle;
      }

      .changes-table tr:last-child td {
        border-bottom: none;
      }

      .col-name {
        font-weight: 600;
        color: #334155;
      }

      .change-from {
        color: #b91c1c;
        background: #fef2f2;
        border: 1px solid #fee2e2;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
      }

      .change-to {
        color: #15803d;
        font-weight: 600;
        background: #f0fdf4;
        border: 1px solid #dcfce7;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
      }

      .empty-val {
        font-style: italic;
        color: #94a3b8;
      }

      .expand-changes-btn {
        align-self: flex-start;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        color: #4f46e5;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        padding: 6px 12px;
        margin-top: 4px;
        border-radius: 6px;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .expand-changes-btn:hover {
        background: #e2e8f0;
        color: #3730a3;
        border-color: #cbd5e1;
      }

      .history-meta {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        border-top: 1px solid #f1f5f9;
        padding-top: 12px;
      }

      .meta-item {
        font-size: 12px;
        color: #64748b;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .loading-state, .empty-state {
        text-align: center;
        padding: 60px 0;
        color: #64748b;
      }

      .empty-icon {
        margin-bottom: 16px;
        opacity: 0.3;
      }
    `}</style>
    </div>
  );
}

interface HistoryCardProps {
  entry: HistoryEntry;
  navigate: ReturnType<typeof useNavigate>;
}

function HistoryCard({ entry, navigate }: HistoryCardProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { icon, color, bg } = getActionStyle(entry.action);

  const parsed = React.useMemo(() => parseDetails(entry.details, entry.action), [entry.details, entry.action]);

  return (
    <div className={`history-card${entry.registerId ? ' history-card-clickable' : ''}`}
      onClick={() => {
        if (entry.registerId && entry.entryId) {
          navigate(`/register/${entry.registerId}?row=${entry.entryId}`);
        } else if (entry.registerId) {
          navigate(`/register/${entry.registerId}`);
        }
      }}
      style={{ cursor: entry.registerId ? 'pointer' : 'default' }}
    >
      <div className="history-card-icon">
        <div className="icon-circle" style={{ borderColor: color, background: bg }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <div className="timeline-connector" />
      </div>
      <div className="history-card-main">
        <div className="history-card-header">
          <span className="action-badge" style={{ background: bg, color }}>
            {entry.action}
          </span>
          <span className="timestamp">
            <Calendar size={12} />
            {new Intl.DateTimeFormat('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }).format(new Date(entry.timestamp))}
          </span>
        </div>
        
        {parsed.isEditRow && parsed.changes.length > 0 ? (
          <div className="history-changes-container">
            <p className="history-details-title">{parsed.title}</p>
            <div className="changes-table-wrapper" onClick={(e) => e.stopPropagation()}>
              <table className="changes-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {(isExpanded ? parsed.changes : parsed.changes.slice(0, 3)).map((change, idx) => (
                    <tr key={idx}>
                      <td className="col-name">{change.column}</td>
                      <td>
                        {isImageValue(change.from) ? (
                          <div className="history-value-images from">
                            {change.from.split('|||').map((url, i) => (
                              <img 
                                key={i} 
                                src={url.trim()} 
                                alt="Before" 
                                className="history-image-preview" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(url.trim(), '_blank');
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="change-from">
                            {change.from || <span className="empty-val">empty</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        {isImageValue(change.to) ? (
                          <div className="history-value-images to">
                            {change.to.split('|||').map((url, i) => (
                              <img 
                                key={i} 
                                src={url.trim()} 
                                alt="After" 
                                className="history-image-preview" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(url.trim(), '_blank');
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="change-to">
                            {change.to || <span className="empty-val">empty</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.changes.length > 3 && (
              <button
                className="expand-changes-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
              >
                {isExpanded ? 'Show less' : `+ ${parsed.changes.length - 3} more changes`}
              </button>
            )}
          </div>
        ) : (
          <p className="history-details">{entry.details}</p>
        )}

        <div className="history-meta">
          {entry.userName && (
            <span className="meta-item">
              <User size={12} />
              {entry.userName}
            </span>
          )}
          {entry.registerName && (
            <span className="meta-item">
              <FileText size={12} />
              {entry.registerName}
            </span>
          )}
          {entry.registerId && (
            <span className="meta-item" style={{ marginLeft: 'auto', color: '#6366f1', fontWeight: 600, fontSize: 11 }}>
              View in Register <ArrowRight size={11} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function isImageValue(val: string): boolean {
  if (!val) return false;
  const urls = val.split('|||');
  return urls.every(url => {
    const u = url.trim();
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('data:image/');
  }) && urls.some(url => {
    const u = url.trim().toLowerCase();
    return u.includes('cloudinary.com') || u.includes('/image/upload/') || u.endsWith('.png') || u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.gif') || u.endsWith('.webp');
  });
}

function parseDetails(details: string, action: string) {
  if (action.toLowerCase() !== 'edit row') {
    return { isEditRow: false, title: details, changes: [] };
  }

  const parts = details.split(': ');
  if (parts.length < 2) {
    return { isEditRow: true, title: details, changes: [] };
  }

  const title = parts[0];
  const changesStr = parts.slice(1).join(': ');

  const changes: Array<{ column: string; from: string; to: string }> = [];
  let currentToken = '';
  let inQuotes = false;

  for (let i = 0; i < changesStr.length; i++) {
    const char = changesStr[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentToken += char;
    } else if (char === ',' && !inQuotes) {
      const trimmed = currentToken.trim();
      if (trimmed) {
        changes.push(parseSingleChange(trimmed));
      }
      currentToken = '';
      if (changesStr[i + 1] === ' ') {
        i++;
      }
    } else {
      currentToken += char;
    }
  }

  const finalTrimmed = currentToken.trim();
  if (finalTrimmed) {
    changes.push(parseSingleChange(finalTrimmed));
  }

  return {
    isEditRow: true,
    title,
    changes: changes.filter(c => c.column !== '')
  };
}

function parseSingleChange(part: string): { column: string; from: string; to: string } {
  const match = part.match(/(.+?)\s+changed\s+from\s+"(.*?)"\s+to\s+"(.*?)"$/);
  if (match) {
    return {
      column: match[1].trim(),
      from: match[2],
      to: match[3]
    };
  }
  return { column: '', from: '', to: part };
}

function getActionStyle(action: string): { icon: React.ReactNode; color: string; bg: string } {
  const a = action.toLowerCase();
  if (a.includes('add row') || a.includes('create')) return { icon: <Plus size={16} />, color: '#10b981', bg: '#ecfdf5' };
  if (a.includes('delete')) return { icon: <Trash2 size={16} />, color: '#ef4444', bg: '#fef2f2' };
  if (a.includes('rename') || a.includes('edit')) return { icon: <Pencil size={16} />, color: '#3b82f6', bg: '#eff6ff' };
  if (a.includes('link')) return { icon: <LinkIcon size={16} />, color: '#8b5cf6', bg: '#f5f3ff' };
  if (a.includes('restore')) return { icon: <RotateCcw size={16} />, color: '#f59e0b', bg: '#fffbeb' };
  if (a.includes('column') || a.includes('type')) return { icon: <Settings size={16} />, color: '#8b5cf6', bg: '#f5f3ff' };
  return { icon: <Activity size={16} />, color: '#64748b', bg: '#f1f5f9' };
}

