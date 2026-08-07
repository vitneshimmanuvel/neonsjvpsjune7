import { useCallback, memo, useState, useEffect, useRef, startTransition, useDeferredValue, useMemo } from 'react';
import { Menu, Search, Plus, FileText, X, Folder, FolderOpen, FileSpreadsheet, ClipboardPaste, Pencil, Trash2, PlusCircle, FolderPlus, Bell, User, Activity, LayoutTemplate, LogOut, CloudUpload, Clock, CheckCircle2, HelpCircle, XCircle, Shield, Sparkles, PenLine, ChevronDown, ChevronRight, ArrowLeft, Check, Loader2, Play, Pause, ChevronLeft, Sun, Moon, Monitor, BookMarked, Database, RefreshCw, Maximize2, Minimize2, Download, Bookmark, Filter, MoreVertical, UserCheck, ShieldAlert, PenTool, Tag, Calendar, Phone, ArrowUpDown, Eye, Lock as LockIcon, Paperclip, Users, Zap, GripVertical, BookOpen, CreditCard } from 'lucide-react';
import { toggleFullscreen, enableFullscreen } from '../../lib/fullscreen';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth';
import type { RegisterSummary, Business } from '../../lib/api';
import { getRegister, getRegisterColumnsOnly, addEntry, formatDateToDDMMYYYY, listFolders, createFolder, renameFolder, deleteFolder, moveRegisterToFolder, moveRegistersToFolder, duplicateRegister, searchAllRegisters, canUserSelectBackDates } from '../../lib/api';
import toast from 'react-hot-toast';
import { ImageCompressionModule } from '../../lib/imageCompressionModule';
import { firebaseLogWorkspaceAction, sendPresenceHeartbeat, firebaseGetOnlineUsers, firebaseGetUsers, firebaseGetActivity, type OnlineUserItem } from '../../lib/firebaseAuth';
import { DatePickerModal } from '../register/modals/DatePickerModal';
import { RearrangeModal } from '../common/RearrangeModal';
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
  sidebarWidth = 260,
  isCollapsed,
  toggleCollapse,
  unreadCount,
  onToggleNotifications
}: SidebarProps) {
  const navigate = useNavigate();
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'monitor'>(() => {
    try {
      return (localStorage.getItem('theme-mode') as 'light' | 'dark' | 'monitor') || 'light';
    } catch {
      return 'light';
    }
  });

  const toggleThemeMode = useCallback(() => {
    const nextMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'monitor' : 'light';
    setThemeMode(nextMode);
    try {
      document.documentElement.classList.remove('light', 'dark', 'monitor');
      document.documentElement.classList.add(nextMode);
      localStorage.setItem('theme-mode', nextMode);
    } catch (e) {
      console.error('Failed to set theme mode:', e);
    }
  }, [themeMode]);

  const { id: currentRegId } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canSelectBackDates = canUserSelectBackDates(user);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderMenuId, setFolderMenuId] = useState<number | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedRegIds, setSelectedRegIds] = useState<Set<number>>(new Set());
  const [showRearrangeModal, setShowRearrangeModal] = useState(false);
  const [orderNonce, setOrderNonce] = useState(0);


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
  const [quickEntryDateCol, setQuickEntryDateCol] = useState<{ colId: string; val: string; rect?: DOMRect } | null>(null);

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
  const isSystemAdmin = (authUser as any)?.role === 'admin' || (authUser as any)?.role === 'superadmin' || (authUser as any)?.permissions?.isAdmin;
  const location = useLocation();
  const [showOnlineUsersModal, setShowOnlineUsersModal] = useState(false);

  const { data: register } = useQuery({
    queryKey: ['register', Number(currentRegId)],
    queryFn: () => getRegister(Number(currentRegId)),
    enabled: !!currentRegId,
  });

  useEffect(() => {
    if (!(authUser as any)?.id) return;

    const pathname = location.pathname;
    let activityDesc = 'Browsing workspace';
    if (register?.name) {
      activityDesc = `Viewing register: ${register.name}`;
    } else if (currentRegId) {
      activityDesc = `Viewing register #${currentRegId}`;
    } else if (pathname.startsWith('/folder/')) {
      activityDesc = 'Browsing folder';
    } else if (pathname.startsWith('/admin')) {
      activityDesc = 'Managing admin dashboard';
    } else if (pathname === '/') {
      activityDesc = 'Browsing registers (Home)';
    }

    sendPresenceHeartbeat({
      userId: (authUser as any).id,
      userName: (authUser as any).name || 'User',
      email: (authUser as any).email || '',
      role: (authUser as any).role || 'user',
      avatar: (authUser as any).avatar || '',
      currentActivity: activityDesc
    });

    const interval = setInterval(() => {
      sendPresenceHeartbeat({
        userId: (authUser as any).id,
        userName: (authUser as any).name || 'User',
        email: (authUser as any).email || '',
        role: (authUser as any).role || 'user',
        avatar: (authUser as any).avatar || '',
        currentActivity: activityDesc
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [authUser, currentRegId, register?.name, location.pathname]);

  const { data: folders = [] } = useQuery({
    queryKey: ['folders', businessId],
    queryFn: () => listFolders(businessId!),
    enabled: !!businessId,
  });

  const sortedFolders = useMemo(() => {
    const allowed = folders.filter(f => {
      if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return true;
      const allowedFolders = (user as any).permissions?.allowedFolders;
      const isFolderAllowed = Array.isArray(allowedFolders) && allowedFolders.map(String).includes(f.id.toString());
      const hasChildRegAllowed = (filtered || []).some(r => r.folderId === f.id);
      return isFolderAllowed || hasChildRegAllowed;
    });
    const customOrder: number[] = (() => {
      try { return JSON.parse(localStorage.getItem('admin_folder_order') || '[]'); } catch { return []; }
    })();
    if (customOrder.length === 0) return allowed;
    const orderMap = new Map(customOrder.map((id, index) => [id, index]));
    return [...allowed].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return posA - posB;
    });
  }, [folders, user, filtered, orderNonce]);

  const sortedFiltered = useMemo(() => {
    if (!filtered) return [];
    const customRegOrder: number[] = (() => {
      try { return JSON.parse(localStorage.getItem('admin_register_order') || '[]'); } catch { return []; }
    })();
    if (customRegOrder.length === 0) return filtered;
    const regOrderMap = new Map(customRegOrder.map((id, index) => [id, index]));
    return [...filtered].sort((a, b) => {
      const posA = regOrderMap.has(a.id) ? regOrderMap.get(a.id)! : 9999;
      const posB = regOrderMap.has(b.id) ? regOrderMap.get(b.id)! : 9999;
      return posA - posB;
    });
  }, [filtered, orderNonce]);

  // Folder Drag-and-Drop Reordering state
  const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'top' | 'bottom' | null>(null);

  const handleFolderReorder = useCallback((fromId: number, toId: number, insertAfter: boolean) => {
    const currentFolderIds = sortedFolders.map(f => f.id);
    const fromIdx = currentFolderIds.indexOf(fromId);
    if (fromIdx === -1) return;
    currentFolderIds.splice(fromIdx, 1);
    let toIdx = currentFolderIds.indexOf(toId);
    if (toIdx === -1) return;
    if (insertAfter) toIdx += 1;
    currentFolderIds.splice(toIdx, 0, fromId);

    try {
      localStorage.setItem('admin_folder_order', JSON.stringify(currentFolderIds));
    } catch (e) {
      console.error('Failed to save folder order:', e);
    }
    setOrderNonce(n => n + 1);
    toast.success('Folder order updated', { duration: 1500 });
  }, [sortedFolders]);

  // Fullscreen mode state & listener
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const [isQuickToolsOpen, setIsQuickToolsOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(() => {
    try {
      return localStorage.getItem('seen_version_2.8') !== 'true';
    } catch {
      return false;
    }
  });
  const [versionTab, setVersionTab] = useState<'2.8' | '2.7' | '2.6' | '2.2' | '2.1' | '2.0.1' | '2.0' | '1.9.7' | '1.9.6' | '1.9.5' | '1.8.8' | '1.8.7' | '1.8.5' | '1.8.2' | '1.8.1' | '1.8.0' | '1.7.9' | '1.7.7'>('2.8');
  const [showOlderVersionsDropdown, setShowOlderVersionsDropdown] = useState(false);
  
  // Slideshow state
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const handleCloseVersionModal = useCallback(() => {
    setShowVersionModal(false);
    try {
      localStorage.setItem('seen_version_2.8', 'true');
      localStorage.setItem('seen_version_2.7', 'true');
      localStorage.setItem('seen_version_2.6', 'true');
      localStorage.setItem('seen_version_2.2', 'true');
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    const isSlideshowVersion = versionTab === '2.8' || versionTab === '2.7' || versionTab === '2.6' || versionTab === '2.2' || versionTab === '2.1' || versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7';
    if (!isSlideshowVersion || !showVersionModal || !isPlaying) return;
    const slideCount = versionTab === '2.8' ? 3 : (versionTab === '2.7' ? 1 : (versionTab === '2.6' ? 4 : (versionTab === '2.2' ? 5 : (versionTab === '2.1' ? 4 : (versionTab === '2.0.1' ? 3 : (versionTab === '2.0' ? 6 : (versionTab === '1.9.7' ? 4 : (versionTab === '1.9.6' ? 5 : (versionTab === '1.9.5' ? 10 : (versionTab === '1.8.8' ? 3 : 5))))))))));
    const interval = setInterval(() => {
      setActiveSlide(prev => (prev + 1) % slideCount);
    }, 4500);
    return () => clearInterval(interval);
  }, [versionTab, showVersionModal, isPlaying]);

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

  const filteredSearchResults = useMemo(() => {
    if (!searchResults) return [];
    if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return searchResults;
    const allowedRegs = (user as any).permissions?.allowedRegisters;
    if (Array.isArray(allowedRegs)) {
      return searchResults.filter(r => allowedRegs.map(String).includes(String(r.registerId)));
    }
    const allowedFolders = (user as any).permissions?.allowedFolders;
    if (Array.isArray(allowedFolders)) {
      return searchResults.filter(r => r.folderId && allowedFolders.map(String).includes(String(r.folderId)));
    }
    return [];
  }, [searchResults, user]);


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
      toast.success('Moved register to folder');
    },
    onError: () => {
      toast.error('Failed to move register');
    }
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
              if (folderMenuId) {
                navigate(`/folder/${folderMenuId}`);
                closeSidebar();
              }
              setFolderMenuId(null);
            }}>
              <Eye size={16} />Open Folder Page
            </button>
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
        <style>{`
          @keyframes livePulseDot {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          @keyframes iconTilt {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(-14deg) scale(1.15); }
            75% { transform: rotate(12deg) scale(1.15); }
            100% { transform: rotate(0deg); }
          }
          @keyframes sbDropdownIn {
            from { opacity: 0; transform: translateY(-8px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .sidebar-add-dropdown {
            animation: sbDropdownIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .sb-dd-item {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 8px 10px !important;
            border-radius: 10px !important;
            border: none !important;
            background: transparent !important;
            color: #0f172a !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            width: 100% !important;
            text-align: left !important;
          }
          .sb-dd-item:hover {
            background: #f1f5f9 !important;
            transform: translateX(3px) !important;
          }
          .sb-dd-item:hover .sb-dd-icon-box {
            transform: scale(1.12) !important;
          }
          .sb-dd-icon-box {
            width: 32px !important;
            height: 32px !important;
            border-radius: 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          .sb-dd-icon-box.blue { background: #eff6ff !important; color: #2563eb !important; }
          .sb-dd-icon-box.amber { background: #fffbeb !important; color: #d97706 !important; }
          .sb-dd-icon-box.green { background: #f0fdf4 !important; color: #16a34a !important; }
          .sb-dd-icon-box.orange { background: #fff7ed !important; color: #ea580c !important; }
          @keyframes sbFooterMenuIn {
            from { opacity: 0; transform: translateY(10px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          .sb-footer-popup {
            animation: sbFooterMenuIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .sb-footer-item {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 8px 10px !important;
            border-radius: 10px !important;
            border: none !important;
            background: transparent !important;
            color: #0f172a !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;
            width: 100% !important;
            text-align: left !important;
          }
          .sb-footer-item:hover {
            background: #f1f5f9 !important;
            transform: translateX(4px) !important;
          }
          .sb-footer-item:hover .sb-ft-icon-box {
            transform: scale(1.12) !important;
          }
          .sb-ft-icon-box {
            width: 30px !important;
            height: 30px !important;
            border-radius: 8px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
          }
          .sb-ft-icon-box.blue { background: #eff6ff !important; color: #2563eb !important; }
          .sb-ft-icon-box.purple { background: #f3e8ff !important; color: #9333ea !important; }
          .sb-ft-icon-box.rose { background: #ffe4e6 !important; color: #e11d48 !important; }
          .sb-ft-icon-box.indigo { background: #e0e7ff !important; color: #4f46e5 !important; }
          .sb-ft-icon-box.emerald { background: #dcfce7 !important; color: #16a34a !important; }
          .sb-ft-icon-box.violet { background: #f3e8ff !important; color: #7c3aed !important; }
          .sb-ft-icon-box.red { background: #fff1f2 !important; color: #e11d48 !important; }
          .sb-footer-item.logout {
            color: #e11d48 !important;
          }
          .sb-footer-item.logout:hover {
            background: #fff1f2 !important;
          }
          .sb-action-btn {
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .sb-action-add {
            background: linear-gradient(135deg, #0b2545 0%, #134074 50%, #0066cc 100%) !important;
            background-size: 200% 200% !important;
            color: #ffffff !important;
            border: none !important;
            box-shadow: 0 3px 10px rgba(0, 102, 204, 0.25) !important;
          }
          .sb-action-add:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 20px rgba(0, 102, 204, 0.4) !important;
          }
          .sb-action-add:hover .sb-add-icon {
            transform: rotate(90deg) scale(1.15);
          }
          .sb-add-icon {
            transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .sb-action-entry {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%) !important;
            border: 1px solid #a7f3d0 !important;
            color: #047857 !important;
            box-shadow: 0 2px 6px rgba(16, 185, 129, 0.1) !important;
          }
          .sb-action-entry:hover {
            background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%) !important;
            border-color: #6ee7b7 !important;
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 18px rgba(16, 185, 129, 0.28) !important;
          }
          .sb-action-entry:hover .sb-entry-icon {
            animation: iconTilt 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .sb-search-wrap {
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
            border: 1px solid #cbd5e1 !important;
            background: #f8fafc !important;
          }
          .sb-search-wrap:hover {
            border-color: #94a3b8 !important;
            background: #ffffff !important;
          }
          .sb-search-wrap:focus-within {
            border-color: #2563eb !important;
            background: #ffffff !important;
            box-shadow: 0 0 0 3.5px rgba(37, 99, 235, 0.14), 0 3px 12px rgba(0, 0, 0, 0.05) !important;
          }
          .sb-search-wrap:focus-within .sb-search-icon {
            color: #2563eb !important;
            transform: scale(1.12);
          }
          .sb-search-icon {
            transition: all 0.2s ease;
          }
          .sb-tool-btn {
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
          }
          .sb-tool-btn:hover {
            transform: translateY(-2px) scale(1.05) !important;
            background: #ffffff !important;
            border-color: #cbd5e1 !important;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08) !important;
          }
        `}</style>

        <div className="sidebar-brand" style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="sidebar-brand-group" onClick={() => navigate('/')} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
              <img src="/logo-transparent.png" alt="AG Trust" className="sidebar-brand-logo" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain', transition: 'transform 0.2s ease' }} />
              {!isCollapsed && (
                <div className="sidebar-brand-text">
                  <div className="sidebar-brand-name" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                    AG <span style={{ color: 'var(--accent)' }}>Trust</span>
                  </div>
                  <div className="sidebar-brand-sub" style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                    Record Book
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-brand-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
            <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} style={{ display: isMobile ? 'flex' : 'none' }}>
              <X size={18} />
            </button>

            {!isCollapsed && (
              <>
                {/* Notifications Bell */}
                <button
                  className="sidebar-collapse-btn sb-tool-btn"
                  onClick={() => onToggleNotifications()}
                  title="Notifications"
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '9px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <Bell size={15} />
                  {unreadCount > 0 && (
                    <span className="notif-badge" style={{ position: 'absolute', top: '-4px', right: '-4px' }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Quick Tools Dropdown Button */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="sidebar-collapse-btn sb-tool-btn"
                    onClick={() => setIsQuickToolsOpen(!isQuickToolsOpen)}
                    title="Quick Tools (Theme, Fullscreen, Online Users)"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '9px',
                      border: `1px solid ${isQuickToolsOpen ? '#bfdbfe' : '#e2e8f0'}`,
                      background: isQuickToolsOpen ? '#eff6ff' : '#f8fafc',
                      color: isQuickToolsOpen ? '#2563eb' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <MoreVertical size={15} />
                  </button>

                  {isQuickToolsOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                        onClick={() => setIsQuickToolsOpen(false)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: '38px',
                          right: '0',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '12px',
                          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                          zIndex: 1000,
                          minWidth: '210px',
                          padding: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px'
                        }}
                      >
                        <button
                          className="context-item"
                          onClick={() => { toggleFullscreen(); setIsQuickToolsOpen(false); }}
                          style={{
                            padding: '9px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            fontSize: '13px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#0f172a'
                          }}
                        >
                          {isFullscreen ? <Minimize2 size={16} color="#2563eb" /> : <Maximize2 size={16} color="#2563eb" />}
                          <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Mode (F11)'}</span>
                        </button>

                        <button
                          className="context-item"
                          onClick={() => { toggleThemeMode(); setIsQuickToolsOpen(false); }}
                          style={{
                            padding: '9px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            fontSize: '13px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#0f172a'
                          }}
                        >
                          {themeMode === 'light' ? (
                            <Sun size={16} color="#f59e0b" />
                          ) : themeMode === 'dark' ? (
                            <Moon size={16} color="#8b5cf6" />
                          ) : (
                            <Monitor size={16} color="#64748b" />
                          )}
                          <span>Theme: {themeMode.charAt(0).toUpperCase() + themeMode.slice(1)}</span>
                        </button>

                        {isSystemAdmin && (
                          <button
                            className="context-item"
                            onClick={() => { setShowOnlineUsersModal(true); setIsQuickToolsOpen(false); }}
                            style={{
                              padding: '9px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              width: '100%',
                              fontSize: '13px',
                              borderRadius: '8px',
                              fontWeight: 600,
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              color: '#0f172a'
                            }}
                          >
                            <div style={{ position: 'relative', display: 'inline-flex' }}>
                              <Users size={16} color="#10b981" />
                              <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '6px', height: '6px', backgroundColor: '#10b981', borderRadius: '50%' }} />
                            </div>
                            <span>Online Users & Activity</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            <button
              className="sidebar-collapse-btn sb-tool-btn"
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              {isCollapsed ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="13 8 17 12 13 16"></polyline></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="11 8 7 12 11 16"></polyline></svg>
              )}
            </button>
          </div>
        </div>

        {/* Actions Bar — Combined +Add and Entry buttons side-by-side with micro-animations */}
        {!isCollapsed ? (
          <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            {(isSystemAdmin || (authUser as any)?.role === 'sheet_admin' || (authUser as any)?.permissions?.canCreateSheets) && (
              <div style={{ flex: 1.1, position: 'relative' }}>
                <button
                  className="sidebar-add-btn sb-action-btn sb-action-add"
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  title="Add new register or file"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={15} strokeWidth={2.8} className="sb-add-icon" /> <span className="sidebar-add-text">Add</span>
                </button>

                {isAddMenuOpen && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                      onClick={() => setIsAddMenuOpen(false)}
                    />
                    <div
                      className="sidebar-add-dropdown"
                      style={{
                        position: 'absolute',
                        top: '46px',
                        left: '0',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px',
                        boxShadow: '0 16px 36px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.04)',
                        zIndex: 1000,
                        minWidth: '215px',
                        whiteSpace: 'nowrap',
                        padding: '6px',
                      }}
                    >
                      <div style={{ padding: '6px 12px 6px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        Create & Import
                      </div>

                      <button className="sb-dd-item" onClick={() => { navigate('/templates'); setIsAddMenuOpen(false); }}>
                        <div className="sb-dd-icon-box blue"><PlusCircle size={16} /></div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>New Register</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Create custom register</div>
                        </div>
                      </button>

                      <button className="sb-dd-item" onClick={() => { setIsCreatingFolder(true); setIsAddMenuOpen(false); }}>
                        <div className="sb-dd-icon-box amber"><FolderPlus size={16} /></div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>New File</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Create folder container</div>
                        </div>
                      </button>

                      <label className="sb-dd-item" style={{ cursor: 'pointer' }}>
                        <div className="sb-dd-icon-box green"><FileSpreadsheet size={16} /></div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Input Excel</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Import .xlsx or .csv</div>
                        </div>
                        <input type="file" accept=".xlsx, .xls, .csv" className="hidden-file-input" onChange={(e) => { onInputExcel?.(e); setIsAddMenuOpen(false); }} style={{ display: 'none' }} />
                      </label>

                      <button className="sb-dd-item" onClick={() => { onInputFolder?.(); setIsAddMenuOpen(false); }}>
                        <div className="sb-dd-icon-box orange"><Folder size={16} fill="#ffedd5" color="#ea580c" /></div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Input File</div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Import register file</div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={() => setIsEntryPanelOpen(true)}
              className="sb-action-btn sb-action-entry"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '9px 12px',
                borderRadius: '10px',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="Quick add entry to any register"
            >
              <PenLine size={15} className="sb-entry-icon" />
              <span>Entry</span>
            </button>
          </div>
        ) : (
          (isSystemAdmin || (authUser as any)?.role === 'sheet_admin' || (authUser as any)?.permissions?.canCreateSheets) && (
            <div className="sidebar-add-section" style={{ padding: '8px', position: 'relative' }}>
              <button
                className="sidebar-add-btn sb-action-btn sb-action-add"
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                title="Add new item"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px',
                  borderRadius: '10px'
                }}
              >
                <Plus size={16} strokeWidth={2.8} className="sb-add-icon" />
              </button>

              {isAddMenuOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                    onClick={() => setIsAddMenuOpen(false)}
                  />
                  <div
                    className="sidebar-add-dropdown"
                    style={{
                      position: 'absolute',
                      top: '0',
                      left: 'calc(100% + 8px)',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      boxShadow: '0 16px 36px rgba(15, 23, 42, 0.16), 0 4px 12px rgba(0, 0, 0, 0.04)',
                      zIndex: 1000,
                      minWidth: '215px',
                      whiteSpace: 'nowrap',
                      padding: '6px'
                    }}
                  >
                    <div style={{ padding: '6px 12px 6px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Create & Import
                    </div>

                    <button className="sb-dd-item" onClick={() => { navigate('/templates'); setIsAddMenuOpen(false); }}>
                      <div className="sb-dd-icon-box blue"><PlusCircle size={16} /></div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>New Register</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Create custom register</div>
                      </div>
                    </button>

                    <button className="sb-dd-item" onClick={() => { setIsCreatingFolder(true); setIsAddMenuOpen(false); }}>
                      <div className="sb-dd-icon-box amber"><FolderPlus size={16} /></div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>New File</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Create folder container</div>
                      </div>
                    </button>

                    <label className="sb-dd-item" style={{ cursor: 'pointer' }}>
                      <div className="sb-dd-icon-box green"><FileSpreadsheet size={16} /></div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Input Excel</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Import .xlsx or .csv</div>
                      </div>
                      <input type="file" accept=".xlsx, .xls, .csv" className="hidden-file-input" onChange={(e) => { onInputExcel?.(e); setIsAddMenuOpen(false); }} style={{ display: 'none' }} />
                    </label>

                    <button className="sb-dd-item" onClick={() => { onInputFolder?.(); setIsAddMenuOpen(false); }}>
                      <div className="sb-dd-icon-box orange"><Folder size={16} fill="#ffedd5" color="#ea580c" /></div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Input File</div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Import register file</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        )}

        {/* Global Search Bar with animated glow and shortcut hint */}
        {!isCollapsed && (
          <div style={{ padding: '4px 12px 10px' }}>
            <div
              className="gs-input-wrap sb-search-wrap"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8.5px 12px',
                borderRadius: '11px'
              }}
            >
              <Search size={14} className="sb-search-icon" style={{ color: '#94a3b8', flexShrink: 0 }} />
              <input
                placeholder="Search all registers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: '12.5px',
                  color: '#0f172a',
                  fontWeight: 500
                }}
                autoComplete="off"
              />
              {!search && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#94a3b8',
                    background: '#e2e8f0',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    lineHeight: 1,
                    letterSpacing: '0.3px',
                    pointerEvents: 'none',
                    userSelect: 'none'
                  }}
                >
                  ⌘K
                </span>
              )}
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    border: 'none',
                    background: '#e2e8f0',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    padding: 0,
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15) rotate(90deg)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1) rotate(0)'}
                  title="Clear search"
                >
                  <X size={11} />
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
                      {f.status === 'uploading' && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }}></span>}
                      {f.status === 'success' && <CheckCircle2 size={12} color="var(--secondary)" />}
                      {f.status === 'error' && <XCircle size={12} color="var(--primary)" />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-list sidebar-list--local" style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}>
          {search.trim().length > 0 ? (
            <>
              {/* Status line */}
              <div className="gs-status">
                {search.trim().length < 2
                  ? 'Type at least 2 characters…'
                  : isSearching
                    ? 'Searching…'
                    : `${filteredSearchResults?.length || 0} results`}
                {isSearching && <div className="gs-status-bar" />}
              </div>

              {/* Results */}
              {filteredSearchResults?.map((res, i) => (
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
              {!isSearching && deferredSearch.trim().length >= 2 && (!filteredSearchResults || filteredSearchResults.length === 0) && (
                <div className="gs-empty">No results for "{search}"</div>
              )}
            </>
          ) : (
            <>

              {sortedFolders.map(folder => {
                const folderRegs = sortedFiltered.filter(r => r.folderId === folder.id);
                const isExpanded = expandedFolders[folder.id];

                return (
                  <div key={folder.id} className="sidebar-folder-group">
                    <div
                      className="sidebar-folder-header"
                      draggable={true}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDraggedFolderId(folder.id);
                        e.dataTransfer.setData('application/json', JSON.stringify({ type: 'FOLDER', folderId: folder.id }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedFolderId(null);
                        setDragOverFolderId(null);
                        setDragOverPosition(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        const rawTypes = Array.from(e.dataTransfer.types);
                        const isFolderDrag = rawTypes.includes('application/json') || draggedFolderId !== null;

                        if (isFolderDrag && (draggedFolderId || rawTypes.includes('application/json'))) {
                          if (draggedFolderId && draggedFolderId === folder.id) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const isBottom = e.clientY - rect.top > rect.height / 2;
                          setDragOverFolderId(folder.id);
                          setDragOverPosition(isBottom ? 'bottom' : 'top');
                        } else {
                          e.currentTarget.classList.add('drag-over');
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('drag-over');
                        if (dragOverFolderId === folder.id) {
                          setDragOverFolderId(null);
                          setDragOverPosition(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('drag-over');

                        // Check if dropping a folder for position reordering
                        let folderDragData: any = null;
                        try {
                          const raw = e.dataTransfer.getData('application/json');
                          if (raw) folderDragData = JSON.parse(raw);
                        } catch {}

                        if ((folderDragData && folderDragData.type === 'FOLDER') || draggedFolderId !== null) {
                          const fromId = folderDragData?.folderId ? Number(folderDragData.folderId) : draggedFolderId;
                          if (fromId && fromId !== folder.id) {
                            handleFolderReorder(fromId, folder.id, dragOverPosition === 'bottom');
                          }
                          setDraggedFolderId(null);
                          setDragOverFolderId(null);
                          setDragOverPosition(null);
                          return;
                        }

                        // Otherwise, dropping a register INTO folder
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
                        setDraggedFolderId(null);
                        setDragOverFolderId(null);
                        setDragOverPosition(null);
                      }}
                      onClick={() => {
                        setExpandedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }));
                        startTransition(() => { navigate(`/folder/${folder.id}`); closeSidebar(); });
                      }}
                      style={{
                        position: 'relative',
                        cursor: 'grab',
                        transition: 'all 0.15s ease',
                        borderTop: (dragOverFolderId === folder.id && dragOverPosition === 'top') ? '2px solid #2563eb' : undefined,
                        borderBottom: (dragOverFolderId === folder.id && dragOverPosition === 'bottom') ? '2px solid #2563eb' : undefined,
                        background: (dragOverFolderId === folder.id) ? '#eff6ff' : undefined,
                        opacity: (draggedFolderId === folder.id) ? 0.45 : 1,
                      }}
                      data-tooltip={isCollapsed ? folder.name : undefined}
                    >
                      {!isCollapsed && (
                        <GripVertical
                          size={13}
                          style={{
                            color: '#94a3b8',
                            flexShrink: 0,
                            opacity: 0.5,
                            marginRight: '-2px'
                          }}
                        />
                      )}
                      {isExpanded ? (
                        <FolderOpen size={16} fill="#fbbf24" color="#f59e0b" className="folder-icon" />
                      ) : (
                        <Folder size={16} fill="#fbbf24" color="#f59e0b" className="folder-icon" />
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
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
                {sortedFiltered.filter(r => !r.folderId).map(reg => renderRegister(reg, 0))}
              </div>

              {/* Rearrange Modal */}
              <RearrangeModal
                isOpen={showRearrangeModal}
                onClose={() => setShowRearrangeModal(false)}
                folders={folders}
                registers={filtered || []}
                onSaveOrder={() => setOrderNonce(n => n + 1)}
              />
            </>
          )}
        </div>

        {/* The old bottom search bar has been removed and replaced by the top search bar. */}

        <div
          className={`sidebar-footer-profile ${isFooterMenuOpen ? 'open' : ''}`}
          onClick={() => setIsFooterMenuOpen(v => !v)}
        >
          <div className="sidebar-profile-avatar" style={{ overflow: 'hidden', padding: 0 }}>
            {(user as any)?.avatar ? (
              <img src={(user as any).avatar} alt={user?.name || 'User'} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'U')
            )}
          </div>
          {!isCollapsed && (
            <div className="sidebar-profile-info">
              <span className="sidebar-profile-name">{user?.name || user?.email || 'User'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '1px' }}>
                <span className="sidebar-profile-role">
                  {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sheet_admin' ? 'Staff' : 'User'}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--brand-blue)',
                    backgroundColor: 'var(--brand-blue-light)',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'inline-block',
                    flexShrink: 0
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setVersionTab('2.6');
                    setActiveSlide(0); // Reset slideshow to first slide
                    setShowVersionModal(true);
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = '#bfdbfe';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = 'var(--brand-blue-light)';
                  }}
                  title="View what's new in v2.7"
                >
                  v2.7
                </span>
              </div>
            </div>
          )}
          {!isCollapsed && (
            <ChevronDown size={14} className={`sidebar-profile-chevron ${isFooterMenuOpen ? 'open' : ''}`} />
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
              className="sb-footer-popup"
              style={{
                position: 'absolute',
                bottom: '64px',
                left: '8px',
                width: '250px',
                background: '#ffffff',
                borderRadius: '16px',
                boxShadow: '0 20px 48px rgba(15, 23, 42, 0.18), 0 4px 14px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                padding: '6px',
                zIndex: 1001,
                border: '1px solid #e2e8f0',
              }}
            >
              {/* Top User Profile Header Card */}
              <div style={{
                padding: '10px 12px',
                marginBottom: '4px',
                background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0b2545 0%, #0066cc 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  {(user as any)?.avatar ? (
                    <img src={(user as any).avatar} alt={user?.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (user?.name || user?.email || 'U')[0].toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name || 'User'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email || 'User Account'}
                  </div>
                </div>
              </div>

              <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); navigate('/profile'); }}>
                <div className="sb-ft-icon-box blue"><User size={15} /></div>
                <span>Profile & Account</span>
              </button>

              <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); navigate('/history'); }}>
                <div className="sb-ft-icon-box purple"><Activity size={15} /></div>
                <span>Activity History</span>
              </button>

              <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); navigate('/recycle-bin'); }}>
                <div className="sb-ft-icon-box rose"><Trash2 size={15} /></div>
                <span>Recycle Bin</span>
              </button>

              <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); navigate('/templates'); }}>
                <div className="sb-ft-icon-box indigo"><LayoutTemplate size={15} /></div>
                <span>Templates</span>
              </button>

              <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); navigate('/backup'); }}>
                <div className="sb-ft-icon-box emerald"><CloudUpload size={15} /></div>
                <span>Backup & Restore</span>
              </button>

              {isSystemAdmin && (
                <button className="sb-footer-item" onClick={() => { setIsFooterMenuOpen(false); sessionStorage.removeItem('admin_workspace_mode'); navigate('/admin/dashboard'); }}>
                  <div className="sb-ft-icon-box violet"><Shield size={15} /></div>
                  <span style={{ fontWeight: 700, color: '#7c3aed' }}>Admin Dashboard</span>
                </button>
              )}

              <div style={{ height: '1px', background: '#f1f5f9', margin: '4px 6px' }} />

              <button className="sb-footer-item logout" onClick={() => { setIsFooterMenuOpen(false); logout(); navigate('/login'); }}>
                <div className="sb-ft-icon-box red"><LogOut size={15} /></div>
                <span>Logout</span>
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
                background: 'var(--surface)',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 0 0 1px var(--border-v)',
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
                  borderRight: isMobile ? 'none' : '1px solid var(--border)',
                  flexShrink: 0,
                  background: 'var(--surface)',
                  height: '100%',
                }}>
                  {/* Header */}
                  <div style={{
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid var(--border-light)',
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
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--foreground)' }}>Quick Entry</h3>
                        <span style={{ fontSize: '12px', color: 'var(--muted-light)' }}>
                          {entrySavedCount > 0 ? `${entrySavedCount} entries saved` : 'Select a register below'}
                        </span>
                      </div>
                    </div>
                    {(isMobile || !entrySelectedReg) && (
                      <button
                        onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
                        style={{
                          background: 'var(--bg-secondary)',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '6px',
                          color: 'var(--muted-light)',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--border)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Search */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
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
                          color: 'var(--foreground)',
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
                              backgroundColor: isSelected ? 'var(--quick-entry-selected-bg)' : 'transparent',
                              borderLeft: isSelected ? '3px solid var(--quick-entry-selected-icon)' : 'none',
                              paddingLeft: isSelected ? `${(indent || 12) - 3}px` : `${indent || 12}px`,
                              transform: isSelected ? 'translateX(2px)' : 'none',
                            }}
                            onMouseEnter={e => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
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
                              background: isSelected ? 'var(--quick-entry-selected-icon-bg)' : (reg.iconColor ? `${reg.iconColor}15` : 'var(--bg-secondary)'),
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              <FileText size={14} color={isSelected ? 'var(--quick-entry-selected-icon)' : (reg.iconColor || 'var(--muted-light)')} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--quick-entry-selected-text)' : 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reg.name}</div>
                              <div style={{ fontSize: '11px', color: isSelected ? 'var(--quick-entry-selected-icon)' : 'var(--muted-light)', opacity: isSelected ? 0.8 : 1 }}>{reg.entryCount} entries</div>
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
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-hover)'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  {isExp ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                                  <Folder size={15} fill="#fbbf24" color="#f59e0b" />
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{folder.name}</span>
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
                  background: 'var(--background)',
                }}>
                  {entrySelectedReg ? (
                    <>
                      {/* Header with Back button */}
                      <div style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'var(--surface)',
                      }}>
                        <button
                          onClick={() => { setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntryExistingEntries([]); }}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            color: 'var(--muted-light)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--border)'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
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
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                            background: 'var(--bg-secondary)',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            color: 'var(--muted-light)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.15s',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--border)'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                        >
                          <X size={16} />
                        </button>
                      </div>

                      {entryLoading ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', flexDirection: 'column', gap: '12px', background: 'var(--surface)' }}>
                          <Loader2 size={28} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: '13px', color: '#94a3b8' }}>Loading columns…</span>
                        </div>
                      ) : (
                        <>
                          {/* Form Fields */}
                          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', background: 'var(--surface)' }}>
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
                                      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                                          borderRadius: '8px', border: '1px solid var(--border)',
                                          background: 'var(--surface)', color: 'var(--foreground)',
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
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'var(--background)',
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
                                            border: '2px dashed var(--border)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            background: 'var(--bg-secondary)',
                                            transition: 'all 0.15s',
                                            boxSizing: 'border-box',
                                            padding: '16px',
                                          }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.backgroundColor = '#f0fdf4'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'; }}
                                          >
                                            {entryUploadingImageCol === colIdStr ? (
                                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <Loader2 size={24} color="#16a34a" style={{ animation: 'spin 1s linear infinite' }} />
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>Uploading & compressing...</span>
                                              </div>
                                            ) : (
                                              <>
                                                <CloudUpload size={24} color="var(--muted-light)" style={{ marginBottom: '6px' }} />
                                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--muted)' }}>Click to upload photo</span>
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
                                    ) : col.type === 'date' ? (
                                      <input
                                        type="text"
                                        readOnly={true}
                                        value={val}
                                        onClick={(e) => {
                                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                          setQuickEntryDateCol({ colId: colIdStr, val, rect });
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setQuickEntryDateCol({ colId: colIdStr, val, rect });
                                          }
                                        }}
                                        placeholder="DD-MM-YYYY"
                                        ref={idx === 0 ? (el: any) => { entryFirstInputRef.current = el; } : undefined}
                                        style={{
                                          width: '100%', padding: '10px 14px', fontSize: '13px',
                                          borderRadius: '8px', border: '1px solid var(--border)',
                                          background: 'var(--surface)', color: 'var(--foreground)',
                                          outline: 'none', transition: 'border-color 0.15s',
                                          font: 'inherit',
                                          boxSizing: 'border-box',
                                          cursor: 'pointer',
                                        }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                                      />
                                    ) : (
                                      <input
                                        type={col.type === 'number' || col.type === 'currency' || col.type === 'rating' ? 'number' : col.type === 'email' ? 'email' : col.type === 'phone' ? 'tel' : col.type === 'url' ? 'url' : 'text'}
                                        value={val}
                                        onChange={e => setEntryValues(prev => ({ ...prev, [colIdStr]: e.target.value }))}
                                        placeholder={isAutoIncr ? 'Auto-generated if blank' : col.type === 'email' ? 'email@example.com' : col.type === 'phone' ? '+91 XXXXX XXXXX' : col.type === 'url' ? 'https://' : `Enter ${col.name}…`}
                                        ref={idx === 0 ? (el: any) => { entryFirstInputRef.current = el; } : undefined}
                                        min={col.type === 'rating' ? 1 : undefined}
                                        max={col.type === 'rating' ? 5 : undefined}
                                        style={{
                                          width: '100%', padding: '10px 14px', fontSize: '13px',
                                          borderRadius: '8px', border: '1px solid var(--border)',
                                          background: 'var(--surface)', color: 'var(--foreground)',
                                          outline: 'none', transition: 'border-color 0.15s',
                                          font: 'inherit',
                                          boxSizing: 'border-box',
                                        }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#86efac'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(22,163,74,0.08)'; }}
                                        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
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
                            borderTop: '1px solid var(--border-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px',
                            background: 'var(--bg-secondary)',
                          }}>
                            {isMobile && (
                              <button
                                type="button"
                                onClick={() => { setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntryExistingEntries([]); }}
                                style={{
                                  padding: '9px 18px', fontSize: '13px', fontWeight: 600,
                                  borderRadius: '8px', border: '1px solid var(--border)',
                                  background: 'var(--surface)', color: 'var(--muted-light)', cursor: 'pointer',
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
                                  if (col.type === 'date') {
                                    const v = entryValues[col.id.toString()];
                                    if (v && v.trim() !== '') {
                                      const parts = v.trim().split(/[-/.]/);
                                      if (parts.length === 3) {
                                        const d = parseInt(parts[0], 10);
                                        const m = parseInt(parts[1], 10);
                                        const y = parseInt(parts[2], 10);
                                        const inputDate = new Date(y, m - 1, d);
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        if (inputDate < today && !canSelectBackDates) {
                                          toast.error(`${col.name}: Backdated entries are not allowed (requires admin permission).`);
                                          return;
                                        }
                                      }
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
                      background: 'var(--surface)',
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
                      <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>Quick Entry Pane</h3>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted-light)', maxWidth: '320px', lineHeight: 1.6 }}>
                        Select a register from the left list to instantly start entering data without leaving this view.
                      </p>
                      <button
                        onClick={() => { setIsEntryPanelOpen(false); setEntrySearch(''); setEntrySelectedReg(null); setEntryColumns([]); setEntryValues({}); setEntrySavedCount(0); }}
                        style={{
                          marginTop: '20px',
                          padding: '8px 18px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--muted-light)',
                          background: 'var(--bg-secondary)',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
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
        {quickEntryDateCol && (
          <DatePickerModal
            open={!!quickEntryDateCol}
            onClose={() => setQuickEntryDateCol(null)}
            currentValue={quickEntryDateCol.val}
            dateRect={quickEntryDateCol.rect}
            canSelectBackDates={canSelectBackDates}
            onSelectDate={(dateStr) => {
              setEntryValues(prev => ({ ...prev, [quickEntryDateCol.colId]: dateStr }));
              setQuickEntryDateCol(null);
            }}
          />
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
              <div>No new alerts<br /><span style={{ fontSize: '13px', fontWeight: 'normal', color: '#cbd5e1' }}>You're all caught up!</span></div>
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
          <style>{`
            @keyframes slideInUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '850px' : '500px',
              width: '100%',
              borderRadius: '20px',
              padding: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '0' : '24px',
              background: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' : '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '0' : '16px',
              borderBottom: '1px solid #f1f5f9',
              padding: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '16px 24px' : '0 0 12px 0',
              background: (versionTab === '2.0.1' || versionTab === '2.0' || versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '#f8fafc' : 'transparent'
            }}>
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

            {/* Version Selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: (versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '0' : '20px',
              padding: (versionTab === '1.9.7' || versionTab === '1.9.6' || versionTab === '1.9.5' || versionTab === '1.8.8' || versionTab === '1.7.7') ? '12px 24px' : '12px 0',
              background: versionTab === '1.7.7' ? '#f8fafc' : 'transparent',
              borderBottom: versionTab === '1.7.7' ? '1px solid #e2e8f0' : 'none',
              position: 'relative'
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                Showing version:
              </span>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowOlderVersionsDropdown(!showOlderVersionsDropdown)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0f172a',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                >
                  {versionTab === '2.0.1' ? 'v2.0.1 (Current)' : `v${versionTab}`}
                  <ChevronDown size={14} style={{ color: '#64748b', transition: 'transform 0.2s', transform: showOlderVersionsDropdown ? 'rotate(180deg)' : 'rotate(0)' }} />
                </button>
                
                {showOlderVersionsDropdown && (
                  <>
                    <div 
                      style={{ position: 'fixed', inset: 0, zIndex: 100 }} 
                      onClick={() => setShowOlderVersionsDropdown(false)} 
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: '4px',
                      width: '160px',
                      background: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      zIndex: 101,
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '4px'
                    }}>
                      {[
                        '2.8', '2.7', '2.6', '2.2', '2.1', '2.0.1', '2.0', '1.9.7', '1.9.6', '1.9.5', '1.8.8', '1.8.7', '1.8.5', '1.8.2', '1.8.1', '1.8.0', '1.7.9', '1.7.7'
                      ].map(v => (
                        <button
                          key={v}
                          onClick={() => {
                            setVersionTab(v as any);
                            setActiveSlide(0);
                            setShowOlderVersionsDropdown(false);
                          }}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: versionTab === v ? 700 : 500,
                            borderRadius: '6px',
                            border: 'none',
                            background: versionTab === v ? '#f1f5f9' : 'transparent',
                            color: versionTab === v ? '#0f172a' : '#475569',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            if (versionTab !== v) e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseLeave={e => {
                            if (versionTab !== v) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {v === '2.8' ? 'v2.8 (Current)' : `v${v}`}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {versionTab === '2.8' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.8 • Feature 1 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Immutable Entry ID Column Linking
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Upgraded column-linking engine to sync data using unique immutable entry IDs instead of row index positions. Even if rows are deleted, added, or reordered, linked columns stay 100% aligned.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Paperclip size={24} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Immutable Entry Sync</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Zero desync on row moves & deletions</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.8 • Feature 2 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Enhanced Unlinking & Data Protection
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Unlinking a column gives clear "Clear Data" vs "Keep Data" options. Clearing target data wipes only the destination column, keeping source column data 100% safe & untouched.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <ShieldAlert size={24} color="#16a34a" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Source Data Safeguard</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Smart unlink controls & data safety</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.8 • Feature 3 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Interactive Link Details & 1-Click Repair
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Click the 🔗 Link icon in column headers to view connected registers & columns. Features a 1-click Unlink & Re-link workflow to instantly repair desynced historical entries.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <RefreshCw size={24} color="#d97706" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>1-Click Link Repair</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Live link diagnostics & instant repair</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Navigation Footer */}
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
                      title={isPlaying ? 'Pause Slideshow' : 'Play Slideshow'}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      onClick={() => setActiveSlide(prev => (prev > 0 ? prev - 1 : 2))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
                      title="Previous Feature"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setActiveSlide(prev => (prev + 1) % 3)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }}
                      title="Next Feature"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* Dots */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[0, 1, 2].map(idx => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        style={{
                          width: activeSlide === idx ? '20px' : '6px',
                          height: '6px',
                          borderRadius: '3px',
                          background: activeSlide === idx ? '#2563eb' : '#cbd5e1',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                        }}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-button)'
                    }}
                  >
                    Got it, thanks!
                  </button>
                </div>
              </div>
            ) : versionTab === '2.7' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.7 • Live DB Speed Engine</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Database Cold-Start Indexing
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Automated database indexes on entries, registers, and folders. Query execution times dropped from 3000ms+ to 50ms while maintaining 100% live data freshness.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Zap size={24} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Ultra-Fast Queries</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>50ms response times for large registers</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : versionTab === '2.6' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.6 • Feature 1 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Multi-Select Drag & Drop
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Select single or multiple registers and drag them directly into any sidebar folder. Features real-time multi-card ghost badges and active target folder outlines.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Folder size={24} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Folder Drag & Drop</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Move single & bulk selected registers effortlessly</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.6 • Feature 2 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          User Active Status Center
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Admin-only live status overlay next to the sidebar logo displaying active staff presence, online count, and quick jump to Manage Users & Roles.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Users size={24} color="#16a34a" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Live Presence Tracker</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Fixed-size status center overlay for admins</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.6 • Feature 3 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          App-Wide Smooth Animations
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Modern spring press dynamics for buttons, logo rotate interactions, sidebar item hover nudges, and backdrop blur pop-in dialogs.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Sparkles size={24} color="#d97706" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Micro-Interactions</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Elevated hover lifts & spring physics</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f3e8ff', color: '#7e22ce', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.6 • Feature 4 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Premium Animated Back Buttons
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Unified back button design featuring smooth left slide nudges, blue glow borders, and interactive icon color flips on hover.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <ArrowLeft size={24} color="#7e22ce" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Animated Back UI</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Integrated across all app pages</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Controls Footer */}
                <div style={{ height: '56px', padding: '0 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[0, 1, 2, 3].map(idx => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        style={{
                          width: activeSlide === idx ? '20px' : '8px',
                          height: '8px',
                          borderRadius: '4px',
                          background: activeSlide === idx ? '#2563eb' : '#cbd5e1',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {activeSlide > 0 && (
                      <button
                        onClick={() => setActiveSlide(prev => prev - 1)}
                        style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#475569' }}
                      >
                        Previous
                      </button>
                    )}
                    {activeSlide < 3 ? (
                      <button
                        onClick={() => setActiveSlide(prev => prev + 1)}
                        style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Next Feature
                      </button>
                    ) : (
                      <button
                        onClick={handleCloseVersionModal}
                        style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: '#16a34a', color: 'white', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Got it, thanks!
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : versionTab === '2.2' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.2 • Feature 1 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Strict 10-Digit Phone Validation
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Phone number validation alerts when fewer or more than 10 digits are entered, showing the exact count. Typed numbers are retained when clicking away for easy editing.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Phone size={24} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>10-Digit Validation</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Exact count notifications & input preservation</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.2 • Feature 2 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Dashboard Active User Status
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Real-time Active/Inactive staff status indicators directly on the Main Dashboard overview page without navigating to User Settings.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <User size={24} color="#059669" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Live User Status</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Active & Inactive user activity indicators</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#d97706', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.2 • Feature 3 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Folder Page Access Control
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Restricted staff users now only see allowed registers inside Folder pages matching their assigned permissions.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <LockIcon size={24} color="#d97706" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Access Protection</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Filtered folder registers per staff permission</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f3e8ff', color: '#7e22ce', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.2 • Feature 4 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Attachments Gallery & Clear All Option
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Read-only 📎 Attachments Gallery for row images & signatures, plus a 🧹 Clear All Fields option in Record Details.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Paperclip size={24} color="#7e22ce" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Row Tools</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Gallery viewer & single-click row reset</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 4 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.2 • Feature 5 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Student Identity in History Logs
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          History entries and Excel log exports now prominently feature Student Name & RB Number badges for instant identification.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FileText size={24} color="#3730a3" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>History Badges</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Student Name & RB Number identification</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Navigation Bar for Slideshow */}
                <div style={{ height: '56px', borderTop: '1px solid #e2e8f0', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {[0, 1, 2, 3, 4].map(idx => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        style={{
                          width: activeSlide === idx ? '24px' : '8px',
                          height: '8px',
                          borderRadius: '4px',
                          background: activeSlide === idx ? '#2563eb' : '#cbd5e1',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12px', fontWeight: 600 }}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <button
                      onClick={handleCloseVersionModal}
                      style={{ background: 'var(--navy)', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Explore v2.2
                    </button>
                  </div>
                </div>
              </div>
            ) : versionTab === '2.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.1 • Feature 1 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Dedicated Folder Page & Bulk Actions
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Dedicated folder management page with Bulk Move, Bulk Delete to Recycle Bin, Select All/Deselect All controls, and real-time in-folder search.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FolderOpen size={24} fill="#fbbf24" color="#d97706" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Folder Workspace</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Bulk move, bulk delete, & folder search</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.1 • Feature 2 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          2-Tier Back Navigation & Header Clean-up
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Breadcrumbs removed for clean file view. Back button (`←`) navigates from open file directly to parent folder, and back again to main registers overview.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <ArrowLeft size={24} color="#002d5d" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>2-Tier Back System</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>File → Folder → All Registers</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.1 • Feature 3 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Admin Folder & Register Rearrangement
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Dedicated Rearrange modal for Admins to customize display positioning of folders and registers with Move Up/Down controls and rank badges.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <ArrowUpDown size={24} color="#002d5d" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Custom Rearrange</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Custom display ordering for Admin</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.1 • Feature 4 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Dated Excel Exports & UI Polish
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Downloaded Excel files now automatically include Register Name & Date (DD-MM-YYYY), plus hover-revealed card checkboxes and top sidebar UI design polish.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FileSpreadsheet size={24} color="#107c41" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Dated Excel Downloads</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Automatic date inclusion & hover checkboxes</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer / Controls */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                  >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    <span>{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {[0, 1, 2, 3].map(idx => (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        style={{
                          width: activeSlide === idx ? '24px' : '8px',
                          height: '8px',
                          borderRadius: '4px',
                          background: activeSlide === idx ? '#002d5d' : '#cbd5e1',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.3s'
                        }}
                      />
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setActiveSlide(prev => (prev > 0 ? prev - 1 : 3))}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#334155', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setActiveSlide(prev => (prev < 3 ? prev + 1 : 0))}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#002d5d', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                      {activeSlide === 3 ? 'Got it' : 'Next'}
                    </button>
                  </div>
                </div>
              </div>
            ) : versionTab === '2.0.1' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0.1 • Feature 1 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Date Picker Error Fix (Add Record & Quick Entry)
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Resolved date selection issue when adding new records or using Quick Entry pane. Selecting dates now populates form fields smoothly without connection error popups.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Calendar size={24} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Seamless Date Selection</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Error-free date popovers for Add Record & Quick Entry</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0.1 • Feature 2 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Accurate Checkbox COUNT Summary
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Footer COUNT summary for Checkbox columns now specifically counts selected/checked items instead of displaying the total number of rows.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <CheckCircle2 size={24} color="#10b981" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Checked Box Counter</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>N COUNT accurately tallies checked boxes</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0.1 • Feature 3 of 3</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Formatted Checkbox Exports (YES / Blank)
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Excel (.xlsx) and PDF exports now represent checked rows as clean 'YES' labels and leave unchecked rows blank instead of printing 'true' and 'false'.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FileSpreadsheet size={24} color="#1d4ed8" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Clean Excel & PDF Export</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Checked rows as YES and unchecked as empty</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer / Controls */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isPlaying ? (
                      <><Pause size={12} /> Pause Auto-play</>
                    ) : (
                      <><Play size={12} /> Play Slideshow</>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          border: 'none',
                          background: activeSlide === idx ? 'var(--brand-blue)' : '#cbd5e1',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      padding: '8px 20px', background: 'var(--navy)', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    Got It
                  </button>
                </div>
              </div>
            ) : versionTab === '2.0' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 1 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Digital Signature Column Type
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Draw, re-sign, and save signatures directly into spreadsheet cells using an interactive canvas pad with ink colors, stroke width controls, and touch support.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <PenTool size={24} color="#1d4ed8" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Digital Canvas Signature Pad</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Ink colors, line thickness & mobile touch drawing</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 2 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Configurable Status & Yes/No Badges
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Custom option color swatches for Status and Yes/No column types. Display selectable options as dynamic colored badge pills across spreadsheet cells and dropdown popovers.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Tag size={24} color="#10b981" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Color-Coded Status & Yes/No</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Custom swatches & pill badge dropdowns</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 3 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Admin Activity History Downloads
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Restricted History page downloads accessible exclusively to Admin users. Export complete audit trail logs into structured Excel spreadsheets.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Download size={24} color="#1e3a8a" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Admin Activity Export</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Download history logs to Excel (Admin restricted)</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fffbeb', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 4 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Phone Number (+91) Validation
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Updated phone number column validation allowing standard 10-digit mobile numbers or numbers prefixed with the +91 country code.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Phone size={24} color="#b45309" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>10-Digit & +91 Support</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Flexible phone number formatting & validation</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 4 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f3e8ff', color: '#7e22ce', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 5 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Date Backdate Restrictions & Filters
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Restricted backdated date entries preventing past date selection, with new 'From Date & To Date Range' filter options for date columns.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Calendar size={24} color="#7e22ce" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Date Protection & Range Filter</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>No backdated entries & From/To date filtering</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 5 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f0fdf4', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v2.0 • Feature 6 of 6</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Performance & Core Refinements
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Optimized virtual grid performance, image compression module enhancements, and real-time database synchronization.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <CheckCircle2 size={24} color="#15803d" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>v2.0 Major Engine Upgrade</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>High speed, smooth rendering & rock solid stability</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer / Controls */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isPlaying ? (
                      <><Pause size={12} /> Pause Auto-play</>
                    ) : (
                      <><Play size={12} /> Play Slideshow</>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          border: 'none',
                          background: activeSlide === idx ? 'var(--brand-blue)' : '#cbd5e1',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      padding: '8px 20px', background: 'var(--navy)', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    Got It
                  </button>
                </div>
              </div>
            ) : versionTab === '1.9.7' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.7 • Change 1 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          User Active Status Tracking
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Live presence indicators added to the Users & Roles table. Easily view who is Online, Away, Recent, or Offline with pulse dots and relative timestamps.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <UserCheck size={20} color="#10b981" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Live Online Presence</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Real-time user status monitoring</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.7 • Change 2 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Real-time Admin Notifications
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Admin Panel receives instant in-app alerts whenever users log in, complete with unread notification badge count and dropdown panel.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Bell size={20} color="#2563eb" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Admin Alert System</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Instant login alerts</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.7 • Change 3 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Automated User Email Alerts
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Automated security alert emails are dispatched to registered user email accounts upon every login to verify account access.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <ShieldAlert size={20} color="#f59e0b" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Security Mailer</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Automatic email notice</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.7 • Change 4 of 4</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          User Status Quick Filters
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Filter user management views with one click by All Users, Online, Away, and Offline status chips.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Filter size={20} color="#8b5cf6" />
                          <div>
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>Quick Status Chips</strong>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>Dynamic user filtering</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer / Controls */}
                <div style={{ padding: '12px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ffffff' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isPlaying ? (
                      <><Pause size={12} /> Pause Auto-play</>
                    ) : (
                      <><Play size={12} /> Play Slideshow</>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          border: 'none',
                          background: activeSlide === idx ? 'var(--brand-blue)' : '#cbd5e1',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      padding: '8px 20px', background: 'var(--navy)', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ) : versionTab === '1.9.6' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #10b981);
                    width: 0%;
                    border-radius: 2px;
                  }
                  .progress-bar-fill-playing {
                    width: 100%;
                    transition: width 4.5s linear;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.6 • Change 1 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Multi-Device Database Sync
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Register shortcuts and filters are now stored in the database instead of local storage. This ensures they sync instantly and are visible across all devices and admin accounts.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '280px' }}>
                          <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Database size={18} color="#10b981" />
                            <div>
                              <strong style={{ fontSize: '12px', color: '#0f172a' }}>Database Synced</strong>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>Active across all devices</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.6 • Change 2 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Clean Registers Panel
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Recent Staff Activities and Quick Controls are hidden when the Registers section is expanded, giving you a clean, distraction-free interface for your registers.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', width: '100%', maxWidth: '280px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>Active Register View</div>
                          <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', width: '80%', marginBottom: '6px' }} />
                          <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', width: '50%', marginBottom: '12px' }} />
                          <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 600 }}>• Other dashboard panels hidden</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.6 • Change 3 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Three-Dot Options Menu
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          We replaced the simple delete button with a modern three-dot vertical menu dropdown, letting you easily rename custom labels or delete shortcuts.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '8px 0', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', width: '120px' }}>
                          <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#475569' }}>Change Name</div>
                          <div style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, color: '#ef4444' }}>Delete</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.6 • Change 4 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Bolder Entry Count Card Match
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          Shortcut cards now match the layout and design of summary stats cards. Entry counts are computed reactively and styled in a large, bold design.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ background: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', width: '100%', maxWidth: '200px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>BE 26-27</div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>520 <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>entries</span></div>
                          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>ADM MODE BE-26-27</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 4 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} />
                          <span>v1.9.6 • Change 5 of 5</span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: '1.2' }}>
                          Compact Header Actions
                        </h3>
                        <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#475569', lineHeight: '1.5', fontWeight: 500 }}>
                          We consolidated header controls into a collapsing search bar, icon-only toggle buttons, and a single consolidated export options dropdown.
                        </p>
                      </div>
                      <div style={{ flex: 1.1, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', borderLeft: '1px solid #e2e8f0' }} className="animate-slide-right">
                        <div style={{ display: 'flex', gap: '8px', background: 'white', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}><Search size={14} /></div>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}><Bookmark size={14} /></div>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}><Filter size={14} /></div>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1.5px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}><MoreVertical size={14} /></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Progress Bar */}
                <div style={{ height: '3px', width: '100%', background: '#e2e8f0', position: 'relative' }}>
                  <div
                    key={activeSlide}
                    className={`progress-bar-fill ${isPlaying ? 'progress-bar-fill-playing' : ''}`}
                  />
                </div>

                {/* Footer Controls */}
                <div style={{ height: '56px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isPlaying ? (
                      <><Pause size={12} /> Pause Auto-play</>
                    ) : (
                      <><Play size={12} /> Play Slideshow</>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          border: 'none',
                          background: activeSlide === idx ? 'var(--brand-blue)' : '#cbd5e1',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      padding: '8px 20px', background: 'var(--navy)', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ) : versionTab === '1.9.5' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes gentlePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.04); }
                  }
                  @keyframes borderGlowBlue {
                    0%, 100% { border-color: rgba(37, 99, 235, 0.1); }
                    50% { border-color: rgba(37, 99, 235, 0.4); }
                  }
                  @keyframes spinSlow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #10b981);
                  .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #10b981);
                    width: 0%;
                    border-radius: 2px;
                  }
                  .progress-bar-fill-playing {
                    width: 100%;
                    transition: width 4.5s linear;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} style={{ animation: 'spinSlow 6s linear infinite' }} />
                          <span>v1.9.5 • Change 1 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          1. Metrics & Stats Cards
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          A redesigned metrics panel showing real-time stats for Employees, Workspace Sheets (Registers), Audit logs, approvals, and Recycle Bin items.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ padding: '20px 24px', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', width: '100%', maxWidth: '200px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Registers</div>
                          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>123</div>
                          <div style={{ fontSize: '11px', color: 'var(--brand-green)', fontWeight: 600 }}>Active Workspace Sheets</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 2 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          2. Live Connection Status
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Admins can monitor the status of the database connections at any time with a green glowing live link indicator badge.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#10b981', fontWeight: 700, background: 'white', padding: '8px 16px', borderRadius: '99px', border: '1px solid rgba(16, 185, 129, 0.25)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                          <span style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 8px #10b981' }} />
                          Live Database Connected
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 3 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          3. Dashboard Sync Engine
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          A manual dashboard sync button pulls all recent user activity logs, requests, and metrics instantly without loading the full app again.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <button style={{ padding: '10px 20px', borderRadius: '10px', background: 'white', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                          <RefreshCw size={14} /> Sync Dashboard
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 4 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          4. Workspace Registers Directory
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          An expandable registers directory panel integrated directly in the Admin Overview allows searching and drilling down into any sheet.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '8px' }}>
                            <Search size={12} style={{ color: 'var(--muted)' }} />
                            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Search registers...</div>
                          </div>
                          <div style={{ fontSize: '10.5px', padding: '6px', background: 'rgba(99,102,241,0.06)', color: '#6366f1', borderRadius: '6px', fontWeight: 600 }}>📁 AHS ADMISSIONS 25-26</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 4 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 5 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          5. Detailed Sheet Previews
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Clicking any register opens a detailed portal overlay. Admins can view columns, values, pagination, and navigate pages in fullscreen mode.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                          <div style={{ background: 'var(--navy)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'white' }}>AHS 25-26 Detail</span>
                            <Maximize2 size={10} color="white" />
                          </div>
                          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px', color: 'var(--muted)' }}>
                            <div># I BILL • T MODE • 📅 DATE</div>
                            <div style={{ height: '1px', background: '#cbd5e1' }} />
                            <div>10000 • AKE • 10-05-2025</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 5 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 6 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          6. Advanced Multi-Column Filters
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Slice and analyze data with filters using specific operators (like contains, greater than, date before) across multiple columns simultaneously.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', padding: '12px' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#4f46e5', background: 'rgba(99,102,241,0.08)', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                            Filter: I BILL &gt; 10000
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 6 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 7 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          7. Excel Export for Filtered Views
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Admins can export custom filtered data views directly to Excel format to download and share only relevant subsets of data.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <button style={{ padding: '10px 20px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'white', boxShadow: '0 4px 12px rgba(16,185,129,0.25)' }}>
                          <Download size={14} /> Export 12 Rows
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSlide === 7 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 8 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          8. Saved Custom Templates
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Save custom register structures as templates directly to your dashboard. Recreate them in one click or delete them anytime using the card level trash button.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', padding: '12px', position: 'relative' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', marginBottom: '8px' }}>★</div>
                          <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-main)' }}>Custom Template A</div>
                          <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>12 columns</div>
                          <Trash2 size={12} color="#EF4444" style={{ position: 'absolute', top: '12px', right: '12px' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 8 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 9 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          9. Formula Remapping on Rename
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Renaming column fields automatically prompts dependency check remapping to map formulas, preventing broken formula calculations.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', padding: '12px' }}>
                          <div style={{ fontSize: '9px', color: 'var(--muted)' }}>{"Remap: {OLD} → {NEW}"}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 9 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>v1.9.5 • Change 10 of 10</span>
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          10. Clean Imports Sanitization
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Date formatting conversions bypass US format shifts (keeping April 11th correct) and leading currency symbols (like ₹) are auto-stripped on imports.
                        </p>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', padding: '12px', fontSize: '10.5px' }}>
                          <div style={{ color: '#94a3b8' }}>₹ 10500x → <strong style={{ color: '#15803d' }}>10500x</strong></div>
                          <div style={{ color: '#94a3b8' }}>45758 → <strong style={{ color: '#15803d' }}>11-04-2025</strong></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Progress Bar */}
                <div style={{ height: '3px', width: '100%', background: '#e2e8f0', position: 'relative' }}>
                  <div
                    key={activeSlide}
                    className={`progress-bar-fill ${isPlaying ? 'progress-bar-fill-playing' : ''}`}
                  />
                </div>

                {/* Footer Controls */}
                <div style={{ height: '56px', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', background: '#f8fafc' }}>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    {isPlaying ? (
                      <><Pause size={12} /> Pause Auto-play</>
                    ) : (
                      <><Play size={12} /> Play Slideshow</>
                    )}
                  </button>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          border: 'none',
                          background: activeSlide === idx ? 'var(--brand-blue)' : '#cbd5e1',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                    ))}
                  </div>
                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      padding: '8px 20px', background: 'var(--navy)', color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
                    onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            ) : versionTab === '1.8.8' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes gentlePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.04); }
                  }
                  @keyframes borderGlowBlue {
                    0%, 100% { border-color: rgba(37, 99, 235, 0.1); }
                    50% { border-color: rgba(37, 99, 235, 0.4); }
                  }
                  @keyframes spinSlow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                  @keyframes cursorMoveFormula {
                    0% { transform: translate(140px, 140px); }
                    25% { transform: translate(75px, 28px); }
                    30% { transform: translate(75px, 28px) scale(0.85); }
                    35% { transform: translate(75px, 28px) scale(1); }
                    48% { transform: translate(75px, 78px); }
                    52% { transform: translate(75px, 78px) scale(0.85); }
                    56% { transform: translate(75px, 78px) scale(1); }
                    75%, 100% { transform: translate(140px, 140px); }
                  }
                  @keyframes formulaDropdownReveal {
                    0%, 30% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                    35%, 72% { opacity: 1; transform: scale(1) translateY(0); visibility: visible; }
                    76%, 100% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                  }
                  @keyframes formulaTextChange {
                    0%, 50% { opacity: 0.5; }
                    51%, 100% { opacity: 1; }
                  }
                  @keyframes formulaFlashGreen {
                    0%, 50% { background-color: #ffffff; }
                    52% { background-color: #dcfce7; border-color: #22c55e; }
                    68%, 100% { background-color: #ffffff; border-color: #cbd5e1; }
                  }
                  @keyframes cursorMoveDropdown {
                    0% { transform: translate(140px, 140px); }
                    25% { transform: translate(90px, 28px); }
                    30% { transform: translate(90px, 28px) scale(0.85); }
                    35% { transform: translate(90px, 28px) scale(1); }
                    48% { transform: translate(90px, 72px); }
                    52% { transform: translate(90px, 72px) scale(0.85); }
                    56% { transform: translate(90px, 72px) scale(1); }
                    75%, 100% { transform: translate(140px, 140px); }
                  }
                  @keyframes dropdownRevealAnim {
                    0%, 30% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                    35%, 72% { opacity: 1; transform: scale(1) translateY(0); visibility: visible; }
                    76%, 100% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                  }
                  @keyframes optionItemsReveal {
                    0%, 51% { opacity: 0; transform: translateY(4px); }
                    58%, 100% { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes cloudGlow {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 4px 6px rgba(37,99,235,0.15)); }
                    50% { transform: scale(1.08); filter: drop-shadow(0 6px 14px rgba(37,99,235,0.35)); }
                  }
                  @keyframes laserFlowLeft {
                    0% { stroke-dashoffset: 20; }
                    100% { stroke-dashoffset: 0; }
                  }
                  @keyframes registerPulse {
                    0%, 48% { border-color: #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
                    55%, 90% { border-color: rgba(37, 99, 235, 0.4); box-shadow: 0 8px 16px rgba(37,99,235,0.08); }
                    100% { border-color: #e2e8f0; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #10b981);
                    width: 0%;
                    border-radius: 2px;
                  }
                  .progress-bar-fill-playing {
                    width: 100%;
                    transition: width 4.5s linear;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} style={{ animation: 'spinSlow 6s linear infinite' }} />
                          <span>Version 1.8.8 Live</span>
                        </div>
                        <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          Bug Fixes & Improvements
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Critical fixes for admin permissions and Excel import. Grant Access now works correctly for all users, and date columns import properly.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>Grant Access Button Fix (Admin Panel)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>Excel Date Import — Proper Formatting</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #e8faf0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.9)', borderRadius: '20px', boxShadow: '0 15px 30px rgba(30, 41, 59, 0.08)', textAlign: 'center', width: '190px', animation: 'gentlePulse 3s ease-in-out infinite' }}>
                          <div style={{ fontSize: '38px', fontWeight: 900, background: 'linear-gradient(135deg, #2563eb, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            v1.8.8
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Bug Fixes
                          </div>
                          <div style={{ height: '1px', background: '#cbd5e1', margin: '12px auto', width: '70%' }} />
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
                            Admin Access & Date Import Fixes
                          </div>
                        </div>
                        <div style={{ position: 'absolute', top: '12%', left: '10%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#2563eb', border: '1px solid #dbeafe' }}>🔓 Grant Access Fix</div>
                        <div style={{ position: 'absolute', bottom: '12%', left: '12%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#16a34a', border: '1px solid #dcfce7' }}>📅 Date Import Fix</div>
                        <div style={{ position: 'absolute', top: '15%', right: '8%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#7c3aed', border: '1px solid #f3e8ff' }}>🛡️ Admin Panel</div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 2 of 3</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          🔓 Grant Access Fix
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          Super Admins can now properly toggle and configure folder & sheet access. The buttons are fully interactive and update their visual state correctly.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#dc2626', fontWeight: 'bold' }}>•</span>
                            <span><strong>Blocked State:</strong> Fixed 🚫 restricted icon preventing clicks on admin accounts.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#dc2626', lineHeight: 1.4 }}>
                            <span style={{ color: '#dc2626', fontWeight: 'bold' }}>•</span>
                            <span><strong>Visual Bug:</strong> Fixed button staying green "Access Granted" when clicked.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#16a34a', lineHeight: 1.4 }}>
                            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>•</span>
                            <span><strong>Result:</strong> Buttons now toggle cleanly between green and gray.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#fef2f2', borderLeft: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        {/* Mock Admin Panel UI */}
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                          <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>User Settings</span>
                            <span style={{ fontSize: '9px', padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 600 }}>Fixed</span>
                          </div>
                          
                          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Folder row - before fix */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                              <span style={{ fontSize: '10px' }}>📁</span>
                              <span style={{ fontSize: '9px', fontWeight: 600, color: '#991b1b', flex: 1 }}>ADM 21-22</span>
                              <span style={{ fontSize: '8px', padding: '2px 8px', borderRadius: '12px', background: '#fee2e2', color: '#991b1b', fontWeight: 700, textDecoration: 'line-through' }}>🚫 Blocked</span>
                            </div>
                            {/* Folder row - after fix */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', animation: 'borderGlowBlue 3s infinite' }}>
                              <span style={{ fontSize: '10px' }}>📁</span>
                              <span style={{ fontSize: '9px', fontWeight: 600, color: '#166534', flex: 1 }}>ADM 21-22</span>
                              <span style={{ fontSize: '8px', padding: '2px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>✓ Grant Access</span>
                            </div>
                            {/* Folder row - after fix */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                              <span style={{ fontSize: '10px' }}>📁</span>
                              <span style={{ fontSize: '9px', fontWeight: 600, color: '#166534', flex: 1 }}>ADM 22-23</span>
                              <span style={{ fontSize: '8px', padding: '2px 8px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>✓ Grant Access</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 3 of 3</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          📅 Excel Date Import Fix
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          Date columns now display correctly when importing Excel files. No more mysterious numbers like 45484 — dates show as proper DD-MM-YYYY format.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#dc2626', fontWeight: 'bold' }}>•</span>
                            <span><strong>Bug:</strong> Date columns showed serial numbers (e.g. 45484).</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#16a34a', lineHeight: 1.4 }}>
                            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>•</span>
                            <span><strong>Fix:</strong> Dates now import as 11-07-2024 format correctly.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#ecfdf5', borderLeft: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        {/* Mock Date Column Before/After */}
                        <div style={{ width: '100%', maxWidth: '220px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                          <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>DOA Column</span>
                            <span style={{ fontSize: '9px', padding: '2px 6px', background: '#dcfce7', color: '#15803d', borderRadius: '4px', fontWeight: 600 }}>Fixed</span>
                          </div>
                          <div style={{ padding: '4px 0' }}>
                            {/* Before row */}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>Before</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#991b1b', fontWeight: 700, textDecoration: 'line-through' }}>45484</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>After</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>11-07-2024</span>
                            </div>
                            <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 12px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>Before</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#991b1b', fontWeight: 700, textDecoration: 'line-through' }}>45439</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>After</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>27-05-2024</span>
                            </div>
                            <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 12px' }} />
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>Before</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#991b1b', fontWeight: 700, textDecoration: 'line-through' }}>45423</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px' }}>
                              <span style={{ fontSize: '8px', color: '#94a3b8', width: '40px', fontWeight: 600 }}>After</span>
                              <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>11-05-2024</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Progress Bar */}
                <div style={{ height: '3px', width: '100%', background: '#e2e8f0', position: 'relative' }}>
                  <div
                    key={activeSlide + '-' + isPlaying}
                    className={`progress-bar-fill ${isPlaying ? 'progress-bar-fill-playing' : ''}`}
                  />
                </div>

                {/* Slideshow Navigation Controls Footer */}
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setIsPlaying(p => !p)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      title={isPlaying ? 'Pause auto-play' : 'Resume auto-play'}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <div style={{ width: '1px', height: '14px', background: '#cbd5e1' }} />
                    <button
                      onClick={() => { setActiveSlide(prev => (prev - 1 + 4) % 4); setIsPlaying(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => { setActiveSlide(prev => (prev + 1) % 4); setIsPlaying(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[0, 1, 2, 3].map(idx => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          background: activeSlide === idx ? '#2563eb' : '#cbd5e1',
                          transition: 'background-color 0.2s, transform 0.2s',
                          transform: activeSlide === idx ? 'scale(1.2)' : 'scale(1)'
                        }}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-button)'
                    }}
                  >
                    Got it, thanks!
                  </button>
                </div>
              </div>
            ) : versionTab === '1.8.5' ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                maxHeight: '400px', 
                overflowY: 'auto', 
                paddingRight: '8px',
                animation: 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 25, 2026</span>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Breadcrumb Navigation & Folder Dropdown</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Navigate your registers with ease using the new breadcrumb path at the top: Home › Folder › Register. Click on any folder name to instantly see and switch between sibling registers inside the same folder, complete with subtle icons for a clean, intuitive experience.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fef3c7', color: '#d97706', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <PenLine size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Cell Split & Merge</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Right-click any cell and choose "Split Cell" to divide it into two side-by-side editable areas within one cell. Need it back as one? Use "Merge Cell" to combine them again. Works seamlessly with all column types including currency.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#fce7f3', color: '#db2777', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <Shield size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Min/Max Validation for Currency & Number Columns</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Set minimum and maximum allowed values when creating or changing currency and number columns. If any entered value falls outside the range, a warning toast will alert you immediately — even inside split cells.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Alphabetical Dropdown & Filter Sorting</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Dropdown cell options and filter panel values are now automatically sorted alphabetically from A to Z when displayed. Case-insensitive and numeric-aware sorting makes it faster to find the right option.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#f3e8ff', color: '#7c3aed', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Dark Mode & Theme Improvements</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      All new components — breadcrumbs, folder dropdowns, and split cells — have been carefully styled to look great in Light, Dark, and Monitor modes with proper contrast and smooth transitions.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.8.2' ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                maxHeight: '400px', 
                overflowY: 'auto', 
                paddingRight: '8px',
                animation: 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 23, 2026</span>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Enhanced Column Unlinking & Data Retention Control</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Refined the column unlinking workflow. The "Keep Data" or "Clear Data" confirmation modal is now available on both sides of the link connection (source and target). However, selecting "Clear Data" will only clear the cell values of the target destination column. The source column data is guaranteed to be preserved under all actions.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Fixed Column Unlink Data Clear Persistence</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Resolved an issue where selecting "Clear Data" on unlinking did not persist to the backend database after invalidating the queries or reloading the page. Unlink operations now correctly force entry updates to sync changes permanently.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.8.1' ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '16px', 
                maxHeight: '400px', 
                overflowY: 'auto', 
                paddingRight: '8px',
                animation: 'slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 21, 2026</span>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Unified Activity Log & Deduplication</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Implemented a smart client-side deduplication engine. Twin logs generated simultaneously by low-level and high-level client mutations are now combined. The Activity Log page, Active Report analytics, and System Dashboard now present a clean and uncluttered timeline.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Pristine Register History & Icons</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Activity log actions are normalized to standard keys to ensure they inherit beautiful outlines, themed colors, and custom Lucide icons. The history tab now parses normalized cell edits, displaying clean "before" and "after" visual tables.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.8.0' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 15, 2026</span>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Robust Column Linking & Immutable ID Sync</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Upgraded the column-linking synchronization engine. Previously, columns were linked using sequential row indexes, which could lead to misaligned data if rows were inserted or deleted. Sync operations now match rows dynamically using unique database/immutable entry identifiers. Even if registers are sorted, modified, or row orders are changed, linked columns remain perfectly aligned.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Fixed Live Entry Count Visualizations</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Corrected a caching issue where unlinking or re-linking registers would show outdated or mismatching entry counts (such as showing 77 matched when cleared, or differing total counts on both ends).
                    </p>
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <HelpCircle size={15} style={{ color: '#3b82f6' }} /> How to Use: Restore and Fix Desynced Data
                  </h4>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                    If your linked columns (e.g., Student Name, Registration Number) became misaligned due to past row deletions or additions, follow these simple steps to repair:
                  </p>
                  <ol style={{ margin: '0 0 12px 0', paddingLeft: '20px', fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
                    <li>Open the target register containing the linked column.</li>
                    <li>Go to the linked column's settings and click <strong>Unlink Column</strong> (this will safely disconnect the old index-based sync logic, without deleting your actual entry details).</li>
                    <li>Click <strong>Link Column</strong> again, map the column to the source register, and choose the matching column key (e.g., <em>RB NO</em>).</li>
                    <li>The system will immediately rebuild the connections using the new immutable matching logic, instantly restoring and aligning all student names and linked data!</li>
                  </ol>

                  <h4 style={{ margin: '12px 0 8px 0', fontSize: '13px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ Note: If Target ("To") Column Already Has Unwanted / Previous Data
                  </h4>
                  <p style={{ margin: '0 0 8px 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                    If your target ("to") column already contains unwanted or pre-populated data from previous legacy links:
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: '#475569', lineHeight: 1.6 }}>
                    <li>Go to your target ("to") column settings and click <strong>Unlink Column</strong> to clear and remove the old index-bound data. (Don't worry, your main lead/client details are completely safe and won't be deleted!).</li>
                    <li>Click <strong>Link Column</strong> again, select the source ("from") register, choose the matching unique column key (e.g., <em>RB NO</em>), and map the column.</li>
                    <li>The system will automatically rebuild all connections using the new immutable matching logic, instantly pulling the correct values and keeping them aligned!</li>
                  </ol>
                </div>
              </div>
            ) : versionTab === '1.7.9' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Released Jun 15, 2026</span>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                  <div style={{ background: '#ecfdf5', color: '#10b981', padding: '6px', borderRadius: '8px', marginTop: '2px', display: 'flex', flexShrink: 0 }}>
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Multi-User State Isolation</h4>
                    <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                      Preferences such as hidden columns, active filters, selected columns, and pagination state are now uniquely saved per user using a user-id namespace, preventing conflicts when multiple users access the same registers on shared devices.
                    </p>
                  </div>
                </div>
              </div>
            ) : versionTab === '1.7.7' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '440px', position: 'relative', overflow: 'hidden' }}>

                {/* Style block injection */}
                <style>{`
                  @keyframes slideInUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                  @keyframes slideInLeft {
                    from { transform: translateX(-24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes slideInRight {
                    from { transform: translateX(24px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                  }
                  @keyframes gentlePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.04); }
                  }
                  @keyframes borderGlow {
                    0%, 100% { border-color: rgba(37, 99, 235, 0.1); }
                    50% { border-color: rgba(37, 99, 235, 0.3); }
                  }
                  @keyframes mockScroll {
                    0%, 15% { transform: translateX(0); }
                    40%, 60% { transform: translateX(-60px); }
                    85%, 100% { transform: translateX(0); }
                  }
                  @keyframes spinSlow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                  }
                  @keyframes colorFill {
                    0%, 15% { background-color: transparent; }
                    45%, 80% { background-color: rgba(22, 163, 74, 0.08); }
                    95%, 100% { background-color: transparent; }
                  }
                  @keyframes cursorClick {
                    0% { transform: translate(120px, 120px); }
                    35% { transform: translate(50px, 32px); }
                    40% { transform: translate(50px, 32px) scale(0.85); }
                    45%, 70% { transform: translate(50px, 32px) scale(1); }
                    90%, 100% { transform: translate(120px, 120px); }
                  }
                  @keyframes colorDropdownOpen {
                    0%, 35% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                    40%, 75% { opacity: 1; transform: scale(1) translateY(0); visibility: visible; }
                    80%, 100% { opacity: 0; transform: scale(0.95) translateY(-5px); visibility: hidden; }
                  }
                  .animate-slide-left {
                    animation: slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .animate-slide-right {
                    animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                  }
                  .progress-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #10b981);
                    width: 0%;
                    border-radius: 2px;
                  }
                  .progress-bar-fill-playing {
                    width: 100%;
                    transition: width 4.5s linear;
                  }
                `}</style>

                {/* Main Slides Content */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {activeSlide === 0 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#eff6ff', color: '#2563eb', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <Sparkles size={12} style={{ animation: 'spinSlow 6s linear infinite' }} />
                          <span>Version 1.7.7 Live</span>
                        </div>
                        <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          UI/UX Makeover Special
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                          Welcome to the most polished release of RecordBook! We've cleaned up user portals, replaced text emojis with outline vector icons, and redesigned sheets to fit cleanly on laptop displays.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>Sleek Premium White Sidebar & Avatar Footer</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>100% Outlined Vector Icons (Lucide-React)</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>Compact Responsive Layout with Sticky Column</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', fontSize: '9px' }}>✓</span>
                            <span>7 Mild Column Background Colors & Scroll Protection</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: 'linear-gradient(135deg, #eff6ff 0%, #e8faf0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255, 255, 255, 0.9)', borderRadius: '20px', boxShadow: '0 15px 30px rgba(30, 41, 59, 0.08)', textAlign: 'center', width: '190px', animation: 'gentlePulse 3s ease-in-out infinite' }}>
                          <div style={{ fontSize: '38px', fontWeight: 900, background: 'linear-gradient(135deg, #2563eb, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            v1.7.7
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Big Update
                          </div>
                          <div style={{ height: '1px', background: '#cbd5e1', margin: '12px auto', width: '70%' }} />
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, lineHeight: 1.4 }}>
                            Aesthetics & Layout Redesign
                          </div>
                        </div>
                        <div style={{ position: 'absolute', top: '12%', left: '10%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#2563eb', border: '1px solid #dbeafe' }}>⚪ White Sidebar</div>
                        <div style={{ position: 'absolute', bottom: '12%', left: '12%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#16a34a', border: '1px solid #dcfce7' }}>🎨 Mild Colors</div>
                        <div style={{ position: 'absolute', top: '15%', right: '8%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#7c3aed', border: '1px solid #f3e8ff' }}>⚡ Vector Icons</div>
                        <div style={{ position: 'absolute', bottom: '15%', right: '10%', background: 'white', padding: '4px 10px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', fontSize: '10px', fontWeight: 600, color: '#ea580c', border: '1px solid #ffedd5' }}>🖥️ Sticky Column</div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 1 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 2 of 5</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          ⚪ Premium White Sidebar Redesign
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          The dark sidebar is gone. We've introduced a professional light theme with soft slate-blue colors, visual depth, and smooth list entry hover transformations.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#2563eb', fontWeight: 'bold' }}>•</span>
                            <span><strong>Light Slate Palette:</strong> Integrates cleanly with workspace sheets.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#2563eb', fontWeight: 'bold' }}>•</span>
                            <span><strong>Profile Footer:</strong> Shows user avatar, initials, and privilege tag.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#2563eb', fontWeight: 'bold' }}>•</span>
                            <span><strong>Active Glow:</strong> Clear indicators marking your active sheets.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} className="animate-slide-right">
                        <div style={{ width: '100%', maxWidth: '210px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 20px rgba(0,0,0,0.04)', overflow: 'hidden', animation: 'borderGlow 3s ease-in-out infinite' }}>
                          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <img src="/logo-transparent.png" alt="AG Logo" style={{ width: '16px', height: '16px' }} />
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a' }}>AG Trust <span style={{ color: '#2563eb', fontSize: '8px' }}>Record Book</span></span>
                          </div>
                          <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', borderLeft: '2px solid #2563eb' }}>
                              <FileText size={10} color="#2563eb" />
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#2563eb' }}>Students Register</span>
                            </div>
                            <div style={{ padding: '6px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                              <Folder size={10} fill="#fbbf24" color="#f59e0b" />
                              <span style={{ fontSize: '10px', fontWeight: 500 }}>All Folders</span>
                            </div>
                            <div style={{ padding: '6px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
                              <Activity size={10} />
                              <span style={{ fontSize: '10px', fontWeight: 500 }}>History Logs</span>
                            </div>
                          </div>
                          <div style={{ marginTop: '16px', padding: '8px 10px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px', background: '#fafbfc' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700 }}>
                              US
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '9px', fontWeight: 600, color: '#0f172a', lineHeight: 1.1 }}>User Account</span>
                              <span style={{ fontSize: '7px', color: '#94a3b8', background: '#f1f5f9', padding: '0px 2px', borderRadius: '2px', width: 'fit-content' }}>Admin</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 2 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 3 of 5</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          ⚡ Crisp SVG Vector Icons
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          Say goodbye to standard text emojis! We replaced them with high-fidelity Lucide outlines that stay sharp and clean at any zoom level or screen density.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>•</span>
                            <span><strong>Visual Consistency:</strong> Matching outline weights for all tools.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>•</span>
                            <span><strong>No Fuzzy Rendering:</strong> Scalable vector graphics look outstanding.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#7c3aed', fontWeight: 'bold' }}>
                            <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>•</span>
                            <span><strong>Modern Feel:</strong> Gives the entire administration suite a premium SaaS look.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#eff6ff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '14px' }} className="animate-slide-right">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '200px' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Old Emojis</div>
                          <div style={{ padding: '8px 12px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.5, border: '1px dashed #cbd5e1' }}>
                            <span style={{ fontSize: '14px' }}>🛡️</span>
                            <span style={{ fontSize: '11px', color: '#475569', fontWeight: 500 }}>Admin Setup</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', maxWidth: '200px' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>New Vector Icons</div>
                          <div style={{ padding: '8px 12px', background: 'white', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #dbeafe', boxShadow: '0 4px 10px rgba(37,99,235,0.06)', transform: 'scale(1.02)' }}>
                            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Shield size={11} color="#2563eb" />
                            </div>
                            <span style={{ fontSize: '11px', color: '#0f172a', fontWeight: 600 }}>Admin Setup</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 3 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 4 of 5</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          🖥️ Compact Tables & Sticky Columns
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          Table grids inside Admin Panels are now optimized to fit on standard laptop screens. Spacing has been compressed and critical column items are locked to avoid clipping.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#ea580c', fontWeight: 'bold' }}>•</span>
                            <span><strong>Sticky Left Anchoring:</strong> S.No and Name remain locked when scrolling.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#ea580c', fontWeight: 'bold' }}>•</span>
                            <span><strong>Grid Compression:</strong> Read role details and status without clutter.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#ea580c', fontWeight: 'bold' }}>•</span>
                            <span><strong>Responsive Glide:</strong> Data columns slide cleanly underneath locked headers.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#fafafb', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }} className="animate-slide-right">
                        <div style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', marginBottom: '6px', alignSelf: 'flex-start' }}>Locked Name column scroll preview</div>
                        <div style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: 'white', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                          <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '10px', color: '#475569' }}>
                            <div style={{ width: '20px', padding: '6px', textAlign: 'center', borderRight: '1px solid #f1f5f9', background: '#f8fafc', zIndex: 2 }}>#</div>
                            <div style={{ width: '60px', padding: '6px', borderRight: '1px solid #f1f5f9', background: '#f8fafc', zIndex: 2, boxShadow: '1px 0 3px rgba(0,0,0,0.05)', position: 'relative' }}>Name</div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', width: '180px', animation: 'mockScroll 5s ease-in-out infinite' }}>
                                <div style={{ width: '60px', padding: '6px', flexShrink: 0 }}>Role</div>
                                <div style={{ width: '60px', padding: '6px', flexShrink: 0 }}>Rights</div>
                                <div style={{ width: '60px', padding: '6px', flexShrink: 0 }}>Status</div>
                              </div>
                            </div>
                          </div>
                          <div style={{ fontSize: '10px', color: '#0f172a' }}>
                            <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9' }}>
                              <div style={{ width: '20px', padding: '6px', textAlign: 'center', background: '#ffffff', borderRight: '1px solid #f1f5f9', zIndex: 2 }}>1</div>
                              <div style={{ width: '60px', padding: '6px', background: '#f8fafc', borderRight: '1px solid #f1f5f9', fontWeight: 600, zIndex: 2, boxShadow: '1px 0 3px rgba(0,0,0,0.05)', position: 'relative' }}>Immanuvel</div>
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', width: '180px', animation: 'mockScroll 5s ease-in-out infinite' }}>
                                  <div style={{ width: '60px', padding: '6px', flexShrink: 0, color: '#7c3aed', fontWeight: 600 }}>Staff</div>
                                  <div style={{ width: '60px', padding: '6px', flexShrink: 0, color: '#475569' }}>Read/Write</div>
                                  <div style={{ width: '60px', padding: '6px', flexShrink: 0 }}><span style={{ background: '#dcfce7', color: '#15803d', padding: '1px 4px', borderRadius: '3px', fontSize: '8px', fontWeight: 700 }}>Active</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSlide === 4 && (
                    <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                      <div style={{ flex: 1, padding: '24px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} className="animate-slide-left">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, width: 'fit-content', marginBottom: '14px' }}>
                          <span>Slide 5 of 5</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', lineHeight: 1.2 }}>
                          🎨 Column Background Colors & Grid Fixes
                        </h2>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                          Highlight entire customizer columns with 7 soft tints. The scroll bleed-through fix stops scrolled items from overlapping frozen columns.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>•</span>
                            <span><strong>7 Mild Transparent Colors:</strong> Tailored at 8% opacity to protect readability.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>•</span>
                            <span><strong>Scroll Bleed Blocking:</strong> Headers and frozen frames block scroll overlap.</span>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>•</span>
                            <span><strong>High Contrast Safety:</strong> Standard contrast toggle bypasses coloring if active.</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ width: '48%', background: '#f0fdf4', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', position: 'relative' }} className="animate-slide-right">
                        <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '10px', width: '180px', boxShadow: '0 8px 20px rgba(0,0,0,0.06)' }}>
                          <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b', marginBottom: '6px' }}>COLUMN STYLE TINT</div>
                          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px', position: 'relative' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', border: '1px solid #cbd5e1', background: 'white' }} />
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#dcfce7', border: '1.5px solid #2563eb' }} />
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#dbeafe' }} />
                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#fef3c7' }} />

                            {/* Color Dropdown Popover */}
                            <div style={{
                              position: 'absolute',
                              top: '16px',
                              left: '8px',
                              background: 'white',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '4px',
                              zIndex: 5,
                              boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
                              display: 'flex',
                              gap: '3px',
                              animation: 'colorDropdownOpen 5s infinite'
                            }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dcfce7' }} />
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dbeafe' }} />
                              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fef3c7' }} />
                            </div>
                          </div>
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ background: '#1b2a4a', color: 'white', fontSize: '8px', fontWeight: 600, padding: '3px 6px', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Status Color</span>
                              <span>🔒</span>
                            </div>
                            <div style={{ fontSize: '8px', padding: '5px 6px', borderBottom: '1px solid #f1f5f9', animation: 'colorFill 5s infinite' }}>Paid</div>
                            <div style={{ fontSize: '8px', padding: '5px 6px', borderBottom: '1px solid #f1f5f9', animation: 'colorFill 5s infinite' }}>Pending</div>
                          </div>
                        </div>
                        <div style={{ position: 'absolute', width: '10px', height: '15px', background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 320 512\'%3E%3Cpath fill=\'%23000000\' d=\'M0 55.2V426c0 24.2 27.3 37.2 46.2 22L135 376h121c21 0 38-17 38-38V55.2c0-21-17-38-38-38H38C17 17.2 0 34.2 0 55.2z\'/%3E%3C/svg%3E") no-repeat', backgroundSize: 'contain', zIndex: 10, animation: 'cursorClick 5s infinite' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Slideshow Progress Bar */}
                <div style={{ height: '3px', width: '100%', background: '#e2e8f0', position: 'relative' }}>
                  <div
                    key={activeSlide + '-' + isPlaying}
                    className={`progress-bar-fill ${isPlaying ? 'progress-bar-fill-playing' : ''}`}
                  />
                </div>

                {/* Slideshow Navigation Controls Footer */}
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setIsPlaying(p => !p)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      title={isPlaying ? 'Pause auto-play' : 'Resume auto-play'}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <div style={{ width: '1px', height: '14px', background: '#cbd5e1' }} />
                    <button
                      onClick={() => { setActiveSlide(prev => (prev - 1 + 5) % 5); setIsPlaying(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => { setActiveSlide(prev => (prev + 1) % 5); setIsPlaying(false); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[0, 1, 2, 3, 4].map(idx => (
                      <button
                        key={idx}
                        onClick={() => { setActiveSlide(idx); setIsPlaying(false); }}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          background: activeSlide === idx ? '#2563eb' : '#cbd5e1',
                          transition: 'background-color 0.2s, transform 0.2s',
                          transform: activeSlide === idx ? 'scale(1.2)' : 'scale(1)'
                        }}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleCloseVersionModal}
                    style={{
                      background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-button)'
                    }}
                  >
                    Got it, thanks!
                  </button>
                </div>
              </div>
            ) : null}

            {!['2.2', '2.1', '2.0.1', '2.0', '1.9.7', '1.9.6', '1.9.5', '1.8.8', '1.7.7'].includes(versionTab) && (
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
            )}
          </div>
        </div>
      )}

      {/* Online Users & Live Activity Modal (Admin Only) */}
      <OnlineUsersModal
        isOpen={showOnlineUsersModal}
        onClose={() => setShowOnlineUsersModal(false)}
      />
    </>
  );
});

function OnlineUsersModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isSystemAdmin = (authUser as any)?.role === 'admin' || (authUser as any)?.role === 'superadmin' || (authUser as any)?.permissions?.isAdmin;

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'online' | 'active' | 'inactive'>('all');

  const fetchUsersData = useCallback(async () => {
    try {
      const [usersRes, onlineRes, actRes] = await Promise.all([
        firebaseGetUsers().catch(() => ({ users: [] })),
        firebaseGetOnlineUsers().catch(() => ({ users: [] })),
        firebaseGetActivity(300).catch(() => ({ activities: [] }))
      ]);

      const usersList = usersRes.users || [];
      const onlineList = onlineRes.users || [];
      const activitiesList = actRes.activities || [];

      const onlineMap = new Map<string, any>();
      onlineList.forEach((u: any) => onlineMap.set(String(u.id), u));

      const latestActMap = new Map<string, string>();
      activitiesList.forEach((a: any) => {
        if (a.userId && !latestActMap.has(String(a.userId))) {
          latestActMap.set(String(a.userId), a.timestamp);
        }
      });

      const now = Date.now();
      const processed = usersList.map((u: any) => {
        const uid = String(u.id);
        const presence = onlineMap.get(uid);
        const actTimeStr = presence?.lastActive || latestActMap.get(uid) || u.lastLogin || u.createdAt;
        const actTime = actTimeStr ? new Date(actTimeStr).getTime() : now - 30 * 86400 * 1000;
        const diffMs = now - actTime;

        let computedStatus: 'online' | 'away' | 'recent' | 'offline' | 'inactive' = 'offline';
        if (u.status === 'inactive') {
          computedStatus = 'inactive';
        } else if (presence?.status === 'online' || diffMs <= 3 * 60 * 1000) {
          computedStatus = 'online';
        } else if (diffMs <= 60 * 60 * 1000) {
          computedStatus = 'away';
        } else if (diffMs <= 24 * 60 * 60 * 1000) {
          computedStatus = 'recent';
        } else {
          computedStatus = 'offline';
        }

        return {
          id: uid,
          name: u.name || 'User',
          email: u.email || '',
          role: (u.role || 'user').toUpperCase(),
          accountStatus: u.status || 'active',
          computedStatus,
          lastActive: actTimeStr,
          currentActivity: presence?.currentActivity || 'Active in app'
        };
      });

      const sortOrder: Record<string, number> = { online: 0, away: 1, recent: 2, offline: 3, inactive: 4 };
      processed.sort((a: any, b: any) => (sortOrder[a.computedStatus] ?? 99) - (sortOrder[b.computedStatus] ?? 99));

      setAllUsers(processed);
    } catch (err) {
      console.error('Failed to load user active status center:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !isSystemAdmin) return;
    fetchUsersData();
    const interval = setInterval(fetchUsersData, 5000);
    return () => clearInterval(interval);
  }, [isOpen, isSystemAdmin, fetchUsersData]);

  if (!isOpen || !isSystemAdmin) return null;

  const onlineCount = allUsers.filter(u => u.computedStatus === 'online').length;
  const activeCount = allUsers.filter(u => u.accountStatus === 'active').length;
  const inactiveCount = allUsers.filter(u => u.accountStatus === 'inactive').length;

  const filteredUsers = allUsers.filter(u => {
    // Tab filter
    if (activeTab === 'online' && u.computedStatus !== 'online') return false;
    if (activeTab === 'active' && u.accountStatus !== 'active') return false;
    if (activeTab === 'inactive' && u.accountStatus !== 'inactive') return false;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      return (
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.computedStatus?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getAvatarBg = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = ['#10b981', '#6366f1', '#f59e0b', '#0284c7', '#8b5cf6', '#ec4899', '#14b8a6', '#059669'];
    return colors[Math.abs(hash) % colors.length];
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="modal-animate-pop"
        style={{
          width: '740px',
          maxWidth: '92vw',
          height: '560px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={22} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
              User Active Status Center
            </h3>
            <span style={{
              backgroundColor: '#dcfce7',
              color: '#15803d',
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '16px',
              border: '1px solid #a7f3d0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span className="status-pulse-dot" style={{ width: '7px', height: '7px', backgroundColor: '#22c55e', borderRadius: '50%' }} />
              {onlineCount} Online Now
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => {
                sessionStorage.setItem('admin_active_tab', 'users');
                sessionStorage.removeItem('admin_workspace_mode');
                onClose();
                navigate('/admin/dashboard?tab=users');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: 0
              }}
            >
              Manage Users & Roles →
            </button>

            <button
              onClick={onClose}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px'
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Row */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[
              { id: 'all', label: `All (${allUsers.length})` },
              { id: 'online', label: `Online (${onlineCount})` },
              { id: 'active', label: `Active (${activeCount})` },
              { id: 'inactive', label: `Inactive (${inactiveCount})` },
            ].map(tab => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? 700 : 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                    background: isSelected ? '#eff6ff' : '#ffffff',
                    color: isSelected ? '#2563eb' : '#475569'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '6px 12px',
            width: '200px'
          }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Filter users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '12px', color: '#0f172a' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Users Cards Grid */}
        <div style={{
          flex: '1 1 0%',
          minHeight: '360px',
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '14px',
          alignContent: 'start',
          backgroundColor: '#fafafa'
        }}>
          {loading && allUsers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <Loader2 size={26} className="animate-spin" color="#2563eb" />
              Loading user status center...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '60px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              No users found matching current filters
            </div>
          ) : (
            filteredUsers.map(u => {
              const statusCfg: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
                online: { label: 'Online', dot: '#22c55e', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
                away: { label: 'Away', dot: '#f59e0b', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
                recent: { label: 'Recent', dot: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
                offline: { label: 'Offline', dot: '#94a3b8', bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
                inactive: { label: 'Inactive', dot: '#ef4444', bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
              };

              const cfg = statusCfg[u.computedStatus] || statusCfg.offline;

              return (
                <div
                  key={u.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '14px',
                    border: `1.5px solid ${cfg.border}`,
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    position: 'relative',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {/* Top Row: Avatar & Details & Role Tag */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      {/* Avatar */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          backgroundColor: u.avatar ? 'transparent' : getAvatarBg(u.name),
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '16px',
                          fontWeight: 800,
                          overflow: 'hidden'
                        }}>
                          {u.avatar ? (
                            <img src={u.avatar} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            u.name ? u.name.charAt(0).toUpperCase() : 'U'
                          )}
                        </div>
                        <span style={{
                          position: 'absolute',
                          bottom: '-1px',
                          right: '-1px',
                          width: '11px',
                          height: '11px',
                          borderRadius: '50%',
                          backgroundColor: cfg.dot,
                          border: '2px solid #ffffff',
                          boxShadow: u.computedStatus === 'online' ? '0 0 6px #22c55e' : 'none'
                        }} />
                      </div>

                      {/* User Info */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: '13.5px',
                          fontWeight: 800,
                          color: '#0f172a',
                          textTransform: 'uppercase',
                          letterSpacing: '0.2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {u.name}
                        </div>
                        <div style={{
                          fontSize: '11.5px',
                          color: '#64748b',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {u.email}
                        </div>
                      </div>
                    </div>

                    {/* Role Tag */}
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      flexShrink: 0
                    }}>
                      {u.role}
                    </span>
                  </div>

                  {/* Status Pill Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginTop: '2px' }}>
                    <span style={{
                      backgroundColor: cfg.bg,
                      color: cfg.text,
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '6px',
                      border: `1px solid ${cfg.border}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: cfg.dot }} />
                      {cfg.label}
                      {u.computedStatus !== 'inactive' && (
                        <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: '3px' }}>
                          {formatRelativeTime(u.lastActive)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function formatRelativeTime(isoStr?: string): string {
  if (!isoStr) return 'Just now';
  const diffSec = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (isNaN(diffSec) || diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

