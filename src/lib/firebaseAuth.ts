// Client-side authentication and admin endpoints communicating with /api/ backend

export interface AppUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: 'superadmin' | 'admin' | 'sheet_admin' | 'user';
  status: 'active' | 'inactive';
  createdAt: string;
  phone?: string;
  lastLogin?: string;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canDownload: boolean;
    isAdmin: boolean;
    canCreateSheets?: boolean;
    viewRestrictions?: Record<string, number[]> | null;
    editRestrictions?: Record<string, number[]> | null;
    downloadRestrictions?: Record<string, number[]> | null;
    createRestrictions?: Record<string, boolean> | null;
    rowViewRestrictions?: Record<string, { start?: number; end?: number }> | null;
    rowEditRestrictions?: Record<string, { start?: number; end?: number }> | null;
    rowDownloadRestrictions?: Record<string, { start?: number; end?: number }> | null;
    fullSheetAccess?: boolean;
    allowedRegisters?: string[];
    allowedFolders?: string[];
  };
}

export async function ensureDefaultAdmin(): Promise<void> {
  // Database superadmin is already bootstrapped on the server side
  return Promise.resolve();
}

export async function firebaseLogin(email: string, password: string) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function firebaseAdminLogin(email: string, password: string) {
  const result = await firebaseLogin(email, password);
  if (result.user.role !== 'admin' && result.user.role !== 'superadmin') {
    throw new Error('You do not have admin access');
  }
  return result;
}

export async function firebaseGetMe(token: string) {
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Unauthorized');
  }
  return res.json();
}

export function subscribeToMe(
  token: string, 
  onUpdate: (user: any) => void, 
  onError: (err: any) => void
) {
  let active = true;
  firebaseGetMe(token)
    .then((res) => {
      if (active) onUpdate(res.user);
    })
    .catch((err) => {
      if (active) onError(err);
    });

  return () => {
    active = false;
  };
}

export async function firebaseLogout(_token: string) {
  // Stateless logout, handled client side by clearing token
  return Promise.resolve();
}

export async function firebaseChangePassword(token: string, currentPassword: string, newPassword: string) {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Password change failed');
  }
  return res.json();
}

export async function firebaseGetUsers() {
  const res = await fetch('/api/auth/users');
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch users');
  }
  return res.json();
}

export async function firebaseCreateUser(data: {
  name: string; email: string; password: string; role?: string; phone?: string;
}) {
  const res = await fetch('/api/auth/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create user');
  }
  return res.json();
}

export async function firebaseUpdateUser(id: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/auth/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update user');
  }
  return res.json();
}

export async function firebaseUpdatePermissions(id: string, permissions: Record<string, unknown>) {
  const res = await fetch(`/api/auth/users/${id}/permissions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissions })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update permissions');
  }
  return res.json();
}

export async function firebaseAdminChangePassword(id: string, newPassword: string) {
  const res = await fetch(`/api/auth/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: newPassword })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to reset password');
  }
  return res.json();
}

export async function firebaseDeleteUser(id: string) {
  const res = await fetch(`/api/auth/users/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to delete user');
  }
  return res.json();
}

export async function firebaseUpdateUserStatus(id: string, status: 'active' | 'inactive') {
  const res = await fetch(`/api/auth/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update status');
  }
  return res.json();
}

export async function logActivity(
  userId: string, 
  userName: string, 
  action: string, 
  details: string,
  registerId?: string | number,
  registerName?: string
) {
  const res = await fetch('/api/activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userName, action, details, registerId, registerName })
  });
  if (!res.ok) {
    const err = await res.json();
    console.error('Failed to log activity:', err.error);
  }
}

export function firebaseLogWorkspaceAction(
  userId: string, 
  userName: string, 
  action: string, 
  details: string,
  registerId?: string | number,
  registerName?: string
) {
  logActivity(userId, userName, action, details, registerId, registerName).catch(() => {});
}

export async function firebaseGetActivity(limitCount = 200) {
  const res = await fetch(`/api/activity?limit=${limitCount}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch activity');
  }
  return res.json();
}

export async function firebaseGetUserActivity(userId: string) {
  const res = await fetch(`/api/activity/user/${userId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch user activity');
  }
  return res.json();
}

export async function firebaseCreateRequest(
  userId: string,
  userName: string,
  data: { registerName: string; description: string; type: 'download' | 'delete_register'; registerId?: string | number; scope?: object }
) {
  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userName, ...data })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create request');
  }
  return res.json();
}

export async function firebaseGetMyDownloadRequests(userId: string) {
  const res = await fetch(`/api/requests/my?userId=${userId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch my requests');
  }
  return res.json();
}

export async function firebaseGetAllDownloadRequests() {
  const res = await fetch('/api/requests/all');
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch all requests');
  }
  return res.json();
}

export async function firebaseGetPendingDownloadRequests() {
  const res = await fetch('/api/requests/pending');
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch pending requests');
  }
  return res.json();
}

export async function firebaseRespondRequest(
  requestId: string,
  status: 'approved' | 'rejected',
  adminResponse: string,
  adminName: string = 'Admin'
) {
  const res = await fetch(`/api/requests/${requestId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, adminResponse, adminName })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to respond to request');
  }
  return res.json();
}

export async function firebaseCreateNotification(
  userId: string,
  data: { title: string; message: string; type: string; meta?: Record<string, any> }
) {
  const res = await fetch('/api/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...data })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create notification');
  }
  return res.json();
}

export async function firebaseGetMyNotifications(userId: string) {
  const res = await fetch(`/api/notifications?userId=${userId}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch notifications');
  }
  return res.json();
}

export async function firebaseMarkNotificationRead(notifId: string) {
  const res = await fetch(`/api/notifications/${notifId}/read`, {
    method: 'PUT'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to mark read');
  }
}

export async function firebaseMarkAllNotificationsRead(userId: string) {
  const res = await fetch('/api/notifications/read-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to mark all read');
  }
}
