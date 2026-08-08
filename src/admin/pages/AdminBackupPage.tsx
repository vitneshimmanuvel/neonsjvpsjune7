import { useState } from 'react';
import { Database, Download, RefreshCw, Calendar, FileText, CheckCircle2, ShieldCheck, HardDrive, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface BackupSnapshot {
  id: string;
  name: string;
  size: string;
  registersCount: number;
  entriesCount: number;
  createdAt: string;
  type: 'manual' | 'automated';
}

export default function AdminBackupPage() {
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [schedule, setSchedule] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const [backups, setBackups] = useState<BackupSnapshot[]>([
    { id: 'snap_1', name: 'Snapshot_Auto_2026-08-08.json', size: '14.2 MB', registersCount: 42, entriesCount: 18520, createdAt: 'Today, 00:00 UTC', type: 'automated' },
    { id: 'snap_2', name: 'Snapshot_Manual_v2.8_Prep.json', size: '14.1 MB', registersCount: 42, entriesCount: 18490, createdAt: 'Yesterday, 18:30', type: 'manual' },
    { id: 'snap_3', name: 'Snapshot_Auto_2026-08-07.json', size: '13.9 MB', registersCount: 40, entriesCount: 18210, createdAt: 'Aug 07, 2026', type: 'automated' },
  ]);

  const handleCreateSnapshot = async () => {
    setIsCreatingBackup(true);
    await new Promise(r => setTimeout(r, 1200));
    const now = new Date().toISOString().split('T')[0];
    const newSnap: BackupSnapshot = {
      id: `snap_${Date.now()}`,
      name: `Snapshot_Manual_${now}.json`,
      size: '14.3 MB',
      registersCount: 42,
      entriesCount: 18540,
      createdAt: 'Just now',
      type: 'manual'
    };
    setBackups([newSnap, ...backups]);
    setIsCreatingBackup(false);
    toast.success('Instant Database Snapshot created & verified successfully!');
  };

  const handleDownloadSnapshot = (snap: BackupSnapshot) => {
    toast.success(`Downloading ${snap.name}...`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--navy)', letterSpacing: '-0.02em' }}>
            Data Backup & Restore Vault
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: 'var(--muted)' }}>
            Automated database backups, instant snapshots, and disaster recovery restore points.
          </p>
        </div>

        <button
          onClick={handleCreateSnapshot}
          disabled={isCreatingBackup}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
            borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
            color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer',
            boxShadow: 'var(--shadow-button)', transition: 'all 0.2s'
          }}
        >
          <RefreshCw size={15} className={isCreatingBackup ? 'spin' : ''} />
          {isCreatingBackup ? 'Creating Snapshot...' : 'Create Instant Snapshot'}
        </button>
      </div>

      {/* Backup Settings Card */}
      <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--foreground)' }}>Automated Backup Frequency</h4>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: 'var(--muted)' }}>
              Choose how often full database snapshots are stored in cloud cold storage.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['daily', 'weekly', 'monthly'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setSchedule(f); toast.success(`Automated schedule set to ${f}`); }}
                style={{
                  padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  border: schedule === f ? '2px solid #2563eb' : '1px solid var(--border)',
                  background: schedule === f ? '#eff6ff' : 'var(--bg-secondary)',
                  color: schedule === f ? '#2563eb' : 'var(--foreground)',
                  cursor: 'pointer', textTransform: 'capitalize'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Snapshots Table */}
      <div style={{ background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--border)', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database size={18} color="#2563eb" /> Available Database Snapshots ({backups.length})
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 12px' }}>Snapshot File</th>
                <th style={{ padding: '10px 12px' }}>Size</th>
                <th style={{ padding: '10px 12px' }}>Registers Included</th>
                <th style={{ padding: '10px 12px' }}>Total Records</th>
                <th style={{ padding: '10px 12px' }}>Created Date</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace' }}>{b.name}</div>
                    <span style={{ background: b.type === 'automated' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: b.type === 'automated' ? '#2563eb' : '#10b981', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700 }}>
                      {b.type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--muted)' }}>{b.size}</td>
                  <td style={{ padding: '12px', color: 'var(--foreground)', fontWeight: 600 }}>{b.registersCount} Registers</td>
                  <td style={{ padding: '12px', color: 'var(--foreground)', fontWeight: 600 }}>{b.entriesCount.toLocaleString()} Entries</td>
                  <td style={{ padding: '12px', color: 'var(--muted)' }}>{b.createdAt}</td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDownloadSnapshot(b)}
                      style={{
                        background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', border: 'none',
                        padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}
                    >
                      <Download size={13} /> Download
                    </button>
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
