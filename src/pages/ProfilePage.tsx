import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import {
  User, Mail, Phone, Shield, Key, Plus, Search, Trash2, UserPlus,
  CheckCircle2, XCircle, Edit3, Users, Sparkles, RefreshCw, Eye, EyeOff, Lock
} from 'lucide-react';
import {
  firebaseGetUsers, firebaseCreateUser, firebaseDeleteUser,
  firebaseUpdateUserStatus, firebaseChangePassword, type AppUser
} from '../lib/firebaseAuth';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user: authUser, token } = useAuth();
  const isSystemAdmin = authUser?.role === 'admin' || authUser?.role === 'superadmin' || authUser?.permissions?.isAdmin;

  const [activeTab, setActiveTab] = useState<'profile' | 'users'>('profile');

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // User Management state
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showAddUserModal, setShowAddUserModal] = useState(false);

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<'user' | 'sheet_admin' | 'admin' | 'superadmin'>('user');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Fetch users for admin
  const loadUsers = useCallback(async () => {
    if (!isSystemAdmin) return;
    setIsLoadingUsers(true);
    try {
      const res = await firebaseGetUsers();
      if (res?.users) {
        setUsersList(res.users);
      }
    } catch (err: any) {
      console.error('Failed to load users:', err);
      toast.error('Failed to load users list');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    if (activeTab === 'users' && isSystemAdmin) {
      loadUsers();
    }
  }, [activeTab, isSystemAdmin, loadUsers]);

  // Handle password update
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!currentPassword || !newPassword) {
      toast.error('Please enter both current and new password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      await firebaseChangePassword(token, currentPassword, newPassword);
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Handle create user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      toast.error('Name, Email, and Password are required');
      return;
    }

    setIsSubmittingUser(true);
    try {
      await firebaseCreateUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        role: newUserRole,
        phone: newUserPhone.trim() || undefined
      });
      toast.success(`User ${newUserName} created successfully`);
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserPhone('');
      setNewUserRole('user');
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Handle delete user
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"?`)) return;
    try {
      await firebaseDeleteUser(userId);
      toast.success(`User ${userName} deleted`);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (user: AppUser) => {
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await firebaseUpdateUserStatus(user.id, nextStatus);
      toast.success(`User status updated to ${nextStatus}`);
      loadUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user status');
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      const matchSearch =
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.phone && u.phone.includes(userSearch));
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [usersList, userSearch, roleFilter]);

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'superadmin':
        return <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Shield size={12} /> Super Admin</span>;
      case 'admin':
        return <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Shield size={12} /> System Admin</span>;
      case 'sheet_admin':
        return <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} /> Staff / Sheet Admin</span>;
      default:
        return <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><User size={12} /> Standard User</span>;
    }
  };

  const displayName = authUser?.name || authUser?.email || 'User';

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto', width: '100%', height: '100%', overflowY: 'auto' }}>
      <style>{`
        .prof-tab-btn {
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .prof-tab-btn:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
        .prof-tab-btn.active {
          background: #ffffff;
          color: #2563eb;
          border-color: #e2e8f0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        .prof-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.03);
          transition: all 0.2s ease;
        }
        .prof-input-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          transition: all 0.2s ease;
        }
        .prof-input-wrap:focus-within {
          border-color: #2563eb;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }
        .prof-input-wrap input, .prof-input-wrap select {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          font-size: 13.5px;
          color: #0f172a;
          font-weight: 500;
        }
      `}</style>

      {/* Header & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
            Account Settings & Team
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13.5px', fontWeight: 500 }}>
            Manage your personal profile, security, and team members.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '4px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <button
            className={`prof-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={15} /> My Profile
          </button>
          {isSystemAdmin && (
            <button
              className={`prof-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={15} /> User Management ({usersList.length || '…'})
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: MY PROFILE */}
      {activeTab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          
          {/* Personal Information Card */}
          <div className="prof-card" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{
                width: '68px',
                height: '68px',
                background: 'linear-gradient(135deg, #002d5d 0%, #0066cc 100%)',
                color: '#ffffff',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: 800,
                boxShadow: '0 6px 18px rgba(0, 102, 204, 0.25)'
              }}>
                {displayName[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>{displayName}</h2>
                <div style={{ marginTop: '6px' }}>{getRoleBadge(authUser?.role)}</div>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '20px 0' }} />

            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#2563eb" /> Personal Details
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Full Name</label>
                <div className="prof-input-wrap">
                  <User size={15} color="#94a3b8" />
                  <input type="text" value={authUser?.name || ''} readOnly placeholder="Full Name" />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Email Address</label>
                <div className="prof-input-wrap">
                  <Mail size={15} color="#94a3b8" />
                  <input type="email" value={authUser?.email || ''} readOnly placeholder="Email Address" />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Phone Number</label>
                <div className="prof-input-wrap">
                  <Phone size={15} color="#94a3b8" />
                  <input type="text" value={authUser?.phone || 'Not specified'} readOnly placeholder="Phone Number" />
                </div>
              </div>
            </div>
          </div>

          {/* Security & Password Card */}
          <div className="prof-card" style={{ padding: '28px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Key size={17} color="#2563eb" /> Security & Password
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
              Update your account password regularly for enhanced security.
            </p>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Current Password</label>
                <div className="prof-input-wrap">
                  <Lock size={15} color="#94a3b8" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: 0 }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>New Password</label>
                <div className="prof-input-wrap">
                  <Key size={15} color="#94a3b8" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '6px' }}>Confirm New Password</label>
                <div className="prof-input-wrap">
                  <Key size={15} color="#94a3b8" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPassword}
                style={{
                  marginTop: '8px',
                  padding: '11px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isChangingPassword ? <RefreshCw size={16} className="spinner" /> : <Lock size={15} />}
                <span>Update Password</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT & ADD USER */}
      {activeTab === 'users' && isSystemAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Controls Bar */}
          <div className="prof-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
              <div className="prof-input-wrap" style={{ flex: 1, maxWidth: '360px' }}>
                <Search size={15} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search user by name, email, or phone…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '9.5px 14px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0f172a',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Roles</option>
                <option value="superadmin">Super Admin</option>
                <option value="admin">System Admin</option>
                <option value="sheet_admin">Staff / Sheet Admin</option>
                <option value="user">Standard User</option>
              </select>

              <button
                onClick={loadUsers}
                title="Refresh user list"
                style={{ padding: '9.5px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer', color: '#475569' }}
              >
                <RefreshCw size={15} className={isLoadingUsers ? 'spinner' : ''} />
              </button>
            </div>

            <button
              onClick={() => setShowAddUserModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #0b2545 0%, #0066cc 100%)',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 102, 204, 0.28)'
              }}
            >
              <UserPlus size={16} /> Add New User
            </button>
          </div>

          {/* Users List */}
          <div className="prof-card" style={{ padding: '0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '14px 20px' }}>User Details</th>
                  <th style={{ padding: '14px 20px' }}>Role</th>
                  <th style={{ padding: '14px 20px' }}>Status</th>
                  <th style={{ padding: '14px 20px' }}>Created Date</th>
                  <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                      <RefreshCw size={24} className="spinner" style={{ margin: '0 auto 8px' }} />
                      Loading users list…
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                      No users found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            background: '#eff6ff',
                            color: '#2563eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '15px',
                            fontWeight: 700
                          }}>
                            {u.name ? u.name[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <strong style={{ fontSize: '14px', color: '#0f172a', display: 'block' }}>{u.name}</strong>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</span>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 20px' }}>
                        {getRoleBadge(u.role)}
                      </td>

                      <td style={{ padding: '14px 20px' }}>
                        {u.status === 'active' ? (
                          <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> Active
                          </span>
                        ) : (
                          <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '3px 10px', borderRadius: '16px', fontSize: '11.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={12} /> Deactivated
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '14px 20px', fontSize: '12.5px', color: '#64748b' }}>
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            title={u.status === 'active' ? 'Deactivate user' : 'Activate user'}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              background: u.status === 'active' ? '#fff1f2' : '#f0fdf4',
                              color: u.status === 'active' ? '#e11d48' : '#16a34a',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(String(u.id), u.name)}
                            title="Delete User"
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid #fca5a5',
                              background: '#fff',
                              color: '#e11d48',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD NEW USER MODAL */}
      {showAddUserModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="prof-card" style={{ width: '100%', maxWidth: '480px', padding: '28px', background: '#ffffff', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <UserPlus size={22} color="#2563eb" /> Add New User
            </h2>
            <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>
              Create an account for a new staff or system user.
            </p>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Full Name *</label>
                <div className="prof-input-wrap">
                  <User size={15} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Email Address *</label>
                <div className="prof-input-wrap">
                  <Mail size={15} color="#94a3b8" />
                  <input
                    type="email"
                    placeholder="john@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Initial Password *</label>
                <div className="prof-input-wrap">
                  <Key size={15} color="#94a3b8" />
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Phone Number (Optional)</label>
                <div className="prof-input-wrap">
                  <Phone size={15} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="9999999999"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Assign User Role *</label>
                <div className="prof-input-wrap">
                  <Shield size={15} color="#94a3b8" />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as any)}
                    style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13.5px', fontWeight: 600 }}
                  >
                    <option value="user">Standard User</option>
                    <option value="sheet_admin">Staff / Sheet Admin</option>
                    <option value="admin">System Admin</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  style={{ flex: 1, padding: '11px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #0b2545 0%, #0066cc 100%)', color: '#ffffff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {isSubmittingUser ? <RefreshCw size={15} className="spinner" /> : <UserPlus size={15} />}
                  <span>Create User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
