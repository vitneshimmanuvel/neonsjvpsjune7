import { Plus, Upload, FileText, FolderOpen, Search, X } from 'lucide-react';
import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RegisterSummary } from '../../lib/api';
import { useAuth } from '../../lib/auth';

interface DashboardContentProps {
  filtered?: RegisterSummary[];
  excelMutation: any;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInputFolder?: () => void;
  search?: string;
  setSearch?: (val: string) => void;
}

const GRADIENTS = [
  { bg: 'linear-gradient(135deg, #0b2545 0%, #0066cc 100%)', accent: '#0066cc' },
  { bg: 'linear-gradient(135deg, #047857 0%, #10b981 100%)', accent: '#10b981' },
  { bg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', accent: '#7c3aed' },
  { bg: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)', accent: '#f59e0b' },
  { bg: 'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)', accent: '#f43f5e' },
  { bg: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)', accent: '#06b6d4' },
];

function getRegisterTheme(id: number | string, iconColor?: string) {
  if (iconColor && iconColor !== 'var(--navy)' && iconColor.startsWith('#')) {
    return { bg: `linear-gradient(135deg, ${iconColor} 0%, #0066cc 100%)`, accent: iconColor };
  }
  const num = typeof id === 'number' ? id : (parseInt(String(id).replace(/\D/g, ''), 10) || 0);
  return GRADIENTS[Math.abs(num) % GRADIENTS.length];
}

export function DashboardContent({ filtered, excelMutation, handleFileUpload, onInputFolder, search, setSearch }: DashboardContentProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = (user as any)?.permissions?.canCreateSheets || (user as any)?.permissions?.isAdmin || (user as any)?.role === 'admin' || (user as any)?.role === 'superadmin' || (user as any)?.role === 'sheet_admin';

  if (!filtered || filtered.length === 0) {
    if (search) {
      return (
        <div className="content-area" style={{ padding: '24px 32px' }}>
          <div className="registers-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>Your Registers</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                  0 registers found
                </p>
              </div>
              {setSearch && (
                <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search all registers..."
                    style={{
                      width: '100%',
                      padding: '9.5px 36px 9.5px 38px',
                      borderRadius: '12px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      color: '#0f172a',
                      background: 'white',
                      outline: 'none',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                    }}
                  />
                  <button
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      background: '#e2e8f0',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '18px',
                      height: '18px',
                      padding: 0
                    }}
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', margin: '0 0 8px 0' }}>No registers found matching "{search}"</p>
              <button
                onClick={() => setSearch && setSearch('')}
                style={{
                  padding: '8px 16px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginTop: '12px'
                }}
              >
                Clear Search Filter
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="content-area" style={{ padding: '24px 32px' }}>
        <div className="empty-state">
          <img src="/logo-transparent.png" alt="AG Trust" className="empty-logo" />
          <h2 className="empty-title">Welcome to AG Trust</h2>
          <p className="empty-sub">Create your first register by selecting a template, starting from scratch, or uploading Excel data.</p>
          <div className="empty-actions">
            <button className="empty-btn" onClick={() => navigate('/templates')}>
              <Plus size={16} />Add New Register
            </button>
            <label htmlFor="excel-upload-empty" className="empty-btn empty-btn-secondary" style={{ marginLeft: 8 }}>
              <Upload size={16} />{excelMutation.isPending ? 'Importing...' : 'Import Excel'}
            </label>
            <input id="excel-upload-empty" type="file" accept=".xlsx, .xls, .csv" className="hidden-input" title="Upload Excel File" aria-label="Upload Excel File" onChange={handleFileUpload} />
            <div className="empty-btn empty-btn-secondary" style={{ marginLeft: 8, cursor: 'pointer' }} onClick={onInputFolder}>
              <FolderOpen size={16} />Import Folder
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content-area" style={{ padding: '24px 32px' }}>
      <style>{`
        .dash-header-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .dash-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .dash-main-title {
          margin: 0;
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.4px;
        }
        .dash-badge-count {
          padding: 3px 10px;
          border-radius: 20px;
          background: #eff6ff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid #bfdbfe;
        }
        .dash-search-input {
          width: 100%;
          padding: 9.5px 36px 9.5px 38px;
          border-radius: 12px;
          border: 1px solid #cbd5e1;
          font-size: 13px;
          color: #0f172a;
          background: #ffffff;
          outline: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .dash-search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3.5px rgba(37, 99, 235, 0.14), 0 4px 12px rgba(0,0,0,0.05);
        }
        .dash-card-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 20px;
        }
        .dash-reg-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 24px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          position: relative;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 3px 10px rgba(0,0,0,0.03);
          overflow: hidden;
        }
        .dash-reg-card:hover {
          transform: translateY(-4px);
          border-color: #93c5fd;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.1);
        }
        .dash-card-accent-bar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
        }
        .dash-icon-box {
          width: 56px;
          height: 56px;
          border-radius: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          color: #ffffff;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .dash-reg-card:hover .dash-icon-box {
          transform: scale(1.1) rotate(3deg);
        }
        .dash-card-name {
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 10px;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dash-card-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
          flex-wrap: wrap;
          justify-content: center;
        }
        .dash-entries-badge {
          padding: 2px 8px;
          border-radius: 12px;
          background: #f1f5f9;
          color: #2563eb;
          font-weight: 700;
          font-size: 11.5px;
        }
      `}</style>

      <div className="registers-content">
        {/* Header bar */}
        <div className="dash-header-wrap">
          <div className="dash-title-group">
            <h2 className="dash-main-title">Your Registers</h2>
            <span className="dash-badge-count">{filtered.length} Total</span>
          </div>
          {setSearch && (
            <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input
                type="text"
                className="dash-search-input"
                value={search || ''}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all registers..."
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: '#e2e8f0',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    padding: 0
                  }}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Registers Card Grid */}
        <div className="dash-card-grid">
          {filtered.map((reg) => {
            const theme = getRegisterTheme(reg.id, reg.iconColor);
            return (
              <div 
                key={reg.id} 
                className="dash-reg-card" 
                onClick={() => startTransition(() => navigate(`/register/${reg.id}`))}
              >
                <div className="dash-card-accent-bar" style={{ background: theme.accent }} />

                <div className="dash-icon-box" style={{ background: theme.bg }}>
                  <FileText size={25} />
                </div>

                <div className="dash-card-name" title={reg.name}>{reg.name}</div>

                <div className="dash-card-meta">
                  <span className="dash-entries-badge">{reg.entryCount} entries</span>
                  <span>&bull;</span>
                  <span>{new Date(reg.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            );
          })}

          {canCreate && (
            <div 
              className="dash-reg-card" 
              style={{ borderStyle: 'dashed', borderColor: '#cbd5e1', background: '#f8fafc' }}
              onClick={() => navigate('/templates')}
            >
              <div className="dash-icon-box" style={{ background: '#e2e8f0', color: '#64748b' }}>
                <Plus size={26} />
              </div>
              <div className="dash-card-name">Add New Register</div>
              <div className="dash-card-meta">
                <span>Create from template</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
