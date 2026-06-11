import { useCallback, memo, useState, useEffect, useRef, startTransition, useDeferredValue, useMemo } from 'react';
import { Menu, Search, Plus, FileText, X, Folder, FileSpreadsheet, ClipboardPaste, Pencil, Trash2, PlusCircle, FolderPlus, Bell, User, Activity, LayoutTemplate, LogOut, CloudUpload, Clock, CheckCircle2, XCircle, Shield, Sparkles, PenLine, ChevronDown, ChevronRight, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import type { RegisterSummary, Business } from '../../lib/api';
import { getRegister, getRegisterColumnsOnly, addEntry, formatDateToDDMMYYYY, listFolders, createFolder, renameFolder, deleteFolder, moveRegisterToFolder, moveRegistersToFolder, duplicateRegister, searchAllRegisters } from '../../lib/api';
import toast from 'react-hot-toast';
import { ImageCompressionModule } from '../../lib/imageCompressionModule';
import { firebaseLogWorkspaceAction } from '../../lib/firebaseAuth';
interface SidebarProps {
  businesses?: Business[];
  filtered?: RegisterSummary[];
  search: string;
  setSearch: (v: string) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  menuId: number | null;
  setMenuId: (id: number | null) => void;
  onInputFolder?: () => void;
  onInputExcel?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importSession?: import('../../pages/HomePage').ImportSession | null;
  onClearImport?: () => void;
  clipboard: { id: number, type: 'copy' | 'move' } | null;
  setClipboard: (v: { id: number, type: 'copy' | 'move' } | null) => void;
  sidebarWidth?: number;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  unreadCount: number;
  onToggleNotifications: () => void;
}

export const Sidebar = memo(function Sidebar({
  businesses,
  filtered,
  search,
  setSearch,
  sidebarOpen,
  setSidebarOpen,
  menuId,
  setMenuId,
  onInputFolder,
  onInputExcel,
  importSession,
  onClearImport,
  clipboard,
  setClipboard,
  sidebarWidth,
  isCollapsed,
  toggleCollapse,
  unreadCount,
  onToggleNotifications
}: SidebarProps) {
  const navigate = useNavigate();
  const { id: currentRegId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderMenuId, setFolderMenuId] = useState<number | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedRegIds, setSelectedRegIds] = useState<Set<number>>(new Set());

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isFooterMenuOpen, setIsFooterMenuOpen] = useState(false);
  const [isEntryPanelOpen, setIsEntryPanelOpen] = useState(false);
  const [entryExpandedFolders, setEntryExpandedFolders] = useState<Record<string, boolean>>({});
  const [entrySearch, setEntrySearch] = useState('');
  // Quick Entry form state
  const [entrySelectedReg, setEntrySelectedReg] = useState<{ id: number; name: string; iconColor?: string } | null>(null);
  const [entryColumns, setEntryColumns] = useState<any[]>([]);
  const [entryExistingEntries, setEntryExistingEntries] = useState<any[]>([]);
  const [entryValues, setEntryValues] = useState<Record<string, string>>({});
  const [entryLoading, setEntryLoading] = useState(false);
  const [entrySubmitting, setEntrySubmitting] = useState(false);
  const [entrySavedCount, setEntrySavedCount] = useState(0);
  const entryFirstInputRef = useRef<HTMLElement | null>(null);
  const [entryUploadingImageCol, setEntryUploadingImageCol] = useState<string | null>(null);

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 768;

  const businessId = businesses?.[0]?.id;
  const deferredSearch = useDeferredValue(search);
  const { logout, user: authUser } = useAuth();
  const isSystemAdmin = (authUser as any)?.role === 'admin' || (authUser as any)?.role === 'superadmin';

  const { data: folders = [] } = useQuery({
    queryKey: ['folders', businessId],
    queryFn: () => listFolders(businessId!),
    enabled: !!businessId,
  });

  const { data: register } = useQuery({
    queryKey: ['register', Number(currentRegId)],
    queryFn: () => getRegister(Number(currentRegId)),
    enabled: !!currentRegId,
  });

  const [showNotifications, setShowNotifications] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(() => {
    try {
      return localStorage.getItem('seen_version_1.7.6') !== 'true';
    } catch {
      return false;
    }
  });
  const [versionTab, setVersionTab] = useState<'1.7.6' | '1.7.5' | '1.7.1' | '1.7.0' | '1.6.10' | '1.6.9' | '1.6.3' | '1.6.2' | '1.6.1' | '1.6.0' | '1.5.6' | '1.5.5' | '1.5.2' | '1.5.1' | '1.5' | '1.3.1' | '1.2'>('1.7.6');

  const handleCloseVersionModal = useCallback(() => {
    setShowVersionModal(false);
    try {
      localStorage.setItem('seen_version_1.7.6', 'true');
    } catch (e) {
      console.error(e);
    }
  }, []);

  const notifications = useMemo(() => {
    if (!register?.entries || register.entries.length < 2) return [];
    
    const notifs: any[] = [];
    const entries = register.entries;
    const seen = new Map<string, number>(); 
    
    for (const entry of entries) {
      if (!entry.cells || Object.keys(entry.cells).length === 0) continue; 
      
      const validCells: Record<string, any> = {};
      Object.entries(entry.cells).forEach(([k, v]) => {
         if (v && String(v).trim() !== '') validCells[k] = v;
      });
      
      if (Object.keys(validCells).length === 0) continue;
      
      const signature = JSON.stringify(validCells, Object.keys(validCells).sort());
      
      if (seen.has(signature)) {
        notifs.push({
          id: `dup-${entry.id}`,
          type: 'warning',
          title: 'Double Entry Warning',
          message: `Identical data detected in row.`,
          entryId: entry.id,
          timestamp: new Date()
        });
      } else {
        seen.set(signature, entry.id);
      }
    }
    
    return notifs.reverse();
  }, [register?.entries]);

  const handleNotificationClick = (entryId: number) => {
    setShowNotifications(false);
    if (sidebarOpen) setSidebarOpen(false);
    const rowEl = document.getElementById(`row-${entryId}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      rowEl.style.transition = 'background-color 0.5s';
      const originalBg = rowEl.style.backgroundColor;
      rowEl.style.backgroundColor = '#fff3cd';
      setTimeout(() => {
        rowEl.style.backgroundColor = originalBg;
      }, 2000);
    } else {
      alert('Row not found on current page. Please change page.');
    }
  };

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['globalSearch', businessId, deferredSearch],
    queryFn: () => searchAllRegisters(businessId!, deferredSearch),
    enabled: !!businessId && deferredSearch.trim().length >= 2,
    staleTime: 60 * 1000,
  });


  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createFolder(businessId!, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders', businessId] }),
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameFolder(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['folders', businessId] }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(['folders', businessId], (old: any[] | undefined) => {
        return (old || []).filter(f => f.id !== deletedId);
      });
      queryClient.setQueryData(['registers', businessId], (old: RegisterSummary[] | undefined) => {
        return (old || []).map(r => r.folderId === deletedId ? { ...r, folderId: undefined } : r);
      });
      queryClient.invalidateQueries({ queryKey: ['folders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ regId, fId }: { regId: number; fId: number | null }) => moveRegisterToFolder(regId, fId),
    onSuccess: (_, variables) => {
      queryClient.setQueryData(['registers', businessId], (old: RegisterSummary[] | undefined) => {
        return (old || []).map(r => r.id === variables.regId ? { ...r, folderId: variables.fId === null ? undefined : variables.fId } : r);
      });
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
    },
  });

  const moveMultipleMutation = useMutation({
    mutationFn: ({ regIds, fId }: { regIds: number[]; fId: number | null }) => moveRegistersToFolder(regIds, fId),
    onSuccess: (_, variables) => {
      queryClient.setQueryData(['registers', businessId], (old: RegisterSummary[] | undefined) => {
        const targetFolderId = variables.fId === null ? undefined : variables.fId;
        const idSet = new Set(variables.regIds);
        return (old || []).map(r => idSet.has(r.id) ? { ...r, folderId: targetFolderId } : r);
      });
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      setIsMultiSelectMode(false);
      setSelectedRegIds(new Set());
      toast.success(`Successfully moved ${variables.regIds.length} registers`);
    },
    onError: () => {
      toast.error('Failed to move registers');
    }
  });

  const handlePaste = async (folderId: number | null) => {
    if (!clipboard) return;
    if (clipboard.type === 'move') {
      await moveMutation.mutateAsync({ regId: clipboard.id, fId: folderId });
    } else if (clipboard.type === 'copy') {
      const newReg = await duplicateRegister(clipboard.id);
      await moveMutation.mutateAsync({ regId: newReg.id, fId: folderId });
    }
    setClipboard(null);
    setFolderMenuId(null);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolderMutation.mutate(newFolderName.trim(), {
        onSuccess: () => {
          setIsCreatingFolder(false);
          setNewFolderName('');
        }
      });
    }
  };

  const prefetchRegister = useCallback((regId: number) => {
    queryClient.prefetchQuery({
      queryKey: ['register', regId],
      queryFn: () => getRegister(regId),
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  const renderRegister = (reg: RegisterSummary, indent: number = 0) => (
    <div
      key={reg.id}
      draggable
      onDragStart={(e) => {
        const ids = isMultiSelectMode && selectedRegIds.has(reg.id)
          ? Array.from(selectedRegIds)
          : [reg.id];
        e.dataTransfer.setData('text/plain', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`register-item ${Number(currentRegId) === reg.id ? 'active' : ''}`}
      onClick={(e) => {
        if (isMultiSelectMode) {
          e.stopPropagation();
          setSelectedRegIds(prev => {
            const next = new Set(prev);
            if (next.has(reg.id)) {
              next.delete(reg.id);
            } else {
              next.add(reg.id);
            }
            return next;
          });
        } else {
          startTransition(() => { navigate(`/register/${reg.id}`); closeSidebar(); });
        }
      }}
      onMouseEnter={() => prefetchRegister(reg.id)}
      style={{
        ...(!isCollapsed && indent ? { paddingLeft: `${16 + indent}px` } : {}),
        backgroundColor: isMultiSelectMode && selectedRegIds.has(reg.id) ? 'rgba(30, 45, 120, 0.06)' : undefined,
      }}
      data-tooltip={isCollapsed ? reg.name : undefined}
    >
      {isMultiSelectMode && !isCollapsed && (
        <div 
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: `2px solid ${selectedRegIds.has(reg.id) ? 'var(--primary)' : '#cbd5e1'}`,
            backgroundColor: selectedRegIds.has(reg.id) ? 'var(--primary)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '8px',
            flexShrink: 0,
            transition: 'all 0.15s ease',
          }}
        >
          {selectedRegIds.has(reg.id) && (
            <Check size={10} color="#ffffff" strokeWidth={3} />
          )}
        </div>
      )}
      <div
        className="register-icon-bg"
        {...{ style: { '--dyn-bg': reg.iconColor ? `${reg.iconColor}20` : 'rgba(27,42,74,0.08)' } as React.CSSProperties }}
      >
        <FileText size={16} color={reg.iconColor || 'var(--navy)'} />
      </div>
      <div className="register-item-info">
        <div className="register-item-name">{reg.name}</div>
        <div className="register-item-meta">{reg.entryCount} entries {!isCollapsed && `• ${new Date(reg.updatedAt).toLocaleDateString()}`}</div>
        {!isCollapsed && reg.lastActivity && <div className="register-item-activity">{reg.lastActivity}</div>}
      </div>
      {!isMultiSelectMode && (
        <button
          className="register-item-menu"
          title="Register options"
          aria-label="Register options"
          onClick={(e) => { e.stopPropagation(); setMenuId(menuId === reg.id ? null : reg.id); }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--muted)' }}
        >
          <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>⋮</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}
      
      {/* ── Folder Context Menu ── */}
      {folderMenuId !== null && (
        <div className="modal-overlay" onClick={() => setFolderMenuId(null)}>
          <div className="context-menu" onClick={(e) => e.stopPropagation()}>
            <div className="context-title">{folders.find(f => f.id === folderMenuId)?.name || 'Folder'}</div>
            <button className="context-item" onClick={() => {
              const name = prompt('Rename folder:', folders.find(f => f.id === folderMenuId)?.name || '');
              if (name && name.trim()) renameFolderMutation.mutate({ id: folderMenuId, name: name.trim() });
              setFolderMenuId(null);
            }}>
              <Pencil size={16} />Rename
            </button>
            <button 
              className="context-item" 
              onClick={() => handlePaste(folderMenuId)}
              disabled={!clipboard}
              style={{ opacity: !clipboard ? 0.5 : 1, cursor: !clipboard ? 'not-allowed' : 'pointer' }}
            >
              <ClipboardPaste size={16} />Paste {clipboard ? (clipboard.type === 'move' ? '(Move)' : '(Copy)') : ''}
            </button>
            <button className="context-item danger" onClick={() => {
              if (confirm('Delete this folder? Its registers will remain as unassigned.')) {
                deleteFolderMutation.mutate(folderMenuId);
              }
              setFolderMenuId(null);
            }}>
              <Trash2 size={16} />Delete
            </button>
          </div>
        </div>
      )}

      <div className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <div className="mobile-topbar-brand">
          <img src="/logo-transparent.png" alt="AG Trust" className="mobile-topbar-logo" />
          <span style={{ fontWeight: 700 }}>AG Trust</span>
        </div>
        <div style={{ width: 40 }} /> {/* Spacer for balance */}
      </div>

      {/* ── Sidebar ── */}
      <div
        className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''} ${isCollapsed ? 'sidebar--collapsed' : ''}`}
        style={sidebarWidth && !isCollapsed ? { width: sidebarWidth, minWidth: sidebarWidth } : undefined}
      >
        <div className="sidebar-brand">
          <div className="sidebar-brand-group" onClick={() => navigate('/')}>
            <img src="/logo-transparent.png" alt="AG Trust" className="sidebar-brand-logo" />
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-name">AG <span>Trust</span></div>
              <div className="sidebar-brand-sub">Record Book</div>
            </div>
          </div>
          
          <div className="sidebar-brand-actions">
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
              <X size={18} />
            </button>
            
            <button 
              className="sidebar-collapse-btn" 
              onClick={() => onToggleNotifications()}
              title="Notifications"
              style={{ position: 'relative' }}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="notif-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <button 
              className="sidebar-collapse-btn" 
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="13 8 17 12 13 16"></polyline></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="11 8 7 12 11 16"></polyline></svg>
              )}
            </button>
          </div>
        </div>
        {/* Sidebar Add Button — only visible to users with canCreateSheets permission or admins */}
        {(isSystemAdmin || (authUser as any)?.role === 'sheet_admin' || (authUser as any)?.permissions?.canCreateSheets) && (
        <div className="sidebar-add-section" style={{ padding: '8px 8px 4px', position: 'relative' }}>
          <button 
            className="sidebar-add-btn"
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            title="Add new item"
          >
            <Plus size={15} /> <span className="sidebar-add-text">Add</span>
          </button>

          {isAddMenuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                onClick={() => setIsAddMenuOpen(false)}
              />
              <div 
                className="sidebar-add-dropdown"
                style={{
                  position: 'absolute',
                  top: '0',
                  ...(isCollapsed
                    ? { left: 'calc(100% + 8px)' }   // pop to the RIGHT in collapsed mode
                    : { top: '44px', left: '8px', right: '8px' }  // drop down normally
                  ),
                  background: 'white',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  minWidth: '180px',
                  whiteSpace: 'nowrap',
                }}
              >
                <button className="context-item" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '12.5px' }} onClick={() => { navigate('/templates'); setIsAddMenuOpen(false); }}>
                  <PlusCircle size={16} color="var(--navy)" /><span>New Register</span>
                </button>
                <button className="context-item" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '12.5px' }} onClick={() => { setIsCreatingFolder(true); setIsAddMenuOpen(false); }}>
                  <FolderPlus size={16} color="var(--navy)" /><span>New File</span>
                </button>
                <label className="context-item" style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                  <FileSpreadsheet size={16} color="#107c41" /><span>Input Excel</span>
                  <input type="file" accept=".xlsx, .xls, .csv" className="hidden-file-input" onChange={(e) => { onInputExcel?.(e); setIsAddMenuOpen(false); }} />
                </label>
                <button className="context-item" style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '12.5px' }} onClick={() => { onInputFolder?.(); setIsAddMenuOpen(false); }}>
                  <Folder size={16} fill="#fbbf24" color="#f59e0b" /><span>Input File</span>
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {/* Entry Button — Quick Add Entry to any register */}
        {!isCollapsed && (
          <div style={{ padding: '0 8px 4px' }}>
            <button
              onClick={() => setIsEntryPanelOpen(true)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                color: '#15803d',
                cursor: 'pointer',
                fontSize: '11.5px',
                fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #dcfce7 0%, #d1fae5 100%)';
                e.currentTarget.style.borderColor = '#86efac';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(22,163,74,0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)';
              }}
              title="Quick add entry to any register"
            >
              <PenLine size={13} />
              <span>Entry</span>
            </button>
          </div>
        )}

        {/* Global Search Bar */}
        {!isCollapsed && (
          <div style={{ padding: '2px 10px 8px' }}>
            <div className="gs-input-wrap">
              <Search size={12} className="gs-input-icon" />
              <input
                placeholder="Search all registers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="gs-input"
                autoComplete="off"
              />
              {search && (
                <button onClick={() => setSearch('')} className="gs-input-clear" title="Clear">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}


        {/* Folder creation input moved to a modal or handled via menu */}
        {isCreatingFolder && (
          <div className="sidebar-new-section" style={{ padding: '8px 20px' }}>
            <div className="sidebar-action-row" style={{ display: 'flex', gap: '4px' }}>
              <input 
                type="text" 
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                style={{ flex: 1, padding: '6px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border)' }}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
              />
              <button 
                onClick={handleCreateFolder}
                style={{ padding: '6px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </button>
              <button 
                onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }}
                style={{ padding: '6px', background: 'transparent', color: 'var(--muted)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        
        {importSession && (
          <div className="sidebar-import-session" style={{ margin: '0 1rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Folder size={14} color="var(--primary)" />
                {importSession.folderName}
              </div>
              <button onClick={onClearImport} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }} aria-label="Clear import">
                <X size={14} />
              </button>
            </div>
            {importSession.files.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>No excel files found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {importSession.files.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: f.status === 'error' ? 'var(--danger)' : 'var(--muted)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span>
                      {f.status === 'waiting' && <Clock size={12} style={{ opacity: 0.6 }} />}
                      {f.status === 'uploading' && <span className="spinner" style={{width: 10, height: 10, borderWidth: 2}}></span>}
                      {f.status === 'success' && <CheckCircle2 size={12} color="var(--secondary)" />}
                      {f.status === 'error' && <XCircle size={12} color="var(--primary)" />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-list sidebar-list--local">
          {search.trim().length > 0 ? (
            <>
              {/* Status line */}
              <div className="gs-status">
                {search.trim().length < 2
                  ? 'Type at least 2 characters…'
                  : isSearching
                    ? 'Searching…'
                    : `${searchResults?.length || 0} results`}
                {isSearching && <div className="gs-status-bar" />}
              </div>

              {/* Results */}
              {searchResults?.map((res, i) => (
                <div
                  key={i}
                  className="gs-card"
                  onClick={() => {
                    startTransition(() => {
                      if (res.entryId !== -1) {
                        navigate(`/register/${res.registerId}?row=${res.entryId}`);
                      } else {
                        navigate(`/register/${res.registerId}`);
                      }
                      closeSidebar();
                    });
                  }}
                >
                  <div className="gs-card-name">
                    {res.entryId === -1 ? <FileSpreadsheet size={13} /> : <FileText size={13} />}
                    <span>{res.registerName}</span>
                  </div>
                  {res.entryId !== -1 && (
                    <div className="gs-card-detail">
                      <span className="gs-badge">Row {res.rowNumber}</span>
                      <span className="gs-match">{res.matchedText.length > 60 ? res.matchedText.slice(0, 60) + '…' : res.matchedText}</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Empty */}
              {!isSearching && deferredSearch.trim().length >= 2 && (!searchResults || searchResults.length === 0) && (
                <div className="gs-empty">No results for "{search}"</div>
              )}
            </>
          ) : (
            <>
              {/* Multiselect controls */}
              {!isCollapsed && (
                <div style={{ padding: '4px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: isMultiSelectMode ? '1px solid #f1f5f9' : 'none', marginBottom: isMultiSelectMode ? '8px' : '0' }}>
                  <button
                    onClick={() => {
                      setIsMultiSelectMode(prev => !prev);
                      setSelectedRegIds(new Set());
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isMultiSelectMode ? 'var(--primary)' : 'var(--muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      backgroundColor: isMultiSelectMode ? 'rgba(30,45,120,0.08)' : 'transparent',
                      transition: 'all 0.2s',
                    }}
                  >
                    <CheckCircle2 size={13} />
                    {isMultiSelectMode ? 'Cancel Selection' : 'Select Multiple'}
                  </button>
                  {isMultiSelectMode && selectedRegIds.size > 0 && (
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
                      {selectedRegIds.size} selected (Drag to move)
                    </span>
                  )}
                </div>
              )}

              {folders.filter(f => {
                if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return true;
                const allowedFolders = (user as any).permissions?.allowedFolders;
                return Array.isArray(allowedFolders) && allowedFolders.map(String).includes(f.id.toString());
              }).map(folder => {
                const folderRegs = filtered?.filter(r => r.folderId === folder.id) || [];
                const isExpanded = expandedFolders[folder.id];

                return (
                  <div key={folder.id} className="sidebar-folder-group">
                    <div 
                      className="sidebar-folder-header"
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('drag-over');
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('drag-over');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('drag-over');
                        const dragData = e.dataTransfer.getData('text/plain');
                        if (dragData) {
                          try {
                            const ids = JSON.parse(dragData);
                            if (Array.isArray(ids)) {
                              moveMultipleMutation.mutate({ regIds: ids, fId: folder.id });
                            } else {
                              moveMutation.mutate({ regId: Number(ids), fId: folder.id });
                            }
                          } catch (err) {
                            const regId = parseInt(dragData, 10);
                            if (!isNaN(regId)) {
                              moveMutation.mutate({ regId, fId: folder.id });
                            }
                          }
                        }
                      }}
                      onClick={() => setExpandedFolders(prev => ({...prev, [folder.id]: !prev[folder.id] ? true : false}))}
                      data-tooltip={isCollapsed ? folder.name : undefined}
                    >
                      {!isCollapsed && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px' }}>
                          {isExpanded ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          )}
                        </div>
                      )}
                      <Folder size={16} fill="#fbbf24" color="#f59e0b" />
                      <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                      <button
                        className="register-item-menu"
                        onClick={(e) => { e.stopPropagation(); setFolderMenuId(folderMenuId === folder.id ? null : folder.id); }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--muted)' }}
                      >
                        <span style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>⋮</span>
                      </button>
                    </div>
                    
                    {isExpanded && (
                      <div className="sidebar-folder-children" style={{ paddingBottom: '4px' }}>
                        {folderRegs.length === 0 ? (
                          <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '4px 12px 4px 44px', fontStyle: 'italic' }}>Empty folder</div>
                        ) : (
                          folderRegs.map(reg => renderRegister(reg, 24))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              
              <div 
                className="sidebar-unassigned-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragData = e.dataTransfer.getData('text/plain');
                  if (dragData) {
                    try {
                      const ids = JSON.parse(dragData);
                      if (Array.isArray(ids)) {
                        moveMultipleMutation.mutate({ regIds: ids, fId: null });
                      } else {
                        moveMutation.mutate({ regId: Number(ids), fId: null });
                      }
                    } catch (err) {
                      const regId = parseInt(dragData, 10);
                      if (!isNaN(regId)) {
                        moveMutation.mutate({ regId, fId: null });
                      }
                    }
                  }
                }}
                style={{ paddingBottom: '20px', minHeight: '100px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unassigned</span>
                  {clipboard && (
                    <button 
                      onClick={() => handlePaste(null)} 
                      style={{ background: 'transparent', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ClipboardPaste size={12} /> Paste Here
                    </button>
                  )}
                </div>
                {filtered?.filter(r => !r.folderId).map(reg => renderRegister(reg, 0))}
              </div>
            </>
          )}
        </div>

        {/* The old bottom search bar has been removed and replaced by the top search bar. */}

        <div 
          className={`sidebar-footer-profile ${isFooterMenuOpen ? 'open' : ''}`}
          onClick={() => setIsFooterMenuOpen(v => !v)}
        >
          <div className="sidebar-profile-avatar">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'U')}
          </div>
          {!isCollapsed && (
            <div className="sidebar-profile-info">
              <span className="sidebar-profile-name">{user?.name || user?.email || 'User'}</span>
              <span className="sidebar-profile-role">
                {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sheet_admin' ? 'Staff' : 'User'}
              </span>
            </div>
          )}
          {!isCollapsed && (
            <ChevronDown size={14} className={`sidebar-profile-chevron ${isFooterMenuOpen ? 'open' : ''}`} />
          )}
          {!isCollapsed && (
            <span 
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                fontSize: '9px',
                fontWeight: 600,
                color: '#1d4ed8',
                backgroundColor: '#dbeafe',
                padding: '1px 4px',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                opacity: 0.6
              }}
              onClick={(e) => {
                e.stopPropagation();
                setVersionTab('1.7.6');
                setShowVersionModal(true);
              }}
              onMouseEnter={e => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.backgroundColor = '#bfdbfe';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.opacity = '0.6';
                e.currentTarget.style.backgroundColor = '#dbeafe';
              }}
              title="View what's new in v1.7.6"
            >
              v1.7.6
            </span>
          )}
        </div>

        {/* Footer Popup Menu — rendered OUTSIDE footer div to avoid click bubbling */}
        {isFooterMenuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
              onClick={() => setIsFooterMenuOpen(false)}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '60px',
                left: '8px',
                width: '240px',
                background: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
                zIndex: 1001,
                border: '1px solid #e2e8f0',
              }}
            >
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: 'inherit', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); navigate('/profile'); }}>
                <User size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Profile</span>
              </button>
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: 'inherit', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); navigate('/history'); }}>
                <Activity size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>History</span>
              </button>
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: 'inherit', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); navigate('/recycle-bin'); }}>
                <Trash2 size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Recycle Bin</span>
              </button>
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: 'inherit', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); navigate('/templates'); }}>
                <LayoutTemplate size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Templates</span>
              </button>
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: '#128C7E', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); navigate('/backup'); }}>
                <CloudUpload size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Backup & Restore</span>
              </button>
              {isSystemAdmin && (
                <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: '#7c3aed', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); sessionStorage.removeItem('admin_workspace_mode'); navigate('/admin/dashboard'); }}>
                  <Shield size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Admin Dashboard</span>
                </button>
              )}
              <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }} />
              <button className="footer-menu-item" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', color: '#ef4444', background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', font: 'inherit' }} onClick={() => { setIsFooterMenuOpen(false); logout(); navigate('/login'); }}>
                <LogOut size={16} /> <span style={{ fontSize: '14px', fontWeight: 500 }}>Logout</span>
              </button>
            </div>
          </>
        )}

        {/* ── Quick Entry Panel Modal ── */}
        {isEntryPanelOpen && createPortal(
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: isMobile ? (entrySelectedReg ? '480px' : '400px') : '1000px',
                maxWidth: '95vw',
                height: isMobile ? undefined : '700px',
                maxHeight: '85vh',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.05)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                overflow: 'hidden',
                transition: 'all 0.25s ease',
              }}
            >
              {/* Left Column (Register Picker Pane) */}
              {(!isMobile || !entrySelectedReg) && (
                <div style={{
                  width: isMobile ? '100%' : '360px',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
                  flexShrink: 0,
                  background: 'white',
                  height: '100%',
                }}>
                  {/* Header */}
                  <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                        padding: '8px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <PenLine size={18} color="#16a34a" />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>Quick Entry</h3>
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          {entrySavedCount > 0 ? `${entrySavedCount} entries saved` : 'Select a register below'}
                        </span>
                      </div>
                    </div>
                    {(isMobile || !entrySelectedReg) && (
                      <button
                        onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
                        style={{
                          background: '#f1f5f9',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          color: '#64748b',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Search */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}>
                      <Search size={14} color="#94a3b8" />
                      <input
                        type="text"
                        placeholder="Search registers…"
                        value={entrySearch}
                        onChange={e => setEntrySearch(e.target.value)}
                        autoFocus
                        style={{
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: '13px',
                          color: '#0f172a',
                          width: '100%',
                          font: 'inherit',
                        }}
                      />
                      {entrySearch && (
                        <button
                          onClick={() => setEntrySearch('')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#94a3b8', display: 'flex' }}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Register List */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {(() => {
                      const searchLower = entrySearch.toLowerCase().trim();
                      const matchesSearch = (name: string) => !searchLower || name.toLowerCase().includes(searchLower);

                      const visibleFolders = folders.filter(f => {
                        if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return true;
                        const allowedFolders = (user as any).permissions?.allowedFolders;
                        return Array.isArray(allowedFolders) && allowedFolders.map(String).includes(f.id.toString());
                      });

                      const foldersWithRegs = visibleFolders.map(folder => {
                        const folderRegs = (filtered || []).filter(r => r.folderId === folder.id && matchesSearch(r.name));
                        return { folder, regs: folderRegs };
                      }).filter(f => f.regs.length > 0 || (!searchLower && f.regs.length === 0));

                      const unassignedRegs = (filtered || []).filter(r => !r.folderId && matchesSearch(r.name));

                      const handleSelectRegister = async (reg: RegisterSummary) => {
                        setEntryLoading(true);
                        setEntrySelectedReg({ id: reg.id, name: reg.name, iconColor: reg.iconColor });
                        try {
                          const detail = await getRegister(reg.id);
                          const cols = (detail.columns || []).filter((c: any) => c.type !== 'formula');
                          setEntryColumns(detail.columns || []);
                          setEntryExistingEntries(detail.entries || []);
                          const init: Record<string, string> = {};
                          cols.forEach((c: any) => { init[c.id.toString()] = ''; });
                          setEntryValues(init);
                        } catch (err) {
                          toast.error('Failed to load register columns');
                          setEntrySelectedReg(null);
                        } finally {
                          setEntryLoading(false);
                        }
                      };

                      const renderEntryRegItem = (reg: RegisterSummary, indent: number = 0) => {
                        const isSelected = entrySelectedReg?.id === reg.id;
                        return (
                          <div
                            key={reg.id}
                            onClick={() => handleSelectRegister(reg)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: `8px 12px 8px ${indent ? `${indent}px` : '12px'}`,
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              backgroundColor: isSelected ? '#f0fdf4' : 'transparent',
                              borderLeft: isSelected ? '3px solid #16a34a' : 'none',
                              paddingLeft: isSelected ? `${(indent || 12) - 3}px` : `${indent || 12}px`,
                              transform: isSelected ? 'translateX(2px)' : 'none',
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = '#f8fafc';
                                e.currentTarget.style.transform = 'translateX(2px)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.transform = 'translateX(0)';
                              }
                            }}
                          >
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '6px',
                              background: isSelected ? '#dcfce7' : (reg.iconColor ? `${reg.iconColor}15` : '#f1f5f9'),
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              <FileText size={14} color={isSelected ? '#16a34a' : (reg.iconColor || '#64748b')} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#15803d' : '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reg.name}</div>
                              <div style={{ fontSize: '11px', color: isSelected ? '#16a34a' : '#94a3b8', opacity: isSelected ? 0.8 : 1 }}>{reg.entryCount} entries</div>
                            </div>
                            <PenLine size={14} color="#16a34a" style={{ opacity: isSelected ? 1 : 0.6, flexShrink: 0 }} />
                          </div>
                        );
                      };

                      if (searchLower && foldersWithRegs.every(f => f.regs.length === 0) && unassignedRegs.length === 0) {
                        return (
                          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                            <Search size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                            <div>No registers found for "{entrySearch}"</div>
                          </div>
                        );
                      }

                      return (
                        <>
                          {foldersWithRegs.map(({ folder, regs }) => {
                            const isExp = entryExpandedFolders[folder.id] ?? (!!searchLower);
                            return (
                              <div key={folder.id} style={{ marginBottom: '2px' }}>
                                <div
                                  onClick={() => setEntryExpandedFolders(prev => ({ ...prev, [folder.id]: !isExp }))}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '8px 12px', borderRadius: '8px',
                                    cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  {isExp ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                                  <Folder size={15} fill="#fbbf24" color="#f59e0b" />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155', flex: 1 }}>{folder.name}</span>
                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>{regs.length}</span>
                                </div>
                                {isExp && regs.map(reg => renderEntryRegItem(reg, 40))}
                              </div>
                            );
                          })}

                          {unassignedRegs.length > 0 && (
                            <>
                              {foldersWithRegs.length > 0 && (
                                <div style={{ padding: '4px 12px', marginTop: '4px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unassigned</span>
                                </div>
                              )}
                              {unassignedRegs.map(reg => renderEntryRegItem(reg))}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Right Column (Form / Empty State Pane) */}
              {(!isMobile || entrySelectedReg) && (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minWidth: 0,
                  background: '#f8fafc',
                }}>
                  {entrySelectedReg ? (
                    <>
                      {/* Header with Back button */}
                      <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'white',
                      }}>
                        <button
                          onClick={() => { setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntryExistingEntries([]); }}
                          style={{
                            background: '#f1f5f9',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            color: '#64748b',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                          title={isMobile ? "Back to register list" : "Deselect register"}
                        >
                          <ArrowLeft size={16} />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '6px',
                              background: entrySelectedReg.iconColor ? `${entrySelectedReg.iconColor}15` : '#f0fdf4',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              <FileText size={12} color={entrySelectedReg.iconColor || '#16a34a'} />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {entrySelectedReg.name}
                            </h3>
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '32px' }}>
                            Add new entry (Row #{entryExistingEntries.length + entrySavedCount + 1})
                          </span>
                        </div>
                        <button
                          onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
                          style={{
                            background: '#f1f5f9',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            color: '#64748b',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {entryLoading ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', flexDirection: 'column', gap: '12px', background: 'white' }}>
                          <Loader2 size={28} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Loading columns…</span>
                        </div>
                      ) : (
                        <>
                          {/* Form Fields */}
                          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'white' }}>
                            {entryColumns.filter((c: any) => c.type !== 'formula').length === 0 ? (
                              <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                                No columns found. Add columns first.
                              </p>
                            ) : (
                              entryColumns.filter((c: any) => c.type !== 'formula').map((col: any, idx: number) => {
                                const colIdStr = col.id.toString();
                                const val = entryValues[colIdStr] ?? '';
                                const isAutoIncr = col.type === 'auto_increment';

                                return (
                                  <div key={col.id} style={{ marginBottom: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {col.name}
                                        {col.mandatory && <span style={{ color: '#ef4444', fontSize: 14 }}>*</span>}
                                      </label>
                                      <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 500 }}>{col.type.replace('_', ' ')}</span>
                                    </div>
                                    {col.type === 'dropdown' ? (
                                      <select
                                        value={val}
                                        onChange={e => setEntryValues(prev => ({ ...prev, [colIdStr]: e.target.value }))}
                                        ref={idx === 0 ? (el: any) => { entryFirstInputRef.current = el; } : undefined}
                                        style={{
                                          width: '100%', padding: '10px 14px', fontSize: '13px',
                                          borderRadius: '8px', border: '1px solid #e2e8f0',
                                          background: 'white', color: '#0f172a',
                                          outline: 'none', transition: 'border-color 0.15s',
                                          font: 'inherit',
                                        }}
                                      >
                                        <option value="">-- Select --</option>
                                        {(col.dropdownOptions || []).map((opt: string) => (
                                          <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    ) : col.type === 'checkbox' ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '40px' }}>
                                        <input
                                          type="checkbox"
                                          checked={val === 'true'}
                                          onChange={e => setEntryValues(prev => ({ ...prev, [colIdStr]: e.target.checked ? 'true' : 'false' }))}
                                          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '13px', color: '#64748b' }}>{val === 'true' ? 'Checked' : 'Unchecked'}</span>
                                      </div>
                                    ) : col.type === 'image' ? (
                                      <div style={{ position: 'relative' }}>
                                        {val ? (
                                          <div style={{
                                            position: 'relative',
                                            width: '100%',
                                            height: '140px',
                                            borderRadius: '10px',
                                            border: '1px solid #e2e8f0',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: '#f8fafc',
                                          }}>
                                            <img 
                                              src={val.split('|||')[0]}
                                              alt={col.name} 
                                              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                                            />
                                            <button
                                              type="button"
                                              onClick={() => setEntryValues(prev => ({ ...prev, [colIdStr]: '' }))}
                                              style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: 'rgba(15, 23, 42, 0.6)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                color: 'white',
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'background-color 0.15s',
                                                zIndex: 10,
                                              }}
                                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.9)'; }}
                                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.6)'; }}
                                            >
                                              <X size={14} />
                                            </button>
                                          </div>
                                        ) : (
                                          <label style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '100%',
                                            height: '100px',
                                            border: '2px dashed #cbd5e1',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            background: '#f8fafc',
                                            transition: 'all 0.15s',
                                            boxSizing: 'border-box',
                                            padding: '16px',
                                          }}
                                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
                                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                          >
                                            {entryUploadingImageCol === colIdStr ? (
                                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <Loader2 size={24} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} />
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>Uploading & compressing...</span>
                                              </div>
                                            ) : (
                                              <>
                                                <CloudUpload size={24} color="#64748b" style={{ marginBottom: '6px' }} />
                                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>Click to upload photo</span>
                                                <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>JPEG, PNG, WebP</span>
                                              </>
                                            )}
                                            <input
                                              type="file"
                                              accept="image/*"
                                              style={{ display: 'none' }}
                                              disabled={entryUploadingImageCol === colIdStr}
                                              onChange={async (e) => {
                                                const f = e.target.files?.[0];
                                                if (!f) return;
                                                setEntryUploadingImageCol(colIdStr);
                                                try {
                                                  const uploadedUrl = await ImageCompressionModule.compressAndUploadToCloudinary(f);
                                                  setEntryValues(prev => ({ ...prev, [colIdStr]: uploadedUrl }));
                                                  toast.success('Image compressed & uploaded to secure cloud storage successfully!');
                                                } catch (err) {
                                                  toast.error('Failed to upload image');
                                                  console.error(err);
                                                } finally {
                                                  setEntryUploadingImageCol(null);
                                                }
                                              }}
                                            />
                                          </label>
                                        )}
                                      </div>
                                    ) : (
                                      <input
                                        type={col.type === 'number' || col.type === 'currency' || col.type === 'rating' ? 'number' : col.type === 'email' ? 'email' : col.type === 'phone' ? 'tel' : col.type === 'url' ? 'url' : col.type === 'date' ? 'text' : 'text'}
                                        value={val}
                                        onChange={e => setEntryValues(prev => ({ ...prev, [colIdStr]: e.target.value }))}
                                        placeholder={isAutoIncr ? 'Auto-generated if blank' : col.type === 'date' ? 'DD-MM-YYYY' : col.type === 'email' ? 'email@example.com' : col.type === 'phone' ? '+91 XXXXX XXXXX' : col.type === 'url' ? 'https://' : `Enter ${col.name}…`}
                                        ref={idx === 0 ? (el: any) => { entryFirstInputRef.current = el; } : undefined}
                                        min={col.type === 'rating' ? 1 : undefined}
                                        max={col.type === 'rating' ? 5 : undefined}
                                        style={{
                                          width: '100%', padding: '10px 14px', fontSize: '13px',
                                          borderRadius: '8px', border: '1px solid #e2e8f0',
                                          background: 'white', color: '#0f172a',
                                          outline: 'none', transition: 'border-color 0.15s',
                                          font: 'inherit',
                                          boxSizing: 'border-box',
                                        }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                                      />
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* Footer */}
                          <div style={{
                            padding: '14px 20px',
                            borderTop: '1px solid #f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            background: '#fafbfc',
                          }}>
                            {isMobile && (
                              <button
                                type="button"
                                onClick={() => { setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntryExistingEntries([]); }}
                                style={{
                                  padding: '9px 18px', fontSize: '13px', fontWeight: 600,
                                  borderRadius: '8px', border: '1px solid #e2e8f0',
                                  background: 'white', color: '#64748b', cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.backgroundColor = 'white'; }}
                              >
                                Back
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={entrySubmitting || entryColumns.filter((c: any) => c.type !== 'formula').length === 0}
                              onClick={async () => {
                                for (const col of entryColumns) {
                                  if (col.mandatory && col.type !== 'formula' && col.type !== 'auto_increment') {
                                    const v = entryValues[col.id.toString()];
                                    if (!v || v.trim() === '') {
                                      toast.error(`${col.name} is a mandatory field.`);
                                      return;
                                    }
                                  }
                                }
                                const cells: Record<string, string> = {};
                                Object.entries(entryValues).forEach(([k, v]) => {
                                  const col = entryColumns.find((c: any) => c.id.toString() === k);
                                  if (col?.type === 'formula') return;
                                  let finalVal = v.trim();
                                  if (col?.type === 'date' && finalVal !== '') {
                                    finalVal = formatDateToDDMMYYYY(finalVal);
                                  }
                                  if (finalVal !== '') cells[k] = finalVal;
                                });
                                setEntrySubmitting(true);
                                try {
                                  await addEntry(entrySelectedReg!.id, cells);
                                  if (user?.id) {
                                    firebaseLogWorkspaceAction(
                                      user.id as string,
                                      (user as any)?.name || user?.email || 'Unknown',
                                      'add_row',
                                      `Added new row (Quick Entry) inside register: ${entrySelectedReg!.name}`,
                                      entrySelectedReg!.id,
                                      entrySelectedReg!.name
                                    );
                                  }
                                  toast.success(`Entry added to ${entrySelectedReg!.name}`, {
                                    style: { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 600, fontSize: '13px' },
                                    icon: '✅',
                                    duration: 2500,
                                  });
                                  setEntrySavedCount(c => c + 1);
                                  queryClient.invalidateQueries({ queryKey: ['register', entrySelectedReg!.id] });
                                  queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
                                  
                                  // Reset form fields so they can add another entry to the SAME register immediately
                                  const init: Record<string, string> = {};
                                  const cols = (entryColumns || []).filter((c: any) => c.type !== 'formula');
                                  cols.forEach((c: any) => { init[c.id.toString()] = ''; });
                                  setEntryValues(init);
                                  
                                  // Refocus first input if possible
                                  setTimeout(() => {
                                    if (entryFirstInputRef.current) {
                                      entryFirstInputRef.current.focus();
                                    }
                                  }, 100);
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to add entry');
                                } finally {
                                  setEntrySubmitting(false);
                                }
                              }}
                              style={{
                                padding: '9px 24px', fontSize: '13px', fontWeight: 600,
                                borderRadius: '8px', border: 'none',
                                background: entrySubmitting ? '#86efac' : 'linear-gradient(135deg, #16a34a, #15803d)',
                                color: 'white', cursor: entrySubmitting ? 'wait' : 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                boxShadow: '0 2px 8px rgba(22,163,74,0.2)',
                              }}
                              onMouseEnter={e => { if (!entrySubmitting) e.currentTarget.style.boxShadow = '0 4px 14px rgba(22,163,74,0.3)'; }}
                              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(22,163,74,0.2)'; }}
                            >
                              {entrySubmitting ? (
                                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                              ) : (
                                <><Check size={14} /> Save Entry</>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    /* Desktop Empty State */
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px',
                      textAlign: 'center',
                      background: 'white',
                    }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '20px',
                        boxShadow: '0 8px 24px rgba(22, 163, 74, 0.1)',
                      }}>
                        <PenLine size={32} color="#16a34a" />
                      </div>
                      <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Quick Entry Pane</h3>
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b', maxWidth: '320px', lineHeight: 1.6 }}>
                        Select a register from the left list to instantly start entering data without leaving this view.
                      </p>
                      <button
                        onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
                        style={{
                          marginTop: '20px',
                          padding: '8px 18px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#64748b',
                          background: '#f1f5f9',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>
      

      {/* Sliding Notification Panel Overlay */}
      {showNotifications && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            zIndex: 9998,
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.3s'
          }}
          onClick={() => setShowNotifications(false)}
        />
      )}
      
      {/* Sliding Notification Panel */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          right: showNotifications ? 0 : '-380px',
          width: '380px',
          height: '100vh',
          backgroundColor: 'white',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 9999,
          transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={16} /> Alerts & Warnings
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {notifications.length > 0 && (
              <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, background: '#fee2e2', padding: '2px 8px', borderRadius: '12px' }}>
                {notifications.length} new
              </span>
            )}
            <button 
              onClick={() => setShowNotifications(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', color: '#64748b', borderRadius: '4px' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '16px', background: '#f1f5f9', borderRadius: '50%' }}>
                <Bell size={32} style={{ opacity: 0.4 }} />
              </div>
              <div>No new alerts<br/><span style={{ fontSize: '13px', fontWeight: 'normal', color: '#cbd5e1' }}>You're all caught up!</span></div>
            </div>
          ) : (
            notifications.map(notif => (
              <div 
                key={notif.id}
                onClick={() => handleNotificationClick(notif.entryId)}
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid #f1f5f9', 
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.paddingLeft = '24px'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.paddingLeft = '20px'; }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', marginTop: '6px', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>{notif.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{notif.message}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Click to view row
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Version Updates Modal ── */}
      {showVersionModal && (
        <div className="modal-overlay" onClick={handleCloseVersionModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#eff6ff', color: '#3b82f6', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>What's New</h3>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Release updates & improvements</span>
                </div>
              </div>
              <button 
                onClick={handleCloseVersionModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={18} />
              </button>
            </div>

            {/* Version Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#f1f5f9', padding: '4px', borderRadius: '8px', overflowX: 'auto' }}>
              <button
                onClick={() => setVersionTab('1.7.6')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.7.6' ? 'white' : 'transparent',
                  color: versionTab === '1.7.6' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.7.6' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.7.6 (New)
              </button>
              <button
                onClick={() => setVersionTab('1.7.5')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.7.5' ? 'white' : 'transparent',
                  color: versionTab === '1.7.5' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.7.5' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.7.5
              </button>
              <button
                onClick={() => setVersionTab('1.7.1')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.7.1' ? 'white' : 'transparent',
                  color: versionTab === '1.7.1' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.7.1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.7.1
              </button>
              <button
                onClick={() => setVersionTab('1.7.0')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.7.0' ? 'white' : 'transparent',
                  color: versionTab === '1.7.0' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.7.0' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.7.0
              </button>
              <button
                onClick={() => setVersionTab('1.6.10')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.10' ? 'white' : 'transparent',
                  color: versionTab === '1.6.10' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.10' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.10
              </button>
              <button
                onClick={() => setVersionTab('1.6.9')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.9' ? 'white' : 'transparent',
                  color: versionTab === '1.6.9' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.9' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.9
              </button>
              <button
                onClick={() => setVersionTab('1.6.3')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.3' ? 'white' : 'transparent',
                  color: versionTab === '1.6.3' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.3' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.3
              </button>
              <button
                onClick={() => setVersionTab('1.6.2')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.2' ? 'white' : 'transparent',
                  color: versionTab === '1.6.2' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.2' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.2
              </button>
              <button
                onClick={() => setVersionTab('1.6.1')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.1' ? 'white' : 'transparent',
                  color: versionTab === '1.6.1' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.1
              </button>
              <button
                onClick={() => setVersionTab('1.6.0')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.6.0' ? 'white' : 'transparent',
                  color: versionTab === '1.6.0' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.6.0' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.6.0
              </button>
              <button
                onClick={() => setVersionTab('1.5.6')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.5.6' ? 'white' : 'transparent',
                  color: versionTab === '1.5.6' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.5.6' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                v1.5.6
              </button>
              <button
                onClick={() => setVersionTab('1.5.5')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.5.5' ? 'white' : 'transparent',
                  color: versionTab === '1.5.5' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.5.5' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.5.5
              </button>
              <button
                onClick={() => setVersionTab('1.5.2')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.5.2' ? 'white' : 'transparent',
                  color: versionTab === '1.5.2' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.5.2' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.5.2
              </button>
              <button
                onClick={() => setVersionTab('1.5.1')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.5.1' ? 'white' : 'transparent',
                  color: versionTab === '1.5.1' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.5.1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.5.1
              </button>
              <button
                onClick={() => setVersionTab('1.5')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.5' ? 'white' : 'transparent',
                  color: versionTab === '1.5' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.5' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.5
              </button>
              <button
                onClick={() => setVersionTab('1.3.1')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.3.1' ? 'white' : 'transparent',
                  color: versionTab === '1.3.1' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.3.1' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.3.1
              </button>
              <button
                onClick={() => setVersionTab('1.2')}
                style={{
                  flex: 1,
                  padding: '6px 4px',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: versionTab === '1.2' ? 'white' : 'transparent',
                  color: versionTab === '1.2' ? '#0f172a' : '#64748b',
                  boxShadow: versionTab === '1.2' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                v1.2
              </button>
            </div>
            
            {versionTab === '1.7.6' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 11, 2026 (Latest)</span>
                
                {/* Feature 1: Modern UI Sidebar */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>✨ Modern UI Sidebar Redesign</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Upgraded the sidebar background to a premium light slate gradient, introduced translation hover animations, custom scrollbars, and neon active selection indicators.
                    </p>
                  </div>
                </div>

                {/* Feature 2: User Profile Footer */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>👤 Premium User Profile Footer</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Replaced the static brand label with a dynamic user profile card showing the active user's initials, name, and role.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Safe Data Sync */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fef3c7', color: '#d97706', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔒 Safe Data Synchronization</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Ensured concurrent metadata updates and cell entry changes do not conflict, permanently resolving cache-overwriting bugs.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.7.5' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 11, 2026</span>
                
                {/* Feature 1: PostgreSQL Migration */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔒 PostgreSQL Database Migration</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Migrated from Firebase to PostgreSQL to remove the 1MB document limit, allowing unlimited register sizes, secure ACID transactions, and 10x faster cell edits.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Row Move & Register Sync */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔗 Row Move & Register Auto-Sync</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added support to move rows up/down and automatically synchronize linked registers when the source columns are updated.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Plain Text Excel Export */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fef3c7', color: '#d97706', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📊 Plain Text Excel Export</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Date columns are now exported as plain text (strings) to preserve exact cell inputs (like corrupted serial numbers) and prevent Excel rendering bugs.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.7.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 3, 2026</span>
                
                {/* Feature 1: Prevent Data Overwrite */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔒 Prevent Data Overwrite</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Auto-refresh is now temporarily paused while any edit/add record modal is open. This prevents background synchronization from overwriting your unsaved edits.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Visual Row Highlight */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🌟 Visual Row Highlight</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Navigating to a row from the History page now triggers a smooth yellow pulse animation, making the selected row stand out clearly.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.7.0' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 29, 2026</span>
                
                {/* Feature 1: History to Register Navigation */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔗 Direct History Navigation</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Clicking any history entry card now navigates directly to that row in the Register page. It automatically switches tabs, scrolls the row into view, and highlights it.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Fresh Server Data Fetching */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚡ Stale Cache Bypass</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Enabled direct server fetches for register updates to bypass stale browser cache issues and guarantee 100% real-time data accuracy.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.10' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 29, 2026</span>
                
                {/* Feature 1: Formula Cache Invalidation */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚡ Formula Cache Invalidation</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added automatic cache invalidation for formula results when columns are reordered or moved to ensure formulas always display correct results.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Strict Excel Import Type Guessing */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔒 Strict Excel Import Type Guessing</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Improved Excel type guessing algorithm and strict header keyword verification to prevent numeric columns (e.g. roll numbers, IDs) from being misclassified as dates.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Fractional Date Support */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📅 Fractional Date Support</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added support for parsing Excel serial date numbers containing time fractional parts, guaranteeing precise date conversions on Excel import.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.9' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 29, 2026</span>
                
                {/* Feature 1: High-Speed Entry Data-Loss Fixes */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fee2e2', color: '#dc2626', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🛡️ High-Speed Entry Data-Loss Fixes</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added smart sync-blocking guards during active cell & row additions, preventing background database refreshes from overwriting locally queued unsaved entries.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Dual-Chunk Write Safeguard */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚡ Dual-Chunk Write Safeguard</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Resolved database chunk boundary lag by writing both the current and preceding 50-row chunks in parallel when crossing database chunk boundaries.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Smart Snapshot Merge Logic */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔄 Smart Snapshot Merging</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Extended local row merge behavior to retain and protect recently-added integer ID rows that might be temporarily absent from lagging database snapshots.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Performance Refetch Optimization */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fef3c7', color: '#d97706', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⏱️ Optimized Background Refetching</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Increased database auto-refresh interval from 15s to 60s and disabled disruptive window-focus refetching to eliminate client save race conditions.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.3' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 28, 2026</span>
                
                {/* Feature 1: Concurrency and Safe Data Entry */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🛡️ Safe Data Entry & Auto-Retry</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added auto-retry (up to 3 times) for cell saving to handle transient network issues safely without losing edits.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Browser Close Protection */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🕒 Browser Close Protection (Auto-Flush)</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      A periodic 5-second auto-flush timer automatically saves any pending debounced writes before the tab is closed.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Smart Column Type Changing */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚡ Smart Column Type Changing</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Changes only column metadata for simple type changes without rewriting all entry chunks, avoiding race conditions that cause cell writes to be overwritten.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Excel Date Auto-Detection Keywords */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📅 Excel Date Recognition Safeguards</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Excel serial dates auto-detection now strictly targets headers containing date keywords (date, dob, etc.) to prevent false conversions on IDs.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.2' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 28, 2026</span>
                
                {/* Feature 1: Recycle Bin Optimization */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🗑️ Recycle Bin Speed Optimization</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Recycle Bin loads in milliseconds! By retrieving only metadata folders and bypassing heavy entry documents, database reads are reduced by 99%.
                    </p>
                  </div>
                </div>

                {/* Feature 2: High-Speed History and Admin Reports */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚡ Instant Loading History & Admin Reports</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      History, Active Report, and Activity Logs now use smart batch pagination (1000 items/page) with infinite scrolling, eliminating slow loads and freezing.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Timezone-Aware Filtering */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📅 Timezone-Aware Local Date Matching</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Added Indian Standard Time (IST) timezone-aware matching for date filters so yesterday's logs and reports align perfectly with what you see in the UI.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Auto-Expanding Search */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔍 Smart Auto-Expanding Log Search</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Date and text searches automatically query deeper historical logs in the background if the initial page yields few matches.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 27, 2026</span>
                
                {/* Feature 1: Cell Selection Mode */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📱 Spreadsheet Cell Selection Mode</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Genuine spreadsheet cell focus! Clicking once focuses a cell showing a blue highlight border without popping keyboards. Double click or Enter key toggles active editing.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Keyboard cell traversal */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⌨️ Full Keyboard navigation & Tab Key</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Navigate effortlessly between all cell types (including currency/text fields) using Up/Down/Left/Right arrow keys and Tab/Shift+Tab keys.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Frozen Column Overlapping Fix */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📌 Frozen Columns Overlapping Fix</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Navigating cells slides perfectly! Created a custom scroll helper so selected fields never scroll underneath the locked S.No or frozen columns.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Excel Export Date width Auto-fit */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📊 Excel Date & Photo Column Auto-fit</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Say goodbye to "###" display errors! Downloaded Excel sheets now automatically auto-fit columns based on cell data length and properly restrict image column widths.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.6.0' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 27, 2026</span>
                
                {/* Feature 1: Batched Drag and Drop */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📁 Batched Registers Drag & Drop</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Organize multiple registers at once! Toggle "Select Multiple" in the sidebar, tick registers, and drag them as a single batch to any folder or unassigned zone.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Auto Double Entry Warning */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⚠️ Smart Double Entry Detection</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      No manual toggles needed! Important fields (IDs, Phone numbers, Roll numbers, Emails, etc.) automatically trigger double entry alerts when duplicates &gt;= 3 chars are entered.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Manageable Admin Recycle Bin */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🗑️ Recycle Bin Management & View-Only Mode</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Embedded Recycle Bin into the Admin panel with "Empty Recycle Bin" capabilities. Standard user recycle bin is restricted to a read-only list for security.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Conditional Column Unlinking */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔗 Clear or Keep Unlinked Column Data</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Choose to preserve or wipe clean the cell values on both sides when unlinking connected columns.
                    </p>
                  </div>
                </div>

                {/* Feature 5: Sync User Profile Details */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>👤 Dynamic User Profile & Admin Edits</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Admin can set and update names and phone numbers in the User Settings card, which immediately updates the dynamic fields and role tags in the User Profile.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.5.6' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 26, 2026</span>
                
                {/* Feature 1: Cell Arrow Key Navigation */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>⌨️ Smart Keyboard Cell Navigation</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Navigate registers like a desktop spreadsheet! Click a cell once to focus/highlight, then use <strong>Up/Down/Left/Right arrow keys</strong> to navigate cell-by-cell. Double-click or start typing to edit text inside a cell seamlessly.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Simplified Filter Column Selector */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>🔍 Simplified Column Visibility Filter</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Bypassed the "+ ADD FILTER" step! Clicking the Filter button now displays an <strong>instant, searchable dropdown checklist of columns</strong> to show or hide columns immediately.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Sharp Read-Only Visibility */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>👁️ High-Contrast Read-Only Data</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      No more faded, unreadable text for read-only rows, columns, or tables! Text opacity reduction has been completely removed so read-only dates and record details remain sharp, clear, and highly legible.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Full Excel Export All Columns */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📥 Complete Excel Exports By Default</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Exporting to Excel now includes all columns (including hidden ones) by default with pre-selected options in the export modal, saving extra click steps while downloading.
                    </p>
                  </div>
                </div>

                {/* Feature 5: Expanded Register Titles */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>📌 Full Register Titles View</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Increased title width to 600px, ensuring long register titles (like <em>BE NEW TEST</em>) display fully without being truncated in the header.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.5.5' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 26, 2026</span>
                
                {/* Feature 1: Cloud Image Upload */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#dbeafe', color: '#2563eb', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>☁️ High-Speed Cloud Image Upload</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      All uploaded images are now <strong>automatically compressed and uploaded to secure cloud storage</strong>! Images are stored as clean HTTPS URLs instead of heavy base64 data. This means:<br />
                      • <strong>Excel exports</strong> now contain clickable "View Photo" hyperlinks<br />
                      • <strong>Faster loading</strong> — images load from CDN instead of Firestore<br />
                      • <strong>Smaller database</strong> — URLs are tiny compared to base64 blobs<br />
                      • <strong>Auto-fallback</strong> — if network fails, safely saves as base64
                    </p>
                  </div>
                </div>

                {/* Feature 2: Split-Pane Quick Entry */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Split-Pane Quick Entry Modal</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Redesigned the centered Quick Entry modal into a highly productive split-pane dashboard. View folders & registers on the left, and fill out the active entry form on the right without closing the view! Switch registers with a single click.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Drag-and-Drop Image Uploader */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Drag-and-Drop Image Uploader</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Implemented direct image uploading with client-side Canvas compression inside both the Quick Entry form and the Add Record modal! Select local photos directly, see instant previews, and images are automatically uploaded to the cloud.
                    </p>
                  </div>
                </div>

                {/* Feature 4: Accelerated Continuous Entry */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Accelerated Continuous Multi-Entry Flow</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Keep register selections active after clicking "Save Entry". Inputs automatically clear and the cursor refocuses on the first field, allowing lightning-fast data entry. Dynamic row sequence numbers (e.g. <em>Row #15</em>) are displayed in form headers for clear real-time feedback.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.5.2' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 23, 2026</span>
                
                {/* Feature 1: Intelligent Photo Compression */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Client-Side Image Compression</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      <strong>The Problem:</strong> Mobile photos are huge (2MB to 10MB) and exceeded Firestore's strict 1MB document size limit, causing image uploads to fail or hang silently.<br />
                      <strong>The Solution:</strong> Implemented canvas-based compression in the browser. Large images are resized to 1000px and highly compressed to ~100KB instantly. Photos upload immediately, load faster, and will never crash the database!
                    </p>
                  </div>
                </div>

                {/* Feature 2: High Parity Sync in Rows */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Reliable Photo Save Hooks</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      The compression engine is seamlessly integrated across all four photo upload gateways: direct cell uploads, row details upload, multi-image additions, and preview window additions.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.5.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 23, 2026</span>
                
                {/* Feature 1: Live Mirror Sync */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Dynamic Column Mirroring & Parity</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      The <strong>To (Destination) Column</strong> now displays the exact state of the <strong>From (Source) Column</strong>. Any structural or content updates (Renaming, Column Type modifications, Dropdown option additions, or cell edits/deletions) instantly reflect across the link.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Lock Indicators and Bright Headers */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Full Column Visibility & Lock Icons</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Target linked columns are kept completely bright and clear (no faded styling). A clear Lock icon 🔒 in the header visually marks it as read-only to prevent accidental edits, with a helpful warning toast if clicked.
                    </p>
                  </div>
                </div>

                {/* Feature 3: Connection Unlinking */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Instant Link Disconnection (Unlink Option)</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      You can now detach any linked columns. Clicking the 🔗 Link Details icon opens a premium modal with a <strong>🗑️ Unlink Column</strong> button. Disconnecting a link frees the To column for manual edits, keeping all existing cell values safe.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.5' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 23, 2026</span>
                
                {/* Feature 1: Link Details Modal */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>View Link Details</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Click the Link icon in the column header to see exactly which register and column this column is connected to, and whether it is sending (From) or receiving (To) data.
                    </p>
                  </div>
                </div>

                {/* Feature 2: Auto Link Sync */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Automatic Entry Copy on Linking</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      When you link two columns, all existing entries from the source column are automatically copied over to the destination register's column matching row numbers. No manual copying needed!
                    </p>
                  </div>
                </div>

                {/* Feature 3: S.No Column Spacing, Hover & Click Area Enhancements */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>S.No Column Improvements</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      • Widened the serial number column and reduced the gap between the number and checkbox for a cleaner layout.<br />
                      • The serial number is centered. The checkbox and options menu only show up when you hover directly over the S.No cell, or if a row is selected.<br />
                      • Clicking anywhere in the S.No cell area opens the row details modal (previously you had to click exactly on the number).
                    </p>
                  </div>
                </div>

                {/* Feature 4: Keyboard Navigation Caret Navigation */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Cell Editing Navigation Fix</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      When you are typing inside a cell, pressing Left or Right arrow keys will move your cursor inside the text itself. It will no longer jump to the adjacent cell and interrupt your typing.
                    </p>
                  </div>
                </div>

                {/* Feature 5: Formula Integrity & Protection */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Formula Column Protection & Auto-Update</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      • Formula columns are locked to prevent accidental deletion.<br />
                      • When renaming a column, all formulas using that column update automatically. The selected columns in your formulas and builder are preserved and do not get lost (only the name is updated).
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.3.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 22, 2026</span>
                
                {/* Feature 0: Rapid Saving & Ctrl+S Hotkey */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Rapid Data Protection & Ctrl+S Save Hotkey</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Implemented ultra-fast local state caching and single-chunk Firestore database updates to prevent data loss during rapid data entry. Press <strong>Ctrl + S</strong> at any time to immediately save all pending cell changes.
                    </p>
                  </div>
                </div>

                {/* Feature 0.5: Instant Save Record Optimization */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Instant "Save Record" Performance</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Optimized adding/duplicating records by writing only the newly active data chunk to Firestore instead of rebuilding the entire sheet, reducing database overhead by 90%+ and making record creation instantaneous.
                    </p>
                  </div>
                </div>

                {/* Feature 1 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Column Selection & Preview Mode</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Select columns directly from the column headers via checkboxes, toggle preview mode in the toolbar to focus on selected columns, and limit PDF/Excel exports to the selected columns.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Clear Date Option & Date Protection</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Easily clear date fields using a new "Clear" button in the custom calendar modal, and prevent accidental deletion or corruption of date values from keyboard backspace/delete inputs.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Advanced Audit Logging & History Filtering</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Logs now store detailed user credentials (userId and userEmail). The renamed "History" page allows standard users to only see their own activities, while administrators retain full visibility.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released May 20, 2026</span>
                
                {/* Feature 1 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Row-Level Detail Permissions</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      The view, edit, and download permission checks are now fully enforced at the individual record detail (row modal) level, matching the main sheet rules.
                    </p>
                  </div>
                </div>

                {/* Feature 2 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Dynamic Read-Only Input Control</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Input elements (dropdowns, checkboxes, dates, images, and text inputs) inside the record details modal are dynamically made read-only or disabled when edits are restricted.
                    </p>
                  </div>
                </div>

                {/* Feature 3 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Conditional Button Visibility</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      The "Save Changes" button and download buttons (PDF/Excel) inside the modal are dynamically shown or hidden based on row-level permissions.
                    </p>
                  </div>
                </div>

                {/* Feature 4 */}
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Formula & Settings Protection</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Access to column configuration, column settings, and editing formulas is restricted strictly to sheet administrators to ensure data integrity.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <button 
                onClick={handleCloseVersionModal}
                style={{
                  background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-button)'
                }}
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});
