import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listRegisters, listFolders, listBusinesses, getRegister } from '../lib/api';
import { useAuth } from '../lib/auth';
import RegisterPage from './RegisterPage';
import { X, ChevronDown, FileSpreadsheet, Folder as FolderIcon, ArrowLeft, Columns } from 'lucide-react';

export default function DualRegisterPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const leftRegisterId = Number(id) || 0;
  const [rightRegisterId, setRightRegisterId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(true);
  const [pickerSearch, setPickerSearch] = useState('');

  // Fetch left register details to get its businessId
  const { data: leftRegister } = useQuery({
    queryKey: ['register', leftRegisterId],
    queryFn: () => getRegister(leftRegisterId),
    enabled: !!leftRegisterId,
  });

  // Fetch businesses as fallback
  const { data: businesses = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: listBusinesses,
  });

  const businessId = leftRegister?.businessId || businesses?.[0]?.id;

  // Fetch registers for the picker using resolved businessId
  const { data: registers = [] } = useQuery({
    queryKey: ['registers', businessId],
    queryFn: () => listRegisters(businessId!),
    enabled: !!businessId,
    staleTime: 60 * 1000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ['folders', businessId],
    queryFn: () => listFolders(businessId!),
    enabled: !!businessId,
    staleTime: 60 * 1000,
  });

  // Filter registers for picker (exclude the left one, apply search, apply permissions)
  const filteredRegisters = useMemo(() => {
    let regs = registers.filter(r => r.id !== leftRegisterId);
    
    // Apply permission filter for non-admin users
    if (user && !((user as any).permissions?.isAdmin || (user as any).permissions?.fullSheetAccess || (user as any).role === 'superadmin' || (user as any).role === 'admin' || (user as any).role === 'sheet_admin')) {
      const allowedRegs = (user as any).permissions?.allowedRegisters;
      if (Array.isArray(allowedRegs)) {
        regs = regs.filter(r => allowedRegs.map(String).includes(r.id.toString()));
      } else {
        const allowedFolders = (user as any).permissions?.allowedFolders;
        if (Array.isArray(allowedFolders)) {
          regs = regs.filter(r => r.folderId && allowedFolders.map(String).includes(r.folderId.toString()));
        } else {
          regs = [];
        }
      }
    }

    if (pickerSearch.trim()) {
      regs = regs.filter(r => r.name.toLowerCase().includes(pickerSearch.toLowerCase()));
    }
    return regs;
  }, [registers, leftRegisterId, pickerSearch, user]);

  // Group by folder
  const groupedRegisters = useMemo(() => {
    const folderMap = new Map(folders.map(f => [f.id, f.name]));
    const groups: Record<string, typeof filteredRegisters> = {};
    const unassigned: typeof filteredRegisters = [];

    filteredRegisters.forEach(r => {
      if (r.folderId) {
        const folderName = folderMap.get(r.folderId) || 'Unknown Folder';
        if (!groups[folderName]) groups[folderName] = [];
        groups[folderName].push(r);
      } else {
        unassigned.push(r);
      }
    });

    return { groups, unassigned };
  }, [filteredRegisters, folders]);

  const handleCloseSplit = () => {
    navigate(`/register/${leftRegisterId}`);
  };

  const handleSelectRight = (regId: number) => {
    setRightRegisterId(regId);
    setShowPicker(false);
  };

  return (
    <div className="dual-register-container">
      {/* Left Pane */}
      <div className="dual-pane dual-pane-left">
        <RegisterPage 
          overrideRegisterId={leftRegisterId} 
          compact={true}
          onCloseSplit={handleCloseSplit}
        />
      </div>

      {/* Divider */}
      <div className="dual-pane-divider">
        <div className="dual-pane-divider-line" />
      </div>

      {/* Right Pane */}
      <div className="dual-pane dual-pane-right">
        {/* Register Picker or Register Content */}
        {showPicker || !rightRegisterId ? (
          <div className="dual-pane-picker">
            <div className="dual-pane-picker-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3>Select a Register</h3>
                <p>Choose which register to display in the right pane</p>
              </div>
              <button
                className="dual-pane-close-btn"
                onClick={handleCloseSplit}
                title="Close Split View"
              >
                <X size={16} />
              </button>
            </div>
            <input
              className="dual-pane-picker-search"
              type="text"
              placeholder="Search registers…"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              autoFocus
            />
            <div className="dual-pane-picker-list">
              {/* Grouped by folder */}
              {Object.entries(groupedRegisters.groups).map(([folderName, regs]) => (
                <div key={folderName} className="dual-pane-picker-group">
                  <div className="dual-pane-picker-folder">
                    <FolderIcon size={14} />
                    <span>{folderName}</span>
                    <span className="dual-pane-picker-count">{regs.length}</span>
                  </div>
                  {regs.map(r => (
                    <button
                      key={r.id}
                      className="dual-pane-picker-item"
                      onClick={() => handleSelectRight(r.id)}
                    >
                      <FileSpreadsheet size={14} />
                      <span>{r.name}</span>
                      <span className="dual-pane-picker-entries">{r.entryCount ?? ''} entries</span>
                    </button>
                  ))}
                </div>
              ))}

              {/* Unassigned */}
              {groupedRegisters.unassigned.length > 0 && (
                <div className="dual-pane-picker-group">
                  <div className="dual-pane-picker-folder">
                    <FolderIcon size={14} />
                    <span>Unorganized</span>
                    <span className="dual-pane-picker-count">{groupedRegisters.unassigned.length}</span>
                  </div>
                  {groupedRegisters.unassigned.map(r => (
                    <button
                      key={r.id}
                      className="dual-pane-picker-item"
                      onClick={() => handleSelectRight(r.id)}
                    >
                      <FileSpreadsheet size={14} />
                      <span>{r.name}</span>
                      <span className="dual-pane-picker-entries">{r.entryCount ?? ''} entries</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredRegisters.length === 0 && (
                <div className="dual-pane-picker-empty">
                  No registers found
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="dual-pane-register-content">
            <RegisterPage 
              key={rightRegisterId}
              overrideRegisterId={rightRegisterId} 
              compact={true}
              onCloseSplit={handleCloseSplit}
              onChangeSplit={() => { setShowPicker(true); setRightRegisterId(null); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
