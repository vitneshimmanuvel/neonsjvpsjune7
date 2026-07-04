import { useState, useEffect, useMemo, useRef } from 'react';
import { firebaseGetUsers } from '../../lib/firebaseAuth';
import { apiUrl } from '../../lib/apiBase';
import { Activity, User, LogIn, LogOut, Shield, Trash2, Edit3, Download, Key, RefreshCw, Filter, X, Calendar, ChevronDown, Plus, Clock, FileSpreadsheet } from 'lucide-react';
import { cleanActivityLogs } from '../../lib/activityHelper';

const ICONS: Record<string, any> = {
  login: <LogIn size={14} color="#10b981"/>, logout: <LogOut size={14} color="#f59e0b"/>,
  admin_login: <Shield size={14} color="#ef4444"/>, register: <User size={14} color="#3b82f6"/>,
  create_user: <User size={14} color="#10b981"/>, delete_user: <Trash2 size={14} color="#ef4444"/>,
  update_user: <Edit3 size={14} color="#8b5cf6"/>, update_permissions: <Shield size={14} color="#f59e0b"/>,
  change_status: <User size={14} color="#f59e0b"/>, change_password: <Key size={14} color="#8b5cf6"/>,
  admin_change_password: <Key size={14} color="#ef4444"/>,
  download_request: <Download size={14} color="#3b82f6"/>,
  respond_download_request: <Download size={14} color="#10b981"/>,
  // Workspace actions
  edit_cells: <Edit3 size={14} color="#6366f1"/>,
  add_row: <Edit3 size={14} color="#10b981"/>,
  delete_row: <Trash2 size={14} color="#ef4444"/>,
  bulk_delete_rows: <Trash2 size={14} color="#ef4444"/>,
  add_column: <Edit3 size={14} color="#3b82f6"/>,
  delete_column: <Trash2 size={14} color="#f59e0b"/>,
  download_data: <Download size={14} color="#10b981"/>,
};

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  admin_login: 'Admin Login',
  register: 'Register',
  create_user: 'Create User',
  delete_user: 'Delete User',
  update_user: 'Update User',
  update_permissions: 'Update Permissions',
  change_status: 'Change Status',
  change_password: 'Change Password',
  admin_change_password: 'Admin Change Password',
  download_request: 'Download Request',
  respond_download_request: 'Respond Download Request',
  // Workspace actions
  edit_cells: 'Edit Cells',
  add_row: 'Add Row',
  delete_row: 'Delete Row',
  bulk_delete_rows: 'Bulk Delete Rows',
  add_column: 'Add Column',
  delete_column: 'Delete Column',
  download_data: 'Download Data',
};

