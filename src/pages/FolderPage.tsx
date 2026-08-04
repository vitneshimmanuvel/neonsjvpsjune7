import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listBusinesses, listFolders, listRegisters, deleteRegister,
  renameRegister, duplicateRegister, moveRegistersToFolder,
  renameFolder, deleteFolder,
  type RegisterSummary, type Folder
} from '../lib/api';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import {
  Folder as FolderIcon, ArrowLeft, Search, CheckSquare, Square,
  MoveRight, Trash2, Plus, Pencil, Eye, Copy,
  CheckCircle2, FolderOpen, AlertTriangle, X, MoreVertical,
  Layers, FileText
} from 'lucide-react';
import { RequestModal } from '../components/register/modals/RequestModal';

export default function FolderPage() {
  const { folderId: rawFolderId } = useParams();
  const folderId = rawFolderId ? parseInt(rawFolderId, 10) : NaN;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || (user as any)?.permissions?.isAdmin;

  // Local states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<number | null>(null);
  
  // Single register menu state
  const [activeRegMenuId, setActiveRegMenuId] = useState<number | null>(null);
  const [hoveredRegId, setHoveredRegId] = useState<number | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  
  // Rename modal states
  const [renameFolderModal, setRenameFolderModal] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState('');
  
  const [renameRegModal, setRenameRegModal] = useState(false);
  const [renameRegId, setRenameRegId] = useState<number | null>(null);
  const [regNameInput, setRegNameInput] = useState('');

  // Single item move modal
  const [singleMoveId, setSingleMoveId] = useState<number | null>(null);

  // Request modal for non-admins
  const [requestModal, setRequestModal] = useState<{
    isOpen: boolean;
    type: 'download' | 'delete_register';
    regId?: number;
    regName?: string;
  }>({ isOpen: false, type: 'delete_register' });

  // Fetch businesses, folders, registers
  const { data: businesses } = useQuery({ queryKey: ['businesses'], queryFn: listBusinesses });
  const businessId = businesses?.[0]?.id;

  const { data: folders = [] } = useQuery({
    queryKey: ['folders', businessId],
    queryFn: () => listFolders(businessId!),
    enabled: !!businessId,
  });

  const { data: allRegisters = [], isLoading: loadingRegisters } = useQuery({
    queryKey: ['registers', businessId],
    queryFn: () => listRegisters(businessId!),
    enabled: !!businessId,
  });

  // Target folder info
  const currentFolder = useMemo(() => {
    return folders.find(f => f.id === folderId);
  }, [folders, folderId]);

  // Filter registers in current folder (with access control for non-admin staff)
  const folderRegisters = useMemo(() => {
    const customRegOrder: number[] = (() => {
      try { return JSON.parse(localStorage.getItem('admin_register_order') || '[]'); } catch { return []; }
    })();
    const regs = allRegisters.filter(r => {
      // Must be in this folder
      if (r.folderId !== folderId) return false;

      // Admins, superadmins, sheet_admins, fullSheetAccess, isAdmin → see all
      if (user && (
        (user as any).permissions?.fullSheetAccess ||
        (user as any).permissions?.isAdmin ||
        (user as any).role === 'superadmin' ||
        (user as any).role === 'admin' ||
        (user as any).role === 'sheet_admin'
      )) {
        return true;
      }

      // Non-admin staff: only show registers they have explicit access to
      if (user) {
        const allowedRegs = (user as any).permissions?.allowedRegisters;
        if (Array.isArray(allowedRegs)) {
          return allowedRegs.map(String).includes(r.id.toString());
        }

        const allowedFolders = (user as any).permissions?.allowedFolders;
        const folderIdStr = r.folderId ? r.folderId.toString() : '';
        if (Array.isArray(allowedFolders)) {
          return !!(folderIdStr && allowedFolders.map(String).includes(folderIdStr));
        }

        return false;
      }

      return true;
    });
    if (customRegOrder.length === 0) return regs;
    const orderMap = new Map(customRegOrder.map((id, index) => [id, index]));
    return [...regs].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return posA - posB;
    });
  }, [allRegisters, folderId, user]);

  // Apply search filter
  const displayedRegisters = useMemo(() => {
    if (!searchTerm.trim()) return folderRegisters;
    const q = searchTerm.toLowerCase().trim();
    return folderRegisters.filter(r => r.name.toLowerCase().includes(q));
  }, [folderRegisters, searchTerm]);

  // Check selection states
  const isAllSelected = useMemo(() => {
    if (displayedRegisters.length === 0) return false;
    return displayedRegisters.every(r => selectedIds.has(r.id));
  }, [displayedRegisters, selectedIds]);

  const isSomeSelected = useMemo(() => {
    return selectedIds.size > 0;
  }, [selectedIds]);

  // Toggle select single register
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Toggle Select All
  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedRegisters.map(r => r.id)));
    }
  }, [isAllSelected, displayedRegisters]);

  // Mutations
  const moveMultipleMutation = useMutation({
    mutationFn: ({ regIds, fId }: { regIds: number[]; fId: number | null }) =>
      moveRegistersToFolder(regIds, fId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['folders', businessId] });
      const targetName = variables.fId === null
        ? 'Unassigned'
        : folders.find(f => f.id === variables.fId)?.name || 'target folder';
      toast.success(`Moved ${variables.regIds.length} register(s) to ${targetName}`);
      setSelectedIds(new Set());
      setShowMoveModal(false);
      setSingleMoveId(null);
    },
    onError: (err: Error) => {
      toast.error(`Move failed: ${err.message}`);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRegister,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['deletedRegisters', businessId] });
      toast.success('Register deleted');
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', businessId] });
      toast.success('Folder renamed successfully');
      setRenameFolderModal(false);
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (fId: number) => deleteFolder(fId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders', businessId] });
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      toast.success('Folder deleted');
      navigate('/');
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const renameRegMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameRegister(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      toast.success('Register renamed');
      setRenameRegModal(false);
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const duplicateMutation = useMutation({
    mutationFn: duplicateRegister,
    onSuccess: (newReg) => {
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      toast.success(`Duplicated register "${newReg.name}"`);
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // Handle Bulk Move
  const handleBulkMove = () => {
    if (selectedIds.size === 0) return;
    moveMultipleMutation.mutate({
      regIds: Array.from(selectedIds),
      fId: targetFolderId
    });
  };

  // Handle Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    if (!isAdmin) {
      toast.error('Only administrators can bulk delete registers.');
      return;
    }

    try {
      await Promise.all(ids.map(id => deleteRegister(id)));
      queryClient.invalidateQueries({ queryKey: ['registers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['deletedRegisters', businessId] });
      toast.success(`Deleted ${ids.length} register(s)`);
      setSelectedIds(new Set());
      setShowDeleteModal(false);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message || err}`);
    }
  };

  if (!currentFolder && !loadingRegisters && folders.length > 0) {
    return (
      <div className="content-area">
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <FolderIcon size={48} color="var(--muted)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--foreground)' }}>Folder Not Found</h2>
          <p style={{ color: 'var(--muted)', margin: '8px 0 20px' }}>The requested folder does not exist or may have been deleted.</p>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '10px 20px',
              background: 'var(--navy)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Return to Registers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="content-area" style={{ padding: '24px 32px', overflowY: 'auto', scrollBehavior: 'smooth', flex: 1, height: '100%' }}>
      {/* ── Top Header & Breadcrumbs ── */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--background)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '7px 14px',
            color: 'var(--foreground)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--muted)';
            e.currentTarget.style.boxShadow = '0 3px 8px rgba(0,0,0,0.08)';
            e.currentTarget.style.transform = 'translateX(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--navy)'
          }}>
            <ArrowLeft size={14} />
          </div>
          <span>Back to All Registers</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '1px solid #fcd34d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
            }}>
              <FolderIcon size={26} fill="#fbbf24" color="#d97706" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--foreground)', margin: 0, letterSpacing: '-0.5px' }}>
                  {currentFolder?.name || 'Folder'}
                </h1>
                <button
                  onClick={() => setShowFolderMenu(!showFolderMenu)}
                  title="Folder Actions"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '6px',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                {showFolderMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                      onClick={() => setShowFolderMenu(false)}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: '0',
                        marginTop: '8px',
                        background: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                        zIndex: 1000,
                        minWidth: '160px',
                        overflow: 'hidden'
                      }}
                    >
                      <button
                        className="context-item"
                        onClick={() => {
                          setShowFolderMenu(false);
                          setFolderNameInput(currentFolder?.name || '');
                          setRenameFolderModal(true);
                        }}
                        style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '13px' }}
                      >
                        <Pencil size={15} color="var(--navy)" />
                        <span>Rename Folder</span>
                      </button>
                      <button
                        className="context-item danger"
                        onClick={() => {
                          setShowFolderMenu(false);
                          if (confirm(`Delete folder "${currentFolder?.name}"? Registers will remain in Unassigned.`)) {
                            deleteFolderMutation.mutate(folderId);
                          }
                        }}
                        style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '13px' }}
                      >
                        <Trash2 size={15} />
                        <span>Delete Folder</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                {folderRegisters.length} register{folderRegisters.length !== 1 ? 's' : ''} in this folder
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => navigate('/templates')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                background: 'var(--navy)',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                transition: 'all 0.15s'
              }}
            >
              <Plus size={16} /> New Register
            </button>
          </div>
        </div>
      </div>

      {/* ── Search & Bulk Actions Bar ── */}
      <div style={{
        background: 'var(--background)',
        borderRadius: '16px',
        padding: '16px 20px',
        border: '1px solid var(--border)',
        marginBottom: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* Left side: Select All & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 300px' }}>
          <button
            onClick={toggleSelectAll}
            disabled={displayedRegisters.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: `1.5px solid ${isAllSelected ? 'var(--primary)' : 'var(--border)'}`,
              background: isAllSelected ? 'rgba(30, 45, 120, 0.06)' : 'var(--background)',
              color: isAllSelected ? 'var(--primary)' : 'var(--muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: displayedRegisters.length === 0 ? 'not-allowed' : 'pointer',
              opacity: displayedRegisters.length === 0 ? 0.6 : 1,
              transition: 'all 0.15s ease'
            }}
          >
            {isAllSelected ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="var(--muted)" />}
            <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          {/* Search box */}
          <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search registers in folder..."
              style={{
                width: '100%',
                padding: '8px 36px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                color: 'var(--foreground)',
                outline: 'none',
                transition: 'all 0.15s'
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'var(--border)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  padding: 0
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Right side: Bulk Actions toolbar */}
        {isSomeSelected && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(30, 45, 120, 0.04)',
            padding: '6px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(30, 45, 120, 0.12)'
          }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy)', marginRight: '4px' }}>
              {selectedIds.size} selected
            </span>

            {/* Bulk Move Button */}
            <button
              onClick={() => setShowMoveModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.15s'
              }}
            >
              <MoveRight size={15} color="var(--navy)" /> Bulk Move
            </button>

            {/* Bulk Delete Button */}
            <button
              onClick={() => setShowDeleteModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <Trash2 size={15} /> Bulk Delete
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 6px',
                textDecoration: 'underline'
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Registers Grid View ── */}
      {displayedRegisters.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: 'var(--background)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          {searchTerm ? (
            <>
              <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
                No registers match "{searchTerm}"
              </p>
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  padding: '8px 16px',
                  background: 'var(--navy)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Clear Search
              </button>
            </>
          ) : (
            <>
              <FolderOpen size={48} color="#cbd5e1" style={{ marginBottom: '12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
                This folder is empty
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 20px' }}>
                Start by creating a new register or move existing registers into this folder.
              </p>
              <button
                onClick={() => navigate('/templates')}
                style={{
                  padding: '10px 20px',
                  background: 'var(--navy)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                Add New Register
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="categories-grid categories-grid--no-pad">
          {displayedRegisters.map(reg => {
            const isSelected = selectedIds.has(reg.id);
            return (
              <div
                key={reg.id}
                className="category-card"
                onClick={() => navigate(`/register/${reg.id}`)}
                onMouseEnter={() => setHoveredRegId(reg.id)}
                onMouseLeave={() => setHoveredRegId(null)}
                style={{
                  position: 'relative',
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                  backgroundColor: isSelected ? 'rgba(30, 45, 120, 0.03)' : 'var(--background)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                {/* Selection Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(reg.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: '14px',
                    left: '14px',
                    zIndex: 2,
                    cursor: 'pointer',
                    padding: '2px',
                    opacity: (isSelected || hoveredRegId === reg.id) ? 1 : 0,
                    transition: 'opacity 0.2s ease'
                  }}
                  title={isSelected ? 'Deselect' : 'Select'}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: isSelected ? 'var(--primary)' : 'var(--background)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}>
                    {isSelected && <CheckCircle2 size={12} color="#ffffff" />}
                  </div>
                </div>

                {/* Card Menu Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveRegMenuId(activeRegMenuId === reg.id ? null : reg.id);
                  }}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                    padding: '4px',
                    borderRadius: '4px',
                    zIndex: 2
                  }}
                >
                  <MoreVertical size={16} />
                </button>

                <div
                  className="category-icon"
                  {...{ style: { '--dyn-bg': reg.iconColor || 'var(--navy)', marginTop: '8px' } as React.CSSProperties }}
                >
                  <FileText size={24} />
                </div>
                <div className="category-name" style={{ paddingRight: '24px' }}>{reg.name}</div>
                <div className="category-count">
                  {reg.entryCount} entries &bull; {new Date(reg.updatedAt).toLocaleDateString()}
                  {reg.lastActivity ? ` | ${reg.lastActivity}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Single Register Context Menu ── */}
      {activeRegMenuId !== null && (
        <div className="modal-overlay" onClick={() => setActiveRegMenuId(null)}>
          <div className="context-menu" onClick={(e) => e.stopPropagation()}>
            <div className="context-title">
              {allRegisters.find(r => r.id === activeRegMenuId)?.name || 'Register'}
            </div>
            <button className="context-item" onClick={() => { navigate(`/register/${activeRegMenuId}`); setActiveRegMenuId(null); }}>
              <Eye size={16} /> Open Register
            </button>
            <button className="context-item" onClick={() => {
              const reg = allRegisters.find(r => r.id === activeRegMenuId);
              setRenameRegId(activeRegMenuId);
              setRegNameInput(reg?.name || '');
              setActiveRegMenuId(null);
              setRenameRegModal(true);
            }}>
              <Pencil size={16} /> Rename
            </button>
            <button className="context-item" onClick={() => {
              duplicateMutation.mutate(activeRegMenuId);
              setActiveRegMenuId(null);
            }}>
              <Copy size={16} /> Duplicate
            </button>
            <button className="context-item" onClick={() => {
              setSingleMoveId(activeRegMenuId);
              setTargetFolderId(folderId);
              setActiveRegMenuId(null);
              setShowMoveModal(true);
            }}>
              <MoveRight size={16} /> Move to another folder
            </button>
            <button className="context-item danger" onClick={() => {
              const reg = allRegisters.find(r => r.id === activeRegMenuId);
              if (isAdmin) {
                if (confirm(`Delete register "${reg?.name}"?`)) deleteMutation.mutate(activeRegMenuId);
              } else {
                setRequestModal({ type: 'delete_register', isOpen: true, regId: activeRegMenuId, regName: reg?.name });
              }
              setActiveRegMenuId(null);
            }}>
              <Trash2 size={16} /> {isAdmin ? 'Delete' : 'Request Deletion'}
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk / Single Move Modal ── */}
      {showMoveModal && (
        <div className="modal-overlay" onClick={() => { setShowMoveModal(false); setSingleMoveId(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h3 className="modal-title">
              Move {singleMoveId ? 'Register' : `${selectedIds.size} Registers`}
            </h3>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Select target folder to move {singleMoveId ? 'this register' : 'selected registers'}:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto', marginBottom: '20px' }}>
              {/* Option for Unassigned */}
              <div
                onClick={() => setTargetFolderId(null)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: targetFolderId === null ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                  background: targetFolderId === null ? 'rgba(30, 45, 120, 0.04)' : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s'
                }}
              >
                <Layers size={18} color="#64748b" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Unassigned (Root)</span>
              </div>

              {/* Folder list */}
              {folders.map(f => (
                <div
                  key={f.id}
                  onClick={() => setTargetFolderId(f.id)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: targetFolderId === f.id ? '2px solid var(--primary)' : '1px solid #e2e8f0',
                    background: targetFolderId === f.id ? 'rgba(30, 45, 120, 0.04)' : 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.15s'
                  }}
                >
                  <FolderIcon size={18} fill="#fbbf24" color="#d97706" />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{f.name}</span>
                  {f.id === folderId && (
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>(Current)</span>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => { setShowMoveModal(false); setSingleMoveId(null); }}>
                Cancel
              </button>
              <button
                className="modal-confirm-btn"
                onClick={() => {
                  if (singleMoveId) {
                    moveMultipleMutation.mutate({ regIds: [singleMoveId], fId: targetFolderId });
                  } else {
                    handleBulkMove();
                  }
                }}
                disabled={moveMultipleMutation.isPending}
              >
                {moveMultipleMutation.isPending ? 'Moving...' : 'Move Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626', marginBottom: '12px' }}>
              <AlertTriangle size={24} />
              <h3 className="modal-title" style={{ margin: 0 }}>Confirm Bulk Deletion</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, marginBottom: '20px' }}>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> selected register(s)?
              They will be moved to the Recycle Bin.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button
                className="modal-confirm-btn"
                style={{ background: '#dc2626' }}
                onClick={handleBulkDelete}
              >
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Folder Modal ── */}
      {renameFolderModal && (
        <div className="modal-overlay" onClick={() => setRenameFolderModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Rename Folder</h3>
            <input
              className="modal-input"
              value={folderNameInput}
              onChange={(e) => setFolderNameInput(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && folderNameInput.trim()) {
                  renameFolderMutation.mutate({ id: folderId, name: folderNameInput.trim() });
                }
              }}
            />
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setRenameFolderModal(false)}>Cancel</button>
              <button
                className="modal-confirm-btn"
                disabled={!folderNameInput.trim() || renameFolderMutation.isPending}
                onClick={() => renameFolderMutation.mutate({ id: folderId, name: folderNameInput.trim() })}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename Register Modal ── */}
      {renameRegModal && (
        <div className="modal-overlay" onClick={() => setRenameRegModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Rename Register</h3>
            <input
              className="modal-input"
              value={regNameInput}
              onChange={(e) => setRegNameInput(e.target.value)}
              placeholder="Register name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameRegId && regNameInput.trim()) {
                  renameRegMutation.mutate({ id: renameRegId, name: regNameInput.trim() });
                }
              }}
            />
            <div className="modal-actions">
              <button className="modal-cancel-btn" onClick={() => setRenameRegModal(false)}>Cancel</button>
              <button
                className="modal-confirm-btn"
                disabled={!regNameInput.trim() || renameRegMutation.isPending}
                onClick={() => renameRegId && renameRegMutation.mutate({ id: renameRegId, name: regNameInput.trim() })}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Modal for Non-Admins */}
      <RequestModal
        isOpen={requestModal.isOpen}
        onClose={() => setRequestModal(prev => ({ ...prev, isOpen: false }))}
        type={requestModal.type}
        registerName={requestModal.regName || 'Unknown Register'}
        registerId={requestModal.regId}
      />
    </div>
  );
}
