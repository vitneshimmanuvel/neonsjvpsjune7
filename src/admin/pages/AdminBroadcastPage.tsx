import { useState } from 'react';
import { Send, Bell, AlertTriangle, ShieldAlert, CheckCircle2, Megaphone, Radio } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminBroadcastPage() {
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastType, setBroadcastType] = useState<'info' | 'warning' | 'success'>('info');
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const handleSendBroadcast = () => {
    if (!broadcastMessage.trim()) {
      toast.error('Please enter a broadcast message!');
      return;
    }
    toast.success(`System Alert Broadcast sent to all active users!`);
    setBroadcastMessage('');
  };

  const handleToggleMaintenance = (val: boolean) => {
    setMaintenanceMode(val);
    if (val) {
      toast.error('Emergency Maintenance Mode ENABLED! Non-admin users locked.');
    } else {
      toast.success('Emergency Maintenance Mode DISABLED. Workspace open.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            Broadcast & Announcement Hub
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--muted)' }}>
            Send real-time system alert messages to online users or toggle maintenance lockdown mode.
          </p>
        </div>
      </div>

      {/* Emergency Maintenance Card */}
      <div style={{ background: maintenanceMode ? 'rgba(239, 68, 68, 0.06)' : 'var(--surface)', border: maintenanceMode ? '2px solid #ef4444' : '1px solid var(--border)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: maintenanceMode ? '#dc2626' : 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={20} color={maintenanceMode ? '#dc2626' : '#64748b'} />
              Emergency System Maintenance Lockdown Mode
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              When enabled, standard users are temporarily restricted from making database edits.
            </p>
          </div>

          <button
            onClick={() => handleToggleMaintenance(!maintenanceMode)}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: maintenanceMode ? '#dc2626' : 'rgba(239, 68, 68, 0.1)',
              color: maintenanceMode ? 'white' : '#dc2626',
              fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              boxShadow: maintenanceMode ? '0 4px 12px rgba(220, 38, 38, 0.3)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {maintenanceMode ? 'DISABLE MAINTENANCE' : 'ENABLE MAINTENANCE LOCKDOWN'}
          </button>
        </div>
      </div>

      {/* Broadcast Message Composer */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Megaphone size={18} color="#2563eb" /> Broadcast Real-Time System Announcement
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
              Alert Banner Type
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {(['info', 'warning', 'success'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setBroadcastType(t)}
                  style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                    border: broadcastType === t ? '2px solid #2563eb' : '1px solid var(--border)',
                    background: broadcastType === t ? '#eff6ff' : 'var(--bg-secondary)',
                    color: broadcastType === t ? '#2563eb' : 'var(--foreground)',
                    cursor: 'pointer', textTransform: 'uppercase'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
              Announcement Message
            </label>
            <textarea
              value={broadcastMessage}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="e.g. Server maintenance scheduled in 10 minutes. Please save your work..."
              rows={4}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)',
                background: 'var(--bg-secondary)', color: 'var(--foreground)', fontSize: '13.5px',
                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Live Banner Preview */}
          {broadcastMessage && (
            <div style={{
              padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              background: broadcastType === 'warning' ? '#fef3c7' : (broadcastType === 'success' ? '#dcfce7' : '#eff6ff'),
              color: broadcastType === 'warning' ? '#b45309' : (broadcastType === 'success' ? '#15803d' : '#1d4ed8'),
              border: `1px solid ${broadcastType === 'warning' ? '#fde68a' : (broadcastType === 'success' ? '#bbf7d0' : '#bfdbfe')}`,
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <Radio size={16} />
              <span><strong>PREVIEW:</strong> {broadcastMessage}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleSendBroadcast}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
                color: 'white', fontWeight: 600, fontSize: '13.5px', cursor: 'pointer',
                boxShadow: 'var(--shadow-button)', transition: 'all 0.2s'
              }}
            >
              <Send size={15} /> Send System Broadcast
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
