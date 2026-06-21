import { useState, useRef, useCallback, useEffect, useMemo, useDeferredValue, useLayoutEffect } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  getRegister, listRegisters, addColumn, deleteColumn, renameColumn, updateColumnDropdownOptions,
  duplicateColumn, moveColumn, reorderColumn, changeColumnType, clearColumnData, insertColumn, updateColumnWidth, updateColumnSummary,
  updateColumnBgColor,
  freezeColumn, hideColumn, setColumnMandatory, setColumnUnique, setColumnDoubleEntryWarning,
  addEntry, updateEntry, updateEntryDirect, deleteEntry, duplicateEntry, bulkDeleteEntries, insertEntry,
  clearRegisterCache,
  listRowHistory,
  restoreEntry, bulkRestoreEntries, restoreColumn,
  addPage, renamePage, deletePage,
  evaluateFormula,
  generateShareLink, addSharedUser, removeSharedUser,
  subscribeToMutationStatus, updateEntriesOrder, flushAllPendingWrites,
  getPendingMutationsCount,
  updateEntryCellStyles, unlinkColumn,
  formatDateToDDMMYYYY,
  listFolders,
  type Entry, type CellStyle, type HistoryEntry, type Folder,
} from '../lib/api';
// xlsx, jsPDF, and jspdf-autotable are now dynamically imported via useExport hook
import { useExport } from '../hooks/useExport';
import { useColumnStats } from '../hooks/useColumnStats';
import {
  Plus, ChevronDown, Calendar,
  Hash, FlaskConical, Pin, IndianRupee,
  Mail, Phone, Globe, Star, CheckSquare, Image as ImageIcon, ArrowLeft,
  Search, FileText, Download, ListOrdered, Maximize2, AlertCircle,
  X, Link as LinkIcon, Info, AlertTriangle, Trash2, ZoomIn, ZoomOut, Bell, Clock, Lock
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RegisterHeader } from '../components/register/RegisterHeader';
import { SpreadsheetRow } from '../components/register/SpreadsheetRow';
import { CellFormatToolbar } from '../components/register/CellFormatToolbar';
import { ExportModal } from '../components/register/modals/ExportModal';
import { ShareModal } from '../components/register/modals/ShareModal';
import { ColumnModals } from '../components/register/modals/ColumnModals';
import { OtherModals } from '../components/register/modals/OtherModals';
import { RegisterToolbar } from '../components/register/RegisterToolbar';
import { RegisterContextMenus } from '../components/register/menus/RegisterContextMenus';
import { RegisterSummaryRow } from '../components/register/RegisterSummaryRow';
import { AddRecordModal } from '../components/register/modals/AddRecordModal';
import { COL_TYPES } from '../lib/constants';
import { useNotifications } from '../lib/NotificationContext';
import { ColumnIcon } from '../components/register/ColumnIcon';
import { useAuth } from '../lib/auth';
import { firebaseLogWorkspaceAction } from '../lib/firebaseAuth';
import { ImageCompressionModule } from '../lib/imageCompressionModule';
import { DataPersistenceModule } from '../lib/dataPersistenceModule';
import { StorageOptimizerModal } from '../components/register/modals/StorageOptimizerModal';
import { RowDetailModal } from '../components/register/modals/RowDetailModal';
import { ImagePreviewModal } from '../components/register/modals/ImagePreviewModal';
import { ReminderModal } from '../components/register/modals/ReminderModal';
import { RemindersSummaryModal } from '../components/register/modals/RemindersSummaryModal';
import { FloatingSelectionToolbar } from '../components/register/FloatingSelectionToolbar';
import { CalcMenuPopover } from '../components/register/menus/CalcMenuPopover';

type CalcType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'filled' | 'empty' | 'distinct' | 'none';


