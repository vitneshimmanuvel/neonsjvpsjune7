import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Folder as FolderIcon, FileText, ArrowUp, ArrowDown, RotateCcw, Check, X, ArrowUpDown } from 'lucide-react';
import type { Folder, RegisterSummary } from '../../lib/api';
import toast from 'react-hot-toast';

interface RearrangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  registers: RegisterSummary[];
  onSaveOrder: () => void;
}

export function RearrangeModal({ isOpen, onClose, folders, registers, onSaveOrder }: RearrangeModalProps) {
  const [activeTab, setActiveTab] = useState<'folders' | 'registers'>('folders');
  const [selectedFolderId, setSelectedFolderId] = useState<number | 'all'>('all');

  // Local reorder states
  const [folderList, setFolderList] = useState<Folder[]>(() => {
    const savedOrder: number[] = (() => {
      try { return JSON.parse(localStorage.getItem('admin_folder_order') || '[]'); } catch { return []; }
    })();
    if (savedOrder.length === 0) return [...folders];
    const orderMap = new Map(savedOrder.map((id, index) => [id, index]));
    return [...folders].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return posA - posB;
    });
  });

  const [registerList, setRegisterList] = useState<RegisterSummary[]>(() => {
    const savedOrder: number[] = (() => {
      try { return JSON.parse(localStorage.getItem('admin_register_order') || '[]'); } catch { return []; }
    })();
    if (savedOrder.length === 0) return [...registers];
    const orderMap = new Map(savedOrder.map((id, index) => [id, index]));
    return [...registers].sort((a, b) => {
      const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
      const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
      return posA - posB;
    });
  });

  // Sync state if props change when opening
  useMemo(() => {
    if (isOpen) {
      const savedFolderOrder: number[] = (() => {
        try { return JSON.parse(localStorage.getItem('admin_folder_order') || '[]'); } catch { return []; }
      })();
      if (savedFolderOrder.length > 0) {
        const orderMap = new Map(savedFolderOrder.map((id, index) => [id, index]));
        setFolderList([...folders].sort((a, b) => {
          const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return posA - posB;
        }));
      } else {
        setFolderList([...folders]);
      }

      const savedRegOrder: number[] = (() => {
        try { return JSON.parse(localStorage.getItem('admin_register_order') || '[]'); } catch { return []; }
      })();
      if (savedRegOrder.length > 0) {
        const orderMap = new Map(savedRegOrder.map((id, index) => [id, index]));
        setRegisterList([...registers].sort((a, b) => {
          const posA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
          const posB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
          return posA - posB;
        }));
      } else {
        setRegisterList([...registers]);
      }
    }
  }, [isOpen, folders, registers]);

  // Filter registers by selected folder if tab is registers
  const displayedRegisters = useMemo(() => {
    if (selectedFolderId === 'all') return registerList;
    if (selectedFolderId === null || selectedFolderId === 0) return registerList.filter(r => !r.folderId);
    return registerList.filter(r => r.folderId === selectedFolderId);
  }, [registerList, selectedFolderId]);

  if (!isOpen) return null;

  // Move Folder Up/Down
  const moveFolder = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= folderList.length) return;
    const next = [...folderList];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setFolderList(next);
  };

  // Move Register Up/Down
  const moveRegister = (regId: number, direction: 'up' | 'down') => {
    const listToMove = [...displayedRegisters];
    const index = listToMove.findIndex(r => r.id === regId);
    if (index === -1) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= listToMove.length) return;

    const swappedItem = listToMove[targetIdx];
    
    setRegisterList(prev => {
      const next = [...prev];
      const masterIdx1 = next.findIndex(r => r.id === regId);
      const masterIdx2 = next.findIndex(r => r.id === swappedItem.id);
      if (masterIdx1 !== -1 && masterIdx2 !== -1) {
        const temp = next[masterIdx1];
        next[masterIdx1] = next[masterIdx2];
        next[masterIdx2] = temp;
      }
      return next;
    });
  };

  // Save Arrangement
  const handleSave = () => {
    const folderIds = folderList.map(f => f.id);
    const registerIds = registerList.map(r => r.id);
    localStorage.setItem('admin_folder_order', JSON.stringify(folderIds));
    localStorage.setItem('admin_register_order', JSON.stringify(registerIds));
    toast.success('Custom arrangement saved!');
    onSaveOrder();
    onClose();
  };

  // Reset Arrangement to Alphabetical
  const handleReset = () => {
    localStorage.removeItem('admin_folder_order');
    localStorage.removeItem('admin_register_order');
    setFolderList([...folders].sort((a, b) => a.name.localeCompare(b.name)));
    setRegisterList([...registers].sort((a, b) => a.name.localeCompare(b.name)));
    toast.success('Reset to default alphabetical order');
    onSaveOrder();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: '640px',
          width: '100%',
          maxHeight: '85vh',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modern Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #002d5d 0%, #0a3d73 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', boxShadow: '0 4px 10px rgba(0,45,93,0.2)' }}>
              <ArrowUpDown size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                Rearrange Folders & Registers
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '2px 0 0' }}>
                Reorder display positioning as per Admin preference
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Selection: Folders vs Registers */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: '10px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <button
            onClick={() => setActiveTab('folders')}
            style={{
              padding: '10px 18px',
              borderRadius: '10px 10px 0 0',
              border: '1px solid #e2e8f0',
              borderBottom: activeTab === 'folders' ? '3px solid var(--navy)' : '1px solid #e2e8f0',
              background: activeTab === 'folders' ? '#ffffff' : 'transparent',
              color: activeTab === 'folders' ? 'var(--navy)' : '#64748b',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s'
            }}
          >
            <FolderIcon size={16} fill={activeTab === 'folders' ? '#fbbf24' : 'none'} color="#d97706" />
            <span>Folders</span>
            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '12px', background: activeTab === 'folders' ? 'rgba(0,45,93,0.1)' : '#e2e8f0', color: activeTab === 'folders' ? 'var(--navy)' : '#64748b' }}>
              {folderList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('registers')}
            style={{
              padding: '10px 18px',
              borderRadius: '10px 10px 0 0',
              border: '1px solid #e2e8f0',
              borderBottom: activeTab === 'registers' ? '3px solid var(--navy)' : '1px solid #e2e8f0',
              background: activeTab === 'registers' ? '#ffffff' : 'transparent',
              color: activeTab === 'registers' ? 'var(--navy)' : '#64748b',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s'
            }}
          >
            <FileText size={16} color="var(--navy)" />
            <span>Registers</span>
            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '12px', background: activeTab === 'registers' ? 'rgba(0,45,93,0.1)' : '#e2e8f0', color: activeTab === 'registers' ? 'var(--navy)' : '#64748b' }}>
              {registerList.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', maxHeight: '440px', background: '#ffffff' }}>
          {activeTab === 'folders' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {folderList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13.5px' }}>
                  No folders available to rearrange.
                </div>
              ) : (
                folderList.map((folder, idx) => (
                  <div
                    key={folder.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', minWidth: '32px', textAlign: 'center' }}>
                        #{idx + 1}
                      </span>
                      <FolderIcon size={20} fill="#fbbf24" color="#d97706" />
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {folder.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => moveFolder(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          background: idx === 0 ? '#f8fafc' : '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: idx === 0 ? '#cbd5e1' : '#334155',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          boxShadow: idx === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <ArrowUp size={14} /> Up
                      </button>
                      <button
                        onClick={() => moveFolder(idx, 'down')}
                        disabled={idx === folderList.length - 1}
                        title="Move Down"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          background: idx === folderList.length - 1 ? '#f8fafc' : '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: idx === folderList.length - 1 ? '#cbd5e1' : '#334155',
                          cursor: idx === folderList.length - 1 ? 'not-allowed' : 'pointer',
                          boxShadow: idx === folderList.length - 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'
                        }}
                      >
                        <ArrowDown size={14} /> Down
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div>
              {/* Filter registers by folder dropdown */}
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Filter Folder:</span>
                <select
                  value={selectedFolderId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all') setSelectedFolderId('all');
                    else if (val === 'unassigned') setSelectedFolderId(0);
                    else setSelectedFolderId(Number(val));
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0f172a',
                    outline: 'none',
                    background: 'white',
                    minWidth: '220px'
                  }}
                >
                  <option value="all">All Registers ({registerList.length})</option>
                  <option value="unassigned">Unassigned Registers ({registerList.filter(r => !r.folderId).length})</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({registerList.filter(r => r.folderId === f.id).length})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {displayedRegisters.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13.5px' }}>
                    No registers match filter.
                  </div>
                ) : (
                  displayedRegisters.map((reg, idx) => (
                    <div
                      key={reg.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', minWidth: '32px', textAlign: 'center' }}>
                          #{idx + 1}
                        </span>
                        <FileText size={20} color="var(--navy)" />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                            {reg.name}
                          </div>
                          {reg.folderId && (
                            <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>
                              Folder: {folders.find(f => f.id === reg.folderId)?.name || 'Unknown'}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => moveRegister(reg.id, 'up')}
                          disabled={idx === 0}
                          title="Move Up"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            background: idx === 0 ? '#f8fafc' : '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: idx === 0 ? '#cbd5e1' : '#334155',
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            boxShadow: idx === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          <ArrowUp size={14} /> Up
                        </button>
                        <button
                          onClick={() => moveRegister(reg.id, 'down')}
                          disabled={idx === displayedRegisters.length - 1}
                          title="Move Down"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            background: idx === displayedRegisters.length - 1 ? '#f8fafc' : '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: idx === displayedRegisters.length - 1 ? '#cbd5e1' : '#334155',
                            cursor: idx === displayedRegisters.length - 1 ? 'not-allowed' : 'pointer',
                            boxShadow: idx === displayedRegisters.length - 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          <ArrowDown size={14} /> Down
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Premium Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <RotateCcw size={14} /> Reset Order
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 18px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                color: '#475569',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                background: 'linear-gradient(135deg, #002d5d 0%, #0a3d73 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 45, 93, 0.25)'
              }}
            >
              <Check size={16} strokeWidth={2.5} /> Save Arrangement
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
