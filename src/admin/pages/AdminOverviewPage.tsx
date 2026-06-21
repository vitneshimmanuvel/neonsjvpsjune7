import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { 
  firebaseGetUsers, 
  firebaseGetActivity, 
  firebaseGetPendingDownloadRequests, 
  firebaseRespondRequest 
} from '../../lib/firebaseAuth';
import { listBusinesses, listRegisters, deleteRegister, listDeletedRegisters, getAllDeletedItems } from '../../lib/api';
import { cleanActivityLogs } from '../../lib/activityHelper';
import { 
  LayoutDashboard, Users, Activity, ShieldAlert, FileSpreadsheet, 
  RefreshCw, TrendingUp, UserCheck, Calendar, ArrowRight, UserPlus, 
  Clock, CheckCircle, XCircle, Trash2, Download, MessageSquare, Send
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ServerUser {
  id: string; name: string; email: string; role: string; status: string;
}

interface PendingRequest {
  id: string;
  userId: string;
  userName: string;
  registerId?: string;
  registerName: string;
  type: 'download' | 'delete_register';
  description: string;
  status: string;
  createdAt: string;
}

const ACTION_ICONS: Record<string, any> = {
  login: <LogInIcon size={14} color="#10b981"/>,
  admin_login: <ShieldIcon size={14} color="#ef4444"/>,
  edit_cells: <EditIcon size={14} color="#6366f1"/>,
  add_row: <PlusIcon size={14} color="#10b981"/>,
  delete_row: <TrashIcon size={14} color="#ef4444"/>,
  bulk_delete_rows: <TrashIcon size={14} color="#ef4444"/>,
  add_column: <PlusIcon size={14} color="#3b82f6"/>,
  delete_column: <TrashIcon size={14} color="#f59e0b"/>,
  download_data: <DownloadIcon size={14} color="#10b981"/>,
};

function LogInIcon(props: any) { return <Activity {...props} />; }
function ShieldIcon(props: any) { return <Activity {...props} />; }
function EditIcon(props: any) { return <Activity {...props} />; }
function PlusIcon(props: any) { return <Activity {...props} />; }
function TrashIcon(props: any) { return <Activity {...props} />; }
function DownloadIcon(props: any) { return <Activity {...props} />; }

export default function AdminOverviewPage({ onNavigateTab }: { onNavigateTab: (tab: any) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalActivities: 0,
    pendingRequests: 0,
    totalRegisters: 0,
    recycleBinCount: 0
  });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const loadData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // 1. Fetch Users
      const usersData = await firebaseGetUsers();
      const usersList: ServerUser[] = usersData.users || [];
      const nonSuperAdminUsers = usersList.filter(u => u.role !== 'superadmin');
      const activeCount = nonSuperAdminUsers.filter(u => u.status === 'active').length;

      // 2. Fetch Pending Requests
      const requestsData = await firebaseGetPendingDownloadRequests();
      const pendingList: PendingRequest[] = requestsData.requests || [];

      // 3. Fetch Recent Activities (fetch more to cover deduplicated results)
      const activitiesData = await firebaseGetActivity(25);
      const activitiesList = cleanActivityLogs(activitiesData.activities || []);

      // 4. Fetch Registers Count & Recycle Bin count
      let registersCount = 0;
      let recycleBinCount = 0;
      try {
        const busList = await listBusinesses();
        const busId = busList[0]?.id || 1;
        const [regs, deletedRegs, deletedRowsCols] = await Promise.all([
          listRegisters(busId),
          listDeletedRegisters(busId),
          getAllDeletedItems(busId)
        ]);
        registersCount = regs.length;
        recycleBinCount = (deletedRegs?.length || 0) + (deletedRowsCols?.length || 0);
      } catch (err) {
        console.error('Error fetching registers or recycle bin counts:', err);
      }

      setStats({
        totalUsers: nonSuperAdminUsers.length,
        activeUsers: activeCount,
        totalActivities: activitiesList.length, // local length or we can display general total
        pendingRequests: pendingList.length,
        totalRegisters: registersCount,
        recycleBinCount: recycleBinCount
      });

      setRecentActivities(activitiesList.slice(0, 5));
      setPendingRequests(pendingList.slice(0, 3));
    } catch (err: any) {
      console.error('Error loading dashboard overview:', err);
      toast.error('Failed to load dashboard overview statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRespond = async (id: string, status: 'approved' | 'rejected') => {
    const req = pendingRequests.find(r => r.id === id);
    if (!req) return;

    if (status === 'rejected' && !adminNote.trim()) {
      toast.error('Please provide a feedback reason for rejection');
      return;
    }

    try {
      setRespondingTo(id);
      
      if (status === 'approved' && req.type === 'delete_register' && req.registerId) {
        const confirmed = window.confirm(`Approving this will PERMANENTLY DELETE the register "${req.registerName}". Continue?`);
        if (!confirmed) {
          setRespondingTo(null);
          return;
        }
        await deleteRegister(Number(req.registerId));
      }

      await firebaseRespondRequest(id, status, adminNote, user?.name || user?.email || 'Admin');
      toast.success(`Request successfully ${status}`);
      setRespondingTo(null); 
      setAdminNote(''); 
      loadData(true);
    } catch (e: any) { 
      toast.error(`Action failed: ${e.message}`); 
      setRespondingTo(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px', color: 'var(--muted)' }}>
        <Clock size={36} className="animate-spin" style={{ color: 'var(--accent)' }} />
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Analyzing data & preparing dashboard...</div>
      </div>
    );
  }

  return (
    <div className="admin-animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <LayoutDashboard size={24} color="var(--accent)" /> System Dashboard
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#10b981', fontWeight: 700, background: 'rgba(16, 185, 129, 0.08)', padding: '4px 10px', borderRadius: '99px', border: '1px solid rgba(16, 185, 129, 0.15)', height: 'fit-content' }}>
              <span className="admin-glow-pulse" style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%' }} />
              Live Database Connection: Connected
            </div>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
            Real-time control center metrics, pending approvals and audit overview.
          </p>
        </div>
        <button 
          onClick={() => loadData(true)} 
          disabled={refreshing}
          className="admin-btn-secondary-flat"
          style={{ padding: '10px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Sync Dashboard'}
        </button>
      </div>

      {/* Stats Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        
        {/* Total Employees */}
        <div className="admin-stat-card-premium" onClick={() => onNavigateTab('users')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: '#6366f1' }}>
              <Users size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Employees</span>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>{stats.totalUsers}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--brand-green)', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <UserCheck size={12} /> {stats.activeUsers} Active Accounts
            </div>
          </div>
        </div>

        {/* Workspace Sheets */}
        <div className="admin-stat-card-premium" onClick={() => onNavigateTab('report')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)' }}>
              <FileSpreadsheet size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registers</span>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>{stats.totalRegisters}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
              Total Active Workspace Sheets
            </div>
          </div>
        </div>

        {/* Audited Operations */}
        <div className="admin-stat-card-premium" onClick={() => onNavigateTab('activity')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
              <TrendingUp size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Audit Logs</span>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>{stats.totalActivities}+</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
              Audited Data Operations
            </div>
          </div>
        </div>

        {/* Pending Approval Requests */}
        <div className="admin-stat-card-premium" onClick={() => onNavigateTab('downloads')} style={{ 
          cursor: 'pointer',
          border: stats.pendingRequests > 0 ? '1.5px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
          boxShadow: stats.pendingRequests > 0 ? 'var(--admin-glow-red)' : 'var(--admin-card-shadow)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: stats.pendingRequests > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(71,85,105,0.08)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: stats.pendingRequests > 0 ? 'var(--danger)' : 'var(--muted)' }}>
              <ShieldAlert size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approvals</span>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: stats.pendingRequests > 0 ? 'var(--danger)' : 'var(--foreground)' }}>{stats.pendingRequests}</div>
            <div style={{ fontSize: '11.5px', color: stats.pendingRequests > 0 ? 'var(--danger)' : 'var(--muted)', fontWeight: stats.pendingRequests > 0 ? 600 : 500, marginTop: '2px' }}>
              {stats.pendingRequests > 0 ? 'Requires Immediate Action' : 'All Clear — No Pending Requests'}
            </div>
          </div>
        </div>

        {/* Recycle Bin Items */}
        <div className="admin-stat-card-premium" onClick={() => onNavigateTab('recycle')} style={{ 
          cursor: 'pointer',
          border: stats.recycleBinCount > 0 ? '1.5px solid rgba(245,158,11,0.2)' : '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
              <Trash2 size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recycle Bin</span>
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>{stats.recycleBinCount}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
              Deleted Sheets & Items
            </div>
          </div>
        </div>

      </div>

      {/* Main Grid: Activities & Approvals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1.8fr 1fr))', gap: '20px' }}>
        
        {/* Left Column: Recent Audits */}
        <div className="admin-card-glass" style={{ padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="var(--accent)" /> Recent Staff Activities
            </h3>
            <button 
              onClick={() => onNavigateTab('activity')} 
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              View Log <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentActivities.map((a: any) => (
              <div 
                key={a.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '12px', 
                  borderRadius: '10px', 
                  background: 'var(--background)',
                  border: '1px solid var(--border-light)' 
                }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {ACTION_ICONS[a.action] || <Activity size={14} color="var(--muted)" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: 'var(--foreground)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.details}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                    <span style={{ color: 'var(--navy)', fontWeight: 700 }}>{a.userName}</span>
                    <span>•</span>
                    <span>{new Date(a.timestamp).toLocaleDateString()} {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)', fontSize: '13.5px', fontWeight: 500 }}>
                No recent activity logged in the system.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Pending Approvals Quick-Respond */}
        <div className="admin-card-glass" style={{ padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color={stats.pendingRequests > 0 ? 'var(--danger)' : 'var(--muted)'} /> Pending Approvals
            </h3>
            <button 
              onClick={() => onNavigateTab('downloads')} 
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              See All <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {pendingRequests.map(r => (
              <div 
                key={r.id} 
                style={{ 
                  background: 'var(--background)',
                  border: r.type === 'delete_register' ? '1.5px solid rgba(239,68,68,0.2)' : '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--foreground)' }}>{r.registerName}</span>
                    {r.type === 'delete_register' ? (
                      <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--destructive-bg)', color: 'var(--destructive)', fontSize: '9px', fontWeight: 700 }}>DELETE</span>
                    ) : (
                      <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(26,115,232,0.08)', color: 'var(--accent)', fontSize: '9px', fontWeight: 700 }}>DOWNLOAD</span>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px', fontWeight: 500 }}>
                    Requested by <strong style={{ color: 'var(--navy)' }}>{r.userName}</strong>
                  </div>
                </div>

                <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '8px', fontSize: '12px', color: 'var(--foreground)', border: '1px solid var(--border-light)', lineHeight: '1.3' }}>
                  {r.description}
                </div>

                {respondingTo === r.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea 
                      placeholder="Audit feedback or rejection notes..."
                      value={adminNote}
                      onChange={e => setAdminNote(e.target.value)}
                      style={{ width: '100%', minHeight: '50px', padding: '8px', borderRadius: '8px', fontSize: '12px', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setRespondingTo(null); setAdminNote(''); }} className="admin-btn-secondary-flat" style={{ height: '30px', fontSize: '11px', padding: '0 10px', borderRadius: '6px' }}>Cancel</button>
                      <button onClick={() => handleRespond(r.id, 'rejected')} style={{ border: 'none', background: 'var(--destructive-bg)', color: 'var(--destructive)', fontWeight: 700, padding: '0 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Reject</button>
                      <button onClick={() => handleRespond(r.id, 'approved')} className="admin-btn-success-glow" style={{ height: '30px', fontSize: '11px', padding: '0 12px', borderRadius: '6px' }}>Approve</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setRespondingTo(r.id)} className="admin-btn-secondary-flat" style={{ flex: 1, height: '30px', padding: 0, justifyContent: 'center', fontSize: '11.5px', borderRadius: '8px' }}>Respond</button>
                    <button onClick={() => handleRespond(r.id, 'approved')} className="admin-btn-success-glow" style={{ flex: 1, height: '30px', padding: 0, justifyContent: 'center', fontSize: '11.5px', borderRadius: '8px' }}>Approve</button>
                  </div>
                )}
              </div>
            ))}
            
            {pendingRequests.length === 0 && (
              <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--brand-green)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={28} />
                <span style={{ fontSize: '13px', fontWeight: 600 }}>All requests answered. Good job!</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Quick Shortcuts Grid */}
      <div>
        <h3 style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px', fontWeight: 700 }}>Quick Actions & Controls</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          
          <div className="admin-card-glass" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onNavigateTab('users')}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(26,115,232,0.08)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserPlus size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Manage Employees</div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500 }}>Create profiles & set sheet permissions.</div>
            </div>
          </div>

          <div className="admin-card-glass" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onNavigateTab('analytics')}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(139,92,246,0.08)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Activity size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Employee Analytics</div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500 }}>Analyze daily work volume & activity stats.</div>
            </div>
          </div>

          <div className="admin-card-glass" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => { sessionStorage.setItem('admin_workspace_mode', '1'); navigate('/'); }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <LayoutDashboard size={18} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Go to Main Workspace</div>
              <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500 }}>Open the active registers & edit cells.</div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
