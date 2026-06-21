import React from 'react';
import { Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ReminderModalProps {
  reminderModal: { entryId: number; colId: string };
  setReminderModal: (val: any) => void;
  reminderDate: string;
  setReminderDate: (val: string) => void;
  reminderTime: string;
  setReminderTime: (val: string) => void;
  reminderStatus: 'Pending' | 'Complete';
  setReminderStatus: (val: 'Pending' | 'Complete') => void;
  reminderMessage: string;
  setReminderMessage: (val: string) => void;
  reminders: any[];
  setReminders: (val: any[]) => void;
  scheduleReminder: (val: any) => void;
  registerId: number;
}

export function ReminderModal({
  reminderModal,
  setReminderModal,
  reminderDate,
  setReminderDate,
  reminderTime,
  setReminderTime,
  reminderStatus,
  setReminderStatus,
  reminderMessage,
  setReminderMessage,
  reminders,
  setReminders,
  scheduleReminder,
  registerId
}: ReminderModalProps) {
  return (
    <div className="modal-overlay" onClick={() => setReminderModal(null)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', overflow: 'hidden', background: '#fff' }}>
        <div className="modal-header" style={{ position: 'relative', padding: '20px 20px 12px', borderBottom: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} color="var(--primary)" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-color)' }}>Set Reminder</h3>
          </div>
          <button 
            onClick={() => setReminderModal(null)} 
            style={{ 
              position: 'absolute', top: '16px', right: '16px', 
              background: '#f3f4f6', borderRadius: '50%', width: '32px', height: '32px',
              cursor: 'pointer', transition: 'all 0.2s', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#e5e7eb'}
            onMouseOut={(e) => e.currentTarget.style.background = '#f3f4f6'}
          >
            <X size={16} color="#374151" strokeWidth={2.5} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px 20px' }}>
          <div>
            <label className="modal-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>Reminder Date <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
            <input type="date" className="modal-input" value={reminderDate} onChange={e => setReminderDate(e.target.value)} style={{ width: '100%', marginBottom: 0 }} />
          </div>
          
          <div>
            <label className="modal-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>Reminder Time <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>(Optional)</span></label>
            <input type="time" className="modal-input" value={reminderTime} onChange={e => setReminderTime(e.target.value)} style={{ width: '100%', marginBottom: 0 }} />
          </div>

          <div>
            <label className="modal-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>Status <span style={{color: 'red'}}>*</span></label>
            <select 
              className="modal-input" 
              value={reminderStatus} 
              onChange={e => setReminderStatus(e.target.value as 'Pending' | 'Complete')} 
              style={{ width: '100%', marginBottom: 0, background: '#ffffff' }}
            >
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
            </select>
          </div>

          <div>
            <label className="modal-label" style={{ marginBottom: '6px', display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>Message / Description <span style={{color: 'red'}}>*</span></label>
            <textarea 
              className="modal-textarea" 
              value={reminderMessage} 
              onChange={e => setReminderMessage(e.target.value)} 
              placeholder="What should this reminder tell you?"
              rows={3}
              style={{ width: '100%', resize: 'none', marginBottom: 0 }}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: '#fafafa' }}>
          <button className="modal-cancel-btn" onClick={() => setReminderModal(null)}>Cancel</button>
          <button 
            className="modal-confirm-btn" 
            onClick={() => {
              if (!reminderMessage) {
                toast.error('Please enter a reminder message');
                return;
              }
              
              let triggerTime: number | undefined = undefined;
              if (reminderDate && reminderTime) {
                const dt = new Date(`${reminderDate}T${reminderTime}`);
                if (isNaN(dt.getTime())) {
                  toast.error('Please enter a valid date and time');
                  return;
                }
                if (reminderStatus === 'Pending' && dt.getTime() < Date.now()) {
                  toast.error('Reminder time must be in the future for active/pending reminders');
                  return;
                }
                triggerTime = dt.getTime();
              }

              const existingIdx = reminders.findIndex(r => r.rowId === reminderModal.entryId && r.colId === reminderModal.colId && r.registerId === String(registerId));
              if (existingIdx > -1) {
                const updated = [...reminders];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  triggerTime: triggerTime,
                  message: reminderMessage,
                  status: reminderStatus
                };
                setReminders(updated);
                toast.success('Reminder updated successfully!');
              } else {
                scheduleReminder({
                  triggerTime: triggerTime,
                  message: reminderMessage,
                  registerId: String(registerId),
                  rowId: reminderModal.entryId,
                  colId: reminderModal.colId,
                  status: reminderStatus
                });
                toast.success('Reminder set successfully!');
              }
              setReminderModal(null);
            }}
          >
            Save Reminder
          </button>
        </div>
      </div>
    </div>
  );
}