// Helper to normalize DD-MM-YYYY to YYYY-MM-DD for comparison
function parseDateString(dStr: string) {
  if (!dStr) return '';
  if (dStr.includes('/') || dStr.includes('-')) {
    const parts = dStr.split(/[/-]/);
    if (parts.length === 3) {
      // Ensure DD and MM are padded if they come in as 1 or 2 digits
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return dStr;
}

export default function RegisterPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const registerId = Number(id) || 0;
  const queryClient = useQueryClient();
  const { addNotification, scheduleReminder, reminders, setReminders } = useNotifications();

  const registerReminders = useMemo(() => {
    return reminders.filter(r => r.registerId === String(registerId));
  }, [reminders, registerId]);

  const [showAddRecordModal, setShowAddRecordModal] = useState(false);
  const [detailViewEntry, setDetailViewEntry] = useState<Entry | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<number | null>(null);

  const isAdminUserTop = useMemo(() => {
    return (user as any)?.permissions?.isAdmin === true || (user as any)?.permissions?.fullSheetAccess === true || (user as any)?.role === 'admin' || (user as any)?.role === 'superadmin' || (user as any)?.role === 'sheet_admin';
  }, [user]);



  // Helper to parse column restriction strings like "1,3,5-8" into a Set of 0-indexed column indices
  const _parseColumnRestriction = (value: any): Set<number> | null => {
    if (Array.isArray(value)) return new Set(value);
    if (typeof value === 'string' && value.trim()) {
      const allowed = new Set<number>();
      const parts = value.split(',').map((s: string) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.includes('-')) {
          const [start, end] = p.split('-').map(Number);
          if (!isNaN(start) && !isNaN(end)) {
            for (let i = start; i <= end; i++) allowed.add(i - 1); // 0-indexed
          }
        } else {
          const num = Number(p);
          if (!isNaN(num)) allowed.add(num - 1);
        }
      }
      return allowed.size > 0 ? allowed : null;
    }
    return null;
  };


  const { data: register, isLoading, error } = useQuery({
    queryKey: ['register', registerId],
    queryFn: () => getRegister(Number(registerId)),
    enabled: !!registerId && !isNaN(Number(registerId)),
    staleTime: 10 * 1000,
    // Re-enabled: the sync guard (hasPendingDebounce + hasPendingRowMutations at
    // the merge block below) already blocks localEntries overwrites when writes are
    // in-flight, so window-focus refetch is safe and ensures users see fresh data
    // when switching back to the tab.
    refetchOnWindowFocus: true,
    refetchInterval: (detailViewEntry || showAddRecordModal) ? false : 15 * 1000,  // Background sync every 15 seconds to prevent multi-user overwrites
    placeholderData: keepPreviousData,
  });

  // Helper to log workspace actions for activity tracking
  const _logWork = useCallback((action: string, details: string) => {
    if (user?.id) {
      firebaseLogWorkspaceAction(
        user.id as string, 
        (user as any)?.name || user?.email || 'Unknown', 
        action, 
        details, 
        registerId, 
        register?.name
      );
    }
  }, [user, registerId, register]);

  const hasRegisterAccess = useMemo(() => {
    if (!user) return false;
    if ((user as any).permissions?.isAdmin || (user as any).permissions?.fullSheetAccess || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return true;
    
    const allowedRegs = (user as any).permissions?.allowedRegisters;
    const allowedFolders = (user as any).permissions?.allowedFolders;

    const hasExplicitRegAccess = Array.isArray(allowedRegs) && allowedRegs.map(String).includes(String(registerId));
    
    const folderId = (register as any)?.folderId;
    const hasFolderAccess = folderId && Array.isArray(allowedFolders) && allowedFolders.map(String).includes(folderId.toString());

    return !!(hasExplicitRegAccess || hasFolderAccess);
  }, [user, registerId, register]);

  const isFullyRestricted = useMemo(() => !hasRegisterAccess, [hasRegisterAccess]);

  const _canDownloadAny = useMemo(() => {
    if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin') return true;
    
    if (!hasRegisterAccess) return false;

    const dlRest = (user as any).permissions?.downloadRestrictions;
    // If downloadRestrictions[String(registerId)] is an empty array, it means download is disabled for this sheet
    if (dlRest && Array.isArray(dlRest[String(registerId)]) && dlRest[String(registerId)].length === 0) return false;
    
    return true;
  }, [user, registerId, hasRegisterAccess]);

  const _canEditAny = useMemo(() => {
    if (!user || (user as any).permissions?.isAdmin || (user as any).permissions?.fullSheetAccess || (user as any).role === 'admin' || (user as any).role === 'superadmin' || (user as any).role === 'sheet_admin') return true;
    
    if (!hasRegisterAccess) return false;

    const editRest = (user as any).permissions?.editRestrictions;
    // If editRest[String(registerId)] is an empty array, it means edit is disabled for this sheet
    if (editRest && Array.isArray(editRest[String(registerId)]) && editRest[String(registerId)].length === 0) return false;
    
    return true;
  }, [user, registerId, hasRegisterAccess]);

  const _canCreateAny = _canEditAny;

  const _editableColumnIds = useMemo(() => {
    if (!user || (user as any).permissions?.isAdmin || (user as any).permissions?.fullSheetAccess || (user as any).role === 'admin' || (user as any).role === 'superadmin' || (user as any).role === 'sheet_admin') return null; // All columns editable
    
    const editRest = (user as any).permissions?.editRestrictions;
    if (!editRest || editRest[String(registerId)] === undefined) {
      return _canEditAny ? null : new Set<number>();
    }

    if (Array.isArray(editRest[String(registerId)])) {
      if (editRest[String(registerId)].length === 0) return new Set<number>();
      return new Set<number>(editRest[String(registerId)].map(Number));
    }

    return new Set<number>();
  }, [user, registerId, _canEditAny]);

  useEffect(() => {
    if (isFullyRestricted && id) {
      toast.error("You do not have permission to view this register.");
      navigate('/');
    }
  }, [isFullyRestricted, navigate, id]);

  // Row-level view restrictions
  const rowViewRange = useMemo(() => {
    if (!user || isAdminUserTop) return null; // null = show all rows
    const rvr = (user as any).permissions?.rowViewRestrictions;
    if (rvr && rvr[String(registerId)]) return rvr[String(registerId)];
    return null;
  }, [user, registerId, isAdminUserTop]);

  // Row-level edit restrictions
  const _rowEditRange = useMemo(() => {
    if (!user || isAdminUserTop) return null;
    const rer = (user as any).permissions?.rowEditRestrictions;
    if (rer && rer[String(registerId)]) return rer[String(registerId)];
    return null;
  }, [user, registerId, isAdminUserTop]);

  // Row-level download restrictions
  const rowDownloadRange = useMemo(() => {
    if (!user || isAdminUserTop) return null;
    const rdr = (user as any).permissions?.rowDownloadRestrictions;
    if (rdr && rdr[String(registerId)]) return rdr[String(registerId)];
    return null;
  }, [user, registerId, isAdminUserTop]);

  // Column-level download restrictions — only these columns can be exported
  const downloadableColumnIds = useMemo(() => {
    if (!user || (user as any).permissions?.isAdmin || (user as any).role === 'admin' || (user as any).role === 'superadmin' || (user as any).permissions?.fullSheetAccess) return null;
    
    if (!hasRegisterAccess) return new Set<number>();

    const dlRest = (user as any).permissions?.downloadRestrictions;
    if (!dlRest || dlRest[String(registerId)] === undefined) {
      return null; // All columns downloadable
    }

    if (Array.isArray(dlRest[String(registerId)])) {
      return new Set<number>(dlRest[String(registerId)].map(Number));
    }

    return new Set<number>();
  }, [user, registerId, hasRegisterAccess]);

  // Column-level view restrictions — only these columns should be visible
  const _viewableColumnIds = useMemo(() => {
    if (!user || (user as any).permissions?.isAdmin || (user as any).permissions?.fullSheetAccess || (user as any).role === 'admin' || (user as any).role === 'superadmin' || (user as any).role === 'sheet_admin') return null; // null = all
    
    if (!hasRegisterAccess) return new Set<number>();

    const colViewRest = (user as any).permissions?.columnViewRestrictions;
    if (!colViewRest || colViewRest[String(registerId)] === undefined) {
      return null; // All columns visible
    }

    if (Array.isArray(colViewRest[String(registerId)])) {
      if (colViewRest[String(registerId)].length === 0) return new Set<number>(); // None visible
      return new Set<number>(colViewRest[String(registerId)].map(Number));
    }
    
    return new Set<number>();
  }, [user, registerId, hasRegisterAccess]);

  const cachedRegister = queryClient.getQueryData(['register', registerId]) as any;

  // Fetch all registers for the Link Column feature
  const { data: allRegisters = [] } = useQuery({
    queryKey: ['registers', register?.businessId],
    queryFn: () => listRegisters(register!.businessId),
    enabled: !!register?.businessId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all folders for the Link Column feature
  const { data: allFolders = [] } = useQuery({
    queryKey: ['folders', register?.businessId],
    queryFn: () => listFolders(register!.businessId),
    enabled: !!register?.businessId,
    staleTime: 5 * 60 * 1000,
  });

  // ── State ──
  const _uid = (user as any)?.id || 'guest';
  const [search, setSearch] = useState(() => localStorage.getItem(`rb_search_${_uid}_${registerId}`) || '');
  const [currentPageIndex, setCurrentPageIndex] = useState(() => {
    const saved = localStorage.getItem(`rb_page_${_uid}_${registerId}`);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [localEntries, setLocalEntries] = useState<Entry[]>(cachedRegister?.entries || []);

  const [calcTypes, setCalcTypes] = useState<Record<number, CalcType>>(() => {
    if (cachedRegister?.columns) {
      const calcs: Record<number, CalcType> = {};
      cachedRegister.columns.forEach((col: any) => {
        if (col.summary) calcs[col.id] = col.summary as CalcType;
      });
      return calcs;
    }
    return {};
  });
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingImagesCount, setUploadingImagesCount] = useState(0);
  const [uploadingCells, setUploadingCells] = useState<Record<string, boolean>>({});
  const [pendingDebounceCount, setPendingDebounceCount] = useState(0);
  const pendingTempRowEdits = useRef<Record<number, Record<string, string>>>({});



  // Modals
  const [newColumnModal, setNewColumnModal] = useState(false);
  const [colMenuId, setColMenuId] = useState<number | null>(null);
  const [colMenuRect, setColMenuRect] = useState<DOMRect | null>(null);
  const [manageColsMenu, setManageColsMenu] = useState<{ rect: DOMRect } | null>(null);
  const [rowMenuId, setRowMenuId] = useState<number | null>(null);
  const [renameColModal, setRenameColModal] = useState(false);
  const [dropdownConfigModal, setDropdownConfigModal] = useState(false);
  const [changeTypeModal, setChangeTypeModal] = useState(false);
  const [linkColumnModal, setLinkColumnModal] = useState(false);
  const [insertColModal, setInsertColModal] = useState<'left' | 'right' | null>(null);
  const [linkInfoModal, setLinkInfoModal] = useState<{
    registerName: string;
    columnName: string;
    role: 'source' | 'target' | 'unknown';
    columnId: number;
    linkedRegisterId?: number;
  } | null>(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  
  // Smooth column drag-and-drop reordering
  const [draggedColumnId, setDraggedColumnId] = useState<number | null>(null);
  const [_dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const colHeaderRefs = useRef<Map<number, HTMLTableCellElement>>(new Map());
  const isDraggingCol = useRef(false);
  const [activeModalColId, setActiveModalColId] = useState<number | null>(null);
  const colVirtualizerRef = useRef<any>(null);

  const [dateModal, setDateModal] = useState(false);
  const [dropdownModal, setDropdownModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [renamePageModal, setRenamePageModal] = useState(false);
  const [filterModal, setFilterModal] = useState(false);
  const [storageOptimizerOpen, setStorageOptimizerOpen] = useState(false);
  const [storageOptimizerTab, setStorageOptimizerTab] = useState<'analytics' | 'config' | 'sandbox' | 'chunks' | 'ledger'>('analytics');
  const [activeSyncCount, setActiveSyncCount] = useState(0);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = DataPersistenceModule.subscribe((ledger) => {
      const pendingCount = ledger.filter(item => item.status === 'pending' || item.status === 'persisting').length;
      setActiveSyncCount(pendingCount);
    });
    return unsubscribe;
  }, []);

  const isLocalStorageInitializedRef = useRef(false);

  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`rb_hidden_cols_${_uid}_${registerId}`);
      if (saved) {
        isLocalStorageInitializedRef.current = true;
        return new Set(JSON.parse(saved));
      }
    } catch (e) {}
    return new Set();
  });
  const [frozenColumns, setFrozenColumns] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(`rb_frozen_cols_${_uid}_${registerId}`);
      if (saved) {
        // We only really need one ref, but we can set it here too just in case
        isLocalStorageInitializedRef.current = true;
        return new Set(JSON.parse(saved));
      }
    } catch (e) {}
    return new Set();
  });

  useEffect(() => {
    if (registerId) {
      localStorage.setItem(`rb_hidden_cols_${_uid}_${registerId}`, JSON.stringify(Array.from(hiddenColumns)));
    }
  }, [hiddenColumns, registerId]);

  useEffect(() => {
    if (registerId) {
      localStorage.setItem(`rb_frozen_cols_${_uid}_${registerId}`, JSON.stringify(Array.from(frozenColumns)));
    }
  }, [frozenColumns, registerId]);
  const [sortColId, setSortColId] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  const detailViewEntryIdRef = useRef<number | null>(null);
  const scrollToRowIdRef = useRef<number | null>(null);
  useEffect(() => {
    detailViewEntryIdRef.current = detailViewEntry?.id || null;
    if (detailViewEntry) {
      setDetailEdits(detailViewEntry.cells || {});
      setDetailErrors({});
    } else {
      setDetailEdits({});
      setDetailErrors({});
    }
  }, [detailViewEntry]);

  const [detailEdits, setDetailEdits] = useState<Record<string, string>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string | null>>({});
  const detailErrorsRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    detailErrorsRef.current = detailErrors;
  }, [detailErrors]);
  const detailInputRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [previewImage, setPreviewImage] = useState<{ url: string; entryId?: number; colId?: string } | null>(null);
  const [showRowAuditTrail, setShowRowAuditTrail] = useState(false);
  const [rowAuditHistory, setRowAuditHistory] = useState<HistoryEntry[]>([]);
  const [rowAuditLoading, setRowAuditLoading] = useState(false);

  // Cell formatting toolbar
  const [formatCell, setFormatCell] = useState<{ entryId: number; colId: string; rect: DOMRect } | null>(null);

  // Reminders
  const [reminderModal, setReminderModal] = useState<{ entryId: number; colId: string } | null>(null);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderStatus, setReminderStatus] = useState<'Pending' | 'Complete'>('Pending');
  const [showRemindersSummary, setShowRemindersSummary] = useState(false);


  // New column form (shared by Add Column and Insert Column)
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('text');
  const [newColDropdownOpts, setNewColDropdownOpts] = useState('');
  const [newColFormula, setNewColFormula] = useState('');

  // Change column type
  const [changeTypeValue, setChangeTypeValue] = useState('text');

  // Rename column
  const [renameColValue, setRenameColValue] = useState('');

  // Dropdown config
  const [dropdownConfigOptions, setDropdownConfigOptions] = useState('');

  // Filter
  const [filters, setFilters] = useState<Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>>(() => {
    const saved = localStorage.getItem(`rb_filters_${_uid}_${registerId}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [activeFilters, setActiveFilters] = useState<Array<{ columnId: number; operator: string; value: string; value2?: string; values?: string[] }>>(() => {
    const saved = localStorage.getItem(`rb_active_filters_${_uid}_${registerId}`);
    return saved ? JSON.parse(saved) : [];
  });

  const deferredSearch = useDeferredValue(search);
  const deferredActiveFilters = useDeferredValue(activeFilters);

  // Column Selection and Preview Mode
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(() => {
    try {
      const savedCols = localStorage.getItem(`rb_selected_cols_${_uid}_${registerId}`);
      if (savedCols) {
        return new Set(JSON.parse(savedCols));
      }
    } catch (e) {}
    return new Set();
  });
  const [isPreviewSelectedColumns, setIsPreviewSelectedColumns] = useState(() => {
    try {
      const savedPreview = localStorage.getItem(`rb_preview_selected_${_uid}_${registerId}`);
      if (savedPreview) {
        return savedPreview === 'true';
      }
    } catch (e) {}
    return false;
  });

  // Date picker for cell — refs to avoid re-render on open
  const [dateDay, setDateDay] = useState('');
  const [dateMonth, setDateMonth] = useState('');
  const [dateYear, setDateYear] = useState('');
  const dateEntryIdRef = useRef<number | null>(null);
  const dateColumnIdRef = useRef<number | null>(null);
  const dateRectRef = useRef<{ top: number, bottom: number, left: number, width: number } | null>(null);
  // Expose as stable getters for OtherModals
  const dateEntryId = dateEntryIdRef.current;
  const dateColumnId = dateColumnIdRef.current;
  const dateRect = dateRectRef.current;

  // Dropdown for cell — refs to avoid re-render on open
  const dropdownOptionsRef = useRef<string[]>([]);
  const dropdownEntryIdRef = useRef<number | null>(null);
  const dropdownColumnIdRef = useRef<number | null>(null);
  const dropdownRectRef = useRef<{ top: number, bottom: number, left: number, width: number } | null>(null);
  const dropdownOptions = dropdownOptionsRef.current;
  const dropdownEntryId = dropdownEntryIdRef.current;
  const dropdownColumnId = dropdownColumnIdRef.current;
  const dropdownRect = dropdownRectRef.current;

  // Share
  const [sharePhone, setSharePhone] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [showExportModal, setShowExportModal] = useState(false);
  // Rename page
  const [renamePageId, setRenamePageId] = useState<number | null>(null);
  const [renamePageValue, setRenamePageValue] = useState('');

  const [calcMenu, setCalcMenu] = useState<{ colId: number; rect: DOMRect } | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Data-loss fix: track in-flight row-add mutations so the localEntries sync
  //    guard (hasPendingDebounce) can also block syncs while rows are being written.
  //    Without this, a background refetch arriving between two onSuccess calls
  //    replaces real-integer-ID entries (already promoted from temp) that are not
  //    yet visible in the Firestore snapshot.
  const pendingRowMutationsCount = useRef(0);

  // Tracks integer IDs of rows added during this browser session so they are
  // never silently dropped by a server-sync that lags behind the local writes.
  const sessionAddedEntryIds = useRef<Set<number>>(new Set());

  // Undo/Redo tracking has been removed to ensure reliable Firestore database updates.

  // Column widths state for custom resizing
  const [colWidths, setColWidths] = useState<Record<number, number>>({});

  // ── Data ──
  // Combined query above handles data fetching for the register
  const errorRef = useRef<any>(null);
  useEffect(() => {
    if (error) {
      errorRef.current = error;
      toast.error('Failed to load register data');
      addNotification({
        title: 'Data Load Error',
        message: 'Failed to load register data. Please try refreshing the page.',
        type: 'error',
        link: { registerId: String(registerId) }
      });
    }
  }, [error, addNotification, registerId]);

  // Note: cache busting removed — the in-memory cache is the source of truth.
  // Busting on every mount was causing data alteration on page refresh
  // because debounced writes might not have persisted yet.

  useEffect(() => {
    const unsubscribe = subscribeToMutationStatus((count) => {
      setIsSaving(count > 0);
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Flush any pending debounced writes immediately before unloading
      const timers = debounceTimers.current;
      const pendingKeys = Object.keys(timers);
      const hasPending = pendingKeys.length > 0;
      if (hasPending) {
        // Fire all pending debounced writes synchronously
        pendingKeys.forEach(key => {
          clearTimeout(timers[key]);
          delete timers[key];
        });
        // Derive and fire pending cell diffs from localEntries vs React Query cache
        const currentRegData = queryClient.getQueryData(['register', registerId]) as any;
        if (currentRegData) {
          const localMap = new Map(localEntriesRef.current.map(le => [le.id, le]));
          for (const entry of currentRegData.entries || []) {
            const local = localMap.get(entry.id);
            if (!local) continue;
            const diff: Record<string, string> = {};
            for (const [colId, val] of Object.entries(local.cells || {})) {
              if ((entry.cells?.[colId] || '') !== (val || '')) {
                diff[colId] = val as string;
              }
            }
            if (Object.keys(diff).length > 0) {
              updateEntryDirect(registerId, entry.id, diff);
            }
          }
        }
      }
      if (isSaving || hasPending) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaving, registerId, queryClient]);

  // Stabilize references so child components only re-render when the actual data changes
  const columns = useMemo(() => {
    const all = [...(register?.columns || [])].sort((a, b) => a.position - b.position);
    if (!_viewableColumnIds) return all;
    return all.filter(c => _viewableColumnIds.has(c.id));
  }, [register?.columns, _viewableColumnIds]);
  const pages = useMemo(() => register?.pages || [{ id: 1, name: 'Page 1', index: 0 }], [register?.pages]);

  useEffect(() => {
    if (!isLocalStorageInitializedRef.current && columns.length > 0) {
      const nextHidden = new Set<number>();
      const nextFrozen = new Set<number>();
      columns.forEach((col: any) => {
        if (col.hidden) nextHidden.add(col.id);
        if (col.frozen) nextFrozen.add(col.id);
      });
      setHiddenColumns(nextHidden);
      setFrozenColumns(nextFrozen);
      isLocalStorageInitializedRef.current = true;
      // Note: we don't return here because we still want to update the refs below
    }

    // Keep refs in sync for handlers that need latest data in closures
    columnsRef.current = columns;
    visibleColumnsRef.current = columns.filter(c => !hiddenColumns.has(c.id));
  }, [columns, hiddenColumns, frozenColumns]);

  // Lock body scroll and handle back-button to close modal
  const modalOpenRef = useRef(false);
  useEffect(() => {
    if (detailViewEntry && !modalOpenRef.current) {
      modalOpenRef.current = true;
      document.body.classList.add('modal-open');
      // Push state to history so back button closes modal
      window.history.pushState({ modal: 'row-detail' }, '');
      
      const handlePopState = () => {
        // If we popped back and we were in a modal, close it
        setDetailViewEntry(null);
        setDetailEdits({});
        setDetailErrors({});
        modalOpenRef.current = false;
      };
      
      window.addEventListener('popstate', handlePopState);
      return () => {
        document.body.classList.remove('modal-open');
        window.removeEventListener('popstate', handlePopState);
        // Clean up history if modal closed via 'X' or Save
        if (modalOpenRef.current && window.history.state?.modal === 'row-detail') {
          modalOpenRef.current = false;
          window.history.back();
        }
      };
    } else if (!detailViewEntry && modalOpenRef.current) {
      modalOpenRef.current = false;
    }
  }, [detailViewEntry]);

  // Auto-initialize edit values when Row Detail view opens (but NOT when columns change mid-edit)
  const detailInitEntryIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (detailViewEntry && columns.length > 0) {
      // Only initialize when opening a new/different entry, not when columns update
      if (detailInitEntryIdRef.current !== detailViewEntry.id) {
        detailInitEntryIdRef.current = detailViewEntry.id;
        const init: Record<string, string> = {};
        columns.filter(c => c.type !== 'formula').forEach(c => {
          init[c.id.toString()] = detailViewEntry.cells?.[c.id.toString()] || '';
        });
        setDetailEdits(init);
      }
    } else {
      // Reset tracker when modal closes
      detailInitEntryIdRef.current = null;
    }
  }, [detailViewEntry, columns]);

  // Sync localEntries and column settings when registerId changes or new data arrives.
  // We do this during render (derived state) to prevent a white-screen flash.
  // By using cachedRegister, we can often show data immediately upon navigation.
  const lastSyncId = useRef<number | null>(null);
  const lastSyncData = useRef<any>(null);

  const dataToSync = register || (Number(registerId) !== lastSyncId.current ? cachedRegister : null);

  const hasPendingDebounce = Object.keys(debounceTimers.current).length > 0;
  // ── Data-loss fix: also block sync if any row-add mutations are still running.
  //    Without this check, a 60 s background refetch that lands while row mutations
  //    are still in-flight would see a partial Firestore snapshot and overwrite the
  //    locally-held entries that have already been promoted from temp→real integer ID
  //    but whose Firestore writes haven't fully propagated to the snapshot yet.
  const hasPendingRowMutations = pendingRowMutationsCount.current > 0;

  // ── Data-loss fix: also block sync if there are any active/in-flight database mutations
  //    (such as cell updates that have fired their debounce but are still persisting).
  //    Without this, a background poll or window-focus refetch could land during a write,
  //    reverting the local UI/cache entries to the old server snapshot and causing data loss.
  const hasPendingMutations = getPendingMutationsCount() > 0;

  if (Number(registerId) !== lastSyncId.current || (register && register !== lastSyncData.current && !hasPendingDebounce && !hasPendingRowMutations && !hasPendingMutations)) {
    if (Number(registerId) !== lastSyncId.current) {
      let loadedSelected: Set<number> = new Set();
      try {
        const savedCols = localStorage.getItem(`rb_selected_cols_${_uid}_${registerId}`);
        if (savedCols) {
          loadedSelected = new Set(JSON.parse(savedCols));
        }
      } catch (e) {}
      setSelectedColumns(loadedSelected);

      let loadedPreview = false;
      try {
        const savedPreview = localStorage.getItem(`rb_preview_selected_${_uid}_${registerId}`);
        if (savedPreview) {
          loadedPreview = savedPreview === 'true';
        }
      } catch (e) {}
      setIsPreviewSelectedColumns(loadedPreview);
      // Clear session row IDs when switching registers
      sessionAddedEntryIds.current.clear();
    }
    lastSyncId.current = Number(registerId);
    lastSyncData.current = register;

    if (dataToSync) {
      // Preserve local optimistic/temporary entries (those with floating point IDs)
      // during query cache synchronization
      const tempEntries = localEntries.filter((e) => !Number.isInteger(e.id));
      const incomingEntries = dataToSync.entries || [];
      const incomingIdSet = new Set(incomingEntries.map((e: any) => e.id));
      const merged = [...incomingEntries];

      // Preserve temp (float ID) entries not yet in server snapshot
      tempEntries.forEach((temp) => {
        if (!incomingIdSet.has(temp.id)) {
          merged.push(temp);
        }
      });

      // ── Data-loss fix: also preserve session-added REAL (integer) entries that
      //    are absent from this snapshot. This covers the race where onSuccess has
      //    already replaced a temp ID with a real integer ID in localEntries but the
      //    background refetch snapshot was taken before that write landed in Firestore.
      localEntries.forEach((e) => {
        if (Number.isInteger(e.id) && !incomingIdSet.has(e.id) && sessionAddedEntryIds.current.has(e.id)) {
          merged.push(e);
        }
      });

      // ── Stability fix: Skip setLocalEntries when the merged data is structurally
      //    identical to the current localEntries. This prevents unnecessary re-renders
      //    from background refetches (every 30s or on window focus) that would cause
      //    the virtualizer to recalculate and briefly display rows in wrong positions.
      const isSameData = merged.length === localEntries.length && merged.every((m, i) => {
        const l = localEntries[i];
        if (!l || m.id !== l.id || m.rowNumber !== l.rowNumber || m.pageIndex !== l.pageIndex) return false;
        // Deep-check cells only if both exist
        const mCells = m.cells || {};
        const lCells = l.cells || {};
        const mKeys = Object.keys(mCells);
        const lKeys = Object.keys(lCells);
        if (mKeys.length !== lKeys.length) return false;
        for (const k of mKeys) {
          if (mCells[k] !== lCells[k]) return false;
        }
        return true;
      });
      if (!isSameData) {
        setLocalEntries(merged);
      }
      // Initialize column settings (widths, summaries) from saved data
      if (dataToSync.columns) {
        const widths: Record<number, number> = {};
        const calcs: Record<number, CalcType> = {};
        dataToSync.columns.forEach((col: any) => {
          if (col.width) widths[col.id] = col.width;
          if (col.summary) calcs[col.id] = col.summary as CalcType;
        });
        setColWidths(widths);
        setCalcTypes(calcs);
      }
      
      // Safety: reset page index if it's out of bounds for the current register data
      const totalEntries = dataToSync.entries?.length || 0;
      if (totalEntries > 0) {
        const lastPage = Math.floor((totalEntries - 1) / 500); // Assuming ~500 per page if not chunked, but we use pageIndex.
        // Actually, let's just reset if it's a new register switch
        if (registerId !== lastSyncId.current) {
             const saved = localStorage.getItem(`rb_page_${_uid}_${registerId}`);
             if (!saved) setCurrentPageIndex(0);
        }
      }
    } else if (registerId !== lastSyncId.current) {
      // Clear data for a new register if no cache exists, avoiding showing stale data
      setLocalEntries([]);
      setColWidths({});
      setCalcTypes({});
    }
  }


  // Also sync localEntriesRef on every local state change
  useEffect(() => {
    localEntriesRef.current = localEntries;
  }, [localEntries]);

  useEffect(() => {
    if (selectedColumns.size === 0) {
      setIsPreviewSelectedColumns(false);
    }
  }, [selectedColumns.size]);

  useEffect(() => {
    if (registerId) {
      localStorage.setItem(`rb_selected_cols_${_uid}_${registerId}`, JSON.stringify(Array.from(selectedColumns)));
    }
  }, [selectedColumns, registerId]);

  useEffect(() => {
    if (registerId) {
      localStorage.setItem(`rb_preview_selected_${_uid}_${registerId}`, isPreviewSelectedColumns ? 'true' : 'false');
    }
  }, [isPreviewSelectedColumns, registerId]);

  const handleCalcCellClick = (e: React.MouseEvent, colId: number) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setCalcMenu({ colId, rect });
  };

  const handleImageDownload = useCallback(async (url: string) => {
    if (!url) return;
    try {
      // For data URLs or blobs, we can download directly
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `record_image_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // For external URLs, try to fetch to avoid browser opening in new tab
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `record_image_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Download failed:", err);
      // Fallback: just open in new tab if fetch fails (CORS)
      window.open(url, '_blank');
    }
  }, []);

  const updateCalcType = async (colId: number, type: string) => {
    setCalcTypes(prev => ({ ...prev, [colId.toString()]: type as CalcType }));
    setCalcMenu(null);
    try {
      await updateColumnSummary(registerId, colId, type);
    } catch (err) {
      toast.error('Failed to save summary setting');
    }
  };

  useEffect(() => {
    if (calcMenu) {
      const h = () => setCalcMenu(null);
      window.addEventListener('click', h);
      return () => window.removeEventListener('click', h);
    }
  }, [calcMenu]);

  // Persist filter state to localStorage
  useEffect(() => {
    if (!registerId) return;
    localStorage.setItem(`rb_search_${_uid}_${registerId}`, search);
    localStorage.setItem(`rb_page_${_uid}_${registerId}`, currentPageIndex.toString());
    localStorage.setItem(`rb_filters_${_uid}_${registerId}`, JSON.stringify(filters));
    localStorage.setItem(`rb_active_filters_${_uid}_${registerId}`, JSON.stringify(activeFilters));
  }, [search, currentPageIndex, filters, activeFilters, registerId]);

  // Reset page to 0 when filters or search change to avoid being stuck on an empty page
  const isInitialFilterRender = useRef(true);
  useEffect(() => {
    if (isInitialFilterRender.current) {
      isInitialFilterRender.current = false;
      return;
    }
    setCurrentPageIndex(0);
  }, [deferredSearch, deferredActiveFilters]);

  // Ctrl+F to focus search, Ctrl+S to flush & save all pending edits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const el = document.getElementById('pab-search-input');
        if (el) { el.focus(); (el as HTMLInputElement).select(); }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Immediately fire all pending debounced writes
        const timers = debounceTimers.current;
        const pendingKeys = Object.keys(timers);
        if (pendingKeys.length > 0) {
          pendingKeys.forEach(key => {
            clearTimeout(timers[key]);
            delete timers[key];
          });
          setPendingDebounceCount(0);
          // Collect all pending cell edits from localEntries and fire updateEntryDirect for each
          // The debounce timers captured closures with the values, so clearing them means
          // we need to re-derive the pending edits from localEntries vs the React Query cache
          const currentRegData = queryClient.getQueryData(['register', registerId]) as any;
          if (currentRegData) {
            const localMap = new Map(localEntriesRef.current.map(e => [e.id, e]));
            for (const entry of currentRegData.entries || []) {
              const local = localMap.get(entry.id);
              if (!local) continue;
              const diff: Record<string, string> = {};
              for (const [colId, val] of Object.entries(local.cells || {})) {
                if ((entry.cells?.[colId] || '') !== (val || '')) {
                  diff[colId] = val as string;
                }
              }
              if (Object.keys(diff).length > 0) {
                updateEntryDirect(registerId, entry.id, diff);
              }
            }
          }
        }
        // Wait for all queued mutations to complete
        flushAllPendingWrites().then(() => {
          toast.success('All changes saved!', { duration: 1500 });
        });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [registerId, queryClient]);

  // Periodic auto-flush: save pending debounced edits every 5 seconds to prevent
  // data loss if the user closes the tab before debounce timers fire.
  useEffect(() => {
    const interval = setInterval(() => {
      const timers = debounceTimers.current;
      const pendingKeys = Object.keys(timers);
      if (pendingKeys.length > 0) {
        pendingKeys.forEach(key => {
          clearTimeout(timers[key]);
          delete timers[key];
        });
        setPendingDebounceCount(0);
        const currentRegData = queryClient.getQueryData(['register', registerId]) as any;
        if (currentRegData) {
          const localMap = new Map(localEntriesRef.current.map(e => [e.id, e]));
          for (const entry of currentRegData.entries || []) {
            const local = localMap.get(entry.id);
            if (!local) continue;
            const diff: Record<string, string> = {};
            for (const [colId, val] of Object.entries(local.cells || {})) {
              if ((entry.cells?.[colId] || '') !== (val || '')) diff[colId] = val as string;
            }
            if (Object.keys(diff).length > 0) {
              updateEntryDirect(registerId, entry.id, diff);
            }
          }
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [registerId, queryClient]);

  // Apply row-level view restrictions before any search/filter/sort
  const rowFilteredEntries = useMemo(() => {
    if (!rowViewRange) return localEntries;
    const { start, end } = rowViewRange;
    return localEntries.filter(e => {
      const num = e.rowNumber;
      if (start !== undefined && num < start) return false;
      if (end !== undefined && num > end) return false;
      return true;
    });
  }, [localEntries, rowViewRange]);

  const entriesByPage = useMemo(() => {
    const pages: Record<number, Entry[]> = {};
    rowFilteredEntries.forEach((e) => {
      const pIdx = e.pageIndex || 0;
      if (!pages[pIdx]) pages[pIdx] = [];
      pages[pIdx].push(e);
    });
    return pages;
  }, [rowFilteredEntries]);

  const pageOffset = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < currentPageIndex; i++) {
      sum += (entriesByPage[i] || []).length;
    }
    return sum;
  }, [entriesByPage, currentPageIndex]);

  // Build paginated lookup from row-filtered entries
  const rowFilteredEntriesByPage = entriesByPage;

  // Filter + sort entries — memoized so it only recomputes when inputs change
  const displayEntries = useMemo(() => {
    const s = deferredSearch.toLowerCase().trim();
    
    // Pre-calculate filter values once before the loop
    const preparedFilters = deferredActiveFilters.map(f => ({
      ...f,
      lFilter: (f.value || '').toLowerCase(),
      nValue: parseFloat(f.value),
      nValue2: parseFloat(f.value2 || '0'),
      dValue: f.value, // Date filters use YYYY-MM-DD string
      dValue2: f.value2 || '',
      values: f.values || [],
    }));

    const filterLen = preparedFilters.length;
    const isSearching = !!s || filterLen > 0;
    
    // Safety check for pagination: if current page is empty but data exists, fallback to page 0
    let targetPage = currentPageIndex;
    if (!isSearching && !entriesByPage[targetPage] && entriesByPage[0]) {
      targetPage = 0;
    }
    
    const entriesToFilter = isSearching ? rowFilteredEntries : (entriesByPage[targetPage] || []);

    // Fast path: No search, no filters, no sorting.
    if (!isSearching && !sortColId) {
      return entriesToFilter;
    }

    let result = isSearching ? [] : [...entriesToFilter];

    if (isSearching) {
      const localLen = entriesToFilter.length;
      for (let i = 0; i < localLen; i++) {
        const e = entriesToFilter[i];

        // 2. Search filtering
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

        // 3. Active Filters
        if (filterLen > 0) {
          let passFilters = true;
          for (let j = 0; j < filterLen; j++) {
            const f = preparedFilters[j];
            const val = (e.cells?.[f.columnId.toString()] || '').trim();
            const lVal = val.toLowerCase();

            let condition = true;
            switch (f.operator) {
              case 'contains': condition = lVal.includes(f.lFilter); break;
              case 'not_contains': condition = !lVal.includes(f.lFilter); break;
              case 'equals': condition = lVal === f.lFilter; break;
              case 'not_equals': condition = lVal !== f.lFilter; break;
              case 'starts_with': condition = lVal.startsWith(f.lFilter); break;
              case 'ends_with': condition = lVal.endsWith(f.lFilter); break;
              case 'eq': condition = parseFloat(val) === f.nValue; break;
              case 'gt': condition = parseFloat(val) > f.nValue; break;
              case 'gte': condition = parseFloat(val) >= f.nValue; break;
              case 'lt': condition = parseFloat(val) < f.nValue; break;
              case 'lte': condition = parseFloat(val) <= f.nValue; break;
              case 'between': {
                const n = parseFloat(val);
                condition = n >= f.nValue && n <= f.nValue2;
                break;
              }
              case 'not_between': {
                const n = parseFloat(val);
                condition = n < f.nValue || n > f.nValue2;
                break;
              }
              case 'date_is': condition = parseDateString(val) === f.dValue; break;
              case 'date_not': condition = parseDateString(val) !== f.dValue; break;
              case 'date_before': condition = parseDateString(val) < f.dValue; break;
              case 'date_after': condition = parseDateString(val) > f.dValue; break;
              case 'date_between': {
                const dVal = parseDateString(val);
                condition = dVal >= f.dValue && dVal <= f.dValue2;
                break;
              }
              case 'date_not_between': {
                const dVal = parseDateString(val);
                condition = dVal < f.dValue || dVal > f.dValue2;
                break;
              }
              case 'empty': condition = !val; break;
              case 'not_empty': condition = !!val; break;
              case 'multi_select': {
                if (!val) {
                  condition = f.values.includes('(Blanks)');
                } else {
                  condition = f.values.includes(val);
                }
                break;
              }
            }
            if (!condition) {
              passFilters = false;
              break;
            }
          }
          if (!passFilters) continue;
        }

        result.push(e);
      }
    }

    // 4. Client-side Sorting (ensures visual consistency even if backend hasn't updated)
    if (sortColId && sortDir) {
      const colDef = columns.find(c => c.id === sortColId);
      const colIdStr = sortColId.toString();
      result.sort((a, b) => {
        const aVal = a.cells?.[colIdStr] || '';
        const bVal = b.cells?.[colIdStr] || '';
        if (colDef?.type === 'date') {
          const dA = parseDateString(aVal);
          const dB = parseDateString(bVal);
          return sortDir === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }
        if (colDef?.type === 'number' || colDef?.type === 'currency' || colDef?.type === 'formula') {
          const nA = parseFloat(aVal) || 0;
          const nB = parseFloat(bVal) || 0;
          return sortDir === 'asc' ? nA - nB : nB - nA;
        }
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }

    return result;
  }, [localEntries, columns, deferredSearch, deferredActiveFilters, sortColId, sortDir, entriesByPage, currentPageIndex]);

  // ── Column Suggestions (Autocomplete) ──
  const columnSuggestions = useMemo(() => {
    const suggestions: Record<string, string[]> = {};
    columns.forEach(col => {
      // Only for text-based or related columns where autocomplete makes sense
      if (['text', 'email', 'phone', 'url', 'currency', 'auto_increment'].includes(col.type)) {
        const set = new Set<string>();
        const colIdStr = col.id.toString();
        // Use localEntries to get the most current state (including optimistic updates)
        localEntries.forEach(e => {
          const val = e.cells?.[colIdStr];
          if (val && val.trim()) set.add(val.trim());
        });
        // Sort alphabetically for a cleaner dropdown
        suggestions[colIdStr] = Array.from(set).sort((a, b) => a.localeCompare(b));
      }
    });
    return suggestions;
  }, [localEntries, columns]);
  
  // ── Helpers ──
  const cleanOptions = (opts: string[]) => {
    const seen = new Set<string>();
    return opts
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => {
        const lower = s.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
  };


  // ── Mutations ──
  const addColumnMutation = useMutation({
    mutationFn: () => addColumn(registerId, {
      name: newColName, type: newColType,
      dropdownOptions: newColType === 'dropdown' ? cleanOptions(newColDropdownOpts.split(',')) : undefined,
      formula: newColType === 'formula' ? newColFormula : undefined,
    }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      const dummyId = Date.now();
      if (prev) {
        const newCol = {
          id: dummyId, registerId, name: newColName, type: newColType,
          position: prev.columns ? prev.columns.length : 0,
          dropdownOptions: newColType === 'dropdown' ? cleanOptions(newColDropdownOpts.split(',')) : undefined,
          formula: newColType === 'formula' ? newColFormula : undefined,
          createdAt: new Date().toISOString()
        };
        queryClient.setQueryData(['register', registerId], { ...prev, columns: [...(prev.columns || []), newCol] });
      }
      setNewColumnModal(false);
      return { prev, dummyId };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
      setLocalEntries(updatedReg.entries || []);
      // Force a re-fetch to ensure all sequential logic (auto-increment) is synced from server
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      toast.success('Column added successfully');
      _logWork('add_column', `Added column "${newColName}" (${newColType})`);

      // Reset form fields
      setNewColName('');
      setNewColType('text');
      setNewColDropdownOpts('');
      setNewColFormula('');

      // Auto-scroll to the new column
      const oldCols = columnsRef.current;
      const newCol = updatedReg.columns?.find((c: any) => !oldCols.some(old => old.id === c.id));
      if (newCol) {
        setTimeout(() => {
          const colIdx = visibleColumnsRef.current.findIndex(c => c.id === newCol.id);
          if (colIdx !== -1 && colVirtualizerRef.current) {
            colVirtualizerRef.current.scrollToIndex(colIdx, { align: 'center', behavior: 'smooth' });
          } else if (parentRef.current) {
            parentRef.current.scrollTo({ left: parentRef.current.scrollWidth, behavior: 'smooth' });
          }
        }, 150);
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to add column');
    },
    onSettled: () => { setNewColName(''); setNewColType('text'); setNewColDropdownOpts(''); setNewColFormula(''); },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: (colId: number) => deleteColumn(registerId, colId),
    onMutate: async (colId) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const previousRegister = queryClient.getQueryData(['register', registerId]) as any;
      const previousLocalEntries = [...localEntries];

      if (previousRegister) {
        const colIdStr = colId.toString();
        const col = previousRegister.columns?.find((c: any) => c.id.toString() === colIdStr);
        if (col?.type === 'formula') {
          throw new Error('Formula columns cannot be deleted');
        }
        
        if (col) {
          // Optimistically update cache
          const updatedReg = {
            ...previousRegister,
            columns: previousRegister.columns.filter((c: any) => c.id.toString() !== colIdStr),
            entries: (previousRegister.entries || []).map((e: any) => {
              const newCells = { ...e.cells };
              delete newCells[colIdStr];
              return { ...e, cells: newCells };
            })
          };
          queryClient.setQueryData(['register', registerId], updatedReg);
          setLocalEntries(updatedReg.entries || []);
        }
      }
      setColMenuId(null);
      return { previousRegister, previousLocalEntries };
    },
    onSuccess: (_, colId, context) => {
      toast.success('Column deleted');
      const deletedColStr = colId.toString();
      const deletedCol = context?.previousRegister?.columns?.find((c: any) => c.id.toString() === deletedColStr);
      _logWork('delete_column', `Deleted column "${deletedCol?.name || colId}"`);
    },
    onError: (err: any, _colId, context) => {
      if (context?.previousRegister) queryClient.setQueryData(['register', registerId], context.previousRegister);
      if (context?.previousLocalEntries) setLocalEntries(context.previousLocalEntries);
      if (err?.message === 'Formula columns cannot be deleted') {
        toast.error('Formula columns cannot be deleted');
      } else {
        toast.error('Failed to delete column');
      }
    },
  });

  const unlinkColumnMutation = useMutation({
    mutationFn: ({ colId, clearData }: { colId: number; clearData: boolean }) => unlinkColumn(registerId, colId, clearData),
    onSuccess: (_, { clearData }) => {
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      if (linkInfoModal?.linkedRegisterId) {
        queryClient.invalidateQueries({ queryKey: ['register', linkInfoModal.linkedRegisterId] });
      }
      toast.success(clearData ? 'Column link removed & data cleared' : 'Column link successfully removed');
      setLinkInfoModal(null);
      setShowUnlinkConfirm(false);
      _logWork('update_permissions', `Removed link on column: ${linkInfoModal?.columnName || 'Unknown'} (${clearData ? 'without data' : 'with data'})`);
    },
    onError: () => {
      toast.error('Failed to remove column link');
    }
  });

  const renameColumnMutation = useMutation({
    mutationFn: () => renameColumn(registerId, activeModalColId!, renameColValue),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev && activeModalColId !== null) {
        const targetCol = prev.columns?.find((c: any) => c.id === activeModalColId);
        const oldName = targetCol?.name;

        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) => {
            if (c.id === activeModalColId) {
              return { ...c, name: renameColValue };
            }
            if (c.type === 'formula' && c.formula && oldName) {
              const escapedOldName = oldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
              const regex = new RegExp(`\\{${escapedOldName}\\}`, 'gi');
              return { ...c, formula: c.formula.replace(regex, `{${renameColValue}}`) };
            }
            return c;
          })
        });
      }
      setRenameColModal(false);
      return { prev };
    },
    onSuccess: (updatedReg, _vars, context) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      toast.success('Column renamed');
      const targetCol = context?.prev?.columns?.find((c: any) => c.id === activeModalColId);
      _logWork('add_column', `Renamed column from "${targetCol?.name || 'Unknown'}" to "${renameColValue}"`);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to rename column');
    },
    onSettled: () => { setRenameColValue(''); setActiveModalColId(null); },
  });

  const updateDropdownMutation = useMutation({
    mutationFn: () => updateColumnDropdownOptions(registerId, activeModalColId!, cleanOptions(dropdownConfigOptions.split(','))),
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      setDropdownConfigModal(false);
      setActiveModalColId(null);
      toast.success('Dropdown options updated');
    },
    onError: () => toast.error('Failed to update options'),
  });

  const addDropdownOptionMutation = useMutation({
    mutationFn: ({ colId, newValue }: { colId: number; newValue: string }) => {
      const col = (register?.columns || []).find((c: any) => c.id === colId);
      const existingOptions = col?.dropdownOptions || [];
      const updatedOptions = cleanOptions([newValue, ...existingOptions]);
      return updateColumnDropdownOptions(registerId, colId, updatedOptions);
    },
    onMutate: async ({ colId, newValue }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) => 
            c.id === colId ? { ...c, dropdownOptions: cleanOptions([newValue, ...(c.dropdownOptions || [])]) } : c
          )
        });
      }
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      toast.success('Option added');
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to add option');
    },
  });

  const onAddDropdownOption = (colId: number, newValue: string, entryId?: number) => {
    addDropdownOptionMutation.mutate({ colId, newValue });
    
    // Also select it for the current entry immediately if entryId provided
    if (entryId != null) {
      setTimeout(() => {
        handleCellChange(entryId, colId.toString(), newValue);
      }, 0);
    }
  };

  const duplicateColumnMutation = useMutation({
    mutationFn: (colId: number) => duplicateColumn(registerId, colId),
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      setColMenuId(null);
      setLocalEntries(updatedReg.entries || []);
      toast.success('Column duplicated');

      // Auto-scroll to the duplicated column
      const oldCols = columnsRef.current;
      const newCol = updatedReg.columns?.find((c: any) => !oldCols.some(old => old.id === c.id));
      if (newCol) {
        setTimeout(() => {
          const colIdx = visibleColumnsRef.current.findIndex(c => c.id === newCol.id);
          if (colIdx !== -1 && colVirtualizerRef.current) {
            colVirtualizerRef.current.scrollToIndex(colIdx, { align: 'center', behavior: 'smooth' });
          } else if (parentRef.current) {
            parentRef.current.scrollTo({ left: parentRef.current.scrollWidth, behavior: 'smooth' });
          }
        }, 150);
      }
    },
    onError: () => toast.error('Failed to duplicate column'),
  });


  const moveColumnMutation = useMutation({
    mutationFn: ({ colId, dir }: { colId: number; dir: 'left' | 'right' }) => moveColumn(registerId, colId, dir),
    onMutate: async ({ colId, dir }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        const cols = prev.columns.map((c: any) => ({ ...c }));
        const idx = cols.findIndex((c: any) => c.id === colId);
        const targetIdx = dir === 'left' ? idx - 1 : idx + 1;
        if (idx >= 0 && targetIdx >= 0 && targetIdx < cols.length) {
          [cols[idx], cols[targetIdx]] = [cols[targetIdx], cols[idx]];
          cols.forEach((c: any, i: number) => { c.position = i; });
          queryClient.setQueryData(['register', registerId], { ...prev, columns: cols });
        }
      }
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to move column');
    },
    onSettled: () => setColMenuId(null),
  });

  const reorderColumnMutation = useMutation({
    mutationFn: ({ colId, targetIndex }: { colId: number; targetIndex: number }) => reorderColumn(registerId, colId, targetIndex),
    onMutate: async ({ colId, targetIndex }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        const cols = prev.columns.map((c: any) => ({ ...c }));
        const idx = cols.findIndex((c: any) => c.id === colId);
        if (idx !== -1) {
          const [col] = cols.splice(idx, 1);
          const clampedTarget = Math.max(0, Math.min(targetIndex, cols.length));
          cols.splice(clampedTarget, 0, col);
          cols.forEach((c: any, i: number) => { c.position = i; });
          queryClient.setQueryData(['register', registerId], { ...prev, columns: cols });
        }
      }
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to reorder column');
    },
    onSettled: () => setColMenuId(null),
  });

  // ── Smooth column drag-and-drop handlers ──
  // Use refs so the mouse event closures always read the latest values
  const dragColIdRef = useRef<number | null>(null);
  const dropTargetIdxRef = useRef<number | null>(null);

  // These refs will be populated after visibleColumns/columns are defined
  const visibleColumnsRef = useRef<typeof columns>([]);
  const columnsRef = useRef<typeof columns>([]);
  const localEntriesRef = useRef<Entry[]>([]);

  const handleColDragMouseDown = useCallback((e: React.MouseEvent, colId: number) => {
    // Only left mouse button
    if (e.button !== 0) return;

    const th = (e.currentTarget as HTMLElement).closest('th') as HTMLTableCellElement;
    if (!th) return;

    e.preventDefault(); // Prevent text selection during drag

    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    let scrollRafId: number | null = null;
    let lastMouseX = 0;

    // Find the scrollable spreadsheet wrapper for auto-scroll
    const scrollContainer = th.closest('.spreadsheet-wrapper') as HTMLElement | null;

    // Auto-scroll loop: runs via requestAnimationFrame while dragging near edges
    const startAutoScroll = () => {
      if (scrollRafId !== null) return; // already running
      if (!scrollContainer) return;

      const edgeZone = 80; // px from edge to trigger scroll
      const maxSpeed = 30; // px per frame at the very edge

      const tick = () => {
        if (!isDraggingCol.current || !scrollContainer) { scrollRafId = null; return; }
        const rect = scrollContainer.getBoundingClientRect();
        const distFromLeft = lastMouseX - rect.left;
        const distFromRight = rect.right - lastMouseX;

        if (distFromLeft < edgeZone && distFromLeft > 0) {
          const speed = maxSpeed * (1 - distFromLeft / edgeZone);
          scrollContainer.scrollLeft -= speed;
        } else if (distFromRight < edgeZone && distFromRight > 0) {
          const speed = maxSpeed * (1 - distFromRight / edgeZone);
          scrollContainer.scrollLeft += speed;
        }
        scrollRafId = requestAnimationFrame(tick);
      };
      scrollRafId = requestAnimationFrame(tick);
    };

    const stopAutoScroll = () => {
      if (scrollRafId !== null) {
        cancelAnimationFrame(scrollRafId);
        scrollRafId = null;
      }
    };

    const cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      stopAutoScroll();

      if (dragGhostRef.current) {
        dragGhostRef.current.remove();
        dragGhostRef.current = null;
      }
      document.querySelectorAll('.col-drop-indicator').forEach(el => el.remove());

      isDraggingCol.current = false;
      dragColIdRef.current = null;
      dropTargetIdxRef.current = null;
      setDraggedColumnId(null);
      setDropTargetIdx(null);
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!started) {
        const dist = Math.sqrt((ev.clientX - startX) ** 2 + (ev.clientY - startY) ** 2);
        if (dist < 5) return;
        started = true;
        isDraggingCol.current = true;
        dragColIdRef.current = colId;
        setDraggedColumnId(colId);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        // Create floating ghost
        const rect = th.getBoundingClientRect();
        const ghost = document.createElement('div');
        ghost.className = 'col-drag-ghost';
        ghost.textContent = th.textContent || '';
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        ghost.style.left = `${ev.clientX - rect.width / 2}px`;
        ghost.style.top = `${ev.clientY - rect.height / 2}px`;
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
      }

      // Move ghost
      if (dragGhostRef.current) {
        const gw = dragGhostRef.current.offsetWidth;
        const gh = dragGhostRef.current.offsetHeight;
        dragGhostRef.current.style.left = `${ev.clientX - gw / 2}px`;
        dragGhostRef.current.style.top = `${ev.clientY - gh / 2}px`;
      }

      // Auto-scroll when near the edges of the spreadsheet container
      lastMouseX = ev.clientX;
      startAutoScroll();

      // Determine target column position
      const visCols = visibleColumnsRef.current;
      let bestIdx: number | null = null;
      colHeaderRefs.current.forEach((headerEl, _id) => {
        const rect = headerEl.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right) {
          const colIdx = visCols.findIndex(c => c.id === _id);
          if (colIdx !== -1) {
            const midX = rect.left + rect.width / 2;
            bestIdx = ev.clientX < midX ? colIdx : colIdx + 1;
          }
        }
      });

      // Remove previous indicators
      document.querySelectorAll('.col-drop-indicator').forEach(el => el.remove());

      if (bestIdx !== null) {
        dropTargetIdxRef.current = bestIdx;
        setDropTargetIdx(bestIdx);

        // Build sorted column elements list
        const cols = Array.from(colHeaderRefs.current.entries());
        const sortedCols = visCols.map(vc => {
          const entry = cols.find(([id]) => id === vc.id);
          return entry ? entry[1] : null;
        }).filter(Boolean) as HTMLTableCellElement[];

        let indicatorLeft = 0;
        let indicatorTop = 0;
        let indicatorHeight = 0;

        if (bestIdx <= 0 && sortedCols[0]) {
          const r = sortedCols[0].getBoundingClientRect();
          indicatorLeft = r.left;
          indicatorTop = r.top;
          indicatorHeight = r.height;
        } else if (bestIdx >= sortedCols.length && sortedCols[sortedCols.length - 1]) {
          const r = sortedCols[sortedCols.length - 1].getBoundingClientRect();
          indicatorLeft = r.right;
          indicatorTop = r.top;
          indicatorHeight = r.height;
        } else if (sortedCols[bestIdx]) {
          const r = sortedCols[bestIdx].getBoundingClientRect();
          indicatorLeft = r.left;
          indicatorTop = r.top;
          indicatorHeight = r.height;
        }

        if (indicatorHeight > 0) {
          const indicator = document.createElement('div');
          indicator.className = 'col-drop-indicator';
          indicator.style.cssText = `
            position: fixed; left: ${indicatorLeft - 2}px; top: ${indicatorTop}px;
            width: 4px; height: ${indicatorHeight}px;
            background: var(--navy, #1a237e); border-radius: 2px;
            z-index: 9999; pointer-events: none;
          `;
          document.body.appendChild(indicator);
        }
      }
    };

    const onMouseUp = () => {
      if (started && isDraggingCol.current) {
        const currentDropIdx = dropTargetIdxRef.current;
        const currentDragId = dragColIdRef.current;
        const visCols = visibleColumnsRef.current;
        const allCols = columnsRef.current;

        if (currentDropIdx !== null && currentDragId !== null) {
          const draggedVisIdx = visCols.findIndex(c => c.id === currentDragId);

          if (draggedVisIdx !== -1 && currentDropIdx !== draggedVisIdx && currentDropIdx !== draggedVisIdx + 1) {
            let targetFullIdx: number;
            if (currentDropIdx >= visCols.length) {
              const lastVisCol = visCols[visCols.length - 1];
              targetFullIdx = allCols.findIndex(c => c.id === lastVisCol.id) + 1;
            } else {
              const targetVisCol = visCols[currentDropIdx];
              targetFullIdx = allCols.findIndex(c => c.id === targetVisCol.id);
            }
            const dragFullIdx = allCols.findIndex(c => c.id === currentDragId);
            if (dragFullIdx < targetFullIdx) targetFullIdx--;

            reorderColumnMutation.mutate({ colId: currentDragId, targetIndex: targetFullIdx });
          }
        }
      }
      cleanup();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [reorderColumnMutation]);

  const updateColumnWidthMutation = useMutation({
    mutationFn: ({ colId, width }: { colId: number; width: number }) => updateColumnWidth(registerId, colId, width),
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (err) => {
      console.error('Failed to save column width:', err);
      toast.error('Failed to save column width');
    },
  });

  const handleColResizeMouseDown = useCallback((e: React.MouseEvent, colId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const th = colHeaderRefs.current.get(colId);
    if (!th) return;

    const innerDiv = th.querySelector('.col-header-inner') as HTMLElement;
    if (!innerDiv) return;

    const startX = e.clientX;
    const startWidth = innerDiv.offsetWidth;

    let styleTag = document.getElementById('col-resize-style');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'col-resize-style';
      document.body.appendChild(styleTag);
    }

    let dragLine = document.getElementById('col-resize-line');
    if (!dragLine) {
      dragLine = document.createElement('div');
      dragLine.id = 'col-resize-line';
      dragLine.style.position = 'fixed';
      dragLine.style.top = '0';
      dragLine.style.bottom = '0';
      dragLine.style.width = '2px';
      dragLine.style.backgroundColor = 'var(--primary)';
      dragLine.style.zIndex = '9999';
      dragLine.style.pointerEvents = 'none';
      document.body.appendChild(dragLine);
    }
    dragLine.style.left = `${startX}px`;

    const colIdx = visibleColumnsRef.current.findIndex(c => c.id === colId);

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
      if (styleTag && colIdx !== -1) {
        styleTag.textContent = `
          html body .spreadsheet tr > :nth-child(${colIdx + 2}) {
            width: ${newWidth}px !important;
            min-width: ${newWidth}px !important;
            max-width: ${newWidth}px !important;
          }
          html body .spreadsheet tr > :nth-child(${colIdx + 2}) .col-header-inner {
            width: ${newWidth}px !important;
            min-width: ${newWidth}px !important;
            max-width: ${newWidth}px !important;
          }
          html body .spreadsheet td:nth-child(${colIdx + 2}) {
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
        `;
      }
      if (dragLine) {
        dragLine.style.left = `${ev.clientX}px`;
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      const newWidth = Math.max(40, startWidth + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [colId]: newWidth }));
      updateColumnWidthMutation.mutate({ colId, width: newWidth });
      
      if (styleTag) styleTag.textContent = ''; // Clear temp style
      if (dragLine) dragLine.remove();
      
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [updateColumnWidthMutation, registerId]);


  const changeColumnTypeMutation = useMutation({
    mutationFn: () => {
      if (activeModalColId === null) throw new Error('No column selected');
      return changeColumnType(registerId, activeModalColId, changeTypeValue, {
        formula: changeTypeValue === 'formula' ? newColFormula : undefined,
        dropdownOptions: changeTypeValue === 'dropdown' ? cleanOptions(newColDropdownOpts.split(',')) : undefined,
      });
    },
    onSuccess: (updatedReg) => {
      // We now receive the full register from the backend to ensure entries are synced (e.g. for auto_increment)
      queryClient.setQueryData(['register', registerId], updatedReg);
      setLocalEntries(updatedReg.entries || []);
      // NOTE: Do NOT call invalidateQueries here — it clears the in-memory
      // cache (firestoreRegisterCache) and triggers a fresh Firestore read
      // that can overwrite recent cell edits with stale chunk data.
      // setQueryData above already sets the authoritative state.

      const col = columnsRef.current.find(c => c.id === activeModalColId);
      if (col?.linkedTo) {
        queryClient.invalidateQueries({ queryKey: ['register', col.linkedTo.registerId] });
      }
      
      setChangeTypeModal(false); 
      setActiveModalColId(null);
      setNewColFormula('');
      setNewColDropdownOpts('');
      toast.success('Column type updated successfully');
    },
    onError: (err: any) => {
      console.error('Failed to change column type:', err);
      toast.error('Failed to update column type. Please try again.');
    }
  });

  const clearColumnDataMutation = useMutation({
    mutationFn: (colId: number) => clearColumnData(registerId, colId),
    onMutate: async (colId) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const previousRegister = queryClient.getQueryData(['register', registerId]) as any;
      const previousLocalEntries = [...localEntries];

      if (previousRegister) {
        const colIdStr = colId.toString();
        // Optimistic update
        const updatedReg = {
          ...previousRegister,
          entries: (previousRegister.entries || []).map((e: any) => {
            const newCells = { ...e.cells };
            delete newCells[colIdStr];
            return { ...e, cells: newCells };
          })
        };
        queryClient.setQueryData(['register', registerId], updatedReg);
        setLocalEntries(updatedReg.entries || []);
      }
      setColMenuId(null);
      return { previousRegister, previousLocalEntries };
    },
    onSuccess: () => {
      toast.success('Column data cleared');
    },
    onError: (_err, _colId, context) => {
      if (context?.previousRegister) queryClient.setQueryData(['register', registerId], context.previousRegister);
      if (context?.previousLocalEntries) setLocalEntries(context.previousLocalEntries);
      toast.error('Failed to clear column data');
    },
  });

  const setColumnMandatoryMutation = useMutation({
    mutationFn: ({ colId, mandatory }: { colId: number; mandatory: boolean }) =>
      setColumnMandatory(registerId, colId, mandatory),
    onMutate: async ({ colId, mandatory }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) =>
            c.id === colId ? { ...c, mandatory } : c
          ),
        });
      }
      setColMenuId(null);
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to update mandatory setting');
    },
  });

  const setColumnUniqueMutation = useMutation({
    mutationFn: ({ colId, unique }: { colId: number; unique: boolean }) =>
      setColumnUnique(registerId, colId, unique),
    onMutate: async ({ colId, unique }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) =>
            c.id === colId ? { ...c, unique } : c
          ),
        });
      }
      setColMenuId(null);
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to update unique setting');
    },
  });

  const setColumnDoubleEntryWarningMutation = useMutation({
    mutationFn: ({ colId, doubleEntryWarning }: { colId: number; doubleEntryWarning: boolean }) =>
      setColumnDoubleEntryWarning(registerId, colId, doubleEntryWarning),
    onMutate: async ({ colId, doubleEntryWarning }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) =>
            c.id === colId ? { ...c, doubleEntryWarning } : c
          ),
        });
      }
      setColMenuId(null);
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to update double entry warning setting');
    },
  });

  const updateColumnBgColorMutation = useMutation({
    mutationFn: ({ colId, bgColor }: { colId: number; bgColor: string | undefined }) =>
      updateColumnBgColor(registerId, colId, bgColor),
    onMutate: async ({ colId, bgColor }) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      if (prev) {
        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: (prev.columns || []).map((c: any) =>
            c.id === colId ? { ...c, bgColor } : c
          ),
        });
      }
      setColMenuId(null);
      return { prev };
    },
    onSuccess: (updatedReg) => {
      queryClient.setQueryData(['register', registerId], updatedReg);
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to update column color');
    },
  });

  const insertColumnMutation = useMutation({
    mutationFn: (vars: { 
      pos: number,           // pre-calculated, snapshot at click time
      name: string, 
      type: string, 
      dropdownOpts: string, 
      formula: string 
    }) => {
      return insertColumn(registerId, {
        name: vars.name, type: vars.type,
        dropdownOptions: vars.type === 'dropdown' ? cleanOptions(vars.dropdownOpts.split(',')) : undefined,
        formula: vars.type === 'formula' ? vars.formula : undefined,
      }, vars.pos);
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const prev = queryClient.getQueryData(['register', registerId]) as any;
      const dummyId = Date.now();
      if (prev) {
        const newCol = {
          id: dummyId,
          registerId,
          name: vars.name,
          type: vars.type,
          position: vars.pos,
          dropdownOptions: vars.type === 'dropdown' ? cleanOptions(vars.dropdownOpts.split(',')) : undefined,
          formula: vars.type === 'formula' ? vars.formula : undefined,
          createdAt: new Date().toISOString()
        };
        
        // Shift all columns at or after the insert position
        const newColumns = (prev.columns || []).map((c: any) => 
          c.position >= vars.pos ? { ...c, position: c.position + 1 } : c
        );
        newColumns.push(newCol);
        newColumns.sort((a: any, b: any) => a.position - b.position);

        queryClient.setQueryData(['register', registerId], {
          ...prev,
          columns: newColumns
        });
      }
      setInsertColModal(null);
      setActiveModalColId(null);
      return { prev, dummyId };
    },
    onSuccess: (updatedReg) => {
      // updatedReg from server is authoritative — no need to invalidate/refetch
      queryClient.setQueryData(['register', registerId], updatedReg);
      setLocalEntries(updatedReg.entries || []);
      toast.success('Column inserted successfully');

      // Reset form fields
      setNewColName('');
      setNewColType('text');
      setNewColDropdownOpts('');
      setNewColFormula('');

      // Auto-scroll to the newly inserted column
      const oldCols = columnsRef.current;
      const newCol = updatedReg.columns?.find((c: any) => !oldCols.some(old => old.id === c.id));
      if (newCol) {
        setTimeout(() => {
          const colIdx = visibleColumnsRef.current.findIndex(c => c.id === newCol.id);
          if (colIdx !== -1 && colVirtualizerRef.current) {
            colVirtualizerRef.current.scrollToIndex(colIdx, { align: 'center', behavior: 'smooth' });
          } else if (parentRef.current) {
            parentRef.current.scrollTo({ left: parentRef.current.scrollLeft + 200, behavior: 'smooth' });
          }
        }, 150);
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(['register', registerId], context.prev);
      toast.error('Failed to insert column');
    },
    onSettled: () => { setNewColName(''); setNewColType('text'); setNewColDropdownOpts(''); setNewColFormula(''); },
  });


  const addEntryMutation = useMutation({
    mutationFn: (initialCells: Record<string, string> = {}) => addEntry(registerId, initialCells, currentPageIndex),
    onMutate: async (initialCells: Record<string, string> = {}) => {
      // ── Data-loss fix: increment pending count BEFORE any async work so the
      //    sync guard blocks background-refetch overwrites during this mutation.
      pendingRowMutationsCount.current += 1;

      // Optimistic: add a temporary row instantly
      const currentPageRows = (entriesByPage[currentPageIndex] || []).length;
      const tempEntry: Entry = {
        id: Date.now() + 0.5, // Float so !Number.isInteger(entryId) detects it as temporary
        registerId,
        rowNumber: pageOffset + currentPageRows + 1,
        cells: initialCells,
        createdAt: new Date().toISOString(),
        pageIndex: currentPageIndex,
      };
      setLocalEntries((prev) => [...prev, tempEntry]);
      return { tempId: tempEntry.id };
    },
    onSuccess: (newEntry, _vars, context) => {
      // ── Data-loss fix: register the real integer ID so merge can protect it
      //    even after the mutation count reaches zero.
      sessionAddedEntryIds.current.add(newEntry.id);
      // Decrement AFTER registering the ID so the guard is still active during
      // the window between this and the next pending mutation's onSuccess.
      pendingRowMutationsCount.current = Math.max(0, pendingRowMutationsCount.current - 1);

      // Invalidate queries for linked columns
      if (_vars) {
        Object.keys(_vars).forEach(colId => {
          const col = columnsRef.current.find(c => c.id.toString() === colId);
          if (col?.linkedTo) {
            queryClient.invalidateQueries({ queryKey: ['register', col.linkedTo.registerId] });
          }
        });
      }

      // Check for pending edits made while the row was being saved
      let finalEntry = newEntry;
      if (context?.tempId && pendingTempRowEdits.current[context.tempId]) {
        const edits = pendingTempRowEdits.current[context.tempId];
        delete pendingTempRowEdits.current[context.tempId];
        if (Object.keys(edits).length > 0) {
          finalEntry = { ...newEntry, cells: { ...newEntry.cells, ...edits } };
          updateEntryDirect(registerId, newEntry.id, edits).catch(console.error);
        }
      }

      // Replace temp entry with real entry from server
      setLocalEntries((prev) => prev.map((e) => e.id === context?.tempId ? finalEntry : e));
      // Patch the cache: replace temp if present, otherwise append (upsert)
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const hasTempEntry = old.entries.some((e: any) => e.id === context?.tempId);
        const updatedEntries = hasTempEntry
          ? old.entries.map((e: any) => e.id === context?.tempId ? finalEntry : e)
          : [...old.entries, finalEntry];
        return { ...old, entries: updatedEntries, entryCount: updatedEntries.length };
      });
      // Close the Add Record modal on success
      setShowAddRecordModal(false);
      _logWork('add_row', `Added new row #${newEntry.rowNumber}`);
    },
    onError: (err: any, _vars, context) => {
      // ── Data-loss fix: always decrement so the guard eventually unblocks
      pendingRowMutationsCount.current = Math.max(0, pendingRowMutationsCount.current - 1);
      // Roll back temp entry
      setLocalEntries((prev) => prev.filter((e) => e.id !== context?.tempId));
      toast.error(`Failed to add row: ${err?.message || 'Unknown error'}`);
    },
  });


  const deleteEntryMutation = useMutation({
    mutationFn: (entryId: number) => deleteEntry(Number(registerId), entryId),
    onMutate: async (entryId) => {
      // 1. Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });

      // 2. Snapshot the previous value
      const previousRegister = queryClient.getQueryData(['register', registerId]);
      const previousLocalEntries = [...localEntries];

      // 4. Optimistically update to the new value
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const entries = old.entries.filter((e: any) => e.id !== entryId);
        return { ...old, entries, entryCount: entries.length };
      });
      setLocalEntries(prev => prev.filter(e => e.id !== entryId));
      setRowMenuId(null);

      // 5. Return context object with snapshotted value
      return { previousRegister, previousLocalEntries };
    },
    onError: (_err, _entryId, context) => {
      // 6. If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousRegister) {
        queryClient.setQueryData(['register', registerId], context.previousRegister);
      }
      if (context?.previousLocalEntries) {
        setLocalEntries(context.previousLocalEntries);
      }
      toast.error('Failed to delete row');
    },
    onSuccess: (_, entryId, context) => {
      const deletedRow = context?.previousLocalEntries?.find(e => e.id === entryId);
      const rowNum = deletedRow ? deletedRow.rowNumber : 'Unknown';
      _logWork('delete_row', `Deleted row #${rowNum}`);
    },
    onSettled: () => {
      // 7. Always refetch after error or success to ensure we are in sync with the server
      // queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      // We might not want to invalidate every time if it's slow, but it's safer.
      // For now let's just keep it optimistic.
    },
  });

  const duplicateEntryMutation = useMutation({
    mutationFn: (entryId: number) => duplicateEntry(registerId, entryId),
    onSuccess: (newEntry) => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return { ...old, entries: [...old.entries, newEntry], entryCount: old.entries.length + 1 };
      });
      setLocalEntries(prev => [...prev, newEntry]);
      setRowMenuId(null);
      _logWork('add_row', `Duplicated row to create row #${newEntry.rowNumber}`);
    },
  });

  const insertEntryMutation = useMutation({
    mutationFn: ({ atIndex, cells }: { atIndex: number, cells?: Record<string, string> }) => 
      insertEntry(registerId, cells || {}, currentPageIndex, atIndex),
    onSuccess: (newEntry, { atIndex }) => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const newEntries = [...old.entries];
        newEntries.splice(atIndex, 0, newEntry);
        // Update rowNumbers for entries after this index on the same page
        const updatedEntries = newEntries.map(e => {
            if (e.id !== newEntry.id && e.rowNumber >= newEntry.rowNumber) {
                return { ...e, rowNumber: e.rowNumber + 1 };
            }
            return e;
        });
        return { ...old, entries: updatedEntries, entryCount: updatedEntries.length };
      });
      
      setLocalEntries(prev => {
        const next = [...prev];
        next.splice(atIndex, 0, newEntry);
        return next.map(e => {
            if (e.id !== newEntry.id && e.rowNumber >= newEntry.rowNumber) {
                return { ...e, rowNumber: e.rowNumber + 1 };
            }
            return e;
        });
      });
      setRowMenuId(null);
      toast.success('Row added successfully');
      _logWork('add_row', `Inserted new row #${newEntry.rowNumber} at position ${atIndex + 1}`);

      // Focus the first editable cell of the new row
      setTimeout(() => {
        // Find the index of the new entry in the current view (displayEntries)
        const viewIndex = displayEntries.findIndex(e => e.id === newEntry.id);
        if (viewIndex !== -1) {
          const firstCol = visibleColumns.find(c => c.type !== 'formula' && c.type !== 'image');
          if (firstCol) {
            const el = document.getElementById(`cell-${viewIndex}-${firstCol.id}`) || document.querySelector(`[data-cell="cell-${viewIndex}-${firstCol.id}"]`) as HTMLElement;
            if (el) el.focus();
          }
        }
      }, 150); // Slightly longer timeout to ensure re-render and virtualizer update
    },
    onError: (err: any) => {
      toast.error(`Failed to insert row: ${err?.message || 'Unknown error'}`);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (entryIds: number[]) => bulkDeleteEntries(registerId, entryIds),
    onMutate: async (entryIds) => {
      await queryClient.cancelQueries({ queryKey: ['register', registerId] });
      const previousRegister = queryClient.getQueryData(['register', registerId]);
      const previousLocalEntries = [...localEntries];

      // Optimistic update
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const entries = old.entries.filter((e: any) => !entryIds.includes(e.id));
        return { ...old, entries, entryCount: entries.length };
      });
      setLocalEntries(prev => prev.filter(e => !entryIds.includes(e.id)));
      setSelectedRows(new Set());

      return { previousRegister, previousLocalEntries };
    },
    onSuccess: (_, entryIds) => {
      toast.success('Rows deleted');
      _logWork('bulk_delete_rows', `Deleted ${entryIds.length} rows`);
    },
    onError: (_err, _vars, context) => {
      if (context?.previousRegister) queryClient.setQueryData(['register', registerId], context.previousRegister);
      if (context?.previousLocalEntries) setLocalEntries(context.previousLocalEntries);
      toast.error('Failed to delete rows');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
    },
  });

  const addPageMutation = useMutation({
    mutationFn: (pageName?: string) => addPage(registerId, pageName),
    onSuccess: (newPage) => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const pages = [...(old.pages || []), newPage];
        return { ...old, pages };
      });
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      toast.success('New sheet added successfully');
      setCurrentPageIndex(newPage.index);
    },
    onError: () => {
      toast.error('Failed to add sheet');
    }
  });

  const renamePageMutation = useMutation({
    mutationFn: () => renamePage(registerId, renamePageId!, renamePageValue),
    onSuccess: () => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map((p: any) => p.id === renamePageId ? { ...p, name: renamePageValue } : p) };
      });
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      setRenamePageModal(false);
    },
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: number) => deletePage(registerId, pageId),
    onSuccess: (_data, pageId) => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        const pages = old.pages.filter((p: any) => p.id !== pageId);
        const entries = old.entries.filter((e: any) => e.pageIndex !== old.pages.find((p: any) => p.id === pageId)?.index);
        return { ...old, pages, entries, entryCount: entries.length };
      });
      queryClient.invalidateQueries({ queryKey: ['register', registerId] });
      setCurrentPageIndex(0);
    },
  });

  const shareLinkMutation = useMutation({
    mutationFn: () => generateShareLink(registerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['register', registerId] }),
  });

  const addSharedUserMutation = useMutation({
    mutationFn: () => addSharedUser(registerId, sharePhone, sharePermission),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['register', registerId] }); setSharePhone(''); },
  });

  const removeSharedUserMutation = useMutation({
    mutationFn: (userId: number) => removeSharedUser(registerId, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['register', registerId] }),
  });

  // ── Validation Helper ──
  const validateCellValue = useCallback((col: any, value: string): { isValid: boolean; error: string | null } => {
    if (!value || value.trim() === '') return { isValid: true, error: null };

    if (col.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) return { isValid: false, error: 'Invalid email format' };
    } else if (col.type === 'phone') {
      const phoneRegex = /^[\d\s+()-]{7,20}$/;
      if (!phoneRegex.test(value)) return { isValid: false, error: 'Invalid phone format (e.g. +91 1234567890)' };
    } else if (col.type === 'date') {
      // Allow partial typing in grid, but full validation in modal or on blur
      const dateRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
      if (!dateRegex.test(value)) return { isValid: false, error: 'Use DD-MM-YYYY format' };
      
      const parts = value.split('-');
      const d = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const y = parseInt(parts[2]);
      if (m < 1 || m > 12) return { isValid: false, error: 'Invalid month (1-12)' };
      const daysInMonth = new Date(y, m, 0).getDate();
      if (d < 1 || d > daysInMonth) return { isValid: false, error: `Invalid day for this month (max ${daysInMonth})` };
      if (y < 1900 || y > 2100) return { isValid: false, error: 'Year must be between 1900-2100' };
    } else if (col.type === 'number' || col.type === 'currency') {
      const numericValue = value.replace(/[^0-9.-]/g, '');
      if (numericValue === '' || isNaN(parseFloat(numericValue))) return { isValid: false, error: 'Must be a valid number' };
    } else if (col.type === 'dropdown') {
      if (col.dropdownOptions && col.dropdownOptions.length > 0) {
         // Strict single choice: value must exactly match one of the options
         const isValidOption = col.dropdownOptions.includes(value);
         if (value.trim() !== '' && !isValidOption) return { isValid: false, error: `'${value}' is not a valid option` };
      }
    } else if (col.type === 'auto_increment') {
      return { isValid: false, error: 'System generated field' };
    }

    return { isValid: true, error: null };
  }, []);

  // ── Handlers ──
  const handleCellChange = useCallback((entryId: number, columnId: string, value: string) => {
    const col = columnsRef.current.find(c => c.id.toString() === columnId);
    if (!col) return;

    // ── Column-level Edit Permissions ──
    if (_editableColumnIds && !_editableColumnIds.has(col.id)) {
      toast.error(`You do not have permission to edit the "${col.name}" column.`);
      return false;
    }

    // ── Linked Target Column Read-only ──
    if ((col as any).linkedTo && (col as any).linkedTo.role === 'target') {
      toast.error(`"${col.name}" is a linked column (To). Data comes from the source register automatically.`);
      return false;
    }

    // ── System Columns Read-only ──
    if (col.type === 'auto_increment' || col.type === 'formula') return;

    // ── Mandatory Field Validation ──
    if ((col as any).mandatory && value.trim() === '') {
      toast.error(`${col.name} is a mandatory field and cannot be empty.`);
      return false; // Return false to indicate rejection
    }

    // ── Date Normalization (Universal Enforcement of DD-MM-YYYY) ──
    if (col.type === 'date' && value.trim() !== '') {
      value = formatDateToDDMMYYYY(value);
    }

    // ── Type-Based Validation ──
    const validation = validateCellValue(col, value);
    if (!validation.isValid) {
      if (value.trim() !== '') {
        // For grid editing, we show a warning but allow the change (save as is)
        if (col.type === 'date' && value.length >= 10) {
        toast(validation.error, { icon: <AlertTriangle size={16} color="var(--warning)" /> });
        } else if (col.type === 'dropdown' || col.type === 'email' || col.type === 'phone' || col.type === 'number' || col.type === 'currency') {
        toast(validation.error, { icon: <AlertTriangle size={16} color="var(--warning)" /> });
        }
      }
    }

    // ── Double Entry Detection & Unique Enforcement ──
    if (col.type !== 'image' && value.trim() !== '') {
      const isDuplicate = localEntriesRef.current.some(
        e => e.id !== entryId && e.cells?.[columnId]?.trim().toLowerCase() === value.trim().toLowerCase()
      );
      if (isDuplicate) {
        if ((col as any).unique) {
          toast.error(
            `Unique Field Violation: "${value}" already exists in column "${col.name}".`,
            {
              id: `dup-unique-${columnId}-${value}`,
              duration: 5000,
              position: 'top-right',
              style: {
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #ef4444',
                fontWeight: 600,
                fontSize: '13px',
                maxWidth: '340px',
              },
              icon: '⛔',
            }
          );
          return false; // Return false to indicate rejection
        } else {
          const nameLower = (col.name || '').toLowerCase();
          const keywords = ['id', 'mobile', 'phone', 'email', 'roll', 'register', 'reg', 'aadhaar', 'pan', 'contact', 'number'];
          const isImportantField = col.type === 'phone' || col.type === 'email' || keywords.some(k => nameLower.includes(k));
          
          if (isImportantField && value.trim().length >= 3) {
            toast(
              `Double Entry Warning: The value "${value}" already exists in column "${col.name}".`,
              {
                id: `dup-warning-${columnId}-${value}`,
                duration: 5000,
                position: 'top-right',
                style: {
                  background: '#fff7ed',
                  color: '#92400e',
                  border: '1px solid #f59e0b',
                  fontWeight: 600,
                  fontSize: '13px',
                  maxWidth: '340px',
                },
                icon: '⚠️',
              }
            );
          }
        }
      }
    }

    // Sync with Row Detail Modal if open for this entry — DECOUPLED MODE
    if (detailViewEntryIdRef.current === entryId) {
      setDetailEdits(prev => ({ ...prev, [columnId]: value }));
      if (detailErrorsRef.current[columnId]) setDetailErrors(prev => ({ ...prev, [columnId]: null }));
      
      // For image columns, we want to bypass decoupled mode and save immediately to Firestore!
      if (col.type !== 'image') {
        // Return early: do NOT update main state or firestore until "Save Changes" is clicked
        return; 
      }
    }

    const isImageColumn = col.type === 'image';

    // 1. Update local state instantly (optimistic) - ONLY for non-image columns to keep loading states accurate
    if (!isImageColumn) {
      setLocalEntries((prev) => prev.map((e) => {
        if (e.id === entryId) {
          // If it's a dropdown, ensure we only store the new value (strict single choice)
          const updatedCells = { ...e.cells, [columnId]: value };
          return { ...e, cells: updatedCells };
        }
        return e;
      }));

      // Patch the React Query cache instantly so that render-phase syncs do not wipe it out
      if (Number.isInteger(entryId)) {
        queryClient.setQueryData(['register', registerId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            entries: old.entries.map((e: any) =>
              e.id === entryId ? { ...e, cells: { ...e.cells, [columnId]: value } } : e
            ),
          };
        });
      }
    }

    // 2. Write to Firestore — INSTANT for images, debounced for other types
    if (!Number.isInteger(entryId)) {
      // It is a temporary optimistic row!
      // Buffer the edit to be saved when the row creation finishes.
      pendingTempRowEdits.current[entryId] = {
        ...(pendingTempRowEdits.current[entryId] || {}),
        [columnId]: value
      };
      return true;
    }

    const cellKey = `${entryId}-${columnId}`;
    setSavingCells(prev => {
      const next = new Set(prev);
      next.add(cellKey);
      return next;
    });

    if (isImageColumn) {
      const entryIdx = localEntriesRef.current.findIndex(e => e.id === entryId);
      const entriesPerChunk = register?.entriesPerChunk || 50;
      const targetChunkIndex = Math.floor(entryIdx / entriesPerChunk);
      
      const checkSizeAndPersist = async () => {
        let finalValue = value;
        let estimatedSize = 0;
        
        // If value is non-empty, estimate the chunk size
        if (value.trim() !== '') {
          const chunkStart = targetChunkIndex * entriesPerChunk;
          const chunkEntriesCopy = localEntriesRef.current.slice(chunkStart, chunkStart + entriesPerChunk);
          const relativeIndex = entryIdx - chunkStart;
          
          if (relativeIndex >= 0 && relativeIndex < chunkEntriesCopy.length) {
            chunkEntriesCopy[relativeIndex] = {
              ...chunkEntriesCopy[relativeIndex],
              cells: { ...chunkEntriesCopy[relativeIndex].cells, [columnId]: value }
            };
          }
          
          estimatedSize = JSON.stringify({ entries: chunkEntriesCopy }).length;
          
          if (estimatedSize > 950000) {
            console.log(`[handleCellChange] Estimated chunk size (${estimatedSize} bytes) exceeds limit.`);
            
            // Check if the chunk is already full even without this new image
            let baseChunkSize = estimatedSize - value.length;
            if (baseChunkSize > 980000) {
              console.log(`[handleCellChange] Base chunk is already ${baseChunkSize} bytes. Optimizing storage space to make room...`);
              toast("Optimizing database storage space to make room...", { icon: 'ℹ️' });
              
              for (let i = 0; i < chunkEntriesCopy.length; i++) {
                const chunkEntry = chunkEntriesCopy[i];
                if (chunkEntry.id === entryId) continue; // Skip the cell we are currently updating
                
                let entryUpdated = false;
                const newCells = { ...chunkEntry.cells };
                
                for (const [cId, cellVal] of Object.entries(newCells)) {
                  if (typeof cellVal === 'string' && cellVal.startsWith('data:image/') && cellVal.length > 40000) {
                    try {
                      let optimized: string;
                      if (cellVal.includes('|||')) {
                        const parts = cellVal.split('|||').filter(Boolean);
                        const optimizedParts = await Promise.all(
                          parts.map(part => part.length > 40000 ? ImageCompressionModule.compressBase64(part, 800, 800, 0.6) : part)
                        );
                        optimized = optimizedParts.join('|||');
                      } else {
                        optimized = await ImageCompressionModule.compressBase64(cellVal, 800, 800, 0.6);
                      }
                      if (optimized.length < cellVal.length) {
                        newCells[cId] = optimized;
                        entryUpdated = true;
                      }
                    } catch (e) {
                      console.error('[handleCellChange] Failed to clean existing image:', e);
                    }
                  }
                }
                
                if (entryUpdated) {
                  chunkEntriesCopy[i] = { ...chunkEntry, cells: newCells };
                  // Update local cache optimistically
                  setLocalEntries(prev => prev.map(e => e.id === chunkEntry.id ? chunkEntriesCopy[i] : e));
                  queryClient.setQueryData(['register', registerId], (old: any) => {
                    if (!old) return old;
                    return { ...old, entries: old.entries.map((e: any) => e.id === chunkEntry.id ? chunkEntriesCopy[i] : e) };
                  });
                  // Save optimized entry to DB asynchronously (queued)
                  updateEntryDirect(registerId, chunkEntry.id, newCells).catch(console.error);
                }
              }
              
              // Recalculate estimated size after cleanup
              estimatedSize = JSON.stringify({ entries: chunkEntriesCopy }).length;
              baseChunkSize = estimatedSize - value.length;
              
              if (baseChunkSize > 980000) {
                console.log(`[handleCellChange] Still too big after optimization. Aborting.`);
                throw new Error(`Write size safety check failed: Chunk is full.`);
              }
              toast.success("Storage space optimized. Resuming upload...");
            }

            console.log(`[handleCellChange] Initiating fallback compression...`);
            try {
              // Exceeds safety limit, perform fallback compression
              // Support multiple images separated by '|||'
              let compressed: string;
              if (value.includes('|||')) {
                const parts = value.split('|||').filter(Boolean);
                const compressedParts = await Promise.all(
                  parts.map(part => (part.startsWith('data:image/') && part.length > 40000)
                    ? ImageCompressionModule.compressBase64(part, 1000, 1000, 0.6)
                    : part)
                );
                compressed = compressedParts.join('|||');
              } else {
                compressed = (value.startsWith('data:image/') && value.length > 40000)
                  ? await ImageCompressionModule.compressBase64(value, 1000, 1000, 0.6)
                  : value;
              }
              
              // Re-estimate chunk size with the compressed image
              chunkEntriesCopy[relativeIndex] = {
                ...chunkEntriesCopy[relativeIndex],
                cells: { ...chunkEntriesCopy[relativeIndex].cells, [columnId]: compressed }
              };
              const newEstimatedSize = JSON.stringify({ entries: chunkEntriesCopy }).length;
              console.log(`[handleCellChange] Fallback compressed image size. New chunk size: ${newEstimatedSize} bytes.`);
              
              if (newEstimatedSize > 1010000) {
                // Still too big, try ultra-aggressive compression
                console.log(`[handleCellChange] Still over limit. Trying ultra-aggressive fallback compression...`);
                let ultraCompressed: string;
                if (value.includes('|||')) {
                  const parts = value.split('|||').filter(Boolean);
                  const ultraCompressedParts = await Promise.all(
                    parts.map(part => (part.startsWith('data:image/') && part.length > 40000)
                      ? ImageCompressionModule.compressBase64(part, 600, 600, 0.5)
                      : part)
                  );
                  ultraCompressed = ultraCompressedParts.join('|||');
                } else {
                  ultraCompressed = (value.startsWith('data:image/') && value.length > 40000)
                    ? await ImageCompressionModule.compressBase64(value, 600, 600, 0.5)
                    : value;
                }
                
                chunkEntriesCopy[relativeIndex] = {
                  ...chunkEntriesCopy[relativeIndex],
                  cells: { ...chunkEntriesCopy[relativeIndex].cells, [columnId]: ultraCompressed }
                };
                const finalEstimatedSize = JSON.stringify({ entries: chunkEntriesCopy }).length;
                console.log(`[handleCellChange] Ultra-aggressive compressed size. Final chunk size: ${finalEstimatedSize} bytes.`);
                
                if (finalEstimatedSize > 1010000) {
                  throw new Error(`Write size safety check failed: Chunk is full. Unable to write even ultra-compressed image.`);
                }
                finalValue = ultraCompressed;
              } else {
                finalValue = compressed;
              }
            } catch (compressErr) {
              console.error('[handleCellChange] Fallback compression failed:', compressErr);
              throw compressErr; // Abort saving if chunk is full
            }
          }
        }
        
        // Track background persistence ledger
        const payloadSize = JSON.stringify({ [columnId]: finalValue }).length;
        const ledgerId = DataPersistenceModule.addLedgerItem(`Update Image (Row #${entryIdx + 1})`, targetChunkIndex, payloadSize, 'persisting');
        
        try {
          const result = await updateEntryDirect(registerId, entryId, { [columnId]: finalValue });
          if (!result) {
            throw new Error("Failed to update entry in database");
          }
          DataPersistenceModule.updateLedgerStatus(ledgerId, 'success');
          
          // Now update local state and query cache AFTER successful database storage!
          setLocalEntries((prev) => prev.map((e) => {
            if (e.id === entryId) {
              return { ...e, cells: { ...e.cells, [columnId]: finalValue } };
            }
            return e;
          }));
          
          queryClient.setQueryData(['register', registerId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              entries: old.entries.map((e: any) =>
                e.id === entryId ? { ...e, cells: { ...e.cells, [columnId]: finalValue } } : e
              ),
            };
          });
          
          // Sync Row Detail View modal edits as well
          if (detailViewEntryIdRef.current === entryId) {
            setDetailEdits(prev => ({ ...prev, [columnId]: finalValue }));
            if (detailViewEntry?.id === entryId) {
              setDetailViewEntry(prev => prev ? { ...prev, cells: { ...prev.cells, [columnId]: finalValue } } : null);
            }
          }
          
          const col = columnsRef.current.find(c => c.id.toString() === columnId);
          if (col?.linkedTo) {
            queryClient.invalidateQueries({ queryKey: ['register', col.linkedTo.registerId] });
          }
          _logWork('edit_cells', `Updated photo in cell [Row #${entryIdx + 1}, Column: ${col?.name || columnId}]`);
        } catch (err: any) {
          DataPersistenceModule.updateLedgerStatus(ledgerId, 'failed', err?.message || err?.toString());
          console.error(`[handleCellChange - Image Error] Failed to write image:`, err);
          
          // Fetch the old image value from the cached query data
          const cachedData = queryClient.getQueryData(['register', registerId]) as any;
          const oldEntry = cachedData?.entries?.find((x: any) => x.id === entryId);
          const oldVal = oldEntry?.cells?.[columnId] || '';
          
          // 1. Revert local state (optimistic) back to the old value
          setLocalEntries((prev) => prev.map((e) => {
            if (e.id === entryId) {
              return { ...e, cells: { ...e.cells, [columnId]: oldVal } };
            }
            return e;
          }));
          
          // 2. Revert the React Query cache back to the old value
          queryClient.setQueryData(['register', registerId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              entries: old.entries.map((e: any) =>
                e.id === entryId ? { ...e, cells: { ...e.cells, [columnId]: oldVal } } : e
              ),
            };
          });
          
          // 3. Revert Row Detail modal edits if open for this entry
          if (detailViewEntryIdRef.current === entryId) {
            setDetailEdits(prev => ({ ...prev, [columnId]: oldVal }));
            if (detailViewEntry?.id === entryId) {
              setDetailViewEntry(prev => prev ? { ...prev, cells: { ...prev.cells, [columnId]: oldVal } } : null);
            }
          }
          
          // 4. Revert Preview Modal state if open for this entry
          setPreviewImage(prev => {
            if (prev && prev.entryId === entryId && prev.colId === columnId) {
              return { ...prev, url: oldVal };
            }
            return prev;
          });
          
          // 5. Show descriptive toast error message
          let errorMsg = "Issue in the image update: Failed to save photo to database.";
          if (err?.message?.includes("exceeds the maximum allowed size") || err?.toString()?.includes("exceeds the maximum allowed size") || err?.message?.includes("Chunk is full")) {
            errorMsg = "Database size limit reached for this section. Please allow background synchronization to complete before uploading more photos.";
          }
          toast.error(errorMsg, { duration: 6000 });
          
          throw err;
        } finally {
          setSavingCells(prev => {
            const next = new Set(prev);
            next.delete(cellKey);
            return next;
          });
        }
      };
      
      return checkSizeAndPersist();
    } else {
      // Other columns: debounce the Firestore write for typing performance
      const key = `${entryId}-${columnId}`;

      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      else setPendingDebounceCount(prev => prev + 1);



      debounceTimers.current[key] = setTimeout(() => {
        delete debounceTimers.current[key];
        setPendingDebounceCount(prev => Math.max(0, prev - 1));

        const payloadSize = JSON.stringify({ [columnId]: value }).length;
        const entriesPerChunk = register?.entriesPerChunk || 50;
        const targetChunkIndex = Math.floor(localEntriesRef.current.findIndex(e => e.id === entryId) / entriesPerChunk);
        const ledgerId = DataPersistenceModule.addLedgerItem(`Update Cell (Row #${localEntriesRef.current.findIndex(e => e.id === entryId) + 1})`, targetChunkIndex, payloadSize, 'persisting');

        // Save with auto-retry (3 attempts) to handle transient network failures
        const saveWithRetry = async (attempt = 1): Promise<void> => {
          try {
            await updateEntryDirect(registerId, entryId, { [columnId]: value });
            DataPersistenceModule.updateLedgerStatus(ledgerId, 'success');

            const col = columnsRef.current.find(c => c.id.toString() === columnId);
            if (col?.linkedTo) {
              queryClient.invalidateQueries({ queryKey: ['register', col.linkedTo.registerId] });
            }
            const rowIdx = localEntriesRef.current.findIndex(e => e.id === entryId);
            const displayVal = value.length > 50 ? value.substring(0, 50) + '...' : value;
            _logWork('edit_cells', `Updated value to "${displayVal}" in cell [Row #${rowIdx + 1}, Column: ${col?.name || columnId}]`);
            
            // Remove from saving cells on success
            setSavingCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
          } catch (err: any) {
            if (attempt < 3) {
              console.warn(`[CellSave] Attempt ${attempt}/3 failed, retrying in ${attempt}s...`);
              await new Promise(r => setTimeout(r, attempt * 1000));
              return saveWithRetry(attempt + 1);
            }
            DataPersistenceModule.updateLedgerStatus(ledgerId, 'failed', err?.message || err?.toString());

            toast.error('Failed to save edit. Please check your connection and try again.', { duration: 4000 });
            
            // Remove from saving cells on exhausted failures
            setSavingCells(prev => {
              const next = new Set(prev);
              next.delete(cellKey);
              return next;
            });
          }
        };
        saveWithRetry();
      }, 300);
    }
    return true;
  }, [registerId, queryClient, addNotification]);

  // ── Cell Formatting ──
  const onCellFormatClick = useCallback((entryId: number, colId: string, rect: DOMRect) => {
    setFormatCell({ entryId, colId, rect });
  }, []);

  const handleCellStyleChange = useCallback((style: Partial<CellStyle>) => {
    if (!formatCell) return;
    const { entryId, colId } = formatCell;

    let mergedStyle = style;

    // 1. Optimistic local update
    setLocalEntries((prev) => prev.map((e) => {
      if (e.id === entryId) {
        const existingStyles = e.cellStyles || {};
        const existingCellStyle = existingStyles[colId] || {};
        mergedStyle = { ...existingCellStyle, ...style };
        return {
          ...e,
          cellStyles: {
            ...existingStyles,
            [colId]: mergedStyle,
          },
        };
      }
      return e;
    }));

    // 2. Persist to Firestore
    updateEntryCellStyles(registerId, entryId, { [colId]: mergedStyle }).then(() => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          entries: old.entries.map((e: any) =>
            e.id === entryId
              ? { ...e, cellStyles: { ...(e.cellStyles || {}), [colId]: mergedStyle } }
              : e
          ),
        };
      });
    });
  }, [formatCell, registerId, queryClient]);

  const handleClearCellStyle = useCallback(() => {
    if (!formatCell) return;
    const { entryId, colId } = formatCell;

    setLocalEntries((prev) => prev.map((e) => {
      if (e.id === entryId) {
        const existingStyles = { ...(e.cellStyles || {}) };
        delete existingStyles[colId];
        return { ...e, cellStyles: existingStyles };
      }
      return e;
    }));

    updateEntryCellStyles(registerId, entryId, { [colId]: {} }).then(() => {
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          entries: old.entries.map((e: any) => {
            if (e.id === entryId) {
              const styles = { ...(e.cellStyles || {}) };
              delete styles[colId];
              return { ...e, cellStyles: styles };
            }
            return e;
          }),
        };
      });
    });
  }, [formatCell, registerId, queryClient]);

  // Excel-like sort: permanently reorders localEntries and persists to Firestore
  const handleSort = useCallback((colId: number, direction: 'asc' | 'desc') => {
    setSortColId(colId);
    setSortDir(direction);

    const colDef = columns.find(c => c.id === colId);
    const colIdStr = colId.toString();

    setLocalEntries(prev => {
      const sorted = [...prev].sort((a, b) => {
        // Only sort entries on the current page; leave other pages untouched
        const aPage = a.pageIndex || 0;
        const bPage = b.pageIndex || 0;
        if (aPage !== currentPageIndex || bPage !== currentPageIndex) return 0;

        const aVal = (a.cells?.[colIdStr] || '').toString().trim();
        const bVal = (b.cells?.[colIdStr] || '').toString().trim();

        // Place empty values at the bottom for A->Z, and at the top for Z->A
        if (!aVal && bVal) return direction === 'asc' ? 1 : -1;
        if (aVal && !bVal) return direction === 'asc' ? -1 : 1;
        if (!aVal && !bVal) return 0;

        if (colDef?.type === 'date') {
          const dA = parseDateString(aVal);
          const dB = parseDateString(bVal);
          return direction === 'asc' ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }

        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) return direction === 'asc' ? aNum - bNum : bNum - aNum;
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });

      // Persist sorted order to Firestore
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return { ...old, entries: sorted };
      });
      // Fire Firestore write via the mutation queue
      updateEntriesOrder(registerId, sorted).catch(err => {
        console.error('Failed to save sorted order:', err);
      });

      return sorted;
    });
  }, [columns, currentPageIndex, registerId, queryClient]);

  // ── Move row up/down/to-position ──
  const handleMoveRow = useCallback((entryId: number, direction: 'up' | 'down' | number) => {
    setLocalEntries(prev => {
      const newEntries = [...prev];
      const fromIdx = newEntries.findIndex(e => e.id === entryId);
      if (fromIdx === -1) return prev;

      let toIdx: number;
      if (direction === 'up') {
        toIdx = fromIdx - 1;
      } else if (direction === 'down') {
        toIdx = fromIdx + 1;
      } else {
        toIdx = direction; // direct 0-based index
      }

      // Bounds check
      if (toIdx < 0 || toIdx >= newEntries.length || toIdx === fromIdx) return prev;

      // Remove the entry from its current position
      const [movedEntry] = newEntries.splice(fromIdx, 1);
      // Insert at the target position
      newEntries.splice(toIdx, 0, movedEntry);

      // Persist to Firestore
      queryClient.setQueryData(['register', registerId], (old: any) => {
        if (!old) return old;
        return { ...old, entries: newEntries };
      });
      updateEntriesOrder(registerId, newEntries).catch(err => {
        console.error('Failed to save row move:', err);
      });

      return newEntries;
    });
  }, [registerId, queryClient]);

  const openDatePicker = useCallback((entryId: number, colId: number, currentVal: string, rect?: DOMRect) => {
    // Support various separators like /, . or - for parsing
    const parts = (currentVal || '').split(/[./-]/);
    setDateDay(parts[0] || ''); setDateMonth(parts[1] || ''); setDateYear(parts[2] || '');
    dateEntryIdRef.current = entryId;
    dateColumnIdRef.current = colId;
    dateRectRef.current = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width } : null;
    setDateModal(true);
  }, []);

  const handleDateSelect = useCallback((d?: string, m?: string, y?: string) => {
    if (d === '' && m === '' && y === '') {
      setDateDay('');
      setDateMonth('');
      setDateYear('');
      if (dateEntryId != null && dateColumnId != null) {
        handleCellChange(dateEntryId, dateColumnId.toString(), '');
      }
      setDateModal(false);
      return;
    }

    // Basic day-month-year validation already happened in OtherModals or is passed in
    const finalD = d || dateDay;
    const finalM = m || dateMonth;
    const finalY = y || dateYear;
    
    // Sync state in case we need it for other UI
    if (d) setDateDay(d);
    if (m) setDateMonth(m);
    if (y) setDateYear(y);

    const dateStr = `${finalD.padStart(2, '0')}-${finalM.padStart(2, '0')}-${finalY}`;
    
    if (dateEntryId != null && dateColumnId != null) {
      const col = columns.find(c => c.id === dateColumnId);
      const validation = validateCellValue(col, dateStr);
      
      if (!validation.isValid) {
        toast(validation.error, { icon: <AlertTriangle size={16} color="var(--warning)" /> });
      }
      
      handleCellChange(dateEntryId, dateColumnId.toString(), dateStr);
    }
    setDateModal(false);
  }, [dateDay, dateMonth, dateYear, dateEntryId, dateColumnId, columns, handleCellChange, validateCellValue]);

  const openDropdown = useCallback((entryId: number, colId: number, options: string[], rect?: DOMRect) => {
    dropdownEntryIdRef.current = entryId;
    dropdownColumnIdRef.current = colId;
    dropdownOptionsRef.current = options;
    dropdownRectRef.current = rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width } : null;
    setDropdownModal(true);
  }, []);
  // ── Export Functions (extracted to useExport hook for code splitting) ──
  const {
    handleExportExcel,
    handleExportPDF,
    handleRowDownloadPDF,
    handleRowDownloadExcel,
    handleRowShareText,
  } = useExport({
    register,
    columns,
    displayEntries,
    localEntries,
    hiddenColumns,
    selectedRows,
    calcTypes,
    colWidths,
    rowDownloadRange,
    downloadableColumnIds,
    selectedColumns,
    isPreviewSelectedColumns,
  });





  const toggleSelectRow = useCallback((id: number) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleMenu = useCallback((id: number) => {
    setRowMenuId(prev => (prev === id ? null : id));
  }, []);

  const handleTableMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('fill-handle')) {
      e.preventDefault();
      const rowIdx = parseInt(target.getAttribute('data-row-idx') || '-1');
      const colId = target.getAttribute('data-col-id');
      if (rowIdx < 0 || !colId) return;

      const startVal = localEntries[rowIdx]?.cells?.[colId] || '';
      let currentEndIdx = rowIdx;
      
      const onMouseMove = (ev: MouseEvent) => {
        const hoverTarget = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement;
        if (!hoverTarget) return;
        const cellWrapper = hoverTarget.closest('.cell-inner-wrapper');
        if (!cellWrapper) return;
        const handle = cellWrapper.querySelector('.fill-handle') as HTMLElement;
        if (!handle) return;
        
        const hColId = handle.getAttribute('data-col-id');
        const hRowIdx = parseInt(handle.getAttribute('data-row-idx') || '-1');
        
        if (hColId === colId && hRowIdx >= 0 && hRowIdx !== currentEndIdx) {
          currentEndIdx = hRowIdx;
          document.querySelectorAll('.drag-fill-target').forEach(el => el.classList.remove('drag-fill-target'));
          const min = Math.min(rowIdx, currentEndIdx);
          const max = Math.max(rowIdx, currentEndIdx);
          for (let i = min; i <= max; i++) {
            const el = document.querySelector(`.fill-handle[data-row-idx="${i}"][data-col-id="${colId}"]`)?.parentElement;
            if (el) el.classList.add('drag-fill-target');
          }
        }
      };
      
      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        document.querySelectorAll('.drag-fill-target').forEach(el => el.classList.remove('drag-fill-target'));
        
        if (currentEndIdx !== rowIdx) {
          const min = Math.min(rowIdx, currentEndIdx);
          const max = Math.max(rowIdx, currentEndIdx);
          for (let i = min; i <= max; i++) {
            if (i === rowIdx) continue;
            const entry = localEntries[i];
            if (entry && entry.cells?.[colId] !== startVal) {
              handleCellChange(entry.id, colId, startVal);
            }
          }
        }
      };
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
  }, [localEntries, handleCellChange]);

  const visibleColumns = useMemo(() => {
    let visible = columns.filter((col) => !hiddenColumns.has(col.id));
    if (isPreviewSelectedColumns && selectedColumns.size > 0) {
      visible = visible.filter((col) => selectedColumns.has(col.id));
    }
    const frozen = visible.filter((col) => frozenColumns.has(col.id));
    const unfrozen = visible.filter((col) => !frozenColumns.has(col.id));
    return [...frozen, ...unfrozen];
  }, [columns, hiddenColumns, frozenColumns, isPreviewSelectedColumns, selectedColumns]);
  // Keep refs in sync for smooth drag handler closures
  visibleColumnsRef.current = visibleColumns;
  columnsRef.current = columns;

  // ── Fixed viewport grid: exactly 6 columns × 9 rows visible ──
  // Measure the actual container to compute column/row sizing dynamically
  const TARGET_COLS = 4;
  const TARGET_ROWS = 9;
  const SERIAL_COL_W = 50; // S.NO column width
  const HEADER_OVERHEAD = 42; // column header row height

  const [wrapperSize, setWrapperSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setWrapperSize((prev) =>
        prev.w === Math.round(width) && prev.h === Math.round(height)
          ? prev
          : { w: Math.round(width), h: Math.round(height) }
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Column width: fill 6 columns exactly into available width
  const defaultColWidth = useMemo(() => {
    if (wrapperSize.w > 0) {
      return Math.max(160, Math.floor((wrapperSize.w - SERIAL_COL_W) / TARGET_COLS));
    }
    return 240; 
  }, [wrapperSize.w]);

  // Row height: fixed compact height (27px)
  const dynamicRowHeight = 46;


  // stats recalculation depends directly on displayEntries for live updates

  // Column statistics (extracted to useColumnStats hook)
  const columnStats = useColumnStats({
    register,
    columns,
    visibleColumns,
    displayEntries,
    selectedRows,
    calcTypes,
  });


  // ── Virtualization ──
  // Always-on virtualization for both rows AND columns.
  // With 200+ columns, rendering all cols even for 30 visible rows = 6,000+ DOM nodes.
  // Column virtualization is the critical fix for large horizontal datasets.
  //
  // Threshold: virtualize whenever >50 rows OR >20 columns to keep the DOM lean.
  const VIRTUALIZATION_THRESHOLD = 50;
  const COL_VIRTUALIZATION_THRESHOLD = 20;
  const useVirtualRows = displayEntries.length > VIRTUALIZATION_THRESHOLD;
  const useColVirtual = visibleColumns.length > COL_VIRTUALIZATION_THRESHOLD;

  const parentRef = useRef<HTMLDivElement>(null);

  // Read initial scroll synchronously so virtualizer can use it on first render
  const initialScrollRef = useRef<{ left: number, top: number } | null>(null);
  if (!initialScrollRef.current) {
    try {
      const saved = sessionStorage.getItem(`rb_scroll_${registerId}`);
      if (saved) {
        initialScrollRef.current = JSON.parse(saved);
      }
    } catch {}
    if (!initialScrollRef.current) initialScrollRef.current = { left: 0, top: 0 };
  }

  // Provide initialRect to virtualizers to prevent 0-item render when parent size is not yet observed
  const initialRect = typeof window !== 'undefined' ? { width: window.innerWidth, height: window.innerHeight } : { width: 1200, height: 800 };

  // ── Row virtualizer ──
  const rowVirtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => dynamicRowHeight, [dynamicRowHeight]),
    overscan: 25,
    enabled: useVirtualRows,
    initialOffset: initialScrollRef.current?.top || 0,
    initialRect,
    getItemKey: useCallback((index: number) => {
      const entry = displayEntries[index];
      return entry ? `${entry.id}-${entry.rowNumber || index}` : index;
    }, [displayEntries]),
  });

  // ── Scroll to row from ?row= URL parameter (global search navigation) ──
  // Step 1: Parse the URL param and set up the scroll target
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rowParam = params.get('row');
    if (rowParam) {
      const entryId = Number(rowParam);
      scrollToRowIdRef.current = entryId;
      setHighlightedRowId(entryId);

      // Clear any active search/filters so the target row is visible
      setSearch('');
      setActiveFilters([]);

      // Find the correct page for this entry
      const targetEntry = localEntries.find(e => e.id === entryId);
      if (targetEntry) {
        const targetPage = targetEntry.pageIndex ?? 0;
        setCurrentPageIndex(targetPage);
      }

      // Clean up the URL param so refreshing doesn't re-scroll
      window.history.replaceState({}, '', window.location.pathname);

      // Clean up the highlighted row after 3.5 seconds
      const timeoutId = setTimeout(() => {
        setHighlightedRowId(null);
      }, 3500);
      return () => clearTimeout(timeoutId);
    }
  }, [location.search, localEntries]);

  // Step 2: Once displayEntries + virtualizer are ready, scroll to the target row
  useEffect(() => {
    const targetEntryId = scrollToRowIdRef.current;
    if (!targetEntryId || !displayEntries || displayEntries.length === 0) return;

    const rowIndex = displayEntries.findIndex(e => e.id === targetEntryId);
    if (rowIndex === -1) return;

    // Clear ref so we don't re-scroll
    scrollToRowIdRef.current = null;

    // Use a short timeout to let the virtualizer measure and settle
    const timerId = setTimeout(() => {
      try {
        rowVirtualizer.scrollToIndex(rowIndex, { align: 'center', behavior: 'smooth' });
      } catch { /* virtualizer may not be ready yet */ }

      // After scrolling, highlight the target row
      setTimeout(() => {
        const rowEl = document.getElementById(`row-${targetEntryId}`);
        if (rowEl) {
          rowEl.classList.add('search-target-row');
          setTimeout(() => rowEl.classList.remove('search-target-row'), 2500);
        }
      }, 500);
    }, 200);

    return () => clearTimeout(timerId);
  }, [displayEntries, rowVirtualizer]);

  // Scroll persistence on refresh/remount/register switch
  const isRestoringScroll = useRef(false);
  const lastRestoredRegisterId = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  useLayoutEffect(() => {
    // Only restore once per register ID, and only when we have data to scroll into
    if (parentRef.current && displayEntries.length > 0 && lastRestoredRegisterId.current !== registerId) {
      lastRestoredRegisterId.current = registerId;
      try {
        const saved = sessionStorage.getItem(`rb_scroll_${registerId}`);
        if (saved) {
          const { left, top } = JSON.parse(saved);
          if (!scrollToRowIdRef.current) {
            isRestoringScroll.current = true;
            // Native scroll for the DOM element
            parentRef.current.scrollTo(left, top);
            // Also notify virtualizers directly so their internal states sync immediately
            rowVirtualizer.scrollToOffset(top, { align: 'start' });
            colVirtualizer.scrollToOffset(left, { align: 'start' });
            // Allow a small window for the browser to emit the scroll event from scrollTo
            setTimeout(() => { isRestoringScroll.current = false; }, 100);
          }
        }
      } catch (e) {}
    }
  }, [displayEntries.length, registerId]);
  // Row virtualizer ──

  // Column virtualizer (horizontal) ──
  // Uses the same scroll container (parentRef) but scrolls horizontally.
  // The serial S.No column (50px) + actions column (44px) are rendered outside the virtualizer.
  const colVirtualizer = useVirtualizer({
    count: visibleColumns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((idx: number) => {
      const col = visibleColumns[idx];
      return col ? (colWidths[col.id] || defaultColWidth) : defaultColWidth;
    }, [visibleColumns, colWidths, defaultColWidth]),
    horizontal: true,
    overscan: 10,
    enabled: useColVirtual,
    initialOffset: initialScrollRef.current?.left || 0,
    initialRect,
  });
  colVirtualizerRef.current = colVirtualizer;

  // Remeasure columns when they are frozen/unfrozen, hidden/shown, or resized
  useEffect(() => {
    colVirtualizer.measure();
  }, [visibleColumns, colWidths, colVirtualizer]);

  const virtualRows = useVirtualRows ? rowVirtualizer.getVirtualItems() : displayEntries.map((e, i) => ({ index: i, start: i * dynamicRowHeight, end: (i + 1) * dynamicRowHeight, size: dynamicRowHeight, key: e?.id ?? i, lane: 0 }));
  const virtualCols = useColVirtual ? colVirtualizer.getVirtualItems() : visibleColumns.map((_, i) => ({ index: i, start: 0, end: 0, size: colWidths[visibleColumns[i]?.id] || defaultColWidth, key: i, lane: 0 }));

  const totalVirtualHeight = useVirtualRows ? rowVirtualizer.getTotalSize() : displayEntries.length * dynamicRowHeight;
  const totalVirtualWidth = useColVirtual ? colVirtualizer.getTotalSize() : visibleColumns.reduce((sum, col) => sum + (colWidths[col.id] || defaultColWidth), 0);
  
  const paddingTop = useVirtualRows && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = useVirtualRows && virtualRows.length > 0 ? totalVirtualHeight - virtualRows[virtualRows.length - 1].end : 0;
  // Horizontal padding for the column virtualizer
  let paddingLeft = useColVirtual && virtualCols.length > 0 ? virtualCols[0].start : 0;
  let paddingRight = useColVirtual && virtualCols.length > 0 ? totalVirtualWidth - virtualCols[virtualCols.length - 1].end : 0;

  const beforeVirtualCols: { index: number }[] = [];
  const afterVirtualCols: { index: number }[] = [];

  if (useColVirtual && virtualCols.length > 0) {
    const firstIdx = virtualCols[0].index;
    const lastIdx = virtualCols[virtualCols.length - 1].index;

    visibleColumns.forEach((col, i) => {
      if (frozenColumns.has(col.id)) {
        if (i < firstIdx) {
          beforeVirtualCols.push({ index: i });
          paddingLeft -= (colWidths[col.id] || defaultColWidth);
        } else if (i > lastIdx) {
          afterVirtualCols.push({ index: i });
          paddingRight -= (colWidths[col.id] || defaultColWidth);
        }
      }
    });
  }

  const frozenLeftOffsets = useMemo(() => {
    const offsets: Record<number, number> = {};
    let left = 64; // S.No column (widened to fit checkbox & row options)
    for (const vc of visibleColumns) {
      if (frozenColumns.has(vc.id)) {
        offsets[vc.id] = left;
        left += colWidths[vc.id] || defaultColWidth;
      }
    }
    return offsets;
  }, [visibleColumns, frozenColumns, colWidths, defaultColWidth]);

  const scrollToColumn = useCallback((colIdx: number) => {
    const container = parentRef.current;
    if (!container) return;

    const visCols = visibleColumnsRef.current;
    if (!visCols[colIdx]) return;

    // Calculate total frozen columns width
    let frozenWidth = 64; // S.No column width
    for (const col of visCols) {
      if (frozenColumns.has(col.id)) {
        frozenWidth += colWidths[col.id] || defaultColWidth;
      }
    }

    // Calculate the start position of the target column in normal flow
    let start = 64; // S.No offset
    for (let i = 0; i < colIdx; i++) {
      start += colWidths[visCols[i].id] || defaultColWidth;
    }
    const width = colWidths[visCols[colIdx].id] || defaultColWidth;
    const end = start + width;

    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;

    // If target is to the left of visible scrollport (behind frozen columns)
    if (start < scrollLeft + frozenWidth) {
      container.scrollLeft = Math.max(0, start - frozenWidth);
    } 
    // If target is to the right of visible scrollport
    else if (end > scrollLeft + containerWidth) {
      container.scrollLeft = end - containerWidth;
    }
  }, [frozenColumns, colWidths, defaultColWidth]);

  const handleLinkIconClick = useCallback(async (e: React.MouseEvent, col: any) => {
    e.stopPropagation();
    if (!col.linkedTo) return;
    
    const loadingToastId = toast.loading('Fetching link details...');
    try {
      const reg = await getRegister(col.linkedTo.registerId);
      const targetCol = reg.columns?.find((c: any) => c.id === col.linkedTo.columnId);
      
      toast.dismiss(loadingToastId);
      setLinkInfoModal({
        registerName: reg.name,
        columnName: targetCol ? targetCol.name : 'Unknown Column',
        role: col.linkedTo.role || 'unknown',
        columnId: col.id,
        linkedRegisterId: col.linkedTo.registerId
      });
    } catch (err) {
      console.error(err);
      toast.dismiss(loadingToastId);
      toast.error('Failed to load link details');
    }
  }, []);

  if (isLoading) return (
    <div className="content-area">
      <div className="book-loader-wrapper">
        <div className="book-loader">
          <div className="page" />
          <div className="page" />
          <div className="page" />
        </div>
        <span className="center-loader-text" style={{ marginTop: '20px' }}>Loading register…</span>
      </div>
    </div>
  );
  if (!register) return <div className="empty-state"><p>Register not found</p></div>;

  return (
    <div className="content-area">
      {/* ── Header ── */}
      <div className="register-header">
        <div className="register-header-left">
          <button className="register-header-back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <h1 className="register-header-title">{register.name}</h1>
          
          {_canEditAny && (
            <button 
              className="pab-tab-action-btn primary header-add-btn" 
              onClick={() => setShowAddRecordModal(true)}
              title="Add Row"
              style={{
                width: '30px',
                height: '30px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                minWidth: '30px'
              }}
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        <div className="register-header-right">
          <RegisterToolbar
            search={search}
            setSearch={setSearch}
            filters={filters}
            activeFilters={activeFilters}
            setFilters={setFilters}
            setActiveFilters={setActiveFilters}
            filterModal={filterModal}
            setFilterModal={setFilterModal}
            addEntryMutation={addEntryMutation}
            setNewColName={setNewColName}
            setNewColType={setNewColType}
            setNewColDropdownOpts={setNewColDropdownOpts}
            setNewColFormula={setNewColFormula}
            setNewColumnModal={setNewColumnModal}
            hiddenColumns={hiddenColumns}
            selectedRows={selectedRows}
            rowCount={displayEntries.length}
            columns={columns}
            bulkDeleteMutation={bulkDeleteMutation}
            setManageColsMenu={setManageColsMenu}
            entries={localEntries}
            canEdit={_canEditAny}
            allColumnsCount={register?.columns?.length || 0}
            selectedColumns={selectedColumns}
            isPreviewSelectedColumns={isPreviewSelectedColumns}
            setIsPreviewSelectedColumns={setIsPreviewSelectedColumns}
            isSaving={isSaving}
            uploadingImagesCount={uploadingImagesCount}
            pendingDebounceCount={activeSyncCount}
            pendingTempRowEditsCount={Object.values(pendingTempRowEdits.current).reduce((acc, edits) => acc + Object.keys(edits).length, 0)}
            onOpenStorageOptimizer={(tab) => {
              setStorageOptimizerTab(tab || 'analytics');
              setStorageOptimizerOpen(true);
            }}
          />
          
          <RegisterHeader 
            register={register} 
            setShareModal={setShareModal} 
            handleOpenExport={() => setShowExportModal(true)}
            canDownload={_canDownloadAny}
            canEdit={_canEditAny}
            onViewReminders={() => setShowRemindersSummary(true)}
            onOpenStorageOptimizer={() => {
              setStorageOptimizerTab('analytics');
              setStorageOptimizerOpen(true);
            }}
          />
        </div>
      </div>

      {/* ── Combined Pages + Actions Bar ── */}
      {pages.length > 0 && (
        <div className="pages-actions-bar">
          <div className="pages-actions-tabs">
            {pages.map((p: any) => (
              <button
                key={p.id}
                className={`page-tab ${p.index === currentPageIndex ? 'active' : ''}`}
                onClick={() => setCurrentPageIndex(p.index)}
                onDoubleClick={() => {
                  if (_canEditAny) {
                    setRenamePageId(p.id);
                    setRenamePageValue(p.name);
                    setRenamePageModal(true);
                  }
                }}
              >
                {p.name}
              </button>
            ))}
            {_canEditAny && (
              <button
                className="page-add-btn"
                onClick={() => {
                  const newName = prompt('Enter new sheet name:');
                  if (newName && newName.trim()) {
                    addPageMutation.mutate(newName.trim());
                  }
                }}
              >
                <Plus size={12} /> Add Sheet
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Spreadsheet ── */}
      <div 
        ref={parentRef}
        className="spreadsheet-wrapper" 
        key={`grid-${columns.length}-${columns.map(c => c.id).join('-')}`}
        onMouseDown={_canEditAny ? handleTableMouseDown : undefined}
        onScroll={(e) => {
          if (isRestoringScroll.current) return;
          const target = e.currentTarget;
          const left = target.scrollLeft;
          const top = target.scrollTop;
          
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => {
            sessionStorage.setItem(`rb_scroll_${registerId}`, JSON.stringify({ left, top }));
          }, 150);
        }}
        style={{ '--dynamic-row-height': `${dynamicRowHeight}px` } as React.CSSProperties}
      >
        <table className={`spreadsheet ${_canEditAny ? '' : 'readonly-access'}`}>
          <thead>
            <tr>
              <th className="serial">
                <div 
                  className="serial-inner" 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: selectedRows.size > 0 ? 'flex-start' : 'center', 
                    gap: '2px', 
                    width: '100%', 
                    height: '100%' 
                  }}
                >
                  {selectedRows.size > 0 && (
                    <>
                      <div style={{ width: '14px', flexShrink: 0 }} /> {/* Spacer matching row options ⋮ button */}
                      <input
                        type="checkbox"
                        className="row-select-checkbox"
                        checked={displayEntries.length > 0 && selectedRows.size === displayEntries.length}
                        ref={(el) => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < displayEntries.length; }}
                        onChange={() => {
                          if (selectedRows.size === displayEntries.length) {
                            setSelectedRows(new Set());
                          } else {
                            setSelectedRows(new Set(displayEntries.map(e => e.id)));
                          }
                        }}
                        tabIndex={-1}
                        title="Select All"
                      />
                    </>
                  )}
                  <span style={{ fontSize: '11px', fontWeight: 700 }}>S.NO</span>
                </div>
              </th>
              {(() => {
                const elements: { type: 'cell' | 'pad-left' | 'pad-right', vc?: { index: number } }[] = [];
                if (useColVirtual) {
                  beforeVirtualCols.forEach(vc => elements.push({ type: 'cell', vc }));
                  if (paddingLeft > 0) elements.push({ type: 'pad-left' });
                  virtualCols.forEach(vc => elements.push({ type: 'cell', vc }));
                  if (paddingRight > 0) elements.push({ type: 'pad-right' });
                  afterVirtualCols.forEach(vc => elements.push({ type: 'cell', vc }));
                } else {
                  visibleColumns.forEach((_, i) => elements.push({ type: 'cell', vc: { index: i } }));
                }

                return elements.map((el) => {
                  if (el.type === 'pad-left') {
                    return <th key="pad-left" className="spacer" style={{ width: paddingLeft, minWidth: paddingLeft, padding: 0, border: 'none' }} />;
                  }
                  if (el.type === 'pad-right') {
                    return <th key="pad-right" className="spacer" style={{ width: paddingRight, minWidth: paddingRight, padding: 0, border: 'none' }} />;
                  }

                  const vc = el.vc!;
                  const col = visibleColumns[vc.index];
                  if (!col) return null;
                  const IconComponent = <ColumnIcon type={col.type} size={12} />;

                  const isFrozen = frozenColumns.has(col.id);
                  const stickyLeft = isFrozen ? frozenLeftOffsets[col.id] : undefined;
                  const colW = colWidths[col.id] || defaultColWidth;

                  const headerBg = col.bgColor 
                    ? `linear-gradient(${col.bgColor}, ${col.bgColor}), ${isFrozen ? 'var(--border-light)' : 'var(--surface)'}`
                    : (isFrozen ? 'var(--border-light)' : undefined);
                  return (
                  <th
                    key={col.id}
                    className={`col-header-cell ${draggedColumnId === col.id ? 'dragging' : ''}${isFrozen ? ' frozen-col' : ''}`}
                    ref={(el) => {
                      if (el) colHeaderRefs.current.set(col.id, el);
                      else colHeaderRefs.current.delete(col.id);
                    }}
                    style={isFrozen
                      ? { position: 'sticky', left: stickyLeft, zIndex: 13, background: headerBg, width: colW, minWidth: colW, maxWidth: colW }
                      : { width: colW, minWidth: colW, maxWidth: colW, background: headerBg }
                    }
                  >
                    <div 
                      className="col-header-inner"
                      title="Click for options, Drag to reorder"
                      onMouseDown={(e) => handleColDragMouseDown(e, col.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (colMenuId === col.id) {
                          setColMenuId(null);
                          setColMenuRect(null);
                        } else {
                          const th = (e.currentTarget as HTMLElement).closest('th');
                          if (th) setColMenuRect(th.getBoundingClientRect());
                          setColMenuId(col.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        className="col-header-select-checkbox"
                        checked={selectedColumns.has(col.id)}
                        onChange={(e) => {
                          const next = new Set(selectedColumns);
                          if (e.target.checked) {
                            next.add(col.id);
                          } else {
                            next.delete(col.id);
                          }
                          setSelectedColumns(next);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Select column"
                      />
                      {IconComponent}
                      <span className="col-header-name">
                        {col.name}
                        {(col as any).mandatory && (
                          <span title="Mandatory field" style={{ color: 'var(--primary)', fontWeight: 900, marginLeft: 2, fontSize: '13px' }}>*</span>
                        )}
                        {(col as any).unique && (
                          <span title="Unique field" style={{ color: 'var(--primary)', fontWeight: 900, marginLeft: 2, fontSize: '12px' }}>★</span>
                        )}
                        {col.type === 'formula' && <span className="col-formula-badge" title={col.formula}>Fx</span>}
                        {col.linkedTo && (
                          <>
                            <button 
                              onClick={(e) => handleLinkIconClick(e, col)}
                              onMouseDown={(e) => e.stopPropagation()}
                              title="Click to view link details"
                              style={{ 
                                background: 'none', 
                                border: 'none', 
                                padding: 0, 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                cursor: 'pointer',
                                marginLeft: '4px'
                              }}
                            >
                              <LinkIcon size={12} color="var(--primary)" />
                            </button>
                            {col.linkedTo.role === 'target' && (
                              <span title="Read-only — data synced from source" style={{ marginLeft: '2px', display: 'inline-flex', alignItems: 'center', opacity: 0.6 }}>
                                <Lock size={10} color="var(--muted)" />
                              </span>
                            )}
                          </>
                        )}
                      </span>
                      {sortColId === col.id && sortDir && (
                        <span className="sort-indicator" title={sortDir === 'asc' ? 'Sorted A→Z' : 'Sorted Z→A'}>
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                      {frozenColumns.has(col.id) && <Pin size={10} color="var(--muted)" className="frozen-pin" />}
                      <div
                        className="col-resize-handle"
                        onMouseDown={(e) => {
                          e.stopPropagation(); // Prevent triggering column options/drag when resizing
                          handleColResizeMouseDown(e, col.id);
                        }}
                      />
                    </div>
                  </th>
                )});
              })()}
              <th className="actions" style={{ width: '50px', minWidth: '50px', padding: 0, position: 'sticky', right: 0, zIndex: 14, background: 'var(--table-bg)', borderLeft: '1px solid var(--border-light)' }}>
                {_canEditAny && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewColumnModal(true);
                    }}
                    title="Add Column"
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--muted)', width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Top row spacer for virtualized rows */}
            {paddingTop > 0 && (
              <tr key="virtual-spacer-top" aria-hidden="true" style={{ visibility: 'hidden' }}>
                <td className="spacer" style={{ height: `${paddingTop}px`, padding: 0, border: 'none', lineHeight: 0 }} colSpan={visibleColumns.length + 4} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const entry = displayEntries[virtualRow.index];
              if (!entry) return null;
              
              return (
                <SpreadsheetRow
                  key={virtualRow.key}
                  entry={entry}
                  idx={virtualRow.index}
                  displayRowNumber={(deferredSearch.trim() || deferredActiveFilters.length > 0) ? entry.rowNumber : (pageOffset + virtualRow.index + 1)}
                  visibleColumns={visibleColumns}
                  virtualCols={useColVirtual ? virtualCols : undefined}
                  beforeVirtualCols={useColVirtual ? beforeVirtualCols : undefined}
                  afterVirtualCols={useColVirtual ? afterVirtualCols : undefined}
                  paddingLeft={useColVirtual ? paddingLeft : 0}
                  paddingRight={useColVirtual ? paddingRight : 0}
                  scrollToColumn={scrollToColumn}
                  isSelected={selectedRows.has(entry.id)}
                  toggleSelectRow={toggleSelectRow}
                  handleCellChange={handleCellChange}
                  openDatePicker={openDatePicker}
                  openDropdown={openDropdown}
                  isMenuOpen={rowMenuId === entry.id}
                  toggleMenu={toggleMenu}
                  registerColumns={columns}
                  onRowDetail={setDetailViewEntry}
                  onImagePreview={setPreviewImage}
                  frozenColumns={frozenColumns}
                  frozenLeftOffsets={frozenLeftOffsets}
                  colWidths={colWidths}
                  defaultColWidth={defaultColWidth}
                  totalRows={displayEntries.length}
                  rowHeight={dynamicRowHeight}
                  onCellFormatClick={onCellFormatClick}
                  searchTerm={deferredSearch || undefined}
                  editableColumnIds={_editableColumnIds}
                  columnSuggestions={columnSuggestions}
                  savingCells={savingCells}
                  highlightedRowId={highlightedRowId}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr key="virtual-spacer-bottom" aria-hidden="true" style={{ visibility: 'hidden' }}>
                <td className="spacer" style={{ height: `${paddingBottom}px`, padding: 0, border: 'none', lineHeight: 0 }} colSpan={visibleColumns.length + 4} />
              </tr>
            )}
            {/* Empty state when search/filter yields no results */}
            {displayEntries.length === 0 && (deferredSearch || deferredActiveFilters.length > 0) && (
              <tr>
                <td colSpan={visibleColumns.length + 3} style={{
                  textAlign: 'center', padding: '48px 20px', color: '#94a3b8',
                  fontSize: '14px', fontWeight: 500, background: 'var(--table-bg)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <Search size={32} style={{ opacity: 0.3 }} />
                    <span>No matching records found</span>
                    {deferredSearch && <span style={{ fontSize: '12px', color: '#b0b8c9' }}>Try a different search term or clear filters</span>}
                    <button
                      onClick={() => { setSearch(''); setActiveFilters([]); }}
                      style={{
                        marginTop: '8px', padding: '6px 16px', borderRadius: '6px',
                        border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
                        fontSize: '12px', color: '#475569', fontWeight: 500,
                      }}
                    >Clear search & filters</button>
                  </div>
                </td>
              </tr>
            )}
            {displayEntries.length === 0 && !deferredSearch && deferredActiveFilters.length === 0 && columns.length > 0 && [1, 2, 3].map((n) => (
              <tr key={`mock-${n}`} className="mock" onClick={_canEditAny ? () => setShowAddRecordModal(true) : undefined}>
                <td className="serial">
                  <div className="serial-inner">
                    <span>{n}</span>
                  </div>
                </td>
                {visibleColumns.map((col) => (
                  <td key={col.id}><div className="mock-cell-content">&nbsp;</div></td>
                ))}
                <td className="actions" style={{ width: '50px', minWidth: '50px', background: 'var(--table-bg)', borderLeft: '1px solid var(--border)' }} />
              </tr>
            ))}
          </tbody>
            {columns.length > 0 && (() => {
              return (
              <RegisterSummaryRow
                visibleColumns={visibleColumns}
                calcTypes={calcTypes}
                calcMenu={calcMenu}
                onCalcClick={handleCalcCellClick}
                onAddRecord={() => addEntryMutation.mutate({})}
                useColVirtual={useColVirtual}
                virtualCols={virtualCols}
                beforeVirtualCols={beforeVirtualCols}
                afterVirtualCols={afterVirtualCols}
                paddingLeft={paddingLeft}
                paddingRight={paddingRight}
                columnStats={columnStats}
                frozenColumns={frozenColumns}
                frozenLeftOffsets={frozenLeftOffsets}
                colWidths={colWidths}
                defaultColWidth={defaultColWidth}
                canEdit={_canEditAny}
              />
              );
            })()}
          </table>
        </div>


      {/* ── Floating Selection Toolbar ── */}
      <FloatingSelectionToolbar
        selectedRows={selectedRows}
        setSelectedRows={setSelectedRows}
        columns={columns}
        hiddenColumns={hiddenColumns}
        downloadableColumnIds={downloadableColumnIds}
        isPreviewSelectedColumns={isPreviewSelectedColumns}
        selectedColumns={selectedColumns}
        handleExportExcel={handleExportExcel}
        handleExportPDF={handleExportPDF}
        bulkDeleteMutation={bulkDeleteMutation}
      />
      {/* ── Context Menus ── */}
      <RegisterContextMenus 
        colMenuId={colMenuId} colMenuRect={colMenuRect} setColMenuId={setColMenuId} columns={columns}
        setActiveModalColId={setActiveModalColId}
        handleSort={handleSort}
        setRenameColValue={setRenameColValue} setRenameColModal={setRenameColModal}
        setChangeTypeValue={setChangeTypeValue} setChangeTypeModal={setChangeTypeModal}
        setDropdownConfigOptions={setDropdownConfigOptions} setDropdownConfigModal={setDropdownConfigModal} setLinkColumnModal={setLinkColumnModal}
        duplicateColumnMutation={duplicateColumnMutation}
        setNewColName={setNewColName} setNewColType={setNewColType} setNewColDropdownOpts={setNewColDropdownOpts} setNewColFormula={setNewColFormula}
        setInsertColModal={setInsertColModal} moveColumnMutation={moveColumnMutation}
        frozenColumns={frozenColumns} setFrozenColumns={setFrozenColumns} freezeColumn={freezeColumn} registerId={registerId}
        hiddenColumns={hiddenColumns} setHiddenColumns={setHiddenColumns} hideColumn={hideColumn}
        clearColumnDataMutation={clearColumnDataMutation} deleteColumnMutation={deleteColumnMutation}
        setColumnMandatoryMutation={setColumnMandatoryMutation}
        setColumnUniqueMutation={setColumnUniqueMutation}
        setColumnDoubleEntryWarningMutation={setColumnDoubleEntryWarningMutation}
        updateColumnBgColorMutation={updateColumnBgColorMutation}
        rowMenuId={rowMenuId} setRowMenuId={setRowMenuId}
        duplicateEntryMutation={duplicateEntryMutation} deleteEntryMutation={deleteEntryMutation}
        insertEntryMutation={insertEntryMutation}
        localEntries={localEntries}
        handleRowDownloadPDF={handleRowDownloadPDF}
        handleRowDownloadExcel={handleRowDownloadExcel}
        handleMoveRow={handleMoveRow}
        handleRowShareText={handleRowShareText}
        calcTypes={calcTypes}
        updateCalcType={updateCalcType}
        manageColsMenu={manageColsMenu}
        setManageColsMenu={setManageColsMenu}
        canEdit={_canEditAny}
        selectedColumns={selectedColumns}
        isPreviewSelectedColumns={isPreviewSelectedColumns}
      />

      {/* ── Modals ── */}
      <ColumnModals 
        newColumnModal={newColumnModal} setNewColumnModal={setNewColumnModal}
        insertColModal={insertColModal} setInsertColModal={setInsertColModal}
        newColName={newColName} setNewColName={setNewColName}
        newColType={newColType} setNewColType={setNewColType}
        newColDropdownOpts={newColDropdownOpts} setNewColDropdownOpts={setNewColDropdownOpts}
        newColFormula={newColFormula} setNewColFormula={setNewColFormula}
        addColumnMutation={addColumnMutation} insertColumnMutation={insertColumnMutation}
        renameColModal={renameColModal} setRenameColModal={setRenameColModal}
        renameColValue={renameColValue} setRenameColValue={setRenameColValue} renameColumnMutation={renameColumnMutation}
        dropdownConfigModal={dropdownConfigModal} setDropdownConfigModal={setDropdownConfigModal}
        dropdownConfigOptions={dropdownConfigOptions} setDropdownConfigOptions={setDropdownConfigOptions} updateDropdownMutation={updateDropdownMutation}
        changeTypeModal={changeTypeModal} setChangeTypeModal={setChangeTypeModal}
        changeTypeValue={changeTypeValue} setChangeTypeValue={setChangeTypeValue} changeColumnTypeMutation={changeColumnTypeMutation}
        linkColumnModal={linkColumnModal} setLinkColumnModal={setLinkColumnModal}
        activeModalColId={activeModalColId}
        COL_TYPES={COL_TYPES}
        columns={columns}
        entries={localEntries}
        allRegisters={allRegisters}
        allFolders={allFolders}
        currentRegisterId={registerId}
      />

      {linkInfoModal && (
        <div className="modal-overlay" onClick={() => { setLinkInfoModal(null); setShowUnlinkConfirm(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LinkIcon size={18} color="var(--primary)" /> Link Connection Details
            </h3>
            
            <div style={{ margin: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: 'var(--bg-light)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Connection Role</span>
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: 700, 
                  color: linkInfoModal.role === 'source' ? '#16a34a' : linkInfoModal.role === 'target' ? '#2563eb' : 'var(--text-main)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px'
                }}>
                  {linkInfoModal.role === 'source' ? 'From Column (Source Column)' : linkInfoModal.role === 'target' ? 'To Column (Destination Column)' : 'Linked Column'}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Linked Register</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy)', display: 'block', marginTop: '2px' }}>
                  📂 {linkInfoModal.registerName}
                </span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>Linked Column</span>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy)', display: 'block', marginTop: '2px' }}>
                  📊 {linkInfoModal.columnName}
                </span>
              </div>
            </div>

            {showUnlinkConfirm ? (
              <div style={{ 
                margin: '16px 0 0 0', 
                padding: '14px', 
                background: 'rgba(239, 68, 68, 0.06)', 
                border: '1px solid rgba(239, 68, 68, 0.2)', 
                borderRadius: '8px'
              }}>
                <h4 style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
                  <AlertTriangle size={16} /> Choose how to Unlink:
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-main)', margin: '0 0 12px 0', lineHeight: '1.4' }}>
                  Unlinking will disconnect the live data sync. The columns will stop mirroring each other. Choose whether to keep or clear the mirrored values.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="modal-confirm-btn" 
                      style={{ flex: 1, background: 'var(--navy)', borderColor: 'var(--navy)', color: '#fff', fontSize: '11px', padding: '8px', fontWeight: 600 }}
                      onClick={() => unlinkColumnMutation.mutate({ colId: linkInfoModal.columnId, clearData: false })}
                      disabled={unlinkColumnMutation.isPending}
                    >
                      {unlinkColumnMutation.isPending ? 'Unlinking...' : 'Keep Data'}
                    </button>
                    <button 
                      className="modal-confirm-btn" 
                      style={{ flex: 1, background: '#dc2626', borderColor: '#dc2626', color: '#fff', fontSize: '11px', padding: '8px', fontWeight: 600 }}
                      onClick={() => unlinkColumnMutation.mutate({ colId: linkInfoModal.columnId, clearData: true })}
                      disabled={unlinkColumnMutation.isPending}
                    >
                      {unlinkColumnMutation.isPending ? 'Unlinking...' : 'Clear Data'}
                    </button>
                  </div>
                  <button 
                    className="modal-cancel-btn" 
                    style={{ width: '100%', fontSize: '11px', padding: '6px' }}
                    onClick={() => setShowUnlinkConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
                <button 
                  className="modal-cancel-btn" 
                  style={{ 
                    flex: 1, 
                    borderColor: '#ef4444', 
                    color: '#ef4444', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: '6px',
                    backgroundColor: 'transparent'
                  }} 
                  onClick={() => setShowUnlinkConfirm(true)}
                >
                  <Trash2 size={16} /> Unlink Column
                </button>
                <button className="modal-confirm-btn" style={{ flex: 1 }} onClick={() => setLinkInfoModal(null)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showExportModal && (() => {
        // Filter columns by download restrictions
        let exportableColumns = downloadableColumnIds
          ? columns.filter(c => downloadableColumnIds.has(c.id))
          : columns;

        if (isPreviewSelectedColumns && selectedColumns.size > 0) {
          exportableColumns = exportableColumns.filter(c => selectedColumns.has(c.id));
        }

        // Calculate permitted row count for download
        let exportRowCount = displayEntries.length;
        if (rowDownloadRange) {
          const start = (rowDownloadRange.start || 1) - 1;
          const end = rowDownloadRange.end || displayEntries.length;
          exportRowCount = Math.max(0, Math.min(end, displayEntries.length) - start);
        }
        return (
          <ExportModal
            onClose={() => setShowExportModal(false)}
            onExport={(options) => {
              if (options.format === 'excel') handleExportExcel(options);
              else handleExportPDF(options);
              setShowExportModal(false);
            }}
            columns={exportableColumns}
            hiddenColumns={hiddenColumns}
            selectedRowCount={selectedRows.size}
            totalRowCount={exportRowCount}
          />
        );
      })()}

      <ShareModal 
        shareModal={shareModal} setShareModal={setShareModal}
        register={register} sharePhone={sharePhone} setSharePhone={setSharePhone}
        sharePermission={sharePermission} setSharePermission={setSharePermission}
        shareLinkMutation={shareLinkMutation} addSharedUserMutation={addSharedUserMutation} removeSharedUserMutation={removeSharedUserMutation}
      />

      <OtherModals 
        renamePageModal={renamePageModal} setRenamePageModal={setRenamePageModal}
        renamePageValue={renamePageValue} setRenamePageValue={setRenamePageValue} renamePageId={renamePageId}
        pages={pages} deletePageMutation={deletePageMutation} renamePageMutation={renamePageMutation}
        dateModal={dateModal} setDateModal={setDateModal}
        dateDay={dateDay} setDateDay={setDateDay} dateMonth={dateMonth} setDateMonth={setDateMonth} dateYear={dateYear} setDateYear={setDateYear}
        handleDateSelect={handleDateSelect} dateRect={dateRect}
        dropdownModal={dropdownModal} setDropdownModal={setDropdownModal}
        dropdownOptions={dropdownOptions} dropdownEntryId={dropdownEntryId} dropdownColumnId={dropdownColumnId}
        dropdownRect={dropdownRect}
        localEntries={localEntries} handleCellChange={handleCellChange}
        columns={columns}
        onAddDropdownOption={onAddDropdownOption}
      />

      <StorageOptimizerModal 
        isOpen={storageOptimizerOpen}
        onClose={() => setStorageOptimizerOpen(false)}
        entries={localEntries}
        registerId={registerId}
        defaultTab={storageOptimizerTab}
      />

      {/* ── Add Record Modal ── */}
      <AddRecordModal
        open={showAddRecordModal}
        onClose={() => setShowAddRecordModal(false)}
        columns={columns}
        isSubmitting={addEntryMutation.isPending}
        onSubmit={(cells) => addEntryMutation.mutate(cells)}
        existingEntries={localEntries}
      />

      {/* Row Detail View Modal (Direct Edit Mode) */}
      {detailViewEntry && (
        <RowDetailModal
          detailViewEntry={detailViewEntry}
          setDetailViewEntry={setDetailViewEntry}
          _canEditAny={_canEditAny}
          _rowEditRange={_rowEditRange}
          _canDownloadAny={_canDownloadAny}
          rowDownloadRange={rowDownloadRange}
          localEntries={localEntries}
          setLocalEntries={setLocalEntries}
          registerId={registerId}
          columns={columns}
          isPreviewSelectedColumns={isPreviewSelectedColumns}
          selectedColumns={selectedColumns}
          _editableColumnIds={_editableColumnIds}
          columnSuggestions={columnSuggestions}
          uploadingCells={uploadingCells}
          setUploadingCells={setUploadingCells}
          setUploadingImagesCount={setUploadingImagesCount}
          setPreviewImage={setPreviewImage}
          evaluateFormula={evaluateFormula}
          validateCellValue={validateCellValue}
          handleCellChange={handleCellChange}
          handleRowDownloadPDF={handleRowDownloadPDF}
          handleRowDownloadExcel={handleRowDownloadExcel}
          handleImageDownload={handleImageDownload}
          setActiveModalColId={setActiveModalColId}
          setChangeTypeValue={setChangeTypeValue}
          setChangeTypeModal={setChangeTypeModal}
          setNewColFormula={setNewColFormula}
          setNewColDropdownOpts={setNewColDropdownOpts}
          openDropdown={openDropdown}
          openDatePicker={openDatePicker}
          queryClient={queryClient}
          pendingTempRowEdits={pendingTempRowEdits}
          debounceTimers={debounceTimers}
          columnsRef={columnsRef}
          localEntriesRef={localEntriesRef}
          
          detailEdits={detailEdits}
          setDetailEdits={setDetailEdits}
          detailErrors={detailErrors}
          setDetailErrors={setDetailErrors}
          detailErrorsRef={detailErrorsRef}
          showRowAuditTrail={showRowAuditTrail}
          setShowRowAuditTrail={setShowRowAuditTrail}
          rowAuditHistory={rowAuditHistory}
          setRowAuditHistory={setRowAuditHistory}
          rowAuditLoading={rowAuditLoading}
          setRowAuditLoading={setRowAuditLoading}
          detailInputRefs={detailInputRefs}
        />
      )}

      <CalcMenuPopover
        calcMenu={calcMenu}
        setCalcMenu={setCalcMenu}
        calcTypes={calcTypes}
        updateCalcType={updateCalcType}
      />
      
      {/* ── Image Preview Modal ── */}
      {previewImage && previewImage.url && (
        <ImagePreviewModal
          previewImage={previewImage}
          setPreviewImage={setPreviewImage}
          handleImageDownload={handleImageDownload}
          uploadingCells={uploadingCells}
          setUploadingCells={setUploadingCells}
          setUploadingImagesCount={setUploadingImagesCount}
          registerId={registerId}
          handleCellChange={handleCellChange}
          detailViewEntry={detailViewEntry}
          setDetailEdits={setDetailEdits}
        />
      )}

      {/* Reminder Modal */}
      {reminderModal && (
        <ReminderModal
          reminderModal={reminderModal}
          setReminderModal={setReminderModal}
          reminderDate={reminderDate}
          setReminderDate={setReminderDate}
          reminderTime={reminderTime}
          setReminderTime={setReminderTime}
          reminderStatus={reminderStatus}
          setReminderStatus={setReminderStatus}
          reminderMessage={reminderMessage}
          setReminderMessage={setReminderMessage}
          reminders={reminders}
          setReminders={setReminders}
          scheduleReminder={scheduleReminder}
          registerId={registerId}
        />
      )}

      {/* ── Cell Format Toolbar ── */}
      {formatCell && (
        <CellFormatToolbar
          position={{ top: formatCell.rect.top, left: formatCell.rect.left }}
          currentStyle={
            localEntries.find(e => e.id === formatCell.entryId)?.cellStyles?.[formatCell.colId] || {}
          }
          onStyleChange={handleCellStyleChange}
          onClearStyle={handleClearCellStyle}
          onClose={() => setFormatCell(null)}
          onAddReminder={() => {
            const existing = reminders.find(r => r.rowId === formatCell.entryId && r.colId === formatCell.colId && r.registerId === String(registerId));
            if (existing && existing.triggerTime) {
              const dt = new Date(existing.triggerTime);
              const yyyy = dt.getFullYear();
              const mm = String(dt.getMonth() + 1).padStart(2, '0');
              const dd = String(dt.getDate()).padStart(2, '0');
              setReminderDate(`${yyyy}-${mm}-${dd}`);
              
              const hh = String(dt.getHours()).padStart(2, '0');
              const min = String(dt.getMinutes()).padStart(2, '0');
              setReminderTime(`${hh}:${min}`);
              
              setReminderMessage(existing.message);
              setReminderStatus(existing.status);
            } else {
              setReminderDate('');
              setReminderTime('');
              setReminderMessage('');
              setReminderStatus('Pending');
            }
            setReminderModal({ entryId: formatCell.entryId, colId: formatCell.colId });
          }}
        />
      )}

      {/* Reminders Summary Modal */}
      <RemindersSummaryModal
        isOpen={showRemindersSummary}
        onClose={() => setShowRemindersSummary(false)}
        registerReminders={registerReminders}
        reminders={reminders}
        setReminders={setReminders}
        localEntries={localEntries}
        columns={columns}
        register={register}
        registerId={registerId}
        handleCellChange={handleCellChange}
      />
    </div>
  );
}
