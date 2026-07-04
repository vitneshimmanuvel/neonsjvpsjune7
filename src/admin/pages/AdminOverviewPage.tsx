import { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import {
  firebaseGetUsers,
  firebaseGetActivity,
  firebaseGetPendingDownloadRequests,
  firebaseRespondRequest
} from '../../lib/firebaseAuth';
import { listBusinesses, listRegisters, deleteRegister, listDeletedRegisters, getAllDeletedItems, getRegister, type RegisterSummary, type Column, type Entry, listSavedShortcuts, createSavedShortcut, deleteSavedShortcut, type SavedRegisterShortcut, renameSavedShortcut, evaluateFormula, getDashboardConfig, saveDashboardConfig } from '../../lib/api';
import { cleanActivityLogs } from '../../lib/activityHelper';
import {
  LayoutDashboard, Users, Activity, ShieldAlert, FileSpreadsheet,
  RefreshCw, TrendingUp, UserCheck, Calendar, ArrowRight, ArrowLeft, UserPlus,
  Clock, CheckCircle, XCircle, Trash2, Download, MessageSquare, Send,
  Search, X, Filter, ChevronDown, ChevronUp, Eye, Hash, Folder,
  Maximize2, Minimize2, Database, Columns, Plus, Bookmark, MoreVertical
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../lib/formatters';
import { FilterModal } from '../../components/register/modals/FilterModal';

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

interface ConfiguredSumMetric {
  id: string;
  shortcutId: string;
  columnId: number;
  mode: 'sum' | 'average';
}

const ACTION_ICONS: Record<string, any> = {
  login: <LogInIcon size={14} color="#10b981" />,
  admin_login: <ShieldIcon size={14} color="#ef4444" />,
  edit_cells: <EditIcon size={14} color="#6366f1" />,
  add_row: <PlusIcon size={14} color="#10b981" />,
  delete_row: <TrashIcon size={14} color="#ef4444" />,
  bulk_delete_rows: <TrashIcon size={14} color="#ef4444" />,
  add_column: <PlusIcon size={14} color="#3b82f6" />,
  delete_column: <TrashIcon size={14} color="#f59e0b" />,
  download_data: <DownloadIcon size={14} color="#10b981" />,
};

function LogInIcon(props: any) { return <Activity {...props} />; }
function ShieldIcon(props: any) { return <Activity {...props} />; }
function EditIcon(props: any) { return <Activity {...props} />; }
function PlusIcon(props: any) { return <Activity {...props} />; }
function TrashIcon(props: any) { return <Activity {...props} />; }
function DownloadIcon(props: any) { return <Activity {...props} />; }

// Helper to render user initials avatar
const renderUserAvatar = (name: string, size = 28) => {
  const firstChar = name ? name.charAt(0).toUpperCase() : 'U';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
  const color = colors[Math.abs(hash) % colors.length];
  return (
    <div style={{
      width: `${size}px`, height: `${size}px`, borderRadius: '50%', backgroundColor: color,
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size > 24 ? '11px' : '9.5px', fontWeight: 800, flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--foreground)', lineHeight: '1.5' }}>
        <span>Updated</span>
        <span style={{ background: 'rgba(99, 102, 241, 0.08)', color: '#6366f1', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
          Row #{rowNum}
        </span>
        <span>in</span>
        <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
          {registerName}
        </span>
        <span>:</span>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{colName}</span>
        <span style={{ color: 'var(--muted)', fontSize: '11.5px' }}>changed from</span>
        <span style={{ background: 'var(--border-light)', color: 'var(--muted)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', textDecoration: 'line-through', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {oldVal === '""' || !oldVal ? '""' : oldVal}
        </span>
        <span style={{ color: 'var(--muted)' }}>➔</span>
        <span style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--brand-green)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--foreground)' }}>
        <span style={{ color: 'var(--brand-green)', fontWeight: 700 }}>Added new row</span>
        <span style={{ background: 'rgba(16, 185, 129, 0.08)', color: 'var(--brand-green)', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--foreground)' }}>
        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>Deleted row</span>
        <span style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--danger)', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
          Row #{rowNum}
        </span>
        <span>from</span>
        <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
          {registerName}
        </span>
      </div>
    );
  }

  const parts = details.split(/(".*?")/g);
  return (
    <div style={{ fontSize: '13px', color: 'var(--foreground)', fontWeight: 500, lineHeight: 1.4 }}>
      {parts.map((part, i) => {
        if (part.startsWith('"') && part.endsWith('"')) {
          return <strong key={i} style={{ color: 'var(--navy)', fontWeight: 700 }}>{part.replace(/"/g, '')}</strong>;
        }
        return part;
      })}
    </div>
  );
};

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

  // ── Register drill-down state ──
  const [allRegisters, setAllRegisters] = useState<RegisterSummary[]>([]);
  const [showRegistersPanel, setShowRegistersPanel] = useState(false);
  const [regSearch, setRegSearch] = useState('');
  const [showAllRegisters, setShowAllRegisters] = useState(false);
  const [initialSearch, setInitialSearch] = useState('');
  const [initialFilters, setInitialFilters] = useState<Array<{ columnId: number; operator: string; value: string; values?: string[] }>>([]);
  const [businessId, setBusinessId] = useState<number>(1);
  const [shortcuts, setShortcuts] = useState<SavedRegisterShortcut[]>([]);
  const [countShortcutSearch, setCountShortcutSearch] = useState('');
  const [sumShortcutSearch, setSumShortcutSearch] = useState('');
  const [shortcutCounts, setShortcutCounts] = useState<Record<string, number>>({});
  const [shortcutData, setShortcutData] = useState<Record<string, { columns: Column[]; filteredEntries: Entry[] }>>({});
  const [configuredSumMetrics, setConfiguredSumMetrics] = useState<ConfiguredSumMetric[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_configured_sum_metrics');
      if (saved) return JSON.parse(saved);
      
      // Fallback/Migration: scan shortcutDisplayModes for existing sum/average configurations
      const displayModesSaved = localStorage.getItem('dashboard_shortcut_display_modes');
      if (displayModesSaved) {
        const modes = JSON.parse(displayModesSaved);
        const migrated: ConfiguredSumMetric[] = [];
        Object.entries(modes).forEach(([shId, config]: [string, any]) => {
          if (config && (config.mode === 'sum' || config.mode === 'average') && config.columnId !== undefined) {
            migrated.push({
              id: `sum-metric-${shId}`,
              shortcutId: shId,
              columnId: config.columnId,
              mode: config.mode
            });
          }
        });
        if (migrated.length > 0) {
          localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(migrated));
          return migrated;
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'sum' | 'average' | null>(null);
  const activeSumMetrics = useMemo(() => {
    return configuredSumMetrics.filter(metric => shortcuts.some(s => s.id === metric.shortcutId));
  }, [configuredSumMetrics, shortcuts]);

  const filteredSumMetrics = useMemo(() => {
    return activeSumMetrics.filter(metric => {
      const s = shortcuts.find(sh => sh.id === metric.shortcutId);
      if (!s) return false;
      return !sumShortcutSearch.trim() ||
        s.name.toLowerCase().includes(sumShortcutSearch.toLowerCase()) ||
        s.registerName.toLowerCase().includes(sumShortcutSearch.toLowerCase());
    });
  }, [activeSumMetrics, shortcuts, sumShortcutSearch]);

  const [shortcutsOrder, setShortcutsOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_shortcuts_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [draggedShortcutIndex, setDraggedShortcutIndex] = useState<number | null>(null);
  const [draggedSumIndex, setDraggedSumIndex] = useState<number | null>(null);

  const filteredCountShortcuts = useMemo(() => {
    const list = shortcuts.filter(s => 
      !countShortcutSearch.trim() || 
      s.name.toLowerCase().includes(countShortcutSearch.toLowerCase()) ||
      s.registerName.toLowerCase().includes(countShortcutSearch.toLowerCase())
    );
    if (shortcutsOrder.length > 0) {
      return [...list].sort((a, b) => {
        const idxA = shortcutsOrder.indexOf(a.id);
        const idxB = shortcutsOrder.indexOf(b.id);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });
    }
    return list;
  }, [shortcuts, countShortcutSearch, shortcutsOrder]);

  const handleDragStartCount = (e: React.DragEvent, index: number) => {
    setDraggedShortcutIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCount = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedShortcutIndex === null || draggedShortcutIndex === index) return;
    
    const items = [...filteredCountShortcuts];
    const draggedItem = items[draggedShortcutIndex];
    items.splice(draggedShortcutIndex, 1);
    items.splice(index, 0, draggedItem);
    
    const newOrder = items.map(item => item.id);
    setShortcutsOrder(newOrder);
    localStorage.setItem('dashboard_shortcuts_order', JSON.stringify(newOrder));
    setDraggedShortcutIndex(index);
  };

  const handleDragEndCount = () => {
    setDraggedShortcutIndex(null);
  };

  const handleDragStartSum = (e: React.DragEvent, index: number) => {
    setDraggedSumIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverSum = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedSumIndex === null || draggedSumIndex === index) return;
    
    const items = [...filteredSumMetrics];
    const draggedItem = items[draggedSumIndex];
    items.splice(draggedSumIndex, 1);
    items.splice(index, 0, draggedItem);
    
    const remainingInactive = configuredSumMetrics.filter(m => !shortcuts.some(s => s.id === m.shortcutId));
    const newConfigured = [...items, ...remainingInactive];
    
    setConfiguredSumMetrics(newConfigured);
    localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(newConfigured));
    setDraggedSumIndex(index);
  };

  const handleDragEndSum = () => {
    setDraggedSumIndex(null);
  };

  useEffect(() => {
    // When menu changes, auto-expand the section containing the current mode
    if (activeMenuId) {
      const metric = configuredSumMetrics.find(m => m.id === activeMenuId);
      const currentModeSetting = metric?.mode;
      if (currentModeSetting === 'sum') {
        setExpandedSection('sum');
      } else if (currentModeSetting === 'average') {
        setExpandedSection('average');
      } else {
        setExpandedSection(null);
      }
    } else {
      setExpandedSection(null);
    }
  }, [activeMenuId, configuredSumMetrics]);

  const [renamingShortcut, setRenamingShortcut] = useState<SavedRegisterShortcut | null>(null);
  const [renameShortcutName, setRenameShortcutName] = useState('');
  const [detailReg, setDetailReg] = useState<{ id: number; name: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailColumns, setDetailColumns] = useState<Column[]>([]);
  const [detailEntries, setDetailEntries] = useState<Entry[]>([]);

  // Shortcut Sums creation states
  const [showSumRegistersList, setShowSumRegistersList] = useState(false);
  const [addingSumReg, setAddingSumReg] = useState<RegisterSummary | null>(null);
  const [addingSumCols, setAddingSumCols] = useState<Column[]>([]);
  const [loadingSumCols, setLoadingSumCols] = useState(false);
  const [sumRegSearch, setSumRegSearch] = useState('');

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
      // 4. Fetch Registers Count & Recycle Bin count
      let registersCount = 0;
      let recycleBinCount = 0;
      try {
        const busList = await listBusinesses();
        const busId = busList[0]?.id || 1;
        setBusinessId(busId);
        const [regs, deletedRegs, deletedRowsCols, dbShortcuts, dbConfig] = await Promise.all([
          listRegisters(busId),
          listDeletedRegisters(busId),
          getAllDeletedItems(busId),
          listSavedShortcuts(busId),
          getDashboardConfig(busId).catch(() => ({ configuredSumMetrics: [], shortcutsOrder: [] }))
        ]);
        registersCount = regs.length;
        setAllRegisters(regs);
        setShortcuts(dbShortcuts);
        if (dbConfig && dbConfig.configuredSumMetrics && dbConfig.configuredSumMetrics.length > 0) {
          setConfiguredSumMetrics(dbConfig.configuredSumMetrics);
          localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(dbConfig.configuredSumMetrics));
        }
        if (dbConfig && dbConfig.shortcutsOrder && dbConfig.shortcutsOrder.length > 0) {
          setShortcutsOrder(dbConfig.shortcutsOrder);
          localStorage.setItem('dashboard_shortcuts_order', JSON.stringify(dbConfig.shortcutsOrder));
        }
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

  useEffect(() => {
    if (shortcuts.length === 0) return;
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      const data: Record<string, { columns: Column[]; filteredEntries: Entry[] }> = {};
      await Promise.all(
        shortcuts.map(async (s) => {
          try {
            const full = await getRegister(s.registerId);
            const filtered = getFilteredEntriesList(
              full.columns || [],
              full.entries || [],
              s.searchQuery || '',
              s.filters || []
            );
            data[s.id] = {
              columns: full.columns || [],
              filteredEntries: filtered
            };
            counts[s.id] = filtered.length;
          } catch (e) {
            console.error(`Failed to load data for shortcut ${s.id}:`, e);
            counts[s.id] = 0;
          }
        })
      );
      setShortcutData(prev => ({ ...prev, ...data }));
      setShortcutCounts(prev => ({ ...prev, ...counts }));
    };
    loadCounts();
  }, [shortcuts]);

  // Synchronize dashboard configuration changes to backend Postgres database
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    const saveConfig = async () => {
      try {
        await saveDashboardConfig(businessId, configuredSumMetrics, shortcutsOrder);
      } catch (e) {
        console.error('Failed to sync dashboard config to database:', e);
      }
    };
    if (businessId) {
      saveConfig();
    }
  }, [configuredSumMetrics, shortcutsOrder, businessId]);

  useEffect(() => {
    const handleGlobalClick = () => {
      setActiveMenuId(null);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
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

  const openRegisterDetail = async (
    reg: { id: number; name: string },
    preSearch = '',
    preFilters: Array<{ columnId: number; operator: string; value: string; values?: string[] }> = []
  ) => {
    setInitialSearch(preSearch);
    setInitialFilters(preFilters);
    setDetailReg(reg);
    setDetailLoading(true);
    try {
      const full = await getRegister(reg.id);
      setDetailColumns((full.columns || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));
      setDetailEntries(full.entries || []);
    } catch (err: any) {
      toast.error(`Failed to load register: ${err.message}`);
      setDetailReg(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveShortcut = async (name: string, searchQuery: string, filters: any[]) => {
    if (!detailReg) return;
    try {
      const saved = await createSavedShortcut({
        businessId,
        name: name || `${detailReg.name} (Filtered)`,
        registerId: detailReg.id,
        registerName: detailReg.name,
        searchQuery,
        filters
      });
      setShortcuts(prev => [saved, ...prev]);
      toast.success('Shortcut saved successfully!');
    } catch (e: any) {
      toast.error(`Failed to save shortcut: ${e.message}`);
    }
  };

  const handleDeleteShortcut = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSavedShortcut(id);
      setShortcuts(prev => prev.filter(s => s.id !== id));
      toast.success('Shortcut removed');
    } catch (e: any) {
      toast.error(`Failed to delete shortcut: ${e.message}`);
    }
  };

  const handleRenameShortcut = async (id: string, newName: string) => {
    try {
      await renameSavedShortcut(id, newName);
      setShortcuts(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
      toast.success('Shortcut renamed successfully!');
    } catch (e: any) {
      toast.error(`Failed to rename shortcut: ${e.message}`);
    }
  };
 
  const handleExportShortcutExcel = async (s: SavedRegisterShortcut) => {
    const data = shortcutData[s.id];
    if (!data || data.filteredEntries.length === 0) {
      toast.error('No data available to export');
      return;
    }

    try {
      const XLSX = await import('xlsx');

      const dataAOA: any[][] = [];
      // Title row
      dataAOA.push([s.registerName]);
      dataAOA.push([`Shortcut: ${s.name}`]);
      dataAOA.push([`Exported on ${new Date().toLocaleString()} (Filtered)`]);
      dataAOA.push([]); // blank row

      // Header
      const headerRow = ['S.No', ...data.columns.map(c => c.name)];
      dataAOA.push(headerRow);

      // Data rows
      data.filteredEntries.forEach((entry, idx) => {
        const row: any[] = [idx + 1];
        data.columns.forEach(col => {
          const val = entry.cells?.[col.id.toString()] || '';
          if (['number', 'currency', 'formula'].includes(col.type)) {
            const cleaned = val.replace(/[^\d.-]/g, '');
            const n = parseFloat(cleaned);
            row.push(isNaN(n) ? val : n);
          } else {
            row.push(val);
          }
        });
        dataAOA.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(dataAOA);

      // Auto-size columns
      const colWidths = headerRow.map((h, i) => {
        let max = h.length;
        dataAOA.forEach(row => {
          const cell = row[i];
          if (cell != null) {
            const len = String(cell).length;
            if (len > max) max = len;
          }
        });
        return { wch: Math.min(max + 2, 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      
      const safeName = s.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      XLSX.writeFile(wb, `${s.registerName}_${safeName}.xlsx`);
      toast.success(`Exported ${data.filteredEntries.length} entries as Excel`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
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
  if (detailReg) {
    return (
      <RegisterDetailPanel
        key={detailReg.id}
        detailReg={detailReg}
        detailLoading={detailLoading}
        detailColumns={detailColumns}
        detailEntries={detailEntries}
        initialSearch={initialSearch}
        initialFilters={initialFilters}
        onSaveShortcut={handleSaveShortcut}
        onClose={() => { setDetailReg(null); setDetailColumns([]); setDetailEntries([]); setInitialSearch(''); setInitialFilters([]); }}
      />
    );
  }

  const handleDownloadAllCountShortcuts = async () => {
    if (countShortcuts.length === 0) {
      toast.error('No shortcuts to export');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const summaryData: any[][] = [
        ['Register Shortcuts & Folders Overview Summary'],
        [`Exported on ${new Date().toLocaleString()}`],
        [],
        ['S.No', 'Register Name', 'Shortcut Name', 'Active Filters', 'Entry Count']
      ];

      countShortcuts.forEach((s, idx) => {
        const count = shortcutCounts[s.id] !== undefined ? shortcutCounts[s.id] : 0;
        summaryData.push([
          idx + 1,
          s.registerName,
          s.name,
          s.filters ? `${s.filters.length} active filters` : 'No filters',
          count
        ]);
      });

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Overview Summary');

      countShortcuts.forEach(s => {
        const data = shortcutData[s.id];
        if (data && data.filteredEntries.length > 0) {
          const sheetData: any[][] = [
            [s.registerName],
            [`Shortcut: ${s.name} (${data.filteredEntries.length} entries)`],
            [],
            ['S.No', ...data.columns.map(c => c.name)]
          ];

          data.filteredEntries.forEach((entry, idx) => {
            const row: any[] = [idx + 1];
            data.columns.forEach(col => {
              const val = entry.cells?.[col.id.toString()] || '';
              if (['number', 'currency', 'formula'].includes(col.type)) {
                const cleaned = val.replace(/[^\d.-]/g, '');
                const n = parseFloat(cleaned);
                row.push(isNaN(n) ? val : n);
              } else {
                row.push(val);
              }
            });
            sheetData.push(row);
          });

          const ws = XLSX.utils.aoa_to_sheet(sheetData);
          const safeSheetName = s.name.replace(/[*?:\\/\[\]]/g, '').substring(0, 30) || `Shortcut ${s.id}`;
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        }
      });

      XLSX.writeFile(wb, `Register_Shortcuts_and_Folders_Export.xlsx`);
      toast.success('Successfully exported all shortcuts to Excel');
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    }
  };

  const handleDownloadAllSumShortcuts = async () => {
    if (activeSumMetrics.length === 0) {
      toast.error('No sum metrics to export');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      const summaryData: any[][] = [
        ['Register Shortcut Sums Overview Summary'],
        [`Exported on ${new Date().toLocaleString()}`],
        [],
        ['S.No', 'Register Name', 'Shortcut Name', 'Metric Type', 'Column Name', 'Value']
      ];

      activeSumMetrics.forEach((metric, idx) => {
        const s = shortcuts.find(sh => sh.id === metric.shortcutId);
        if (!s) return;

        const data = shortcutData[s.id];
        let valStr = '...';
        let colName = 'N/A';
        if (data) {
          const col = data.columns.find(c => c.id === metric.columnId);
          if (col) {
            colName = col.name;
            const valNum = metric.mode === 'sum'
              ? calculateSumForColumn(data.filteredEntries, col.id, col, data.columns)
              : calculateAverageForColumn(data.filteredEntries, col.id, col, data.columns);
            valStr = col.type?.toLowerCase() === 'currency' ? formatCurrency(valNum) : valNum.toLocaleString();
          }
        }

        summaryData.push([
          idx + 1,
          s.registerName,
          s.name,
          metric.mode === 'sum' ? 'Sum' : 'Average',
          colName,
          valStr
        ]);
      });

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Sums Summary');

      activeSumMetrics.forEach(metric => {
        const s = shortcuts.find(sh => sh.id === metric.shortcutId);
        if (!s) return;
        const data = shortcutData[s.id];
        if (data && data.filteredEntries.length > 0) {
          const col = data.columns.find(c => c.id === metric.columnId);
          const colName = col ? col.name : 'N/A';
          const sheetData: any[][] = [
            [s.registerName],
            [`Shortcut: ${s.name} (Calculated ${metric.mode === 'sum' ? 'Sum' : 'Average'} of ${colName})`],
            [],
            ['S.No', ...data.columns.map(c => c.name)]
          ];

          data.filteredEntries.forEach((entry, idx) => {
            const row: any[] = [idx + 1];
            data.columns.forEach(c => {
              const val = entry.cells?.[c.id.toString()] || '';
              if (['number', 'currency', 'formula'].includes(c.type)) {
                const cleaned = val.replace(/[^\d.-]/g, '');
                const n = parseFloat(cleaned);
                row.push(isNaN(n) ? val : n);
              } else {
                row.push(val);
              }
            });
            sheetData.push(row);
          });

          const ws = XLSX.utils.aoa_to_sheet(sheetData);
          const safeSheetName = `${s.name.substring(0, 20)}_${metric.mode === 'sum' ? 'Sum' : 'Avg'}`.replace(/[*?:\\/\[\]]/g, '').substring(0, 30);
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        }
      });

      XLSX.writeFile(wb, `Register_Shortcut_Sums_Export.xlsx`);
      toast.success('Successfully exported all shortcut sums to Excel');
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    }
  };

  const countShortcuts = shortcuts;

  const renderShortcutCard = (s: SavedRegisterShortcut, forceCountMode = false) => {
    const displayVal = shortcutCounts[s.id] !== undefined ? shortcutCounts[s.id] : '...';
    const displayLabel = 'entries';

    return (
      <div
        key={s.id}
        onClick={() => openRegisterDetail({ id: s.registerId, name: s.registerName }, s.searchQuery, s.filters)}
        className="admin-stat-card-premium"
        style={{
          cursor: 'pointer',
          border: '1px solid var(--border)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          padding: '16px',
          overflow: 'visible'
        }}
      >
        {/* Top Row: Icon, Register Name, and Options Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', position: 'relative' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)', flexShrink: 0 }}>
            <FileSpreadsheet size={16} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
            {s.registerName}
          </span>
          
          {/* Three-dot options menu */}
          <div style={{ marginLeft: 'auto', position: 'relative' }} onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }} className="no-print">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveMenuId(activeMenuId === s.id ? null : s.id);
              }}
              title="Options"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--border-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none'; }}
            >
              <MoreVertical size={16} />
            </button>

            {/* Dropdown Menu */}
            {activeMenuId === s.id && (
              <div 
                onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: '0',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: 'var(--admin-card-shadow)',
                  zIndex: 10,
                  minWidth: '140px',
                  padding: '4px 0',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleExportShortcutExcel(s);
                    setActiveMenuId(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Download size={13} color="var(--brand-green)" /> Download Data
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setRenamingShortcut(s);
                    setRenameShortcutName(s.name);
                    setActiveMenuId(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Change Name
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDeleteShortcut(s.id, e);
                    setActiveMenuId(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Middle & Bottom Row: Big entry count & Shortcut Label */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: '4px',
              flexWrap: 'wrap',
              cursor: 'default',
              userSelect: 'none',
              padding: '2px 0',
              borderRadius: '6px'
            }}
          >
            <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>
              {displayVal}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--muted)' }}>
              {displayLabel}
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--brand-green)', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
            {s.name}
          </div>
          {s.filters && s.filters.length > 0 && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
              {s.filters.length} active filter{s.filters.length > 1 ? 's' : ''} {s.searchQuery ? `• "${s.searchQuery}"` : ''}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSumMetricCard = (metric: ConfiguredSumMetric) => {
    const s = shortcuts.find(sh => sh.id === metric.shortcutId);
    if (!s) return null;

    const data = shortcutData[s.id];
    const numericCols = data?.columns.filter(isNumericColumn) || [];

    let displayVal: string | number = '...';
    let displayLabel = 'entries';
    let columnName = 'N/A';

    if (data) {
      const col = data.columns.find(c => c.id === metric.columnId);
      if (col) {
        columnName = col.name;
        const valNum = metric.mode === 'sum'
          ? calculateSumForColumn(data.filteredEntries, col.id, col, data.columns)
          : calculateAverageForColumn(data.filteredEntries, col.id, col, data.columns);
        const isCurrency = col.type?.toLowerCase() === 'currency';
        if (metric.mode === 'sum') {
          displayVal = isCurrency ? formatCurrency(valNum) : valNum.toLocaleString();
          displayLabel = `sum of ${col.name}`;
        } else {
          const formattedAvg = Number(valNum.toFixed(2));
          displayVal = isCurrency ? formatCurrency(formattedAvg) : formattedAvg.toLocaleString();
          displayLabel = `avg of ${col.name}`;
        }
      } else {
        displayVal = shortcutCounts[s.id] !== undefined ? shortcutCounts[s.id] : '...';
        displayLabel = 'entries';
      }
    }

    return (
      <div
        key={metric.id}
        onClick={() => openRegisterDetail({ id: s.registerId, name: s.registerName }, s.searchQuery, s.filters)}
        className="admin-stat-card-premium"
        style={{
          cursor: 'pointer',
          border: '1px solid var(--border)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '130px',
          padding: '16px',
          overflow: 'visible'
        }}
      >
        {/* Top Row: Icon, Register Name, and Options Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', position: 'relative' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)', flexShrink: 0 }}>
            <FileSpreadsheet size={16} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
            {s.registerName}
          </span>
          
          {/* Three-dot options menu */}
          <div style={{ marginLeft: 'auto', position: 'relative' }} onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }} className="no-print">
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setActiveMenuId(activeMenuId === metric.id ? null : metric.id);
              }}
              title="Options"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--border-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none'; }}
            >
              <MoreVertical size={16} />
            </button>

            {/* Dropdown Menu */}
            {activeMenuId === metric.id && (
              <div 
                onClick={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                style={{
                  position: 'absolute',
                  top: '24px',
                  right: '0',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: 'var(--admin-card-shadow)',
                  zIndex: 10,
                  minWidth: '160px',
                  maxHeight: '260px',
                  overflowY: 'auto',
                  padding: '4px 0',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleExportShortcutExcel(s);
                    setActiveMenuId(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Download size={13} color="var(--brand-green)" /> Download Data
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    // Delete ONLY this configured sum metric, not the saved shortcut!
                    const updated = configuredSumMetrics.filter(m => m.id !== metric.id);
                    setConfiguredSumMetrics(updated);
                    localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(updated));
                    setActiveMenuId(null);
                    toast.success('Sum metric removed from dashboard');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Delete
                </button>

                {/* Display Metric Section */}
                <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />
                <div style={{ padding: '4px 12px', fontSize: '9.5px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Display Metric
                </div>

                {/* Sum Option */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setExpandedSection(expandedSection === 'sum' ? null : 'sum');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: metric.mode === 'sum' ? 'var(--brand-green)' : 'var(--foreground)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}>
                        {metric.mode === 'sum' ? '✓' : ''}
                      </span>
                      Sum
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{expandedSection === 'sum' ? '▼' : '▶'}</span>
                  </button>

                  {expandedSection === 'sum' && (
                    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--background)', paddingLeft: '8px' }}>
                      {!data ? (
                        <div style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          Loading columns...
                        </div>
                      ) : numericCols.length === 0 ? (
                        <div style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          No numeric columns
                        </div>
                      ) : (
                        numericCols.map(col => {
                          const isActive = metric.mode === 'sum' && metric.columnId === col.id;
                          return (
                            <button
                              key={`sum-${col.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const updated = configuredSumMetrics.map(m =>
                                  m.id === metric.id ? { ...m, mode: 'sum' as const, columnId: col.id } : m
                                );
                                setConfiguredSumMetrics(updated);
                                localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(updated));
                                setActiveMenuId(null);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '6px 12px 6px 16px',
                                textAlign: 'left',
                                fontSize: '11.5px',
                                color: isActive ? 'var(--brand-green)' : 'var(--foreground)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              <span style={{ width: '10px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}>
                                {isActive ? '✓' : ''}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col.name}>
                                {col.name}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Average Option */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setExpandedSection(expandedSection === 'average' ? null : 'average');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      color: metric.mode === 'average' ? 'var(--brand-green)' : 'var(--foreground)',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '12px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}>
                        {metric.mode === 'average' ? '✓' : ''}
                      </span>
                      Average
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{expandedSection === 'average' ? '▼' : '▶'}</span>
                  </button>

                  {expandedSection === 'average' && (
                    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--background)', paddingLeft: '8px' }}>
                      {!data ? (
                        <div style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          Loading columns...
                        </div>
                      ) : numericCols.length === 0 ? (
                        <div style={{ padding: '6px 16px', fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          No numeric columns
                        </div>
                      ) : (
                        numericCols.map(col => {
                          const isActive = metric.mode === 'average' && metric.columnId === col.id;
                          return (
                            <button
                              key={`avg-${col.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const updated = configuredSumMetrics.map(m =>
                                  m.id === metric.id ? { ...m, mode: 'average' as const, columnId: col.id } : m
                                );
                                setConfiguredSumMetrics(updated);
                                localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(updated));
                                setActiveMenuId(null);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '6px 12px 6px 16px',
                                textAlign: 'left',
                                fontSize: '11.5px',
                                color: isActive ? 'var(--brand-green)' : 'var(--foreground)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              <span style={{ width: '10px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}>
                                {isActive ? '✓' : ''}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={col.name}>
                                {col.name}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Middle & Bottom Row: Big sum/avg & Shortcut Label */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '4px' }}>
            {columnName === 'N/A' || displayLabel === 'entries' ? (
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {displayLabel}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', overflow: 'hidden' }}>
                <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                  {metric.mode === 'sum' ? 'SUM OF' : 'AVG OF'}
                </span>
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 800, 
                  color: 'var(--brand-green)', 
                  background: 'rgba(16, 185, 129, 0.08)', 
                  padding: '2px 8px', 
                  borderRadius: '4px',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  maxWidth: '130px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'inline-block'
                }} title={columnName}>
                  {columnName}
                </span>
              </div>
            )}
            
            <div
              onClick={(e) => {
                e.stopPropagation();
                const nextMode = metric.mode === 'sum' ? 'average' : 'sum';
                const updated = configuredSumMetrics.map(m =>
                  m.id === metric.id ? { ...m, mode: nextMode } : m
                );
                setConfiguredSumMetrics(updated);
                localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(updated));
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '2px 4px',
                marginLeft: '-4px',
                borderRadius: '6px',
                transition: 'all 0.15s',
                width: 'fit-content'
              }}
              title="Click to toggle Sum/Average"
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--border-light)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--foreground)' }}>
                {displayVal}
              </span>
            </div>
          </div>
          
          <div style={{ fontSize: '11.5px', color: 'var(--brand-green)', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
            {s.name}
          </div>
          {s.filters && s.filters.length > 0 && (
            <div style={{ fontSize: '10px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
              {s.filters.length} active filter{s.filters.length > 1 ? 's' : ''} {s.searchQuery ? `• "${s.searchQuery}"` : ''}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <style>{`
        .admin-dashboard-activity-row:hover {
          border-color: var(--accent) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.04) !important;
          transform: translateY(-1px);
        }
      `}</style>
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

        {/* Workspace Sheets — toggles register drill-down panel */}
        <div className="admin-stat-card-premium" onClick={() => setShowRegistersPanel(v => !v)} style={{ cursor: 'pointer', border: showRegistersPanel ? '1.5px solid rgba(16,185,129,0.4)' : '1px solid var(--border)', boxShadow: showRegistersPanel ? '0 0 0 3px rgba(16,185,129,0.08)' : 'var(--admin-card-shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)' }}>
              <FileSpreadsheet size={16} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registers</span>
            {showRegistersPanel ? <ChevronUp size={14} style={{ marginLeft: 'auto', color: 'var(--brand-green)' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--muted)' }} />}
          </div>
          <div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--foreground)' }}>{stats.totalRegisters}</div>
            <div style={{ fontSize: '11.5px', color: showRegistersPanel ? 'var(--brand-green)' : 'var(--muted)', fontWeight: 500, marginTop: '2px' }}>
              {showRegistersPanel ? 'Click a register to drill down ↓' : 'Total Active Workspace Sheets'}
            </div>
          </div>
        </div>

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

      {/* ── Registers Drill-Down Panel ── */}
      {showRegistersPanel && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Shortcuts Grid Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Register Shortcuts & Folders
            </h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="no-print">
              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search shortcuts..."
                  value={countShortcutSearch}
                  onChange={e => setCountShortcutSearch(e.target.value)}
                  style={{
                    padding: '6px 10px 6px 26px', borderRadius: '6px', border: '1.5px solid var(--border)',
                    background: 'var(--background)', color: 'var(--foreground)', fontSize: '11.5px',
                    outline: 'none', width: '160px', transition: 'all 0.15s'
                  }}
                />
                {countShortcutSearch && (
                  <button onClick={() => setCountShortcutSearch('')} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', padding: 0, cursor: 'pointer', display: 'flex' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Download all button */}
              <button
                onClick={handleDownloadAllCountShortcuts}
                title="Download all shortcut data to Excel"
                className="admin-btn-secondary-flat"
                style={{ 
                  padding: '6px 10px', 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: 'var(--brand-green)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  cursor: 'pointer'
                }}
              >
                <Download size={13} /> Export All (Excel)
              </button>
            </div>
          </div>

          {/* Shortcuts Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px'
          }}>
            {/* The Plus Box */}
            <div
              onClick={() => setShowAllRegisters(v => !v)}
              className="admin-card-glass no-print"
              style={{
                border: '2px dashed var(--brand-green)',
                background: 'rgba(16,185,129,0.01)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minHeight: '120px',
                transition: 'all 0.2s',
                gap: '8px',
                boxSizing: 'border-box'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.04)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.01)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus size={28} color="var(--brand-green)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-green)' }}>
                {showAllRegisters ? 'Hide All Registers' : 'See All Registers'}
              </span>
            </div>

            {/* Saved Shortcuts */}
            {filteredCountShortcuts.map((s, index) => (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => handleDragStartCount(e, index)}
                onDragOver={(e) => handleDragOverCount(e, index)}
                onDragEnd={handleDragEndCount}
                style={{
                  cursor: draggedShortcutIndex === index ? 'grabbing' : 'grab',
                  opacity: draggedShortcutIndex === index ? 0.4 : 1,
                  transition: 'opacity 0.2s, transform 0.2s',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {renderShortcutCard(s, true)}
              </div>
            ))}
          </div>

          {/* All Registers list - toggled by the plus box */}
          {showAllRegisters && (
            <div className="admin-animate-fade-in no-print">
              <RegistersListPanel
                allRegisters={allRegisters}
                regSearch={regSearch}
                setRegSearch={setRegSearch}
                onOpenRegister={(reg) => openRegisterDetail(reg)}
              />
            </div>
          )}

          {/* Register Shortcut Sums Section */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '12px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Register Shortcut Sums
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} className="no-print">
              {/* Search input */}
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search shortcut sums..."
                  value={sumShortcutSearch}
                  onChange={e => setSumShortcutSearch(e.target.value)}
                  style={{
                    padding: '6px 10px 6px 26px', borderRadius: '6px', border: '1.5px solid var(--border)',
                    background: 'var(--background)', color: 'var(--foreground)', fontSize: '11.5px',
                    outline: 'none', width: '160px', transition: 'all 0.15s'
                  }}
                />
                {sumShortcutSearch && (
                  <button onClick={() => setSumShortcutSearch('')} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted)', padding: 0, cursor: 'pointer', display: 'flex' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Download all button */}
              <button
                onClick={handleDownloadAllSumShortcuts}
                title="Download all sum metrics data to Excel"
                className="admin-btn-secondary-flat"
                style={{ 
                  padding: '6px 10px', 
                  borderRadius: '6px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  background: 'rgba(16, 185, 129, 0.08)',
                  color: 'var(--brand-green)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  cursor: 'pointer'
                }}
              >
                <Download size={13} /> Export All (Excel)
              </button>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '16px'
          }}>
            {/* The Plus Box for Sums Section */}
            <div
              onClick={() => {
                setShowSumRegistersList(v => !v);
                setAddingSumReg(null);
                setAddingSumCols([]);
              }}
              className="admin-card-glass no-print"
              style={{
                border: '2px dashed var(--brand-green)',
                background: 'rgba(16,185,129,0.01)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                minHeight: '120px',
                transition: 'all 0.2s',
                gap: '8px',
                boxSizing: 'border-box'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.04)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(16,185,129,0.01)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus size={28} color="var(--brand-green)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-green)' }}>
                {showSumRegistersList ? 'Hide Sum Config' : 'Configure Sum Metric'}
              </span>
            </div>
 
            {/* Sums Registers list - toggled by the sums plus box, rendered inline next to the plus box */}
            {showSumRegistersList && (
              <div className="admin-animate-fade-in no-print" style={{ gridColumn: '2 / -1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="admin-card-glass" style={{ padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet size={18} color="var(--brand-green)" /> Select a Register with Active Filters
                    </h3>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                      <input
                        type="text"
                        placeholder="Search registers..."
                        value={sumRegSearch}
                        onChange={e => setSumRegSearch(e.target.value)}
                        style={{
                          padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1.5px solid var(--border)',
                          background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px',
                          outline: 'none', width: '240px', transition: 'all 0.15s'
                        }}
                      />
                    </div>
                  </div>

                  {/* List of filtered registers in the same row-based list style */}
                  {(() => {
                    const filteredRegs = allRegisters.filter(r => 
                      shortcuts.some(s => s.registerId === r.id && s.filters && s.filters.length > 0)
                    ).filter(r => 
                      !sumRegSearch.trim() || r.name.toLowerCase().includes(sumRegSearch.toLowerCase())
                    );

                    if (filteredRegs.length === 0) {
                      return (
                        <div style={{ padding: '12px', color: 'var(--muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          No registers match your search or have shortcuts with active filters.
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                        {filteredRegs.map(reg => {
                          const matchingShortcuts = shortcuts.filter(s => s.registerId === reg.id && s.filters && s.filters.length > 0);
                          const isSelected = addingSumReg?.id === reg.id;
                          return (
                            <div
                              key={reg.id}
                              onClick={async () => {
                                setAddingSumReg(reg);
                                setLoadingSumCols(true);
                                try {
                                  const full = await getRegister(reg.id);
                                  setAddingSumCols((full.columns || []).filter(isNumericColumn));
                                } catch (err) {
                                  console.error('Failed to load columns:', err);
                                  toast.error('Failed to load columns for the selected register');
                                } finally {
                                  setLoadingSumCols(false);
                                }
                              }}
                              className="admin-list-item-hover"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid var(--brand-green)' : '1px solid var(--border-light)',
                                background: isSelected ? 'rgba(16,185,129,0.02)' : 'var(--surface)',
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(16,185,129,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)' }}>
                                  <FileSpreadsheet size={14} />
                                </div>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)' }}>{reg.name}</div>
                                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500 }}>
                                    {matchingShortcuts.length} filtered shortcut{matchingShortcuts.length > 1 ? 's' : ''} available
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '50%' }}>
                                {matchingShortcuts.map((ms) => (
                                  <span key={ms.id} style={{ fontSize: '9.5px', background: 'var(--border-light)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    {ms.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Column Selection Sub-panel */}
                  {addingSumReg && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px' }} className="admin-animate-fade-in">
                      <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: 'var(--navy)' }}>
                        Choose Column for Sum: <span style={{ color: 'var(--brand-green)' }}>{addingSumReg.name}</span>
                      </h5>

                      {loadingSumCols ? (
                        <div style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
                          Loading available columns...
                        </div>
                      ) : addingSumCols.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--danger)', fontStyle: 'italic' }}>
                          No numeric/summable columns found in this register.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {addingSumCols.map(col => (
                            <button
                              key={col.id}
                              onClick={() => {
                                // Find first filtered shortcut
                                const targetShortcut = shortcuts.find(s => s.registerId === addingSumReg.id && s.filters && s.filters.length > 0);
                                if (targetShortcut) {
                                  const newMetric: ConfiguredSumMetric = {
                                    id: `sum-metric-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                                    shortcutId: targetShortcut.id,
                                    columnId: col.id,
                                    mode: 'sum'
                                  };
                                  const updated = [...configuredSumMetrics, newMetric];
                                  setConfiguredSumMetrics(updated);
                                  localStorage.setItem('dashboard_configured_sum_metrics', JSON.stringify(updated));
                                  toast.success(`Added display of Sum of ${col.name} to dashboard`);
                                }
                                // reset
                                setAddingSumReg(null);
                                setAddingSumCols([]);
                                setShowSumRegistersList(false);
                              }}
                              className="admin-btn-secondary-flat"
                              style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Sum of {col.name} ({col.type || 'number'})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
 
            {filteredSumMetrics.length === 0 ? (
              <div 
                className="admin-card-glass"
                style={{
                  gridColumn: 'span 2',
                  border: '1.5px dashed var(--border)',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '120px',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy)' }}>
                  {activeSumMetrics.length === 0 ? 'No shortcut sums configured' : 'No matching sums found'}
                </div>
                <div style={{ maxWidth: '400px', margin: '0 auto', fontSize: '12px' }}>
                  {activeSumMetrics.length === 0 
                    ? 'Use the green "+ Configure Sum Metric" box to add and configure sum or average metrics for your registers.'
                    : 'Adjust your search query to find other configured sums.'}
                </div>
              </div>
            ) : (
              filteredSumMetrics.map((metric, index) => (
                <div
                  key={metric.id}
                  draggable
                  onDragStart={(e) => handleDragStartSum(e, index)}
                  onDragOver={(e) => handleDragOverSum(e, index)}
                  onDragEnd={handleDragEndSum}
                  style={{
                    cursor: draggedSumIndex === index ? 'grabbing' : 'grab',
                    opacity: draggedSumIndex === index ? 0.4 : 1,
                    transition: 'opacity 0.2s, transform 0.2s',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {renderSumMetricCard(metric)}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Grid & Quick Actions */}
      {!showRegistersPanel && (
        <>
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
                    className="admin-dashboard-activity-row"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '10px',
                      background: 'var(--background)',
                      border: '1px solid var(--border-light)',
                      transition: 'all 0.15s ease-in-out'
                    }}
                  >
                    {/* Left Icon Node */}
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: 'var(--surface)',
                      border: '1.5px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                      {ACTION_ICONS[a.action] || <Activity size={12} color="var(--muted)" />}
                    </div>

                    {/* Right Content */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Details parsed */}
                      <div style={{ wordBreak: 'break-word' }}>
                        {renderActivityDetails(a.details)}
                      </div>

                      {/* User Badge & Time */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,45,93,0.04)', padding: '1px 6px 1px 3px', borderRadius: '10px' }}>
                          {renderUserAvatar(a.userName, 18)}
                          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--navy)' }}>{a.userName}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px', color: 'var(--muted)', fontWeight: 500 }}>
                          <Clock size={10} />
                          <span>{new Date(a.timestamp).toLocaleDateString()} {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
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
          <div style={{ marginTop: '24px' }}>
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
        </>)}

      {/* Rename Shortcut Modal */}
      {renamingShortcut && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999
        }} onClick={() => setRenamingShortcut(null)}>
          <div className="admin-card-glass admin-animate-fade-in" style={{
            width: '400px',
            padding: '24px',
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: '16px',
            boxShadow: 'var(--admin-card-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bookmark size={18} color="var(--accent)" /> Rename Shortcut
              </h3>
              <button
                onClick={() => setRenamingShortcut(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
              Provide a new custom name for this filter shortcut card.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Shortcut Name
              </label>
              <input
                type="text"
                value={renameShortcutName}
                onChange={e => setRenameShortcutName(e.target.value)}
                placeholder="e.g., BE 26 - New Admission"
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleRenameShortcut(renamingShortcut.id, renameShortcutName);
                    setRenamingShortcut(null);
                  }
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setRenamingShortcut(null)}
                className="admin-btn-secondary-flat"
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleRenameShortcut(renamingShortcut.id, renameShortcutName);
                  setRenamingShortcut(null);
                }}
                className="admin-btn-success-glow"
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', background: 'var(--accent)', color: 'white' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: RegistersListPanel — expandable register list
   ══════════════════════════════════════════════════════════════════════════ */
function RegistersListPanel({ allRegisters, regSearch, setRegSearch, onOpenRegister }: {
  allRegisters: RegisterSummary[];
  regSearch: string;
  setRegSearch: (v: string) => void;
  onOpenRegister: (reg: { id: number; name: string }) => void;
}) {
  const filtered = useMemo(() => {
    if (!regSearch.trim()) return allRegisters;
    const q = regSearch.toLowerCase();
    return allRegisters.filter(r => r.name.toLowerCase().includes(q));
  }, [allRegisters, regSearch]);

  return (
    <div className="admin-card-glass" style={{ padding: '20px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileSpreadsheet size={18} color="var(--brand-green)" /> All Registers ({allRegisters.length})
        </h3>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input
            type="text"
            placeholder="Search registers..."
            value={regSearch}
            onChange={e => setRegSearch(e.target.value)}
            style={{
              padding: '8px 12px 8px 32px', borderRadius: '8px', border: '1.5px solid var(--border)',
              background: 'var(--background)', color: 'var(--foreground)', fontSize: '13px',
              outline: 'none', width: '240px', transition: 'all 0.15s'
            }}
          />
        </div>
      </div>

      <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map(reg => (
          <div
            key={reg.id}
            onClick={() => onOpenRegister({ id: reg.id, name: reg.name })}
            style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px',
              borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border-light)',
              cursor: 'pointer', transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(26,115,232,0.03)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.background = 'var(--background)'; }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: reg.iconColor ? `${reg.iconColor}18` : 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: reg.iconColor || 'var(--brand-green)', flexShrink: 0 }}>
              <FileSpreadsheet size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reg.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Hash size={10} /> {reg.entryCount} entries</span>
                <span>•</span>
                <span>{new Date(reg.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Eye size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No registers found{regSearch ? ` matching "${regSearch}"` : ''}.
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   HELPER: parseDateString — converts DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
   ══════════════════════════════════════════════════════════════════════════ */
function parseDateString(dStr: string) {
  if (!dStr) return '';
  if (dStr.includes('/') || dStr.includes('-')) {
    const parts = dStr.split(/[/-]/);
    if (parts.length === 3) {
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return dStr;
}

/* Helper to get filtered entries count for saved shortcuts */
function getFilteredEntriesCount(
  columns: Column[],
  entries: Entry[],
  searchQuery: string,
  filters: Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>
) {
  const s = searchQuery.toLowerCase().trim();
  const filterLen = filters.length;
  if (!s && filterLen === 0) return entries.length;

  const preparedFilters = filters.map(f => ({
    ...f,
    lFilter: (f.value || '').toLowerCase(),
    nValue: parseFloat(f.value),
    nValue2: parseFloat(f.value2 || '0'),
    dValue: f.value,
    dValue2: f.value2 || '',
    values: f.values || [],
  }));

  let matchCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    // Search
    if (s) {
      let match = false;
      const cells = e.cells || {};
      for (const key in cells) {
        const val = cells[key];
        if (val && typeof val === 'string' && val.toLowerCase().includes(s)) {
          match = true;
          break;
        }
      }
      if (!match) continue;
    }

    // Filters
    if (filterLen > 0) {
      let pass = true;
      for (let j = 0; j < filterLen; j++) {
        const f = preparedFilters[j];
        const val = (e.cells?.[f.columnId.toString()] || '').trim();
        const lVal = val.toLowerCase();
        let cond = true;
        switch (f.operator) {
          case 'contains': cond = lVal.includes(f.lFilter); break;
          case 'not_contains': cond = !lVal.includes(f.lFilter); break;
          case 'equals': cond = lVal === f.lFilter; break;
          case 'not_equals': cond = lVal !== f.lFilter; break;
          case 'starts_with': cond = lVal.startsWith(f.lFilter); break;
          case 'ends_with': cond = lVal.endsWith(f.lFilter); break;
          case 'eq': cond = parseFloat(val) === f.nValue; break;
          case 'gt': cond = parseFloat(val) > f.nValue; break;
          case 'gte': cond = parseFloat(val) >= f.nValue; break;
          case 'lt': cond = parseFloat(val) < f.nValue; break;
          case 'lte': cond = parseFloat(val) <= f.nValue; break;
          case 'between': { const n = parseFloat(val); cond = n >= f.nValue && n <= f.nValue2; break; }
          case 'date_is': cond = parseDateString(val) === f.dValue; break;
          case 'date_before': cond = parseDateString(val) < f.dValue; break;
          case 'date_after': cond = parseDateString(val) > f.dValue; break;
          case 'date_between': { const dV = parseDateString(val); cond = dV >= f.dValue && dV <= f.dValue2; break; }
          case 'empty': cond = !val; break;
          case 'not_empty': cond = !!val; break;
          case 'multi_select': cond = !val ? (f.values || []).includes('(Blanks)') : (f.values || []).includes(val); break;
        }
        if (!cond) { pass = false; break; }
      }
      if (!pass) continue;
    }

    matchCount++;
  }
  return matchCount;
}

/* Helper to get filtered entries list for saved shortcuts */
function getFilteredEntriesList(
  columns: Column[],
  entries: Entry[],
  searchQuery: string,
  filters: Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>
): Entry[] {
  const s = searchQuery.toLowerCase().trim();
  const filterLen = filters.length;
  if (!s && filterLen === 0) return entries;

  const preparedFilters = filters.map(f => ({
    ...f,
    lFilter: (f.value || '').toLowerCase(),
    nValue: parseFloat(f.value),
    nValue2: parseFloat(f.value2 || '0'),
    dValue: f.value,
    dValue2: f.value2 || '',
    values: f.values || [],
  }));

  const matches: Entry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];

    // Search
    if (s) {
      let match = false;
      const cells = e.cells || {};
      for (const key in cells) {
        const val = cells[key];
        if (val && typeof val === 'string' && val.toLowerCase().includes(s)) {
          match = true;
          break;
        }
      }
      if (!match) continue;
    }

    // Filters
    if (filterLen > 0) {
      let pass = true;
      for (let j = 0; j < filterLen; j++) {
        const f = preparedFilters[j];
        const val = (e.cells?.[f.columnId.toString()] || '').trim();
        const lVal = val.toLowerCase();
        let cond = true;
        switch (f.operator) {
          case 'contains': cond = lVal.includes(f.lFilter); break;
          case 'not_contains': cond = !lVal.includes(f.lFilter); break;
          case 'equals': cond = lVal === f.lFilter; break;
          case 'not_equals': cond = lVal !== f.lFilter; break;
          case 'starts_with': cond = lVal.startsWith(f.lFilter); break;
          case 'ends_with': cond = lVal.endsWith(f.lFilter); break;
          case 'eq': cond = parseFloat(val) === f.nValue; break;
          case 'gt': cond = parseFloat(val) > f.nValue; break;
          case 'gte': cond = parseFloat(val) >= f.nValue; break;
          case 'lt': cond = parseFloat(val) < f.nValue; break;
          case 'lte': cond = parseFloat(val) <= f.nValue; break;
          case 'between': { const n = parseFloat(val); cond = n >= f.nValue && n <= f.nValue2; break; }
          case 'date_is': cond = parseDateString(val) === f.dValue; break;
          case 'date_before': cond = parseDateString(val) < f.dValue; break;
          case 'date_after': cond = parseDateString(val) > f.dValue; break;
          case 'date_between': { const dV = parseDateString(val); cond = dV >= f.dValue && dV <= f.dValue2; break; }
          case 'empty': cond = !val; break;
          case 'not_empty': cond = !!val; break;
          case 'multi_select': cond = !val ? (f.values || []).includes('(Blanks)') : (f.values || []).includes(val); break;
        }
        if (!cond) { pass = false; break; }
      }
      if (!pass) continue;
    }

    matches.push(e);
  }
  return matches;
}

/* Helper to check if a column is numeric/summable */
function isNumericColumn(col: Column) {
  const t = col.type?.toLowerCase();
  return t === 'number' || t === 'currency' || t === 'formula' || t === 'auto_increment' || t === 'rating';
}

/* Helper to calculate the sum of a numeric column for entries */
function calculateSumForColumn(entries: Entry[], columnId: number, col?: Column, columns?: Column[]) {
  let sum = 0;
  const isFormula = col?.type === 'formula';
  for (let i = 0; i < entries.length; i++) {
    let val: string;
    if (isFormula && col?.formula && columns) {
      // Formula columns must be evaluated on-the-fly (cells may be empty/stale)
      val = evaluateFormula(col.formula, entries[i], columns);
    } else {
      val = entries[i].cells?.[columnId.toString()] || '';
    }
    if (val) {
      // Strip all characters except digits, decimal points, and minus signs (e.g. removes currency symbols, commas, spaces)
      const cleanVal = val.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleanVal);
      if (!isNaN(parsed)) {
        sum += parsed;
      }
    }
  }
  return sum;
}

/* Helper to calculate the average of a numeric column for entries */
function calculateAverageForColumn(entries: Entry[], columnId: number, col?: Column, columns?: Column[]) {
  let sum = 0;
  let count = 0;
  const isFormula = col?.type === 'formula';
  for (let i = 0; i < entries.length; i++) {
    let val: string;
    if (isFormula && col?.formula && columns) {
      val = evaluateFormula(col.formula, entries[i], columns);
    } else {
      val = entries[i].cells?.[columnId.toString()] || '';
    }
    if (val) {
      const cleanVal = val.replace(/[^0-9.-]/g, '');
      const parsed = parseFloat(cleanVal);
      if (!isNaN(parsed)) {
        sum += parsed;
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}


/* ══════════════════════════════════════════════════════════════════════════
   FILTER OPS — same as RegisterPage
   ══════════════════════════════════════════════════════════════════════════ */
const TEXT_OPS = [
  { key: 'contains', label: 'Contains' },
  { key: 'equals', label: 'Equals' },
  { key: 'multi_select', label: 'Is Any Of' },
  { key: 'empty', label: 'Is Empty' },
];
const NUMBER_OPS = [
  { key: 'between', label: 'Between' },
  { key: 'gt', label: 'Greater Than' },
  { key: 'lt', label: 'Less Than' },
  { key: 'empty', label: 'Is Empty' },
];
const DATE_OPS = [
  { key: 'date_between', label: 'Between Dates' },
  { key: 'date_is', label: 'Is' },
  { key: 'date_before', label: 'Before' },
  { key: 'date_after', label: 'After' },
  { key: 'empty', label: 'Is Empty' },
];
const DROPDOWN_OPS = [
  { key: 'equals', label: 'Is' },
  { key: 'multi_select', label: 'Is Any Of' },
  { key: 'empty', label: 'Is Empty' },
];

function getOpsForType(type: string) {
  switch (type) {
    case 'number': case 'formula': case 'currency': case 'auto_increment': case 'rating':
      return NUMBER_OPS;
    case 'date': return DATE_OPS;
    case 'dropdown': return DROPDOWN_OPS;
    default: return TEXT_OPS;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENT: RegisterDetailModal — full-screen modal with data + filters + export
   ══════════════════════════════════════════════════════════════════════════ */
// Operator label helper
const opLabel = (op: string) => {
  const labels: Record<string, string> = {
    contains: 'contains', not_contains: 'not contains', equals: 'is', not_equals: 'is not',
    starts_with: 'starts with', ends_with: 'ends with', empty: 'is empty', not_empty: 'is not empty',
    gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', between: 'between',
    date_is: 'is', date_before: 'before', date_after: 'after', date_between: 'between',
    multi_select: 'is any of'
  };
  return labels[op] || op;
};

function RegisterDetailPanel({
  detailReg, detailLoading, detailColumns, detailEntries, onClose,
  initialSearch = '',
  initialFilters = [],
  onSaveShortcut
}: {
  detailReg: { id: number; name: string };
  detailLoading: boolean;
  detailColumns: Column[];
  detailEntries: Entry[];
  onClose: () => void;
  initialSearch?: string;
  initialFilters?: Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>;
  onSaveShortcut: (name: string, searchQuery: string, filters: any[]) => void;
}) {
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(!!initialSearch);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Local states to avoid rendering parent component on every keystroke
  const [detailSearch, setDetailSearch] = useState(initialSearch);
  const [detailFilters, setDetailFilters] = useState<Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>>(initialFilters);


  // Save shortcut modal states
  const [showSaveShortcutModal, setShowSaveShortcutModal] = useState(false);
  const [shortcutName, setShortcutName] = useState('');

  // Auto-populate default name when modal opens
  useEffect(() => {
    if (showSaveShortcutModal) {
      let defaultName = '';
      if (detailSearch) {
        defaultName = `Search "${detailSearch}"`;
      }
      if (detailFilters && detailFilters.length > 0) {
        const filterNames = detailFilters.map(f => {
          const col = detailColumns.find(c => c.id === f.columnId);
          return col ? `${col.name} ${opLabel(f.operator)}` : '';
        }).filter(Boolean).join(', ');
        if (defaultName) {
          defaultName += ` & ${filterNames}`;
        } else {
          defaultName = filterNames;
        }
      }
      if (!defaultName) {
        defaultName = 'Quick Shortcut';
      }
      setShortcutName(defaultName);
    }
  }, [showSaveShortcutModal, detailSearch, detailFilters, detailColumns]);

  // Deferred search string prevents keypress lagging by prioritizing render of input box
  const deferredSearch = useDeferredValue(detailSearch);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // 50 items per page is standard and extremely fast!

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, detailFilters]);

  // Helper to get cumulative count for each filter step
  const getCumulativeCountForFilter = (filterIndex: number) => {
    let currentEntries = detailEntries;
    const s = deferredSearch.toLowerCase().trim();
    if (s) {
      currentEntries = currentEntries.filter(entry => {
        let match = false;
        const cells = entry.cells || {};
        for (const colId in cells) {
          if ((cells[colId] || '').toLowerCase().includes(s)) {
            match = true;
            break;
          }
        }
        return match;
      });
    }

    for (let i = 0; i <= filterIndex; i++) {
      const f = detailFilters[i];
      const col = detailColumns.find(c => c.id === f.columnId);
      if (!col) continue;

      const lFilter = (f.value || '').toLowerCase();
      const nValue = parseFloat(f.value);
      const values = f.values || [];

      currentEntries = currentEntries.filter(entry => {
        const val = (entry.cells?.[col.id.toString()] || '').trim();
        const valLower = val.toLowerCase();
        const valNum = parseFloat(val);

        switch (f.operator) {
          case 'contains': return valLower.includes(lFilter);
          case 'not_contains': return !valLower.includes(lFilter);
          case 'equals': return valLower === lFilter;
          case 'not_equals': return valLower !== lFilter;
          case 'starts_with': return valLower.startsWith(lFilter);
          case 'ends_with': return valLower.endsWith(lFilter);
          case 'empty': return !val;
          case 'not_empty': return !!val;
          case 'greater_than': return !isNaN(valNum) && valNum > nValue;
          case 'less_than': return !isNaN(valNum) && valNum < nValue;
          case 'equals_num': return !isNaN(valNum) && valNum === nValue;
          case 'multi_select':
            if (values.includes('(Blanks)') && !val) return true;
            return values.includes(val);
          default: return true;
        }
      });
    }
    return currentEntries.length;
  };

  // Filter + search logic — same as RegisterPage
  const displayEntries = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();
    const filterLen = detailFilters.length;
    const isSearching = !!s || filterLen > 0;

    if (!isSearching) return detailEntries;

    const preparedFilters = detailFilters.map(f => ({
      ...f,
      lFilter: (f.value || '').toLowerCase(),
      nValue: parseFloat(f.value),
      nValue2: parseFloat(f.value2 || '0'),
      dValue: f.value,
      dValue2: f.value2 || '',
      values: f.values || [],
    }));

    const result: Entry[] = [];
    for (let i = 0; i < detailEntries.length; i++) {
      const e = detailEntries[i];

      // Search
      if (s) {
        let match = false;
        const cells = e.cells || {};
        for (const key in cells) {
          const val = cells[key];
          if (val && typeof val === 'string' && val.toLowerCase().includes(s)) {
            match = true;
            break;
          }
        }
        if (!match) continue;
      }

      // Filters
      if (filterLen > 0) {
        let pass = true;
        for (let j = 0; j < filterLen; j++) {
          const f = preparedFilters[j];
          const val = (e.cells?.[f.columnId.toString()] || '').trim();
          const lVal = val.toLowerCase();
          let cond = true;
          switch (f.operator) {
            case 'contains': cond = lVal.includes(f.lFilter); break;
            case 'not_contains': cond = !lVal.includes(f.lFilter); break;
            case 'equals': cond = lVal === f.lFilter; break;
            case 'not_equals': cond = lVal !== f.lFilter; break;
            case 'starts_with': cond = lVal.startsWith(f.lFilter); break;
            case 'ends_with': cond = lVal.endsWith(f.lFilter); break;
            case 'eq': cond = parseFloat(val) === f.nValue; break;
            case 'gt': cond = parseFloat(val) > f.nValue; break;
            case 'gte': cond = parseFloat(val) >= f.nValue; break;
            case 'lt': cond = parseFloat(val) < f.nValue; break;
            case 'lte': cond = parseFloat(val) <= f.nValue; break;
            case 'between': { const n = parseFloat(val); cond = n >= f.nValue && n <= f.nValue2; break; }
            case 'date_is': cond = parseDateString(val) === f.dValue; break;
            case 'date_before': cond = parseDateString(val) < f.dValue; break;
            case 'date_after': cond = parseDateString(val) > f.dValue; break;
            case 'date_between': { const dV = parseDateString(val); cond = dV >= f.dValue && dV <= f.dValue2; break; }
            case 'empty': cond = !val; break;
            case 'not_empty': cond = !!val; break;
            case 'multi_select': cond = !val ? (f.values || []).includes('(Blanks)') : (f.values || []).includes(val); break;
          }
          if (!cond) { pass = false; break; }
        }
        if (!pass) continue;
      }

      result.push(e);
    }
    return result;
  }, [detailEntries, deferredSearch, detailFilters]);

  const totalPages = Math.ceil(displayEntries.length / itemsPerPage);

  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return displayEntries.slice(start, start + itemsPerPage);
  }, [displayEntries, currentPage, itemsPerPage]);



  const isFiltered = !!deferredSearch.trim() || detailFilters.length > 0;

  // ── Export Functions ──
  const handleExportCSV = () => {
    const entriesToExport = displayEntries;
    if (entriesToExport.length === 0) { toast.error('No data to export'); return; }

    const headers = ['S.No', ...detailColumns.map(c => c.name)];
    const csvRows = [headers.join(',')];

    entriesToExport.forEach((entry, idx) => {
      const row = [
        String(idx + 1),
        ...detailColumns.map(col => {
          const val = entry.cells?.[col.id.toString()] || '';
          // Escape CSV special chars
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detailReg.name}${isFiltered ? '_filtered' : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${entriesToExport.length} entries as CSV`);
  };

  const handleExportExcel = async () => {
    const entriesToExport = displayEntries;
    if (entriesToExport.length === 0) { toast.error('No data to export'); return; }

    setExporting(true);
    try {
      const XLSX = await import('xlsx');

      const dataAOA: any[][] = [];
      // Title row
      dataAOA.push([detailReg.name]);
      dataAOA.push([`Exported on ${new Date().toLocaleString()}${isFiltered ? ' (Filtered)' : ''}`]);
      dataAOA.push([]); // blank row

      // Header
      const headerRow = ['S.No', ...detailColumns.map(c => c.name)];
      dataAOA.push(headerRow);

      // Data rows
      entriesToExport.forEach((entry, idx) => {
        const row: any[] = [idx + 1];
        detailColumns.forEach(col => {
          const val = entry.cells?.[col.id.toString()] || '';
          if (['number', 'currency', 'formula'].includes(col.type)) {
            const cleaned = val.replace(/[^\d.-]/g, '');
            const n = parseFloat(cleaned);
            row.push(isNaN(n) ? val : n);
          } else {
            row.push(val);
          }
        });
        dataAOA.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(dataAOA);

      // Auto-size columns
      const colWidths = headerRow.map((h, i) => {
        let max = h.length;
        dataAOA.forEach(row => {
          const cell = row[i];
          if (cell != null) {
            const len = String(cell).length;
            if (len > max) max = len;
          }
        });
        return { wch: Math.min(max + 2, 40) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, `${detailReg.name}${isFiltered ? '_filtered' : ''}.xlsx`);
      toast.success(`Exported ${entriesToExport.length} entries as Excel`);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };



  const panelContent = (
    <div className="admin-card-glass admin-animate-fade-in" style={isFullScreen ? {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      width: '100vw',
      height: '100vh',
      borderRadius: 0,
      boxShadow: 'none'
    } : {
      width: '100%',
      height: 'calc(100vh - 48px)',
      minHeight: '750px',
      background: 'var(--surface)',
      borderRadius: '16px',
      border: '1.5px solid var(--border)',
      boxShadow: 'var(--admin-card-shadow)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, background: 'var(--surface)' }}>
        {/* Back Button */}
        <button
          onClick={onClose}
          title="Back to Dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--background)',
            border: '1.5px solid var(--border)',
            cursor: 'pointer',
            color: 'var(--foreground)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '12.5px',
            transition: 'all 0.15s',
            boxSizing: 'border-box',
            flexShrink: 0
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--foreground)'; }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)', flexShrink: 0 }}>
          <FileSpreadsheet size={18} />
        </div>
        <div style={{ minWidth: 0, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailReg.name}</h2>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isFiltered ? (
              <>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{displayEntries.length}</span>
                <span>of {detailEntries.length} entries</span>
                <span style={{ padding: '1px 6px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: '9px', fontWeight: 700 }}>FILTERED</span>
              </>
            ) : (
              <><span>{detailEntries.length} entries</span><span>•</span><span>{detailColumns.length} columns</span></>
            )}
          </div>
        </div>

        {/* ── Search Bar & Filter Chips (Inline in Header) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0, marginLeft: '12px', marginRight: '12px' }}>
          {isSearchExpanded ? (
            <div style={{ position: 'relative', width: '160px', flexShrink: 0 }} className="admin-animate-fade-in">
              <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input
                type="text"
                placeholder="Search columns..."
                value={detailSearch}
                onChange={e => setDetailSearch(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px 7px 28px', borderRadius: '6px',
                  border: '1.5px solid var(--border)', background: 'var(--background)',
                  color: 'var(--foreground)', fontSize: '12px', outline: 'none', boxSizing: 'border-box'
                }}
                autoFocus
                onBlur={() => { if (!detailSearch.trim()) setIsSearchExpanded(false); }}
              />
              <button
                onClick={() => {
                  setDetailSearch('');
                  setIsSearchExpanded(false);
                }}
                style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px', display: 'flex' }}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsSearchExpanded(true)}
              title="Search Columns"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                border: '1.5px solid var(--border)', background: 'var(--background)',
                color: 'var(--foreground)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--foreground)'; }}
            >
              <Search size={15} />
            </button>
          )}

        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          {/* Save Shortcut */}
          <button
            onClick={() => setShowSaveShortcutModal(true)}
            title="Save Shortcut"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '34px', height: '34px', borderRadius: '8px',
              border: '1.5px solid var(--border)', background: 'var(--background)',
              cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            <Bookmark size={15} color="var(--accent)" />
          </button>

          {/* Filter toggle and dropdown */}
          <div className="pab-filter-wrapper" style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowFilterPanel(v => !v); }}
              title="Filters"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                border: showFilterPanel ? '1.5px solid rgba(99,102,241,0.4)' : '1.5px solid var(--border)',
                background: showFilterPanel ? 'rgba(99,102,241,0.06)' : 'var(--background)',
                color: showFilterPanel ? '#6366f1' : 'var(--foreground)',
                cursor: 'pointer', transition: 'all 0.15s', position: 'relative', flexShrink: 0
              }}
            >
              <Filter size={15} />
              {detailFilters.length > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#6366f1', color: 'white', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {detailFilters.length}
                </span>
              )}
            </button>

            <FilterModal
              filterModal={showFilterPanel}
              setFilterModal={setShowFilterPanel}
              filters={detailFilters}
              setFilters={setDetailFilters}
              setActiveFilters={setDetailFilters}
              columns={detailColumns}
              entries={detailEntries}
            />
          </div>

          {/* Export Menu Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setShowExportMenu(v => !v); }}
              title="Export Options"
              disabled={displayEntries.length === 0}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '34px', height: '34px', borderRadius: '8px',
                border: showExportMenu ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                background: 'var(--background)',
                color: displayEntries.length === 0 ? 'var(--muted)' : 'var(--foreground)',
                cursor: displayEntries.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', opacity: displayEntries.length === 0 ? 0.5 : 1,
                flexShrink: 0
              }}
              onMouseEnter={e => { if (displayEntries.length > 0) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
              onMouseLeave={e => { if (displayEntries.length > 0) { e.currentTarget.style.borderColor = showExportMenu ? 'var(--accent)' : 'var(--border)'; e.currentTarget.style.color = 'var(--foreground)'; } }}
            >
              <MoreVertical size={16} />
            </button>

            {showExportMenu && (
              <div style={{
                position: 'absolute',
                top: '40px',
                right: '0',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: 'var(--admin-card-shadow)',
                zIndex: 100,
                minWidth: '150px',
                padding: '4px 0',
                display: 'flex',
                flexDirection: 'column'
              }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => {
                    handleExportExcel();
                    setShowExportMenu(false);
                  }}
                  disabled={exporting}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Download size={13} color="var(--brand-green)" />
                  {exporting ? 'Exporting...' : 'Export to Excel'}
                </button>
                <button
                  onClick={() => {
                    handleExportCSV();
                    setShowExportMenu(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Download size={13} color="var(--accent)" />
                  Export to CSV
                </button>
              </div>
            )}
          </div>

          {/* Full Screen Toggle */}
          <button
            onClick={() => setIsFullScreen(v => !v)}
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1.5px solid rgba(59, 130, 246, 0.25)',
              cursor: 'pointer',
              color: '#3b82f6',
              padding: '7px',
              borderRadius: '8px',
              transition: 'all 0.15s',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.16)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)'; }}
          >
            {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            title="Close Panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1.5px solid rgba(239, 68, 68, 0.25)',
              cursor: 'pointer',
              color: '#ef4444',
              padding: '7px',
              borderRadius: '8px',
              transition: 'all 0.15s',
              boxSizing: 'border-box'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.16)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)'; }}
          >
            <X size={18} />
          </button>
        </div>
      </div>


      {/* ── Filter Panel (collapsible) ── */}
      {showFilterPanel && detailFilters.length > 0 && (
        <div style={{
          padding: '6px 24px', borderBottom: '1px solid var(--border)',
          background: 'rgba(99,102,241,0.02)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px'
        }}>
          {/* Left side: title and horizontal filter chips list inline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              Advanced Filters ({detailFilters.length} active)
            </span>

            {/* Horizontal filter chips list */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {detailFilters.map((f, idx) => {
                const col = detailColumns.find(c => c.id === f.columnId);
                let valText = '';
                if (f.operator === 'multi_select') {
                  valText = `(${(f.values || []).length} selected)`;
                } else if (f.operator === 'between' || f.operator === 'date_between') {
                  valText = `"${f.value}" to "${f.value2 || ''}"`;
                } else if (f.operator !== 'empty' && f.operator !== 'not_empty') {
                  valText = `"${f.value}"`;
                }
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px',
                    borderRadius: '6px', background: 'var(--surface)', border: '1.5px solid rgba(99,102,241,0.18)',
                    boxShadow: '0 1px 3px rgba(99,102,241,0.03)', whiteSpace: 'nowrap'
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600 }}>{idx === 0 ? 'WHERE' : 'AND'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--navy)' }}>{col?.name || 'Unknown'}</span>
                    <span style={{ fontSize: '10px', color: '#6366f1', fontWeight: 600 }}>{opLabel(f.operator)}</span>
                    {valText && <span style={{ fontSize: '11px', color: 'var(--foreground)', fontWeight: 600 }}>{valText}</span>}
                    <button
                      onClick={() => setDetailFilters(detailFilters.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: '2px', marginLeft: '2px', borderRadius: '4px', transition: 'all 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right side: Clear All button */}
          <button onClick={() => setDetailFilters([])} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', background: 'rgba(239,68,68,0.08)', color: 'var(--destructive)', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Clear All Filters
          </button>
        </div>
      )}

      {/* ── Summary Stats Cards (Visible when loaded) ── */}
      {!detailLoading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '8px',
          padding: '6px 24px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--surface)',
          flexShrink: 0
        }}>
          {/* Card 1: Total Records */}
          <div className="admin-card-glass" style={{
            padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(79, 70, 229, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', flexShrink: 0 }}>
                <Database size={12} />
              </div>
              <span style={{ fontSize: '8.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Total Records</span>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)', flexShrink: 0, paddingLeft: '4px' }}>{detailEntries.length}</span>
          </div>

          {/* Filtered Records Cards (Render a card for each active filter step, showing progressive count drops) */}
          {detailFilters.length > 0 ? (
            detailFilters.map((f, idx) => {
              const col = detailColumns.find(c => c.id === f.columnId);
              const valText = f.operator === 'multi_select'
                ? `(${(f.values || []).length} selected)`
                : f.operator === 'empty' || f.operator === 'not_empty' ? '' : f.value;
              return (
                <div key={idx} className="admin-card-glass" style={{
                  padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                  background: 'var(--surface)',
                  border: '1.5px solid rgba(99,102,241,0.22)',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.04)',
                  minWidth: '210px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '4px',
                      background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6366f1', flexShrink: 0
                    }}>
                      <Filter size={12} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: '8.5px', color: '#6366f1', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }} title={`${idx === 0 ? 'WHERE' : 'AND'} ${col?.name || 'Unknown'}`}>
                        {idx === 0 ? 'WHERE' : 'AND'} {col?.name || 'Unknown'}
                      </span>
                      <span style={{
                        fontSize: '8.5px', color: 'var(--muted)', fontWeight: 500, display: 'block',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        lineHeight: '1.2', marginTop: '1px'
                      }} title={`${opLabel(f.operator)} ${valText && `"${valText}"`}`}>
                        {opLabel(f.operator)} {valText && `"${valText}"`}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)', flexShrink: 0, paddingLeft: '4px' }}>
                    {getCumulativeCountForFilter(idx)}
                  </span>
                </div>
              );
            })
          ) : (
            /* If no active filters, render the fallback Filtered Records card */
            <div className="admin-card-glass" style={{
              padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              background: 'var(--surface)', border: '1px solid var(--border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div style={{
                  width: '24px', height: '24px', borderRadius: '4px',
                  background: 'rgba(71,85,105,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--muted)', flexShrink: 0
                }}>
                  <Filter size={12} />
                </div>
                <span style={{ fontSize: '8.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Filtered Records</span>
              </div>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--foreground)', flexShrink: 0, paddingLeft: '4px' }}>
                {displayEntries.length}
              </span>
            </div>
          )}

          {/* Card 3: Total Columns */}
          <div className="admin-card-glass" style={{
            padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            background: 'var(--surface)', border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-green)', flexShrink: 0 }}>
                <Columns size={12} />
              </div>
              <span style={{ fontSize: '8.5px', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Columns Count</span>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy)', flexShrink: 0, paddingLeft: '4px' }}>{detailColumns.length}</span>
          </div>
        </div>
      )}

      {/* ── Data Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {detailLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--muted)' }}>
            <Clock size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Loading register data...</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <th style={{
                  padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: 'var(--muted)',
                  borderBottom: '2px solid var(--border)', fontSize: '10px', textTransform: 'uppercase',
                  letterSpacing: '0.05em', whiteSpace: 'nowrap', width: '50px', position: 'sticky', left: 0,
                  background: 'var(--surface)', zIndex: 3
                }}>S.No</th>
                {detailColumns.map(col => (
                  <th key={col.id} style={{
                    padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)',
                    borderBottom: '2px solid var(--border)', fontSize: '10.5px', textTransform: 'uppercase',
                    letterSpacing: '0.03em', whiteSpace: 'nowrap', minWidth: '110px',
                    borderRight: '1px solid var(--border-light)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.name}
                      <span style={{
                        fontSize: '8px', color: 'var(--muted)', fontWeight: 600, padding: '1px 4px',
                        borderRadius: '3px', background: 'var(--bg-secondary)', textTransform: 'lowercase'
                      }}>{col.type}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedEntries.map((entry, idx) => {
                const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                return (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,115,232,0.025)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{
                      padding: '8px 14px', color: 'var(--muted)', fontWeight: 700, fontSize: '10.5px',
                      textAlign: 'center', position: 'sticky', left: 0, background: 'var(--surface)',
                      zIndex: 1, borderRight: '1px solid var(--border-light)'
                    }}>{globalIdx}</td>
                    {detailColumns.map(col => {
                      const val = entry.cells?.[col.id.toString()] || '';
                      const isDropdown = col.type === 'dropdown';
                      return (
                        <td key={col.id} style={{
                          padding: '8px 14px', color: 'var(--foreground)', maxWidth: '280px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          borderRight: '1px solid var(--border-light)', fontSize: '12.5px'
                        }} title={val}>
                          {isDropdown && val ? (
                            <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.06)', color: '#6366f1', fontWeight: 600, fontSize: '11px' }}>{val}</span>
                          ) : val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {displayEntries.length === 0 && !detailLoading && (
                <tr>
                  <td colSpan={detailColumns.length + 1} style={{ padding: '50px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--muted)' }}>
                      <Search size={28} style={{ opacity: 0.3 }} />
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>
                        {isFiltered ? 'No entries match the current filters' : 'This register has no entries'}
                      </span>
                      {isFiltered && (
                        <button onClick={() => { setDetailSearch(''); setDetailFilters([]); }} style={{
                          padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border)',
                          background: 'var(--background)', color: 'var(--accent)', fontSize: '12px',
                          fontWeight: 600, cursor: 'pointer', marginTop: '4px'
                        }}>Clear All Filters</button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '10px 24px', borderTop: '1px solid var(--border)', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'var(--surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '30%', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 500 }}>
            {isFiltered
              ? <><strong style={{ color: 'var(--accent)' }}>{displayEntries.length}</strong> of {detailEntries.length} entries shown</>
              : <>{detailEntries.length} total entries • {detailColumns.length} columns</>
            }
          </span>
          {isFiltered && displayEntries.length > 0 && (
            <span style={{ fontSize: '10.5px', color: 'var(--brand-green)', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.08)' }}>
              Ready to export ↗
            </span>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1.5px solid var(--border)',
                background: 'var(--background)', color: 'var(--foreground)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.4 : 1, fontSize: '11.5px', fontWeight: 700, transition: 'all 0.15s'
              }}
              onMouseEnter={e => { if (currentPage > 1) e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              Previous
            </button>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', minWidth: '90px', textAlign: 'center' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1.5px solid var(--border)',
                background: 'var(--background)', color: 'var(--foreground)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.4 : 1, fontSize: '11.5px', fontWeight: 700, transition: 'all 0.15s'
              }}
              onMouseEnter={e => { if (currentPage < totalPages) e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              Next
            </button>
          </div>
        ) : <div />}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '30%', flexShrink: 0 }}>
          {isFiltered && displayEntries.length > 0 && (
            <button onClick={handleExportExcel} disabled={exporting} style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white',
              fontWeight: 700, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 8px rgba(16,185,129,0.25)'
            }}>
              <Download size={14} /> {exporting ? 'Exporting...' : `Export ${displayEntries.length} Rows`}
            </button>
          )}
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>Close</button>
        </div>
      </div>

      {showSaveShortcutModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999
        }}>
          <div className="admin-card-glass admin-animate-fade-in" style={{
            width: '400px',
            padding: '24px',
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: '16px',
            boxShadow: 'var(--admin-card-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bookmark size={18} color="var(--accent)" /> Save Filtered View
              </h3>
              <button
                onClick={() => setShowSaveShortcutModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}
              >
                <X size={18} />
              </button>
            </div>
            
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', fontWeight: 500 }}>
              Create a quick shortcut on your dashboard to directly open this register with your current search and filters.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Shortcut Name
              </label>
              <input
                type="text"
                value={shortcutName}
                onChange={e => setShortcutName(e.target.value)}
                placeholder="e.g., BE 26 - New Admission"
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setShowSaveShortcutModal(false)}
                className="admin-btn-secondary-flat"
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onSaveShortcut(shortcutName, detailSearch, detailFilters);
                  setShowSaveShortcutModal(false);
                }}
                className="admin-btn-success-glow"
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', background: 'var(--accent)', color: 'white' }}
              >
                Save Shortcut
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isFullScreen) {
    return createPortal(panelContent, document.body);
  }

  return panelContent;
}


