import { useState, useMemo } from 'react';
import { useNotifications } from '../../lib/NotificationContext';
import { X, Bell, AlertTriangle, AlertCircle, Info, CheckCircle2, Check, Sparkles, Clock, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './NotificationPanel.css';

export function NotificationPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { notifications, markAsRead, clearAll } = useNotifications();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.isRead).length;
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter(n => !n.isRead);
    }
    return notifications;
  }, [notifications, filter]);

  const formatTime = (timestamp: string | number | Date) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const handleMarkAllRead = () => {
    notifications.forEach(n => {
      if (!n.isRead) markAsRead(n.id);
    });
  };

  return (
    <>
      {isOpen && <div className="notification-overlay" onClick={onClose} />}
      <div className={`notification-panel ${isOpen ? 'open' : ''}`}>
        
        {/* Header */}
        <div className="notif-header">
          <div className="notif-title-wrap">
            <div className="notif-bell-badge-box">
              <Bell size={18} color="#ffffff" />
              {unreadCount > 0 && <span className="notif-pulse-dot" />}
            </div>
            <div>
              <h2 className="notif-head-title">Notifications</h2>
              <p className="notif-head-sub">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'You are all caught up'}
              </p>
            </div>
          </div>

          <div className="notif-header-actions">
            <button className="notif-close-btn" onClick={onClose} title="Close notifications">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Quick Action Bar */}
        <div className="notif-tabs-bar">
          <div className="notif-tabs-group">
            <button
              className={`notif-tab-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({notifications.length})
            </button>
            <button
              className={`notif-tab-btn ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <div className="notif-action-group">
            {unreadCount > 0 && (
              <button className="notif-text-btn" onClick={handleMarkAllRead} title="Mark all as read">
                <Check size={13} /> Mark Read
              </button>
            )}
            {notifications.length > 0 && (
              <button className="notif-text-btn danger" onClick={clearAll} title="Clear all notifications">
                <Trash2 size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Notifications List Body */}
        <div className="notification-list">
          {filteredNotifications.length === 0 ? (
            <div className="notification-empty">
              <div className="notif-empty-icon-wrap">
                <Sparkles size={36} className="notif-empty-sparkle" />
              </div>
              <h3 className="notif-empty-title">All Caught Up!</h3>
              <p className="notif-empty-sub">
                {filter === 'unread'
                  ? "You don't have any unread notifications."
                  : "No notifications right now. Activity and system updates will appear here."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-item ${notif.isRead ? 'read' : 'unread'}`}
                onClick={() => {
                  markAsRead(notif.id);
                  if (notif.link) {
                    navigate(`/register/${notif.link.registerId}`);
                    onClose();
                  }
                }}
              >
                <div className={`notification-icon-box ${notif.type || 'info'}`}>
                  {notif.type === 'error' && <AlertCircle size={16} />}
                  {notif.type === 'warning' && <AlertTriangle size={16} />}
                  {notif.type === 'success' && <CheckCircle2 size={16} />}
                  {(!notif.type || notif.type === 'info') && <Info size={16} />}
                </div>

                <div className="notification-content">
                  <div className="notif-card-header">
                    <span className="notification-item-title">{notif.title}</span>
                    <span className="notif-time-badge">
                      <Clock size={11} /> {formatTime(notif.timestamp)}
                    </span>
                  </div>
                  <p className="notification-item-message">{notif.message}</p>
                </div>

                {!notif.isRead && <div className="unread-dot-indicator" />}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