export default function AdminActivityPage() {

  const [activities, setActivities] = useState<any[]>([]);
  const [users, setUsers] = useState<{id:string;name:string;email:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pagination states
  const [hasMore, setHasMore] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 1000;

  // Filters
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterSingleDate, setFilterSingleDate] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const fetch_ = async (isFirstPage = false) => {
    if (isFirstPage) {
      setLoading(true);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let usersList = users;
      if (isFirstPage) {
        const userData = await firebaseGetUsers();
        usersList = (userData.users || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email }));
        setUsers(usersList);
      }

      const offset = isFirstPage ? 0 : activities.length;
      const res = await fetch(apiUrl(`/api/activity?limit=${PAGE_SIZE}&offset=${offset}`));
      if (!res.ok) throw new Error('Failed to fetch activity logs');
      const data = await res.json();
      const newItems = data.activities || [];

      if (isFirstPage) {
        setActivities(newItems);
      } else {
        setActivities(prev => {
          const uniqueMap = new Map<string, any>();
          prev.forEach((item: any) => { if (item.id) uniqueMap.set(item.id.toString(), item); });
          newItems.forEach((item: any) => { if (item.id) uniqueMap.set(item.id.toString(), item); });
          return Array.from(uniqueMap.values()).sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        });
      }

      setHasMore(newItems.length === PAGE_SIZE);
    }
    catch (e) {
      console.error("Failed to load activity logs:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  const handleScroll = () => {
    if (!containerRef.current || loading || loadingMore || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetch_(false);
    }
  };

  useEffect(() => { fetch_(true); }, []);

  // Unique action types from data
  const actionTypes = useMemo(() => {
    const types = new Set<string>();
    activities.forEach(a => types.add(a.action));
    return Array.from(types).sort();
  }, [activities]);

  // Unique users from data
  const activityUsers = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach(a => {
      if (a.userId && a.userName && !map.has(a.userId)) {
        map.set(a.userId, a.userName);
      }
    });
    // Also add known users
    users.forEach(u => {
      if (!map.has(u.id)) map.set(u.id, u.name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [activities, users]);

  // Filtered activities
  const filtered = useMemo(() => {
    const cleaned = cleanActivityLogs(activities);
    return cleaned.filter(a => {
      if (filterUser !== 'all' && a.userId !== filterUser) return false;
      if (filterAction !== 'all' && a.action !== filterAction) return false;
      // Single date filter — match the exact day
      if (filterSingleDate) {
        const d = new Date(a.timestamp);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;
        if (localDateStr !== filterSingleDate) return false;
      }
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0,0,0,0);
        if (new Date(a.timestamp) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23,59,59,999);
        if (new Date(a.timestamp) > to) return false;
      }
      return true;
    });
  }, [activities, filterUser, filterAction, filterDateFrom, filterDateTo, filterSingleDate]);

  const hasActiveFilters = filterUser !== 'all' || filterAction !== 'all' || !!filterSingleDate || !!filterDateFrom || !!filterDateTo;

  useEffect(() => {
    if (!loading && !loadingMore && hasActiveFilters && filtered.length < 15 && hasMore) {
      if (activities.length < 1000) {
        fetch_(false);
      }
    }
  }, [filtered.length, loading, loadingMore, hasActiveFilters, hasMore, activities.length]);

  const activeFilterCount = [filterUser !== 'all', filterAction !== 'all', !!filterSingleDate, !!filterDateFrom, !!filterDateTo].filter(Boolean).length;

  const clearFilters = () => {
    setFilterUser('all');
    setFilterAction('all');
    setFilterSingleDate('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // Helper to render user initials avatar
  const renderUserAvatar = (name: string) => {
    const firstChar = name ? name.charAt(0).toUpperCase() : 'U';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
    const color = colors[Math.abs(hash) % colors.length];
    return (
      <div style={{
        width: '24px', height: '24px', borderRadius: '50%', backgroundColor: color,
        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10.5px', fontWeight: 800, flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        {firstChar}
      </div>
    );
  };

  // Helper to format activity details nicely with inline elements and badges
  const renderActivityDetails = (details: string) => {
    // Check for "Updated row #XXX in "RegisterName": Column changed from "Old" to "New""
    const updateRowRegex = /^Updated row #(\d+) in "([^"]+)":\s+([a-zA-Z0-9_\s/\-()]+)\s+changed from\s+([\s\S]*?)\s+to\s+([\s\S]*)$/;
    const match = details.match(updateRowRegex);
    if (match) {
      const [_, rowNum, registerName, colName, oldVal, newVal] = match;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--foreground)', lineHeight: '1.5' }}>
          <span>Updated</span>
          <span style={{ background: 'rgba(99, 102, 241, 0.08)', color: '#6366f1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
            Row #{rowNum}
          </span>
          <span>in</span>
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
            {registerName}
          </span>
          <span>:</span>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{colName}</span>
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>changed from</span>
          <span style={{ background: 'var(--border-light)', color: 'var(--muted)', padding: '2px 6px', borderRadius: '4px', fontSize: '11.5px', textDecoration: 'line-through', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {oldVal === '""' || !oldVal ? '""' : oldVal}
          </span>
          <span style={{ color: 'var(--muted)' }}>➔</span>
          <span style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--brand-green)', padding: '2px 6px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {newVal === '""' || !newVal ? '""' : newVal}
          </span>
        </div>
      );
    }

    // Check for "Added new row #XXX in "RegisterName""
    const addRowRegex = /^Added new row #(\d+) in "([^"]+)"/;
    const matchAdd = details.match(addRowRegex);
    if (matchAdd) {
      const [_, rowNum, registerName] = matchAdd;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--foreground)' }}>
          <span style={{ color: 'var(--brand-green)', fontWeight: 700 }}>Added new row</span>
          <span style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--brand-green)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
            Row #{rowNum}
          </span>
          <span>in</span>
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
            {registerName}
          </span>
        </div>
      );
    }

    // Check for "Deleted row #XXX from "RegisterName""
    const deleteRowRegex = /^Deleted row #(\d+) from "([^"]+)"/;
    const matchDelete = details.match(deleteRowRegex);
    if (matchDelete) {
      const [_, rowNum, registerName] = matchDelete;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13.5px', color: 'var(--foreground)' }}>
          <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Deleted row</span>
          <span style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
            Row #{rowNum}
          </span>
          <span>from</span>
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
            {registerName}
          </span>
        </div>
      );
    }

    // Generic highlight logic for quoted text
    const parts = details.split(/(".*?")/g);
    return (
      <div style={{ fontSize: '13.5px', color: 'var(--foreground)', fontWeight: 500, lineHeight: 1.4 }}>
        {parts.map((part, i) => {
          if (part.startsWith('"') && part.endsWith('"')) {
            return <strong key={i} style={{ color: 'var(--navy)', fontWeight: 700 }}>{part.replace(/"/g, '')}</strong>;
          }
          return part;
        })}
      </div>
    );
  };

  // Group filtered items by date (e.g. "Today", "Yesterday", "July 4, 2026")
  const groupedActivities = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach(a => {
      const date = new Date(a.timestamp);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      let groupKey = '';
      if (date.toDateString() === today.toDateString()) {
        groupKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = 'Yesterday';
      } else {
        groupKey = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(a);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="admin-animate-fade-in">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'10px'}}>
        <h2 style={{margin:0,fontSize:'20px',fontWeight:800,color:'var(--navy)',display:'flex',alignItems:'center',gap:'10px'}}><Activity size={22} color="var(--accent)"/> Activity Log</h2>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <button onClick={() => setShowFilters(!showFilters)} style={{
            background: showFilters || activeFilterCount > 0 ? 'var(--navy)' : 'var(--surface)',
            border:'1.5px solid var(--border)',
            color: showFilters || activeFilterCount > 0 ? 'white' : 'var(--navy)',
            cursor:'pointer',padding:'10px 18px',borderRadius:'10px',display:'flex',alignItems:'center',gap:'8px',
            boxShadow:'var(--admin-card-shadow)',fontSize:'13px',fontWeight:600,transition:'all 0.2s'
          }}>
            <Filter size={14}/>
            Filters
            {activeFilterCount > 0 && (
              <span style={{background:'var(--accent)',color:'white',borderRadius:'50%',width:'18px',height:'18px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,marginLeft:'4px'}}>{activeFilterCount}</span>
            )}
          </button>
          <button onClick={() => fetch_(true)} className="admin-btn-secondary-flat" style={{padding:'12px',borderRadius:'10px'}} title="Refresh activity logs"><RefreshCw size={16}/></button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        {[
          { label: 'All Actions', value: 'all', color: 'var(--navy)', bg: 'var(--border-light)', icon: <Activity size={12}/> },
          { label: 'Logins', value: 'login', color: '#10b981', bg: 'rgba(16,185,129,0.06)', icon: <LogIn size={12}/> },
          { label: 'Cell Edits', value: 'edit_cells', color: '#6366f1', bg: 'rgba(99,102,241,0.06)', icon: <Edit3 size={12}/> },
          { label: 'New Entries', value: 'add_row', color: '#10b981', bg: 'rgba(16,185,129,0.06)', icon: <Plus size={12}/> },
          { label: 'Deletes', value: 'delete_row', color: '#ef4444', bg: 'rgba(239,68,68,0.06)', icon: <Trash2 size={12}/> },
          { label: 'Downloads', value: 'download_data', color: '#3b82f6', bg: 'rgba(59,130,246,0.06)', icon: <Download size={12}/> },
          { label: 'User Changes', value: '_user_changes_', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', icon: <User size={12}/> },
          { label: 'Permissions', value: 'update_permissions', color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', icon: <Shield size={12}/> },
        ].map(chip => {
          const isActive = chip.value === 'all' ? filterAction === 'all' : filterAction === chip.value;
          const iconColor = isActive ? chip.color : 'var(--muted)';
          return (
            <button
              key={chip.value}
              onClick={() => {
                if (chip.value === 'all') {
                  setFilterAction('all');
                } else if (chip.value === '_user_changes_') {
                  const userActions = ['create_user', 'delete_user', 'update_user', 'change_status'];
                  const currentIdx = userActions.indexOf(filterAction);
                  setFilterAction(userActions[(currentIdx + 1) % userActions.length]);
                } else {
                  setFilterAction(filterAction === chip.value ? 'all' : chip.value);
                }
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '99px',
                border: isActive ? `1.5px solid ${chip.color}` : '1.5px solid var(--border)',
                background: isActive ? chip.bg : 'var(--surface)',
                color: isActive ? chip.color : 'var(--muted)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: isActive ? 700 : 500,
                transition: 'all 0.2s',
                boxShadow: isActive ? `0 2px 8px ${chip.bg}` : 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span style={{ color: iconColor, display: 'flex', alignItems: 'center' }}>
                {chip.icon}
              </span>
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="admin-card-glass admin-animate-fade-in" style={{
          padding:'20px',marginBottom:'20px',
          display:'flex',flexWrap:'wrap',gap:'16px',alignItems:'flex-end'
        }}>
          {/* User Filter */}
          <div style={{flex:'1 1 180px',minWidth:'160px'}}>
            <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
              <User size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/> User
            </label>
            <div style={{position:'relative'}}>
              <select
                title="Filter by User"
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                className="admin-input-premium"
                style={{padding:'10px 32px 10px 12px',appearance:'none',cursor:'pointer'}}
              >
                <option value="all">All Users</option>
                {activityUsers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--muted)'}}/>
            </div>
          </div>

          {/* Action Filter */}
          <div style={{flex:'1 1 180px',minWidth:'160px'}}>
            <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
              <Activity size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/> Action Type
            </label>
            <div style={{position:'relative'}}>
              <select
                title="Filter by Action Type"
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                className="admin-input-premium"
                style={{padding:'10px 32px 10px 12px',appearance:'none',cursor:'pointer'}}
              >
                <option value="all">All Actions</option>
                {actionTypes.map(t => (
                  <option key={t} value={t}>{ACTION_LABELS[t] || t.replace(/_/g,' ')}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{position:'absolute',right:'12px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--muted)'}}/>
            </div>
          </div>

          {/* Specific Date */}
          <div style={{flex:'1 1 150px',minWidth:'140px'}}>
            <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
              <Calendar size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/> Specific Date
            </label>
            <input
              type="date"
              title="Specific Date"
              value={filterSingleDate}
              onChange={e => { setFilterSingleDate(e.target.value); if (e.target.value) { setFilterDateFrom(''); setFilterDateTo(''); } }}
              className="admin-input-premium"
              style={{
                padding:'9px 12px',
                border: filterSingleDate ? '1.5px solid var(--navy)' : '1.5px solid var(--border)',
                background: filterSingleDate ? 'rgba(30,41,82,0.04)' : 'var(--surface)'
              }}
            />
          </div>

          {/* Date From */}
          <div style={{flex:'1 1 150px',minWidth:'140px'}}>
            <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
              <Calendar size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/> From Date
            </label>
            <input
              type="date"
              title="From Date"
              value={filterDateFrom}
              onChange={e => { setFilterDateFrom(e.target.value); if (e.target.value) setFilterSingleDate(''); }}
              className="admin-input-premium"
              style={{padding:'9px 12px'}}
            />
          </div>

          {/* Date To */}
          <div style={{flex:'1 1 150px',minWidth:'140px'}}>
            <label style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px',display:'block'}}>
              <Calendar size={12} style={{marginRight:'4px',verticalAlign:'middle'}}/> To Date
            </label>
            <input
              type="date"
              title="To Date"
              value={filterDateTo}
              onChange={e => { setFilterDateTo(e.target.value); if (e.target.value) setFilterSingleDate(''); }}
              className="admin-input-premium"
              style={{padding:'9px 12px'}}
            />
          </div>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="admin-btn-secondary-flat" style={{
              background:'var(--destructive-bg)',color:'var(--destructive)',border:'1px solid rgba(239,68,68,0.2)',
              fontSize:'12px',fontWeight:700,height:'40px',padding:'0 16px',borderRadius:'10px'
            }}>
              <X size={14}/> Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'10px'}}>
        <div style={{fontSize:'13px',color:'var(--muted)',fontWeight:500}}>
          Showing <strong style={{color:'var(--foreground)'}}>{filtered.length}</strong> of {activities.length} entries
          {activeFilterCount > 0 && <span style={{color:'var(--accent)',marginLeft:'6px'}}>({activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active)</span>}
        </div>
        {hasMore && (
          <button 
            onClick={() => fetch_(false)}
            disabled={loadingMore}
            style={{
              background: 'none', border: 'none', color: 'var(--navy)',
              fontWeight: 700, cursor: 'pointer', fontSize: '12px', textDecoration: 'underline',
              padding: 0
            }}
          >
            {loadingMore ? 'Loading older logs...' : 'Load older logs'}
          </button>
        )}
      </div>

      {/* Activities Timeline Container */}
      <div className="admin-card-glass" style={{ padding: '24px 20px', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>
            <RefreshCw className="animate-spin" style={{ display: 'inline-block', marginRight: '8px' }} size={16} />
            Loading activities...
          </div>
        ) : (
          <div style={{ maxHeight: 'calc(100vh - 270px)', overflowY: 'auto', paddingRight: '8px' }} ref={containerRef} onScroll={handleScroll}>
            {filtered.length === 0 ? (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500 }}>
                {activeFilterCount > 0 ? 'No activity matches your filters' : 'No activity logs found'}
              </div>
            ) : (
              Object.entries(groupedActivities).map(([day, items]) => (
                <div key={day} style={{ marginBottom: '28px', position: 'relative' }}>
                  {/* Sticky Date Header */}
                  <div style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: 'var(--surface)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: 'var(--navy)',
                    boxShadow: 'var(--admin-card-shadow)',
                    border: '1px solid var(--border-light)',
                    marginBottom: '20px'
                  }}>
                    <Calendar size={13} color="var(--accent)" />
                    {day}
                  </div>

                  {/* Vertical line connecting the timeline nodes of this day */}
                  <div style={{
                    position: 'absolute',
                    left: '21px',
                    top: '38px',
                    bottom: '8px',
                    width: '2px',
                    background: 'linear-gradient(to bottom, var(--border), var(--border-light))',
                    zIndex: 0
                  }} />

                  {/* Day's Activities List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {items.map(a => {
                      const iconBg = ICONS[a.action] ? 'var(--surface)' : 'rgba(71,85,105,0.04)';
                      return (
                        <div 
                          key={a.id} 
                          className="admin-timeline-item" 
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '16px',
                            position: 'relative',
                            zIndex: 1,
                            paddingLeft: '6px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {/* Circular Timeline Node */}
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: iconBg,
                            border: '1.5px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                            zIndex: 2
                          }}>
                            {ICONS[a.action] || <Activity size={14} color="var(--muted)" />}
                          </div>

                          {/* Activity Detail Card Content */}
                          <div 
                            className="admin-timeline-content"
                            style={{
                              flex: 1,
                              background: 'var(--surface)',
                              border: '1px solid var(--border-light)',
                              borderRadius: '12px',
                              padding: '14px 18px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                              transition: 'all 0.15s'
                            }}
                          >
                            {/* Upper: Formatted Description Details */}
                            {renderActivityDetails(a.details)}

                            {/* Lower: User, Action tag and Time stamp details */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '10px',
                              paddingTop: '8px',
                              borderTop: '1px solid var(--border-light)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* User avatar and Name badge */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,45,93,0.04)', padding: '2px 8px 2px 4px', borderRadius: '12px' }}>
                                  {renderUserAvatar(a.userName)}
                                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)' }}>
                                    {a.userName}
                                  </span>
                                </div>

                                {/* Action Category Badge */}
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  color: 'var(--muted)',
                                  background: 'var(--border-light)',
                                  padding: '2px 8px',
                                  borderRadius: '6px'
                                }}>
                                  {ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ')}
                                </span>
                              </div>

                              {/* Time badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--muted)', fontWeight: 500 }}>
                                <Clock size={11} />
                                <span>{new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            {loadingMore && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', background: 'var(--background)', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '12px', marginTop: '16px' }}>
                <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--navy)' }} />
                Loading older activities...
              </div>
            )}
            {!loadingMore && hasMore && filtered.length > 0 && (
              <div style={{ padding: '16px 0', textAlign: 'center' }}>
                <button 
                  onClick={() => fetch_(false)}
                  className="admin-btn-secondary-flat"
                  style={{
                    padding: '10px 24px', fontSize: '13px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer'
                  }}
                >
                  Load More Activities
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        .admin-timeline-item:hover .admin-timeline-content {
          border-color: var(--accent) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04) !important;
          transform: translateX(3px);
        }
        .admin-timeline-content {
          transition: all 0.2s ease-in-out !important;
        }
      `}</style>
    </div>
  );
}
