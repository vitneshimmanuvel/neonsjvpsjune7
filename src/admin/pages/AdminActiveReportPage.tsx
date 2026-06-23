import { useState, useEffect, useMemo, useRef } from 'react';
import { firebaseGetUsers } from '../../lib/firebaseAuth';
import { listBusinesses, listRegisters } from '../../lib/api';
import { apiUrl } from '../../lib/apiBase';
import { 
  FileSpreadsheet, User, Calendar, RefreshCw, ChevronDown, 
  Filter, X, Search, Download, ClipboardList, Database, Check, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cleanActivityLogs } from '../../lib/activityHelper';

interface RegisterItem {
  id: string;
  name: string;
}

const ACTION_COLORS: Record<string, string> = {
  edit_cells: '#6366f1',
  add_row: '#10b981',
  delete_row: '#ef4444',
  bulk_delete_rows: '#ef4444',
  add_column: '#8b5cf6',
  delete_column: '#f59e0b',
  // Historical actions
  'Delete Row': '#ef4444',
  'Delete Rows': '#ef4444',
  'Add Column': '#8b5cf6',
  'Delete Column': '#f59e0b',
  'Create Register': '#10b981',
  'Trash Register': '#f59e0b',
  'Restore Register': '#10b981',
  'Rename Register': '#8b5cf6',
  'Rename Column': '#8b5cf6',
  'Edit Row': '#3b82f6',
  'Add Row': '#10b981',
  'Insert Row': '#10b981',
  'Change Column Type': '#8b5cf6',
  other: '#94a3b8'
};

const ACTION_LABELS: Record<string, string> = {
  edit_cells: 'Cell Edit',
  add_row: 'Add Row',
  delete_row: 'Delete Row',
  bulk_delete_rows: 'Bulk Delete',
  add_column: 'Add Column',
  delete_column: 'Delete Column',
  // Historical actions
  'Delete Row': 'Delete Row',
  'Delete Rows': 'Bulk Delete',
  'Add Column': 'Add Column',
  'Delete Column': 'Delete Column',
  'Create Register': 'Create Register',
  'Trash Register': 'Trash Register',
  'Restore Register': 'Restore Register',
  'Rename Register': 'Rename Register',
  'Rename Column': 'Rename Column',
  'Edit Row': 'Cell Edit',
  'Add Row': 'Add Row',
  'Insert Row': 'Insert Row',
  'Change Column Type': 'Change Column Type',
};

