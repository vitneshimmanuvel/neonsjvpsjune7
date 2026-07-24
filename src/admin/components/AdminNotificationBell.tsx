import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../lib/auth';
import {
  firebaseGetMyNotifications,
  firebaseMarkNotificationRead,
  firebaseMarkAllNotificationsRead
} from '../../lib/firebaseAuth';
import { Bell, CheckCircle2, UserCheck, ShieldAlert, X, Info } from 'lucide-react';
import toast from 'react-hot-toast';

export interface AdminNotifItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  meta?: any;
}

export function AdminNotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AdminNotifItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    if (!user?.id) return;
    try {
      const data = await firebaseGetMyNotifications(String(user.id));
      const list: AdminNotifItem[] = data.notifications || [];
      setNotifications(list);
      const unread = list.filter(n => !n.isRead).length;

      // If unread count increased, pop toast for newly logged in user
      if (unread > prevCountRef.current && prevCountRef.current !== 0) {
        const latest = list[0];
        if (latest && !latest.isRead) {
          toast.custom((t) => (
            <div style={{
              background: '#0f172a',
              color: '#ffffff',
              padding: '14px 18px',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              animation: t.visible ? 'admin-toast-enter 0.3s ease' : 'admin-toast-leave 0.2s ease',
              maxWidth: '380px'
            }}>
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '8px', borderRadius: '50%', color: '#10b981', display: 'flex' }}>
                <UserCheck size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#f8fafc' }}>{latest.title || 'User Login Alert'}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', wordBreak: 'break-word' }}>{latest.message}</div>
              </div>
            </div>
          ), { duration: 5000, position: 'top-right' });
        }
      }
      prevCountRef.current = unread;
      setUnreadCount(unread);
    } catch (e) {
      // ignore poll errors
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 8000); // poll every 8 seconds
    return () => clearInterval(interval);
  }, [user?.id]);

  // Handle outside click to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await firebaseMarkNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {}
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    try {
      await firebaseMarkAllNotificationsRead(String(user.id));
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Admin Notifications"
        style={{
          position: 'relative',
          background: 'var(--surface)',
          border: '1.5px solid var(--border)',
          borderRadius: '12px',
          padding: '10px',
          cursor: 'pointer',
          color: 'var(--navy)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.2s'
        }}
        className="admin-notif-bell-btn"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            background: '#ef4444',
            color: '#ffffff',
            fontSize: '10px',
            fontWeight: 800,
            borderRadius: '10px',
            padding: '2px 6px',
            minWidth: '16px',
            textAlign: 'center',
            boxShadow: '0 2px 5px rgba(239,68,68,0.4)',
            border: '2px solid var(--surface)'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          width: '360px',
          maxHeight: '480px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.15)',
          zIndex: 2000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'admin-popover-enter 0.2s ease-out'
        }}>
          {/* Panel Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={17} color="var(--accent)" />
              <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--navy)' }}>Admin Notifications</span>
              {unreadCount > 0 && (
                <span style={{
                  background: 'rgba(26,115,232,0.1)',
                  color: 'var(--accent)',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {unreadCount} new
                </span>
              )}
            </div>
            {notifications.length > 0 && unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
                <Bell size={32} style={{ opacity: 0.2, marginBottom: '10px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600 }}>No notifications yet</div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>Login events and security alerts will appear here</div>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    background: n.isRead ? 'transparent' : 'rgba(26,115,232,0.03)',
                    cursor: n.isRead ? 'default' : 'pointer',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: n.title.includes('Login') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                    color: n.title.includes('Login') ? '#10b981' : '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}>
                    {n.title.includes('Login') ? <UserCheck size={16} /> : <Info size={16} />}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: n.isRead ? 600 : 800, color: 'var(--navy)' }}>{n.title}</span>
                      <span style={{ fontSize: '10.5px', color: 'var(--muted)', fontWeight: 500 }}>
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--foreground)', lineHeight: '1.4', wordBreak: 'break-word' }}>{n.message}</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                      {new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>

                  {!n.isRead && (
                    <span style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      marginTop: '6px',
                      flexShrink: 0
                    }} />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .admin-notif-bell-btn:hover {
          background: var(--bg-secondary) !important;
          border-color: var(--accent) !important;
        }
        @keyframes admin-popover-enter {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes admin-toast-enter {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
