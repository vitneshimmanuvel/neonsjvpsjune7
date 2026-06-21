import React, { useState } from 'react';
import { Bell, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { type Entry } from '../../../lib/api';

// Helper to normalize DD-MM-YYYY to YYYY-MM-DD for comparison
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

interface RemindersSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  registerReminders: any[];
  reminders: any[];
  setReminders: (val: any[]) => void;
  localEntries: Entry[];
  columns: any[];
  register: any;
  registerId: number;
  handleCellChange: (entryId: number, colId: string, val: string) => void | boolean | Promise<any>;
}

export function RemindersSummaryModal({
  isOpen,
  onClose,
  registerReminders,
  reminders,
  setReminders,
  localEntries,
  columns,
  register,
  registerId,
  handleCellChange
}: RemindersSummaryModalProps) {
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [editRemDate, setEditRemDate] = useState('');
  const [editRemTime, setEditRemTime] = useState('');
  const [editRemMessage, setEditRemMessage] = useState('');
  const [editRemStatus, setEditRemStatus] = useState<'Pending' | 'Complete'>('Pending');
  const [editRemCellValue, setEditRemCellValue] = useState('');
  const [inlineCellValues, setInlineCellValues] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => { onClose(); setEditingReminderId(null); }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '650px', maxWidth: '90%', position: 'relative' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} color="var(--primary)" />
            <h3 style={{ margin: 0 }}>Active Reminders</h3>
          </div>
          <button 
            className="modal-close" 
            onClick={() => { onClose(); setEditingReminderId(null); }}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'var(--border-color, #f3f4f6)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'background 0.2s'
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
          {registerReminders.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Bell size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p style={{ margin: 0 }}>No reminders set for this register.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {registerReminders.map(r => {
                const entry = localEntries.find(e => e.id === r.rowId);
                const rowNum = entry ? (entry.rowNumber || localEntries.indexOf(entry) + 1) : 'Unknown Row';
                const column = columns.find(c => c.id.toString() === r.colId);
                const colName = column?.name || r.colId || 'General';
                const currentCellValue = (r.colId && entry?.cells) ? entry.cells[r.colId] : '';
                const isEditing = editingReminderId === r.id;
                const registerName = register?.name || 'Register';

                if (isEditing) {
                  return (
                    <div 
                      key={r.id} 
                      style={{ 
                        border: '2px solid var(--primary)', 
                        borderRadius: '12px', 
                        padding: '16px', 
                        background: '#f9fafb',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge badge-primary" style={{ fontSize: '11px', padding: '2px 8px' }}>Editing {registerName} (Row #{rowNum})</span>
                          <span className="badge badge-secondary" style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>Col: {colName}</span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>Edit Mode</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>Reminder Date <span style={{fontSize: '10px', color: 'var(--text-muted)'}}>(Optional)</span></label>
                          <input 
                            type="date" 
                            className="modal-input" 
                            value={editRemDate} 
                            onChange={e => setEditRemDate(e.target.value)} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }} 
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>Reminder Time <span style={{fontSize: '10px', color: 'var(--text-muted)'}}>(Optional)</span></label>
                          <input 
                            type="time" 
                            className="modal-input" 
                            value={editRemTime} 
                            onChange={e => setEditRemTime(e.target.value)} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }} 
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>Reminder Message *</label>
                          <input 
                            type="text" 
                            className="modal-input" 
                            value={editRemMessage} 
                            onChange={e => setEditRemMessage(e.target.value)} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }} 
                            placeholder="Reminder message"
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>Status *</label>
                          <select 
                            className="modal-input" 
                            value={editRemStatus} 
                            onChange={e => setEditRemStatus(e.target.value as 'Pending' | 'Complete')} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Complete">Complete</option>
                          </select>
                        </div>
                      </div>

                      {column && (
                        <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '8px' }}>
                          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '4px' }}>
                            Respective Cell Value ({colName})
                          </label>
                          {column.type === 'dropdown' ? (
                            <select
                              className="modal-input"
                              value={editRemCellValue}
                              onChange={e => setEditRemCellValue(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }}
                            >
                              <option value="">-- Select Option --</option>
                              {column.dropdownOptions?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : column.type === 'checkbox' ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 0' }}>
                              <input
                                type="checkbox"
                                checked={editRemCellValue === 'true'}
                                onChange={e => setEditRemCellValue(e.target.checked ? 'true' : 'false')}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '13px', color: 'var(--text-color)' }}>Checked</span>
                            </label>
                          ) : column.type === 'date' ? (
                            <input
                              type="date"
                              className="modal-input"
                              value={parseDateString(editRemCellValue)}
                              onChange={e => setEditRemCellValue(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }}
                            />
                          ) : (
                            <input
                              type="text"
                              className="modal-input"
                              value={editRemCellValue}
                              onChange={e => setEditRemCellValue(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff', marginBottom: 0 }}
                              placeholder={`Enter cell value...`}
                            />
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        <button 
                          onClick={() => setEditingReminderId(null)}
                          style={{ 
                            padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '6px', 
                            border: '1px solid var(--border-color)', background: '#fff', cursor: 'pointer', color: 'var(--text-color)' 
                          }}
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => {
                            if (!editRemMessage) {
                              toast.error('Please enter a reminder message');
                              return;
                            }
                            
                            let triggerTime: number | undefined = undefined;
                            if (editRemDate && editRemTime) {
                              const dt = new Date(`${editRemDate}T${editRemTime}`);
                              if (isNaN(dt.getTime())) {
                                toast.error('Please enter a valid date and time');
                                return;
                              }
                              if (editRemStatus === 'Pending' && dt.getTime() < Date.now()) {
                                toast.error('Reminder time must be in the future for active/pending reminders');
                                return;
                              }
                              triggerTime = dt.getTime();
                            }

                            const updated = reminders.map(rem => {
                              if (rem.id === r.id) {
                                return {
                                  ...rem,
                                  message: editRemMessage,
                                  status: editRemStatus,
                                  triggerTime: triggerTime
                                };
                              }
                              return rem;
                            });
                            setReminders(updated);

                            const res = handleCellChange(r.rowId as number, r.colId as string, editRemCellValue);
                            if (res !== false) {
                              toast.success('Reminder and respective cell updated successfully!');
                            }
                            setEditingReminderId(null);
                          }}
                          style={{ 
                            padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', 
                            border: 'none', background: 'var(--primary)', cursor: 'pointer', color: '#fff' 
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  );
                }

                const triggerDate = r.triggerTime ? new Date(r.triggerTime).toLocaleString() : 'No schedule set';
                
                return (
                  <div 
                    key={r.id} 
                    style={{ 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '8px', 
                      padding: '12px', 
                      background: 'var(--card-bg, #ffffff)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge badge-primary" style={{ fontSize: '11px', padding: '2px 8px' }}>{registerName} (Row #{rowNum})</span>
                        <span className="badge badge-secondary" style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)' }}>Col: {colName}</span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{triggerDate}</span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span 
                          style={{ 
                            fontSize: '11px', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            background: r.status === 'Pending' ? '#fffbeb' : '#ecfdf5',
                            color: r.status === 'Pending' ? '#d97706' : '#059669',
                            fontWeight: 600
                          }}
                        >
                          {r.status}
                        </span>

                        <button 
                          onClick={() => {
                            setEditingReminderId(r.id);
                            setEditRemMessage(r.message || '');
                            setEditRemStatus(r.status || 'Pending');
                            if (r.triggerTime) {
                              const dt = new Date(r.triggerTime);
                              const yyyy = dt.getFullYear();
                              const mm = String(dt.getMonth() + 1).padStart(2, '0');
                              const dd = String(dt.getDate()).padStart(2, '0');
                              setEditRemDate(`${yyyy}-${mm}-${dd}`);
                              const hh = String(dt.getHours()).padStart(2, '0');
                              const min = String(dt.getMinutes()).padStart(2, '0');
                              setEditRemTime(`${hh}:${min}`);
                            } else {
                              setEditRemDate('');
                              setEditRemTime('');
                            }
                            setEditRemCellValue(currentCellValue);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px',
                            fontSize: '12px',
                            fontWeight: 500
                          }}
                          title="Edit Reminder & Cell Value"
                        >
                          Edit
                        </button>

                        <button 
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this reminder?')) {
                              const updated = reminders.filter(rem => rem.id !== r.id);
                              setReminders(updated);
                              toast.success('Reminder deleted successfully');
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--danger-color, #ef4444)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px'
                          }}
                          title="Delete Reminder"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-color)', fontWeight: 500 }}>
                        {r.message}
                      </p>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '6px', 
                        marginTop: '8px', 
                        background: '#fafafa', 
                        padding: '8px 12px', 
                        borderRadius: '6px', 
                        border: '1px solid #e5e7eb' 
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Respective Cell Value:
                          </span>
                          {inlineCellValues[r.id] !== undefined && inlineCellValues[r.id] !== currentCellValue && (
                            <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600 }}>Unsaved changes</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {column?.type === 'dropdown' ? (
                            <select
                              value={inlineCellValues[r.id] !== undefined ? inlineCellValues[r.id] : currentCellValue}
                              onChange={e => setInlineCellValues(prev => ({ ...prev, [r.id]: e.target.value }))}
                              style={{ flex: 1, padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff' }}
                            >
                              <option value="">-- Select Option --</option>
                              {column.dropdownOptions?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : column?.type === 'checkbox' ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', flex: 1 }}>
                              <input
                                type="checkbox"
                                checked={(inlineCellValues[r.id] !== undefined ? inlineCellValues[r.id] : currentCellValue) === 'true'}
                                onChange={e => setInlineCellValues(prev => ({ ...prev, [r.id]: e.target.checked ? 'true' : 'false' }))}
                                style={{ cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '12px' }}>Checked</span>
                            </label>
                          ) : column?.type === 'date' ? (
                            <input
                              type="date"
                              value={parseDateString(inlineCellValues[r.id] !== undefined ? inlineCellValues[r.id] : currentCellValue)}
                              onChange={e => setInlineCellValues(prev => ({ ...prev, [r.id]: e.target.value }))}
                              style={{ flex: 1, padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff' }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={inlineCellValues[r.id] !== undefined ? inlineCellValues[r.id] : currentCellValue}
                              onChange={e => setInlineCellValues(prev => ({ ...prev, [r.id]: e.target.value }))}
                              style={{ flex: 1, padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #d1d5db', background: '#fff' }}
                              placeholder="Enter cell value..."
                            />
                          )}
                          <button
                            onClick={() => {
                              const valToSave = inlineCellValues[r.id] !== undefined ? inlineCellValues[r.id] : currentCellValue;
                              const res = handleCellChange(r.rowId as number, r.colId as string, valToSave);
                              if (res !== false) {
                                setInlineCellValues(prev => {
                                  const next = { ...prev };
                                  delete next[r.id];
                                  return next;
                                });
                                toast.success('Cell value saved back to table successfully!');
                              }
                            }}
                            style={{
                              padding: '4px 12px',
                              fontSize: '12px',
                              fontWeight: 600,
                              borderRadius: '4px',
                              border: 'none',
                              background: 'var(--primary)',
                              color: '#fff',
                              cursor: 'pointer',
                              transition: 'background 0.2s'
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ marginTop: '16px' }}>
          <button className="modal-confirm-btn" onClick={() => { onClose(); setEditingReminderId(null); }}>Close</button>
        </div>
      </div>
    </div>
  );
}
