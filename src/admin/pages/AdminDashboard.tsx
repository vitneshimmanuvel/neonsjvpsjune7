import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/auth';
import { useNavigate } from 'react-router-dom';
import { firebaseLogout } from '../../lib/firebaseAuth';
import { LayoutDashboard, Users, Activity, LogOut, BarChart3, Menu, X, ShieldAlert, FileSpreadsheet, Trash2 } from 'lucide-react';
import AdminUsersPage from './AdminUsersPage';
import AdminActivityPage from './AdminActivityPage';
import AdminDownloadRequestsPage from './AdminDownloadRequestsPage';
import AdminAnalyticsPage from './AdminAnalyticsPage';
import AdminActiveReportPage from './AdminActiveReportPage';
import RecycleBinPage from '../../pages/RecycleBinPage';

export default function AdminDashboard() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users'|'activity'|'report'|'downloads'|'analytics'|'recycle'>('users');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Clear workspace mode when entering admin dashboard
  useEffect(() => {
    sessionStorage.removeItem('admin_workspace_mode');
  }, []);

  const handleLogout = async () => {
    try { await firebaseLogout(token!); } catch (e) {}
    sessionStorage.removeItem('admin_workspace_mode');
    logout();
    navigate('/admin/login');
  };

  const handleTabClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setSidebarOpen(false); // auto-close on mobile
  };

  const navItems: { key: typeof activeTab; icon: any; label: string }[] = [
    { key: 'users', icon: <Users size={18}/>, label: 'Users & Roles' },
    { key: 'activity', icon: <Activity size={18}/>, label: 'Activity Log' },
    { key: 'report', icon: <FileSpreadsheet size={18}/>, label: 'Active Report' },
    { key: 'downloads', icon: <ShieldAlert size={18}/>, label: 'Approval Requests' },
    { key: 'analytics', icon: <BarChart3 size={18}/>, label: 'Analytics' },
    { key: 'recycle', icon: <Trash2 size={18}/>, label: 'Recycle Bin' },
  ];

  return (
    <div className="admin-animate-fade-in" style={{minHeight:'100vh',background:'var(--background)',display:'flex',position:'relative'}}>

      {/* Mobile topbar */}
      <div className="admin-mobile-topbar" style={{
        display:'none',position:'fixed',top:0,left:0,right:0,zIndex:1001,
        background:'#0f172a',borderBottom:'1px solid rgba(255,255,255,0.06)',
        padding:'12px 16px',alignItems:'center',justifyContent:'space-between',
        boxShadow:'var(--shadow-sm)'
      }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{background:'none',border:'none',color:'white',cursor:'pointer',padding:'4px',display:'flex'}}>
          {sidebarOpen ? <X size={22}/> : <Menu size={22}/>}
        </button>
        <h1 style={{margin:0,fontSize:'16px',fontWeight:800,color:'white',display:'flex',alignItems:'center',gap:'8px'}}>
          <img src="/logo-transparent.png" alt="AG Trust" style={{ width: '18px', height: '18px', objectFit: 'contain' }} /> AG Admin
        </h1>
        <div style={{width:'30px'}}/>
      </div>

      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div className="admin-sidebar-backdrop" onClick={() => setSidebarOpen(false)} style={{
          display:'none',position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:1001,
          backdropFilter:'blur(4px)',WebkitBackdropFilter:'blur(4px)'
        }}/>
      )}

      {/* Sidebar */}
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`} style={{
        width:'260px',background:'var(--surface)',borderRight:'1px solid var(--border)',
        display:'flex',flexDirection:'column',flexShrink:0,
        transition:'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',zIndex:1002
      }}>
        <div style={{padding:'24px 20px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:'12px'}}>
          <h1 style={{margin:0,fontSize:'19px',color:'var(--navy)',fontWeight:800,display:'flex',alignItems:'center',gap:'10px',letterSpacing:'-0.025em'}}>
            <div style={{background:'rgba(26,115,232,0.1)',padding:'6px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <img src="/logo-transparent.png" alt="AG Trust" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
            </div>
            AG Admin
          </h1>
          
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginTop:'6px',background:'var(--bg-secondary)',padding:'10px',borderRadius:'12px',border:'1px solid var(--border)'}}>
            <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'var(--accent)',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'13px',boxShadow:'var(--admin-glow-blue)',flexShrink:0}}>
              {user?.name ? user.name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'A')}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'13px',color:'var(--foreground)',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name || 'Administrator'}</div>
              <div style={{fontSize:'11px',color:'var(--muted)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.email}</div>
            </div>
          </div>
        </div>

        <div style={{padding:'20px 12px',flex:1,display:'flex',flexDirection:'column',gap:'6px'}}>
          {navItems.map(item => (
            <button key={item.key} onClick={() => handleTabClick(item.key)} className="admin-nav-button" style={{
              display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderRadius:'10px',border:'none',
              background:activeTab===item.key?'var(--brand-blue-light)':'transparent',
              color:activeTab===item.key?'var(--accent)':'var(--muted)',
              borderLeft:activeTab===item.key?'3px solid var(--accent)':'3px solid transparent',
              cursor:'pointer',textAlign:'left',fontWeight:600,fontSize:'14px',transition:'all 0.2s',width:'100%'
            }}>
              <span style={{color:activeTab===item.key?'var(--accent)':'var(--placeholder)',display:'flex'}}>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>

        <div style={{padding:'16px 12px',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:'8px'}}>
          <button onClick={() => { sessionStorage.setItem('admin_workspace_mode', '1'); navigate('/'); setSidebarOpen(false); }} style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderRadius:'10px',border:'none',background:'linear-gradient(135deg, var(--navy), var(--navy-light))',color:'white',cursor:'pointer',textAlign:'left',fontWeight:600,fontSize:'14px',boxShadow:'var(--shadow-button)',width:'100%'}}>
            <LayoutDashboard size={18}/> Main Workspace
          </button>
          <button onClick={handleLogout} className="admin-logout-btn" style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px 16px',borderRadius:'10px',border:'none',background:'rgba(239,68,68,0.08)',color:'var(--danger)',cursor:'pointer',textAlign:'left',fontWeight:600,fontSize:'14px',width:'100%',transition:'all 0.2s'}}>
            <LogOut size={18}/> Logout Admin
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="admin-main-content" style={{flex:1,padding:'30px 40px',overflowY:'auto',height:'100vh',boxSizing:'border-box',background:'var(--background)'}}>
        {activeTab === 'users' && <AdminUsersPage />}
        {activeTab === 'activity' && <AdminActivityPage />}
        {activeTab === 'report' && <AdminActiveReportPage />}
        {activeTab === 'downloads' && <AdminDownloadRequestsPage />}
        {activeTab === 'analytics' && <AdminAnalyticsPage />}
        {activeTab === 'recycle' && <RecycleBinPage isAdminPanel={true} />}
      </div>

      {/* Responsive CSS injected inline */}
      <style>{`
        .admin-nav-button:hover {
          background: var(--bg-secondary) !important;
          color: var(--foreground) !important;
        }
        .admin-logout-btn:hover {
          background: rgba(239, 68, 68, 0.12) !important;
          color: var(--danger) !important;
        }
        @media (max-width: 768px) {
          .admin-mobile-topbar { display: flex !important; }
          .admin-sidebar-backdrop { display: block !important; }
          .admin-sidebar {
            position: fixed !important;
            top: 0; left: 0; bottom: 0;
            transform: translateX(-100%);
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }
          .admin-sidebar.open {
            transform: translateX(0) !important;
          }
          .admin-main-content {
            padding: 16px !important;
            padding-top: 60px !important;
            height: calc(100vh - 52px) !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            box-sizing: border-box;
          }
        }
        @media (max-width: 480px) {
          .admin-main-content {
            padding: 10px !important;
            padding-top: 56px !important;
          }
        }
      `}</style>
    </div>
  );
}