const sty = {
  card: { background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } as React.CSSProperties,
  statCard: { background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.04)', flex: '1 1 180px', minWidth: '160px' } as React.CSSProperties,
  label: { fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: '6px', display: 'block' },
  select: { width: '100%', padding: '10px 28px 10px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', fontWeight: 500, appearance: 'none' as const, cursor: 'pointer', outline: 'none', transition: 'all 0.15s' },
  dateInput: { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, transition: 'all 0.15s' },
  input: { width: '100%', padding: '9px 12px 9px 36px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const, transition: 'all 0.15s' }
};

export default function AdminActiveReportPage() {
  const [activities, setActivities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [registers, setRegisters] = useState<RegisterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pagination states
  const [hasMoreActivity, setHasMoreActivity] = useState(true);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 1000;

  // Filters state
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterRegister, setFilterRegister] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterSingleDate, setFilterSingleDate] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState(true);

  const fetch_ = async (isFirstPage = false) => {
    if (isFirstPage) {
      setLoading(true);
      // Reset cursors and states
      setHasMoreActivity(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let usersList = users;
      let regsList = registers;

      if (isFirstPage) {
        const [userRes, busList] = await Promise.all([
          firebaseGetUsers(),
          listBusinesses()
        ]);
        usersList = (userRes.users || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email }));
        setUsers(usersList);

        const busId = busList[0]?.id || 1;
        const summs = await listRegisters(busId);
        const regs = summs.map((s: any) => ({ id: s.id.toString(), name: s.name }));
        regsList = regs.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setRegisters(regsList);
      }

      const offset = isFirstPage ? 0 : activities.length;
      const res = await fetch(apiUrl(`/api/activity?limit=${PAGE_SIZE}&offset=${offset}`));
      if (!res.ok) throw new Error('Failed to fetch activity logs');
      const data = await res.json();
      const rawActivities = data.activities || [];

      // Merge and sort
      const uniqueMap = new Map<string, any>();

      let baseActivities = isFirstPage ? [] : activities;
      baseActivities.forEach((item: any) => {
        if (item.id) uniqueMap.set(item.id.toString(), item);
      });
      rawActivities.forEach((item: any) => {
        if (item.id) uniqueMap.set(item.id.toString(), item);
      });

      const sorted = Array.from(uniqueMap.values())
        .sort((a: any, b: any) => (b.timestamp || '').localeCompare(a.timestamp || ''));

      const validActions = [
        'edit_cells', 'add_row', 'delete_row', 'bulk_delete_rows', 'add_column', 'delete_column',
        'Delete Row', 'Delete Rows', 'Add Column', 'Delete Column', 'Create Register', 'Trash Register', 'Restore Register', 'Rename Register', 'Rename Column',
        'Edit Row', 'Add Row', 'Insert Row', 'Change Column Type'
      ];
      const filtered = sorted.filter((a: any) => validActions.includes(a.action));

      setActivities(filtered);
      setHasMoreActivity(rawActivities.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('Failed to load active report:', e);
      toast.error('Failed to retrieve activity reports');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleTableScroll = () => {
    if (!tableContainerRef.current || loading || loadingMore || !hasMoreActivity) return;
    const { scrollTop, scrollHeight, clientHeight } = tableContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetch_(false);
    }
  };

  useEffect(() => {
    fetch_(true);
  }, []);

  // Filtered reports
  const filteredReport = useMemo(() => {
    const cleaned = cleanActivityLogs(activities);
    return cleaned.filter(a => {
      // 1. Staff Filter
      if (filterUser !== 'all' && a.userId !== filterUser) return false;

      // 2. Register Filter
      if (filterRegister !== 'all') {
        if (!a.registerId || a.registerId !== filterRegister) return false;
      }

      // 3. Action Filter
      if (filterAction !== 'all' && a.action !== filterAction) return false;

      // 4. Specific Date Filter
      if (filterSingleDate) {
        const d = new Date(a.timestamp);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;
        if (localDateStr !== filterSingleDate) return false;
      }

      // 5. Date From Filter
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(a.timestamp) < from) return false;
      }

      // 6. Date To Filter
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(a.timestamp) > to) return false;
      }

      // 7. Text Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const detailsMatch = a.details?.toLowerCase().includes(query);
        const nameMatch = a.userName?.toLowerCase().includes(query);
        const regMatch = a.registerName?.toLowerCase().includes(query);
        const actionMatch = (ACTION_LABELS[a.action] || a.action)?.toLowerCase().includes(query);
        if (!detailsMatch && !nameMatch && !regMatch && !actionMatch) return false;
      }

      return true;
    });
  }, [activities, filterUser, filterRegister, filterAction, filterSingleDate, filterDateFrom, filterDateTo, searchQuery]);

  const hasActiveFilters = filterUser !== 'all' || filterRegister !== 'all' || filterAction !== 'all' || !!filterSingleDate || !!filterDateFrom || !!filterDateTo || !!searchQuery.trim();

  useEffect(() => {
    if (!loading && !loadingMore && hasActiveFilters && filteredReport.length < 15 && hasMoreActivity) {
      if (activities.length < 1000) {
        fetch_(false);
      }
    }
  }, [filteredReport.length, loading, loadingMore, hasActiveFilters, hasMoreActivity, activities.length]);

  // Analytics Metrics
  const metrics = useMemo(() => {
    const total = filteredReport.length;
    
    // Active Contributors
    const contributors = new Set<string>();
    filteredReport.forEach(a => {
      if (a.userId) contributors.add(a.userId);
    });

    // Most Active Register
    const regCount: Record<string, { name: string; count: number }> = {};
    filteredReport.forEach(a => {
      if (a.registerId && a.registerName) {
        if (!regCount[a.registerId]) regCount[a.registerId] = { name: a.registerName, count: 0 };
        regCount[a.registerId].count++;
      }
    });
    let mostActiveReg = '-';
    let maxCount = 0;
    Object.values(regCount).forEach(item => {
      if (item.count > maxCount) {
        maxCount = item.count;
        mostActiveReg = item.name;
      }
    });

    // Today's entries
    const todayStr = new Date().toISOString().split('T')[0];
    const todayEntries = activities.filter(a => {
      return a.timestamp?.split('T')[0] === todayStr;
    }).length;

    return {
      total,
      contributorsCount: contributors.size,
      mostActiveReg,
      todayEntries
    };
  }, [filteredReport, activities]);

  // Clear all filters
  const clearFilters = () => {
    setFilterUser('all');
    setFilterRegister('all');
    setFilterAction('all');
    setFilterSingleDate('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchQuery('');
  };

  const activeFilterCount = [
    filterUser !== 'all',
    filterRegister !== 'all',
    filterAction !== 'all',
    !!filterSingleDate,
    !!filterDateFrom,
    !!filterDateTo,
    !!searchQuery.trim()
  ].filter(Boolean).length;

  // Excel Export Handler
  const handleExportExcel = async () => {
    if (filteredReport.length === 0) {
      toast.error('No record entries to export');
      return;
    }

    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      
      // Map report entries to clean rows
      const rows = filteredReport.map((a, idx) => ({
        'S.No.': idx + 1,
        'Staff Name': a.userName || 'Unknown',
        'Register Name': a.registerName || 'System',
        'Action': ACTION_LABELS[a.action] || a.action.replace(/_/g, ' '),
        'Details & Entry Content': a.details || '',
        'Date': new Date(a.timestamp).toLocaleDateString('en-IN'),
        'Time': new Date(a.timestamp).toLocaleTimeString('en-IN')
      }));

      // Create sheet
      const ws = XLSX.utils.json_to_sheet(rows);
      
      // Auto-fit column widths
      const colWidths = [
        { wch: 8 },  // S.No
        { wch: 22 }, // Staff
        { wch: 25 }, // Register
        { wch: 15 }, // Action
        { wch: 60 }, // Details
        { wch: 12 }, // Date
        { wch: 12 }  // Time
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Active Report');

      // Save file
      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Staff_Active_Report_${dateStr}.xlsx`);
      toast.success('Active report spreadsheet downloaded');
    } catch (e: any) {
      console.error('Failed to export active report:', e);
      toast.error('Failed to export report to Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ClipboardList size={22} color="var(--accent)" /> Staff Active Entry Report
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            style={{
              background: showFilters || activeFilterCount > 0 ? 'var(--navy)' : 'var(--surface)',
              border: '1.5px solid var(--border)',
              color: showFilters || activeFilterCount > 0 ? 'white' : 'var(--navy)',
              cursor: 'pointer', padding: '10px 18px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: 'var(--admin-card-shadow)', fontSize: '13px', fontWeight: 600, transition: 'all 0.2s'
            }}
          >
            <Filter size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span style={{ background: 'var(--accent)', color: 'white', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, marginLeft: '4px' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <button 
            onClick={handleExportExcel} 
            disabled={exporting || filteredReport.length === 0}
            className="admin-btn-success-glow"
            style={{
              cursor: exporting || filteredReport.length === 0 ? 'not-allowed' : 'pointer',
              padding: '10px 18px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px',
              fontSize: '13px', fontWeight: 600, opacity: filteredReport.length === 0 ? 0.6 : 1, transition: 'all 0.2s', height: '38px'
            }}
          >
            <Download size={14} />
            {exporting ? 'Exporting...' : 'Export Excel'}
          </button>
          <button 
            onClick={() => fetch_(true)} 
            className="admin-btn-secondary-flat"
            style={{ padding: '10px', borderRadius: '10px' }}
            title="Refresh active report logs"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="admin-card-glass" style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <Clock size={36} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Fetching activity logs and registers...</div>
        </div>
      ) : (
        <>
          {/* Summary Strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {[
              { icon: <Database size={16} />, label: 'Total Audited Entries', value: metrics.total, color: '#6366f1' },
              { icon: <User size={16} />, label: 'Active Staff Contributors', value: metrics.contributorsCount, color: '#10b981' },
              { icon: <ClipboardList size={16} />, label: 'Most Active Register', value: metrics.mostActiveReg, color: '#f59e0b', isText: true },
              { icon: <Calendar size={16} />, label: "Today's Entries", value: metrics.todayEntries, color: '#06b6d4' },
            ].map((c, i) => (
              <div key={i} className="admin-stat-card-premium" style={{ flex: '1 1 200px', minWidth: '180px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${c.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.color }}>{c.icon}</div>
                  <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.label}</span>
                </div>
                <div style={{ 
                  fontSize: c.isText && String(c.value).length > 15 ? '15px' : '22px', 
                  fontWeight: 800, 
                  color: 'var(--foreground)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '4px'
                }} title={String(c.value)}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Filters Dashboard */}
          {showFilters && (
            <div className="admin-card-glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', border:'1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {/* Staff Selection */}
                <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
                  <label style={sty.label}><User size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Staff Member</label>
                  <div style={{ position: 'relative' }}>
                    <select title="Filter by Staff Member" value={filterUser} onChange={e => setFilterUser(e.target.value)} className="admin-input-premium" style={{ paddingRight: '28px', appearance: 'none', cursor: 'pointer' }}>
                      <option value="all">All Staff Members</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>
                </div>

                {/* Register Selection */}
                <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                  <label style={sty.label}><ClipboardList size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Target Register</label>
                  <div style={{ position: 'relative' }}>
                    <select title="Filter by Target Register" value={filterRegister} onChange={e => setFilterRegister(e.target.value)} className="admin-input-premium" style={{ paddingRight: '28px', appearance: 'none', cursor: 'pointer' }}>
                      <option value="all">All Registers</option>
                      {registers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>
                </div>

                {/* Action Selector */}
                <div style={{ flex: '1 1 150px', minWidth: '130px' }}>
                  <label style={sty.label}><Database size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Action Type</label>
                  <div style={{ position: 'relative' }}>
                    <select title="Filter by Action Type" value={filterAction} onChange={e => setFilterAction(e.target.value)} className="admin-input-premium" style={{ paddingRight: '28px', appearance: 'none', cursor: 'pointer' }}>
                      <option value="all">All Action Types</option>
                      {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)' }} />
                  </div>
                </div>

                {/* Specific Date */}
                <div style={{ flex: '1 1 150px', minWidth: '130px' }}>
                  <label style={sty.label}><Calendar size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> Specific Date</label>
                  <input 
                    type="date" 
                    title="Specific Date"
                    value={filterSingleDate} 
                    onChange={e => { setFilterSingleDate(e.target.value); if (e.target.value) { setFilterDateFrom(''); setFilterDateTo(''); } }} 
                    className="admin-input-premium"
                    style={{ border: filterSingleDate ? '1.5px solid var(--navy)' : '1.5px solid var(--border)', background: filterSingleDate ? 'rgba(30,41,82,0.04)' : 'var(--surface)' }} 
                  />
                </div>

                {/* From Date */}
                <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
                  <label style={sty.label}><Calendar size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> From Date</label>
                  <input type="date" title="From Date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); if (e.target.value) setFilterSingleDate(''); }} className="admin-input-premium" />
                </div>

                {/* To Date */}
                <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
                  <label style={sty.label}><Calendar size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} /> To Date</label>
                  <input type="date" title="To Date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); if (e.target.value) setFilterSingleDate(''); }} className="admin-input-premium" />
                </div>
              </div>

              {/* Text Search & Clear Row */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '500px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex' }}>
                    <Search size={16} />
                  </span>
                  <input 
                    type="text" 
                    placeholder="Search inside audit log details..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="admin-input-premium"
                    style={{ paddingLeft: '36px' }}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}
                      title="Clear search query"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {activeFilterCount > 0 && (
                  <button 
                    onClick={clearFilters} 
                    className="admin-btn-secondary-flat"
                    style={{
                      background: 'var(--destructive-bg)', color: 'var(--destructive)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: '12px', fontWeight: 700, padding: '10px 16px', borderRadius: '10px'
                    }}
                  >
                    <X size={14} /> Clear All Filters
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter statistics indicator */}
          <div style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              Showing <strong style={{ color: 'var(--foreground)' }}>{filteredReport.length}</strong> audited data actions
              {activeFilterCount > 0 && <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>({activeFilterCount} active)</span>}
            </div>
            {hasMoreActivity && (
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

          {/* Audited Logs Grid */}
          <div className="admin-table-premium-wrap admin-animate-fade-in" style={{ border: '1px solid var(--border)' }}>
            <div style={{ maxHeight: 'calc(100vh - 290px)', overflowY: 'auto' }} ref={tableContainerRef} onScroll={handleTableScroll}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>S.No</th>
                    <th style={{ width: '180px' }}>Staff Member</th>
                    <th style={{ width: '180px' }}>Register Name</th>
                    <th style={{ width: '130px' }}>Action</th>
                    <th>Audited Details</th>
                    <th style={{ width: '160px', textAlign: 'right' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReport.map((a, idx) => (
                    <tr key={a.id} className="report-row">
                      <td style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>{idx + 1}</td>
                      <td style={{ fontSize: '13.5px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,45,93,0.05)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>
                            {a.userName?.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ color: 'var(--foreground)' }}>{a.userName || 'Unknown'}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '13.5px', color: 'var(--navy)', fontWeight: 600 }}>
                        {a.registerName || 'System'}
                      </td>
                      <td>
                        <span className="admin-badge-pill" style={{ 
                           background: `${ACTION_COLORS[a.action] || ACTION_COLORS.other}12`, 
                           color: ACTION_COLORS[a.action] || ACTION_COLORS.other,
                           border: `1px solid ${ACTION_COLORS[a.action] || ACTION_COLORS.other}24`
                         }}>
                          {ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--foreground)', fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {a.details}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500, textAlign: 'right' }}>
                        <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{new Date(a.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div style={{ opacity: 0.7, fontSize: '11px', marginTop: '2px' }}>{new Date(a.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                    </tr>
                  ))}
                  {filteredReport.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <ClipboardList size={32} style={{ opacity: 0.3 }} />
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>No entry actions match the active filters</div>
                          <button onClick={clearFilters} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Clear all filters</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {loadingMore && (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', background: 'var(--background)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                          <Clock size={16} className="animate-spin" style={{ color: 'var(--navy)', display: 'inline-block' }} />
                          Loading more logs...
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loadingMore && hasMoreActivity && filteredReport.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '16px', textAlign: 'center', background: 'var(--bg-light)' }}>
                        <button 
                          onClick={() => fetch_(false)}
                          className="admin-btn-secondary-flat"
                          style={{
                            padding: '8px 20px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', margin: '0 auto'
                          }}
                        >
                          Load More Logs
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Inject simple row hovering stylesheet */}
      <style>{`
        .report-row:hover td {
          background-color: rgba(0, 45, 93, 0.015) !important;
        }
      `}</style>
    </div>
  );
}
