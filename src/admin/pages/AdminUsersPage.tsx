import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import {
  firebaseGetUsers, firebaseCreateUser, firebaseDeleteUser,
  firebaseUpdateUserStatus
} from '../../lib/firebaseAuth';
import {
  UserPlus, Trash2, UserCheck, UserX, Search, RefreshCw,
  Eye, EyeOff, Shield, Lock, Edit2, Download, Zap
} from 'lucide-react';

interface ServerUser {
  id: string; name: string; email: string; role: string; status: string;
  createdAt: string; loginHistory?: { type: string; timestamp: string }[];
  permissions?: any;
}

const s = {
  input: { width:'100%',padding:'10px 14px',borderRadius:'8px',border:'1.5px solid var(--border)',background:'var(--surface)',color:'var(--foreground)',fontSize:'14px',outline:'none',transition:'border-color 0.2s' } as React.CSSProperties,
  label: { display:'block',fontSize:'13px',color:'var(--foreground)',marginBottom:'6px',fontWeight:600 } as React.CSSProperties,
  badge: (bg:string,color:string, border:string='transparent') => ({ padding:'4px 10px',borderRadius:'6px',fontSize:'11px',fontWeight:700,background:bg,color,border:`1px solid ${border}`,display:'inline-block' }) as React.CSSProperties,
};

