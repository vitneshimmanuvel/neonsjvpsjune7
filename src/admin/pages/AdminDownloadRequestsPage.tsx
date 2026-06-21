import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../lib/auth';
import { firebaseGetAllDownloadRequests, firebaseRespondRequest } from '../../lib/firebaseAuth';
import { Download, CheckCircle, XCircle, Clock, RefreshCw, Filter, User, ChevronDown, Send, MessageSquare, Calendar, Trash2, ShieldAlert } from 'lucide-react';
import { deleteRegister } from '../../lib/api';

export default function AdminDownloadRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string|null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');

  const fetch_ = async () => {
    setLoading(true);
    try { const d = await firebaseGetAllDownloadRequests(); setRequests(d.requests||[]); }
    catch { } finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, []);

  const handleRespond = async (id:string, status:'approved'|'rejected') => {
    const req = requests.find(r => r.id === id);
    if (!req) return;

    if (status === 'rejected' && !adminNote.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      setRespondingTo(id); // Show loading state
      
      // If it's a delete request and we are approving it, perform the deletion first
      if (status === 'approved' && req.type === 'delete_register' && req.registerId) {
        const confirmed = window.confirm(`Approving this will PERMANENTLY DELETE the register "${req.registerName}". Continue?`);
        if (!confirmed) return;
        
        await deleteRegister(Number(req.registerId));
        console.log('Register deleted successfully via request approval');
      }

      await firebaseRespondRequest(id, status, adminNote, user?.name || user?.email || 'Admin');
      setRespondingTo(null); setAdminNote(''); fetch_();
    } catch(e:any) { 
      alert(`Action failed: ${e.message}`); 
      setRespondingTo(null);
    }
  };

  // Unique users from requests
  const requestUsers = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach(r => { if (r.userId && r.userName) map.set(r.userId, r.userName); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterUser !== 'all' && r.userId !== filterUser) return false;
      return true;
    });
  }, [requests, filterStatus, filterUser]);

  const pending = filtered.filter(r => r.status === 'pending');
  const past = filtered.filter(r => r.status !== 'pending');

  const sBadge = (s:string) => {
    if(s==='pending') return <span style={{padding:'4px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:700,background:'rgba(245,158,11,0.1)',color:'#D97706',display:'flex',alignItems:'center',gap:'4px'}}><Clock size={12}/> Pending</span>;
    if(s==='approved') return <span style={{padding:'4px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:700,background:'rgba(76,175,26,0.1)',color:'var(--brand-green)',display:'flex',alignItems:'center',gap:'4px'}}><CheckCircle size={12}/> Approved</span>;
    return <span style={{padding:'4px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:700,background:'var(--destructive-bg)',color:'var(--destructive)',display:'flex',alignItems:'center',gap:'4px'}}><XCircle size={12}/> Rejected</span>;
  };

  return (
    <div className="admin-animate-fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'10px'}}>
        <h2 style={{margin:0,fontSize:'20px',fontWeight:800,color:'var(--navy)',display:'flex',alignItems:'center',gap:'10px'}}><ShieldAlert size={22} color="var(--accent)"/> Approval Requests</h2>
        <button onClick={fetch_} className="admin-btn-secondary-flat" style={{padding:'12px',borderRadius:'10px'}}><RefreshCw size={16}/></button>
      </div>

      {/* Filters */}
      <div className="admin-card-glass" style={{
        display:'flex',flexWrap:'wrap',gap:'16px',marginBottom:'20px',
        padding:'16px 20px', border:'1px solid var(--border)'
      }}>
        <div style={{flex:'1 1 160px',minWidth:'140px'}}>
          <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
            <Filter size={10} style={{marginRight:'3px',verticalAlign:'middle'}}/> Status
          </label>
          <div style={{position:'relative'}}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="admin-input-premium"
              style={{padding:'8px 28px 8px 10px',appearance:'none',cursor:'pointer'}}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <ChevronDown size={12} style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--muted)'}}/>
          </div>
        </div>
        <div style={{flex:'1 1 160px',minWidth:'140px'}}>
          <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
            <User size={10} style={{marginRight:'3px',verticalAlign:'middle'}}/> User
          </label>
          <div style={{position:'relative'}}>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
              className="admin-input-premium"
              style={{padding:'8px 28px 8px 10px',appearance:'none',cursor:'pointer'}}>
              <option value="all">All Users</option>
              {requestUsers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <ChevronDown size={12} style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--muted)'}}/>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'flex-end'}}>
          <span style={{fontSize:'13px',color:'var(--muted)',fontWeight:600,padding:'8px 0'}}>
            Showing <strong>{filtered.length}</strong> result{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {loading ? <div style={{padding:'60px',textAlign:'center',color:'var(--muted)',fontWeight:600}}><RefreshCw className="animate-spin" style={{display:'inline-block',marginRight:'8px'}} size={16}/> Loading requests...</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
          
          {/* Pending Requests */}
          {pending.length > 0 && (
            <div>
              <h3 style={{fontSize:'13px',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'12px',fontWeight:700,display:'flex',alignItems:'center',gap:'6px'}}>
                <Clock size={14} color="#D97706"/> Pending Action ({pending.length})
              </h3>
              <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                {pending.map(r => (
                  <div key={r.id} style={{
                    background:'var(--surface)',
                    borderRadius:'16px',
                    border: r.type === 'delete_register' ? '1.5px solid rgba(239,68,68,0.4)' : '1.5px solid rgba(26,115,232,0.4)',
                    padding:'20px',
                    boxShadow: r.type === 'delete_register' ? 'var(--admin-glow-red)' : 'var(--admin-glow-blue)',
                    transition:'all 0.2s'
                  }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'14px',flexWrap:'wrap',gap:'8px'}}>
                      <div>
                        <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'4px'}}>
                          {r.type === 'delete_register' ? (
                            <div style={{background:'rgba(239,68,68,0.1)',padding:'6px',borderRadius:'8px'}}><Trash2 size={16} color="var(--destructive)"/></div>
                          ) : (
                            <div style={{background:'rgba(26,115,232,0.1)',padding:'6px',borderRadius:'8px'}}><Download size={16} color="var(--accent)"/></div>
                          )}
                          <div style={{fontSize:'16px',color:'var(--foreground)',fontWeight:800}}>{r.registerName}</div>
                          {r.type === 'delete_register' && <span className="admin-badge-pill" style={{background:'var(--destructive-bg)',color:'var(--destructive)',border:'1px solid rgba(239,68,68,0.2)',fontSize:'10px',padding:'2px 8px'}}>DELETE REGISTER</span>}
                        </div>
                        <div style={{fontSize:'13px',color:'var(--muted)'}}>Requested by <strong style={{color:'var(--navy)'}}>{r.userName}</strong></div>
                        <div style={{fontSize:'11.5px',color:'var(--muted)',marginTop:'4px',display:'flex',alignItems:'center',gap:'4px',fontWeight:500}}>
                          <Calendar size={12}/> {new Date(r.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {sBadge(r.status)}
                    </div>
                    <div style={{background:'var(--background)',padding:'14px',borderRadius:'10px',fontSize:'13.5px',color:'var(--foreground)',marginBottom:'16px',border:'1px solid var(--border)',lineHeight:1.4}}>
                      <strong style={{color:'var(--navy)',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.03em'}}>{r.type === 'delete_register' ? 'Reason for permanent deletion' : 'Download purpose'}:</strong>
                      <div style={{marginTop:'6px',fontWeight:500}}>{r.description}</div>
                    </div>
                    
                    {respondingTo === r.id ? (
                      <div className="admin-animate-fade-in" style={{background:'var(--background)',padding:'16px',borderRadius:'12px',border:'1px solid var(--border)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'10px',fontSize:'13px',fontWeight:700,color:'var(--navy)'}}>
                          <MessageSquare size={14}/> Admin Feedback Note
                        </div>
                        <textarea
                          placeholder="Provide audit feedback or rejection reason..."
                          value={adminNote}
                          onChange={e => setAdminNote(e.target.value)}
                          style={{
                            width:'100%',background:'var(--surface)',border:'1.5px solid var(--border)',
                            color:'var(--foreground)',fontSize:'14px',outline:'none',minHeight:'80px',
                            padding:'12px',borderRadius:'10px',resize:'vertical',boxSizing:'border-box',
                            fontFamily:'inherit',transition:'all 0.2s'
                          }}
                          className="admin-textarea-premium"
                        />
                        <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'12px',flexWrap:'wrap'}}>
                          <button onClick={() => { setRespondingTo(null); setAdminNote(''); }} className="admin-btn-secondary-flat" style={{height:'38px',borderRadius:'8px',padding:'0 16px'}}>Cancel</button>
                          <button onClick={() => handleRespond(r.id,'rejected')} style={{height:'38px',borderRadius:'8px',border:'none',background:'var(--destructive-bg)',color:'var(--destructive)',cursor:'pointer',fontWeight:700,fontSize:'13px',display:'flex',alignItems:'center',gap:'6px',padding:'0 16px'}}>
                            <XCircle size={14}/> Reject
                          </button>
                          <button onClick={() => handleRespond(r.id,'approved')} className="admin-btn-success-glow" style={{height:'38px',borderRadius:'8px',padding:'0 20px'}}>
                            <CheckCircle size={14}/> Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                        <button onClick={() => setRespondingTo(r.id)} className="admin-btn-secondary-flat" style={{height:'38px',borderRadius:'8px',padding:'0 16px',borderColor:'var(--navy)'}}>
                          <Send size={14}/> Respond
                        </button>
                        <button onClick={() => handleRespond(r.id,'approved')} className="admin-btn-success-glow" style={{height:'38px',borderRadius:'8px',padding:'0 20px'}}>
                          <CheckCircle size={14}/> Quick Approve
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && filterStatus !== 'pending' && (
            <div style={{padding:'24px',textAlign:'center',color:'var(--muted)',background:'var(--surface)',borderRadius:'16px',border:'1px dashed var(--border)',fontSize:'14px',fontWeight:500,display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
              <CheckCircle size={18} color="var(--brand-green)"/> No pending approval requests
            </div>
          )}

          {/* Past Requests */}
          {past.length > 0 && (
            <div>
              <h3 style={{fontSize:'13px',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'12px',fontWeight:700}}>History ({past.length})</h3>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {past.map(r => (
                  <div key={r.id} className="admin-card-glass" style={{padding:'16px 20px',border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'15px',color:'var(--foreground)',fontWeight:700}}>{r.registerName}</div>
                        <div style={{fontSize:'12.5px',color:'var(--muted)',marginTop:'4px',display:'flex',flexWrap:'wrap',gap:'6px',alignItems:'center',fontWeight:500}}>
                          <strong style={{color:'var(--navy)'}}>{r.userName}</strong>
                          <span>•</span>
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {sBadge(r.status)}
                    </div>
                    {r.description && (
                      <div style={{fontSize:'12.5px',color:'var(--foreground)',marginTop:'10px',paddingTop:'10px',borderTop:'1px solid var(--border-light)',fontWeight:500}}>
                        <strong style={{color:'var(--muted)'}}>Request Note:</strong> {r.description}
                      </div>
                    )}
                    {r.adminResponse && (
                      <div style={{fontSize:'12.5px',color:'var(--foreground)',marginTop:'8px',background:'var(--background)',padding:'10px 12px',borderRadius:'8px',border:'1px solid var(--border-light)'}}>
                        <strong style={{color:'var(--navy)'}}>Admin Note:</strong> {r.adminResponse}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && <div style={{padding:'40px',textAlign:'center',color:'var(--muted)',fontSize:'14px',fontWeight:500}}>No download requests found</div>}
        </div>
      )}
    </div>
  );
}
