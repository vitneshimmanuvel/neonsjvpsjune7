import { useState } from 'react';
import { Shield, Lock, Key, Users, Globe, Trash2, CheckCircle2, AlertTriangle, Monitor, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

interface SessionItem {
  id: string;
  user: string;
  email: string;
  ip: string;
  device: string;
  location: string;
  loginTime: string;
  isCurrent: boolean;
}

export default function AdminSecurityPage() {
  const [enforceTwoFactor, setEnforceTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('60');
  const [ipRestrict, setIpRestrict] = useState(false);

  const [sessions, setSessions] = useState<SessionItem[]>([
    { id: 'sess_1', user: 'Administrator', email: 'admin@agtrust.org', ip: '106.208.42.112', device: 'Chrome on Windows 11', location: 'Chennai, India', loginTime: 'Active now', isCurrent: true },
    { id: 'sess_2', user: 'Staff User', email: 'staff1@agtrust.org', ip: '157.34.19.88', device: 'Safari on iPhone 15', location: 'Coimbatore, India', loginTime: '12 mins ago', isCurrent: false },
    { id: 'sess_3', user: 'Editor User', email: 'editor@agtrust.org', ip: '49.37.112.5', device: 'Edge on Windows 10', location: 'Madurai, India', loginTime: '45 mins ago', isCurrent: false },
  ]);

  const handleKillSession = (id: string, user: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    toast.success(`Terminated active session for ${user}`);
  };

  const handleSaveSecuritySettings = () => {
    toast.success('Security policies updated successfully!');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            Security Shield & Active Sessions
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--muted)' }}>
            Manage authentication policies, inspect active login sessions, and enforce security compliance.
          </p>
        </div>

        <button
          onClick={handleSaveSecuritySettings}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
            borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
            color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            boxShadow: 'var(--shadow-button)', transition: 'all 0.2s'
          }}
        >
          <Shield size={15} />
          Save Security Policies
        </button>
      </div>

      {/* Security Toggles Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {/* Policy 1: 2FA */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Enforce 2-Factor Authentication</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Mandate OTP verification via SMS or Email for all staff accounts.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enforceTwoFactor}
              onChange={e => setEnforceTwoFactor(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>

        {/* Policy 2: Session Timeout */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Auto Session Inactivity Timeout</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Automatically logout idle staff sessions after duration.
              </p>
            </div>
            <select
              value={sessionTimeout}
              onChange={e => setSessionTimeout(e.target.value)}
              style={{
                padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)',
                background: 'var(--bg-secondary)', color: 'var(--foreground)', fontSize: '12.5px', fontWeight: 600
              }}
            >
              <option value="15">15 Minutes</option>
              <option value="30">30 Minutes</option>
              <option value="60">1 Hour</option>
              <option value="240">4 Hours</option>
            </select>
          </div>
        </div>

        {/* Policy 3: IP Restriction */}
        <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Office IP Whitelisting</h4>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: 1.4 }}>
                Restrict admin dashboard access strictly to office IP ranges.
              </p>
            </div>
            <input
              type="checkbox"
              checked={ipRestrict}
              onChange={e => setIpRestrict(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
          </div>
        </div>
      </div>

      {/* Active User Sessions Table */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={18} color="#2563eb" /> Active User Sessions ({sessions.length})
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Realtime Security Monitor</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 12px' }}>User</th>
                <th style={{ padding: '10px 12px' }}>IP Address</th>
                <th style={{ padding: '10px 12px' }}>Device / Browser</th>
                <th style={{ padding: '10px 12px' }}>Location</th>
                <th style={{ padding: '10px 12px' }}>Login Status</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{s.user}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.email}</div>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', color: 'var(--foreground)' }}>{s.ip}</td>
                  <td style={{ padding: '12px', color: 'var(--foreground)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {s.device.includes('iPhone') ? <Smartphone size={14} color="#64748b" /> : <Monitor size={14} color="#64748b" />}
                      {s.device}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--muted)' }}>{s.location}</td>
                  <td style={{ padding: '12px' }}>
                    {s.isCurrent ? (
                      <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700 }}>
                        Current Session
                      </span>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{s.loginTime}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {!s.isCurrent && (
                      <button
                        onClick={() => handleKillSession(s.id, s.user)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: 'none',
                          padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        <Trash2 size={13} /> Kill Session
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