export default function AdminUsersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<ServerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPass, setNewPass] = useState('');
  // Role is always 'user' by default for new accounts created here
  const [newRole, setNewRole] = useState<'user'|'sheet_admin'>('user');
  const [showNewPass, setShowNewPass] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const fetch_ = async () => {
    setLoading(true); setError('');
    try { const d = await firebaseGetUsers(); setUsers(d.users||[]); }
    catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetch_(); }, []);

  const handleCreate = async (e:React.FormEvent) => {
    e.preventDefault(); if(!newName||!newEmail||!newPass) return;
    setCreating(true); setError('');
    try {
      await firebaseCreateUser({ name:newName, email:newEmail, password:newPass, role:newRole, phone:newPhone });
      setNewName(''); setNewEmail(''); setNewPass(''); setNewPhone(''); setNewRole('user'); setShowCreate(false); fetch_();
    } catch(e:any) { setError(e.message); } finally { setCreating(false); }
  };

  const handleDelete = async (id:string) => {
    if(!confirm('Delete this user?')) return;
    try { await firebaseDeleteUser(id); fetch_(); } catch(e:any) { alert(e.message); }
  };

  const handleToggleStatus = async (id:string, cur:string) => {
    try { await firebaseUpdateUserStatus(id, cur==='active'?'inactive':'active'); fetch_(); }
    catch(e:any) { alert(e.message); }
  };

  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="admin-animate-fade-in">
      {error && <div style={{background:'var(--destructive-bg)',border:'1px solid rgba(230,48,18,0.3)',borderRadius:'12px',padding:'12px 16px',marginBottom:'20px',color:'var(--destructive)',fontSize:'14px',fontWeight:500}}>{error}</div>}

      {/* Toolbar */}
      <div style={{display:'flex',gap:'12px',marginBottom:'20px',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',flex:1,background:'var(--surface)',borderRadius:'12px',padding:'0 16px',border:'1.5px solid var(--border)',boxShadow:'var(--admin-card-shadow)',transition:'border-color 0.2s'}} className="admin-search-bar-wrap">
          <Search size={18} color="var(--muted)"/>
          <input placeholder="Search users by name or email..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{flex:1,padding:'14px 0',border:'none',background:'transparent',color:'var(--foreground)',fontSize:'14px',outline:'none'}}/>
        </div>
        <button onClick={fetch_} className="admin-btn-secondary-flat" style={{padding:'13px',borderRadius:'12px'}} title="Refresh list"><RefreshCw size={16}/></button>
        <button onClick={()=>setShowCreate(!showCreate)} className="admin-btn-success-glow" style={{height:'46px',borderRadius:'12px',padding:'0 22px'}}>
          <UserPlus size={18}/> Add User
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="admin-card-glass admin-animate-fade-in" style={{marginBottom:'24px',border:'1px solid var(--border)'}}>
          <h3 style={{margin:'0 0 20px',fontSize:'17px',fontWeight:800,color:'var(--navy)',display:'flex',alignItems:'center',gap:'8px'}}>
            <UserPlus size={18} color="var(--accent)"/> Create New User
          </h3>
          <form onSubmit={handleCreate} className="admin-create-form" style={{display:'grid',gap:'20px'}}>
            <div><label style={s.label}>Name</label><input className="admin-input-premium" value={newName} onChange={e=>setNewName(e.target.value)} required placeholder="Full name"/></div>
            <div><label style={s.label}>Email</label><input type="email" className="admin-input-premium" value={newEmail} onChange={e=>setNewEmail(e.target.value)} required placeholder="user@example.com"/></div>
            <div><label style={s.label}>Phone Number</label><input className="admin-input-premium" value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="e.g. +91 XXXXX XXXXX"/></div>
            <div><label style={s.label}>Password</label>
              <div style={{position:'relative'}}>
                <input type={showNewPass?'text':'password'} className="admin-input-premium" style={{paddingRight:'40px'}} value={newPass} onChange={e=>setNewPass(e.target.value)} required placeholder="Min 6 characters"/>
                <button type="button" onClick={()=>setShowNewPass(!showNewPass)} style={{position:'absolute',right:'14px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',color:'var(--muted)',cursor:'pointer',display:'flex',alignItems:'center'}}>
                  {showNewPass?<EyeOff size={16}/>:<Eye size={16}/>}
                </button>
              </div>
            </div>
            <div>
              <label style={s.label}>Role</label>
              <select value={newRole} onChange={e=>setNewRole(e.target.value as any)} className="admin-input-premium" style={{cursor:'pointer'}}>
                <option value="user">User</option>
              </select>
            </div>
            {/* Action buttons */}
            <div style={{gridColumn:'1/-1',display:'flex',gap:'12px',justifyContent:'flex-end',marginTop:'10px'}}>
              <button type="button" onClick={()=>setShowCreate(false)} className="admin-btn-secondary-flat" style={{height:'44px',padding:'0 20px',borderRadius:'10px'}}>Cancel</button>
              <button type="submit" disabled={creating} className="admin-btn-success-glow" style={{height:'44px',padding:'0 24px',borderRadius:'10px'}}>{creating?'Creating...':'Create User'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="admin-table-premium-wrap admin-animate-fade-in">
        {loading ? <div style={{padding:'60px',textAlign:'center',color:'var(--muted)',fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}><RefreshCw className="animate-spin" size={18}/> Loading Users...</div> : (
          <div className="admin-table-responsive">
            <table>
              <thead>
                <tr>
                  <th className="admin-table-sticky-col" style={{ width: '18%', minWidth: '130px' }}>Name</th>
                  <th style={{ width: '22%', minWidth: '160px' }}>Email</th>
                  <th style={{ width: '10%', minWidth: '85px' }}>Role</th>
                  <th style={{ width: '32%', minWidth: '180px' }}>Permissions</th>
                  <th style={{ width: '10%', minWidth: '70px' }}>Status</th>
                  <th style={{ width: '8%', minWidth: '90px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const p = u.permissions || { canView:true, canEdit:false, canDownload:false, isAdmin:false };
                  const isSuperAdmin = u.role === 'superadmin';
                  return (
                    <tr key={u.id} className={isSuperAdmin ? 'admin-superadmin-row' : ''} style={{background:isSuperAdmin?'rgba(99,102,241,0.02)':'transparent',cursor:isSuperAdmin?'default':'pointer'}} onClick={() => !isSuperAdmin && navigate(`/admin/users/${u.id}`)}>
                      <td className="admin-table-sticky-col" style={{fontWeight:600,color:'var(--navy)',fontSize:'14px', minWidth: '130px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                          <div style={{width:'28px',height:'28px',borderRadius:'50%',background:isSuperAdmin?'rgba(99,102,241,0.1)':'rgba(0,45,93,0.05)',color:isSuperAdmin?'#6366f1':'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11.5px',fontWeight:800}}>
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          <div style={{display:'flex',flexDirection:'column'}}>
                            <span>{u.name}</span>
                            {isSuperAdmin && <span style={{fontSize:'9px',fontWeight:700,color:'#6366f1',background:'rgba(99,102,241,0.1)',padding:'2px 6px',borderRadius:'4px',border:'1px solid rgba(99,102,241,0.2)',width:'fit-content',marginTop:'2px',display:'inline-flex',alignItems:'center',gap:'3px'}}><Lock size={9}/> Protected</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{color:'var(--muted)', minWidth: '160px'}}>{u.email}</td>
                      <td style={{minWidth: '85px'}}>
                        <span className="admin-badge-pill" style={{
                          background:u.role==='superadmin'?'rgba(99,102,241,0.1)':u.role==='admin'?'rgba(230,48,18,0.1)':u.role==='sheet_admin'?'rgba(16,185,129,0.1)':'rgba(71,85,105,0.08)',
                          color:u.role==='superadmin'?'#6366f1':u.role==='admin'?'var(--accent)':u.role==='sheet_admin'?'var(--brand-green)':'var(--muted)',
                          border:u.role==='superadmin'?'1px solid rgba(99,102,241,0.2)':u.role==='admin'?'1px solid rgba(230,48,18,0.2)':u.role==='sheet_admin'?'1px solid rgba(16,185,129,0.2)':'1px solid rgba(71,85,105,0.15)',
                          padding: '3px 8px', fontSize: '10.5px'
                        }}>{u.role === 'sheet_admin' ? 'Sheet Admin' : u.role}</span>
                      </td>
                      <td style={{minWidth: '180px'}}>
                        <div style={{display:'flex',gap:'4px 6px',flexWrap:'wrap', maxWidth: '240px'}}>
                          {(isSuperAdmin || p.canView) && <span className="admin-badge-pill" style={{background:'rgba(26,115,232,0.08)',color:'var(--accent)',border:'1px solid rgba(26,115,232,0.15)',display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',fontSize:'10.5px'}}><Eye size={11}/> View</span>}
                          {(isSuperAdmin || p.canEdit) && <span className="admin-badge-pill" style={{background:'rgba(52,168,83,0.08)',color:'var(--brand-green)',border:'1px solid rgba(52,168,83,0.15)',display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',fontSize:'10.5px'}}><Edit2 size={11}/> Edit</span>}
                          {(isSuperAdmin || p.canDownload) && <span className="admin-badge-pill" style={{background:'rgba(245,158,11,0.08)',color:'#D97706',border:'1px solid rgba(245,158,11,0.15)',display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',fontSize:'10.5px'}}><Download size={11}/> Download</span>}
                          {(isSuperAdmin || p.isAdmin) && <span className="admin-badge-pill" style={{background:'rgba(239,68,68,0.08)',color:'var(--destructive)',border:'1px solid rgba(239,68,68,0.15)',display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',fontSize:'10.5px'}}><Shield size={11}/> Admin</span>}
                          {isSuperAdmin && <span className="admin-badge-pill" style={{background:'rgba(99,102,241,0.1)',color:'#6366f1',border:'1px solid rgba(99,102,241,0.2)',display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',fontSize:'10.5px'}}><Zap size={11}/> Full Access</span>}
                        </div>
                      </td>
                      <td style={{minWidth: '70px'}}>
                        <span className="admin-badge-pill" style={{
                          background:u.status==='active'?'rgba(52,168,83,0.08)':'rgba(239,68,68,0.08)',
                          color:u.status==='active'?'var(--brand-green)':'var(--destructive)',
                          border:u.status==='active'?'1px solid rgba(52,168,83,0.15)':'1px solid rgba(239,68,68,0.15)',
                          padding: '3px 8px', fontSize: '10.5px'
                        }}>{u.status||'active'}</span>
                      </td>
                      <td style={{minWidth: '90px'}}>
                        {isSuperAdmin ? (
                          <div style={{fontSize:'12px',color:'var(--muted)',fontWeight:600,fontStyle:'italic',display:'flex',alignItems:'center',gap:'4px'}}>
                            <Shield size={13} color="#6366f1"/> Cannot modify
                          </div>
                        ) : (
                          <div style={{display:'flex',gap:'6px'}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>navigate(`/admin/users/${u.id}`)} title="Settings & Permissions" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'6px',cursor:'pointer',color:'var(--navy)',display:'flex',boxShadow:'var(--shadow-sm)',transition:'all 0.2s'}} className="admin-action-hover-btn">
                              <Shield size={13}/>
                            </button>
                            <button onClick={()=>handleToggleStatus(u.id,u.status||'active')} title={u.status==='active'?'Deactivate':'Activate'} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'6px',cursor:'pointer',color:u.status==='active'?'#F59E0B':'var(--brand-green)',display:'flex',boxShadow:'var(--shadow-sm)',transition:'all 0.2s'}} className="admin-action-hover-btn">
                              {u.status==='active'?<UserX size={13}/>:<UserCheck size={13}/>}
                            </button>
                            <button onClick={()=>handleDelete(u.id)} disabled={u.email===user?.email} title="Delete" style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'6px',cursor:'pointer',color:u.email===user?.email?'var(--border)':'var(--destructive)',display:'flex',boxShadow:'var(--shadow-sm)',transition:'all 0.2s'}} className="admin-action-hover-btn">
                              <Trash2 size={13}/>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length===0 && <tr><td colSpan={6} style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>{search?'No matches found':'No users registered'}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .admin-search-bar-wrap:focus-within {
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 4px rgba(26, 115, 232, 0.1) !important;
        }
        .admin-action-hover-btn:hover {
          background: var(--bg-secondary) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
