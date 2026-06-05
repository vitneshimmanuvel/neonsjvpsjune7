import { query } from './_lib/db.js';
import crypto from 'crypto';

// Helper to hash password matching the client-side SHA-256 algorithm
function hashPassword(password) {
  const saltPassword = password + '__sjvps_salt_2024__';
  return crypto.createHash('sha256').update(saltPassword).digest('hex');
}

// Helper to parse JSON body robustly
async function getRequestBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// Format database user to matching frontend camelCase format
function formatUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    phone: row.phone || '',
    createdAt: row.created_at,
    lastLogin: row.last_login,
    permissions: row.permissions || {}
  };
}

// Format register to camelCase format
function formatRegister(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    businessId: Number(row.business_id),
    folderId: row.folder_id ? Number(row.folder_id) : undefined,
    name: row.name,
    icon: row.icon,
    iconColor: row.icon_color,
    category: row.category,
    template: row.template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entryCount: row.entry_count,
    deletedAt: row.deleted_at,
    deletedBy: row.deleted_by,
    deletedByEmail: row.deleted_by_email,
    deletedById: row.deleted_by_id,
    columns: row.columns,
    pages: row.pages,
    shareLink: row.share_link,
    sharedWith: row.shared_with || [],
    deletedItems: row.deleted_items || [],
    migrationCompleted: row.migration_completed,
    entriesPerChunk: row.entries_per_chunk
  };
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // ─── AUTHENTICATION ROUTES ───────────────────────────────────────────────

    // POST /api/auth/login
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = await getRequestBody(req);
      if (!email || !password) return sendError(res, 400, 'Email and password are required');

      const resUser = await query('SELECT * FROM users WHERE LOWER(email) = $1', [email.toLowerCase().trim()]);
      if (resUser.rowCount === 0) return sendError(res, 401, 'Invalid email or password');

      const user = resUser.rows[0];
      if (user.status === 'inactive') {
        return sendError(res, 403, 'Account is deactivated. Contact your administrator.');
      }

      const inputHash = hashPassword(password);
      if (inputHash !== user.password_hash) {
        return sendError(res, 401, 'Invalid email or password');
      }

      // Record login
      await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      // Create log
      const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES ($1, $2, $3, 'login', $4, NOW())
      `, [logId, user.id, user.name, `User logged in: ${user.email}`]);

      // Generate stateless token
      const token = Buffer.from(JSON.stringify({
        id: user.id,
        email: user.email,
        role: user.role,
        ts: Date.now()
      })).toString('base64');

      return sendJson(res, 200, {
        token,
        user: formatUser(user)
      });
    }

    // POST /api/auth/change-password
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '') || url.searchParams.get('token');
      if (!token) return sendError(res, 401, 'No token provided');

      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
        const { currentPassword, newPassword } = await getRequestBody(req);
        if (!currentPassword || !newPassword) return sendError(res, 400, 'Current and new passwords are required');

        const resUser = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (resUser.rowCount === 0) return sendError(res, 404, 'User not found');

        const user = resUser.rows[0];
        const currentHash = hashPassword(currentPassword);
        if (currentHash !== user.password_hash) {
          return sendError(res, 400, 'Current password is incorrect');
        }

        const newHash = hashPassword(newPassword);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
        
        // Create activity log
        const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        await query(`
          INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
          VALUES ($1, $2, $3, 'change_password', 'User changed their password', NOW())
        `, [logId, user.id, user.name]);

        return sendJson(res, 200, { message: 'Password changed successfully' });
      } catch (e) {
        return sendError(res, 401, 'Invalid token');
      }
    }

    // GET /api/auth/me
    if (pathname === '/api/auth/me' && method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '') || url.searchParams.get('token');
      if (!token) return sendError(res, 401, 'No token provided');

      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
        const resUser = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (resUser.rowCount === 0) return sendError(res, 401, 'User not found');
        return sendJson(res, 200, { user: formatUser(resUser.rows[0]) });
      } catch (e) {
        return sendError(res, 401, 'Invalid token');
      }
    }

    // GET /api/auth/users (admin only)
    if (pathname === '/api/auth/users' && method === 'GET') {
      const result = await query('SELECT * FROM users ORDER BY name ASC');
      return sendJson(res, 200, { users: result.rows.map(formatUser) });
    }

    // POST /api/auth/users (admin only)
    if (pathname === '/api/auth/users' && method === 'POST') {
      const data = await getRequestBody(req);
      const email = (data.email || '').toLowerCase().trim();
      
      const check = await query('SELECT 1 FROM users WHERE email = $1', [email]);
      if (check.rowCount > 0) return sendError(res, 400, 'Email already exists');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      const hash = hashPassword(data.password || 'admin123');

      const role = data.role || 'user';
      const permissions = data.permissions || {
        canView: true,
        canEdit: true,
        canDownload: role === 'admin' || role === 'superadmin',
        isAdmin: role === 'admin' || role === 'superadmin',
        fullSheetAccess: role === 'admin' || role === 'superadmin' || role === 'sheet_admin',
      };

      await query(`
        INSERT INTO users (id, name, email, password_hash, role, status, phone, created_at, permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      `, [id, data.name, email, hash, role, 'active', data.phone || '', JSON.stringify(permissions)]);

      // Create activity log
      const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES ($1, $2, $3, 'create_user', $4, NOW())
      `, [logId, id, data.name, `Created user: ${email} (${role})`]);

      const freshUser = await query('SELECT * FROM users WHERE id = $1', [id]);
      return sendJson(res, 201, { user: formatUser(freshUser.rows[0]), message: 'User created' });
    }

    // PUT /api/auth/users/:id (update details/status/role)
    const userMatch = pathname.match(/^\/api\/auth\/users\/([a-zA-Z0-9]+)$/);
    if (userMatch && method === 'PUT') {
      const userId = userMatch[1];
      const data = await getRequestBody(req);
      
      if (data.password) {
        // Change password request
        const hash = hashPassword(data.password);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
        return sendJson(res, 200, { message: 'Password changed successfully' });
      }

      if (data.status) {
        await query('UPDATE users SET status = $1 WHERE id = $2', [data.status, userId]);
        return sendJson(res, 200, { message: `User status changed to ${data.status}` });
      }

      await query(`
        UPDATE users 
        SET name = $1, phone = $2, role = $3
        WHERE id = $4
      `, [data.name, data.phone || '', data.role || 'user', userId]);
      
      return sendJson(res, 200, { message: 'User updated' });
    }

    // PUT /api/auth/users/:id/permissions
    const permMatch = pathname.match(/^\/api\/auth\/users\/([a-zA-Z0-9]+)\/permissions$/);
    if (permMatch && method === 'PUT') {
      const userId = permMatch[1];
      const { permissions } = await getRequestBody(req);
      await query('UPDATE users SET permissions = $1 WHERE id = $2', [JSON.stringify(permissions), userId]);
      return sendJson(res, 200, { message: 'Permissions updated' });
    }

    // DELETE /api/auth/users/:id
    if (userMatch && method === 'DELETE') {
      const userId = userMatch[1];
      await query('DELETE FROM users WHERE id = $1', [userId]);
      return sendJson(res, 200, { message: 'User deleted' });
    }

    // ─── BUSINESSES & FOLDERS ───────────────────────────────────────────────

    // GET /api/businesses
    if (pathname === '/api/businesses' && method === 'GET') {
      const result = await query('SELECT * FROM businesses ORDER BY name ASC');
      return sendJson(res, 200, result.rows.map(r => ({
        id: Number(r.id),
        name: r.name,
        ownerId: Number(r.owner_id),
        createdAt: r.created_at
      })));
    }

    // POST /api/businesses
    if (pathname === '/api/businesses' && method === 'POST') {
      const { name } = await getRequestBody(req);
      const id = Date.now();
      await query('INSERT INTO businesses (id, name, owner_id, created_at) VALUES ($1, $2, 1, NOW())', [id, name]);
      return sendJson(res, 201, { id, name, ownerId: 1 });
    }

    // GET /api/folders
    if (pathname === '/api/folders' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      const result = await query('SELECT * FROM folders WHERE business_id = $1 ORDER BY name ASC', [businessId]);
      return sendJson(res, 200, result.rows.map(r => ({
        id: Number(r.id),
        businessId: Number(r.business_id),
        name: r.name,
        createdAt: r.created_at
      })));
    }

    // POST /api/folders
    if (pathname === '/api/folders' && method === 'POST') {
      const { businessId, name } = await getRequestBody(req);
      const id = Date.now();
      await query('INSERT INTO folders (id, business_id, name, created_at) VALUES ($1, $2, $3, NOW())', [id, businessId, name]);
      return sendJson(res, 201, { id, businessId, name });
    }

    // RENAME / DELETE folders
    const folderMatch = pathname.match(/^\/api\/folders\/(\d+)$/);
    if (folderMatch) {
      const folderId = parseBigInt(folderMatch[1]);
      if (method === 'PUT') {
        const { name } = await getRequestBody(req);
        await query('UPDATE folders SET name = $1 WHERE id = $2', [name, folderId]);
        return sendJson(res, 200, { id: folderId, name });
      }
      if (method === 'DELETE') {
        await query('DELETE FROM folders WHERE id = $1', [folderId]);
        await query('UPDATE registers SET folder_id = NULL WHERE folder_id = $1', [folderId]);
        return sendJson(res, 200, { message: 'Folder deleted successfully' });
      }
    }

    // ─── REGISTERS & ENTRIES ─────────────────────────────────────────────────

    // GET /api/registers
    if (pathname === '/api/registers' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      const result = await query('SELECT * FROM registers WHERE business_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [businessId]);
      return sendJson(res, 200, result.rows.map(formatRegister));
    }

    // GET /api/registers/deleted
    if (pathname === '/api/registers/deleted' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      const result = await query('SELECT * FROM registers WHERE business_id = $1 AND deleted_at IS NOT NULL ORDER BY name ASC', [businessId]);
      return sendJson(res, 200, result.rows.map(formatRegister));
    }

    // POST /api/registers (create register)
    if (pathname === '/api/registers' && method === 'POST') {
      const data = await getRequestBody(req);
      const id = Date.now();
      await query(`
        INSERT INTO registers (
          id, business_id, folder_id, name, icon, icon_color, category, template, 
          created_at, updated_at, entry_count, columns, pages, shared_with
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), 0, $9, $10, $11)
      `, [
        id,
        data.businessId,
        data.folderId || null,
        data.name,
        data.icon || '',
        data.iconColor || '',
        data.category || '',
        data.template || '',
        JSON.stringify(data.columns || []),
        JSON.stringify(data.pages || []),
        JSON.stringify(data.sharedWith || [])
      ]);
      return sendJson(res, 201, { id, name: data.name });
    }

    // GET /api/registers/:id/columns
    const regColumnsMatch = pathname.match(/^\/api\/registers\/(\d+)\/columns$/);
    if (regColumnsMatch && method === 'GET') {
      const regId = parseBigInt(regColumnsMatch[1]);
      const result = await query('SELECT * FROM registers WHERE id = $1', [regId]);
      if (result.rowCount === 0) return sendError(res, 404, 'Register not found');
      return sendJson(res, 200, formatRegister(result.rows[0]));
    }

    // POST /api/registers/:id/restore
    const regRestoreMatch = pathname.match(/^\/api\/registers\/(\d+)\/restore$/);
    if (regRestoreMatch && method === 'POST') {
      const regId = parseBigInt(regRestoreMatch[1]);
      await query('UPDATE registers SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [regId]);
      return sendJson(res, 200, { message: 'Register restored' });
    }

    // DELETE /api/registers/:id/hard
    const regHardMatch = pathname.match(/^\/api\/registers\/(\d+)\/hard$/);
    if (regHardMatch && method === 'DELETE') {
      const regId = parseBigInt(regHardMatch[1]);
      await query('DELETE FROM registers WHERE id = $1', [regId]);
      return sendJson(res, 200, { message: 'Register permanently deleted' });
    }

    // GET, PUT, DELETE for individual registers
    const regMatch = pathname.match(/^\/api\/registers\/(\d+)$/);
    if (regMatch) {
      const regId = parseBigInt(regMatch[1]);

      if (method === 'GET') {
        const regRes = await query('SELECT * FROM registers WHERE id = $1', [regId]);
        if (regRes.rowCount === 0) return sendError(res, 404, 'Register not found');
        
        const entriesRes = await query('SELECT * FROM entries WHERE register_id = $1 ORDER BY row_number ASC', [regId]);
        
        const regDetail = formatRegister(regRes.rows[0]);
        regDetail.entries = entriesRes.rows.map(row => ({
          id: Number(row.id),
          registerId: Number(row.register_id),
          rowNumber: row.row_number,
          cells: row.cells,
          cellStyles: row.cell_styles,
          pageIndex: row.page_index,
          createdAt: row.created_at
        }));

        return sendJson(res, 200, regDetail);
      }

      if (method === 'PUT') {
        const data = await getRequestBody(req);
        await query(`
          UPDATE registers SET 
            name = $1, folder_id = $2, icon = $3, icon_color = $4, category = $5, 
            columns = $6, pages = $7, shared_with = $8, deleted_items = $9, entry_count = $10, updated_at = NOW()
          WHERE id = $11
        `, [
          data.name,
          data.folderId || null,
          data.icon,
          data.iconColor,
          data.category,
          JSON.stringify(data.columns),
          JSON.stringify(data.pages),
          JSON.stringify(data.sharedWith),
          JSON.stringify(data.deletedItems || []),
          data.entryCount !== undefined ? Number(data.entryCount) : 0,
          regId
        ]);
        return sendJson(res, 200, { message: 'Register updated' });
      }

      if (method === 'DELETE') {
        const { deletedBy, deletedByEmail, deletedById } = await getRequestBody(req);
        await query(`
          UPDATE registers SET 
            deleted_at = NOW(), deleted_by = $1, deleted_by_email = $2, deleted_by_id = $3
          WHERE id = $4
        `, [deletedBy, deletedByEmail, deletedById ? String(deletedById) : null, regId]);
        return sendJson(res, 200, { message: 'Register soft-deleted' });
      }
    }

    // POST /api/registers/:id/entries (Add entry row)
    const entryListMatch = pathname.match(/^\/api\/registers\/(\d+)\/entries$/);
    if (entryListMatch && method === 'POST') {
      const regId = parseBigInt(entryListMatch[1]);
      const entry = await getRequestBody(req);
      
      const entryId = parseBigInt(entry.id);
      
      await query(`
        INSERT INTO entries (id, register_id, row_number, cells, cell_styles, page_index, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        entryId,
        regId,
        Number(entry.rowNumber || 1),
        JSON.stringify(entry.cells || {}),
        entry.cellStyles ? JSON.stringify(entry.cellStyles) : null,
        Number(entry.pageIndex || 0),
        parseDate(entry.createdAt) || new Date().toISOString()
      ]);

      // Increment entry_count in register
      await query('UPDATE registers SET entry_count = entry_count + 1, updated_at = NOW() WHERE id = $1', [regId]);

      return sendJson(res, 201, { message: 'Entry added', id: entryId });
    }

    // PUT / DELETE entries: /api/registers/:id/entries/:entryId
    const entryMatch = pathname.match(/^\/api\/registers\/(\d+)\/entries\/(\d+)$/);
    if (entryMatch) {
      const regId = parseBigInt(entryMatch[1]);
      const entryId = parseBigInt(entryMatch[2]);

      if (method === 'PUT') {
        const { cells, cellStyles, pageIndex, rowNumber } = await getRequestBody(req);
        await query(`
          UPDATE entries SET 
            cells = $1, 
            cell_styles = $2, 
            page_index = $3, 
            row_number = COALESCE($4, row_number)
          WHERE id = $5 AND register_id = $6
        `, [
          JSON.stringify(cells || {}),
          cellStyles ? JSON.stringify(cellStyles) : null,
          pageIndex !== undefined ? Number(pageIndex) : 0,
          rowNumber !== undefined ? Number(rowNumber) : null,
          entryId,
          regId
        ]);
        return sendJson(res, 200, { message: 'Entry updated' });
      }

      if (method === 'DELETE') {
        await query('DELETE FROM entries WHERE id = $1 AND register_id = $2', [entryId, regId]);
        await query('UPDATE registers SET entry_count = GREATEST(0, entry_count - 1), updated_at = NOW() WHERE id = $1', [regId]);
        return sendJson(res, 200, { message: 'Entry deleted' });
      }
    }

    // ─── ACTIVITY LOGS ───────────────────────────────────────────────────────

    // GET /api/activity
    if (pathname === '/api/activity' && method === 'GET') {
      const result = await query('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 200');
      return sendJson(res, 200, {
        activities: result.rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          action: r.action,
          details: r.details,
          timestamp: r.timestamp,
          registerId: r.register_id,
          registerName: r.register_name
        }))
      });
    }

    // GET /api/activity/user/:userId
    const userActMatch = pathname.match(/^\/api\/activity\/user\/(.+)$/);
    if (userActMatch && method === 'GET') {
      const userId = userActMatch[1];
      const result = await query('SELECT * FROM activity_logs WHERE user_id = $1 ORDER BY timestamp DESC', [userId]);
      return sendJson(res, 200, {
        activities: result.rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          action: r.action,
          details: r.details,
          timestamp: r.timestamp,
          registerId: r.register_id,
          registerName: r.register_name
        }))
      });
    }

    // POST /api/activity
    if (pathname === '/api/activity' && method === 'POST') {
      const data = await getRequestBody(req);
      const id = data.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp, register_id, register_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        id,
        data.userId || null,
        data.userName || null,
        data.action || '',
        data.details || '',
        parseDate(data.timestamp) || new Date().toISOString(),
        data.registerId ? String(data.registerId) : null,
        data.registerName || null
      ]);
      return sendJson(res, 201, { id });
    }

    // ─── DOWNLOAD / DELETION REQUESTS ────────────────────────────────────────

    // POST /api/requests
    if (pathname === '/api/requests' && method === 'POST') {
      const data = await getRequestBody(req);
      const id = data.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO download_requests (
          id, user_id, user_name, type, register_id, register_name, description, scope, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())
      `, [
        id,
        data.userId || null,
        data.userName || null,
        data.type || 'download',
        data.registerId ? String(data.registerId) : null,
        data.registerName || '',
        data.description || '',
        JSON.stringify(data.scope || {})
      ]);
      return sendJson(res, 201, { id });
    }

    // GET /api/requests/my
    if (pathname === '/api/requests/my' && method === 'GET') {
      const userId = url.searchParams.get('userId');
      const result = await query('SELECT * FROM download_requests WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      return sendJson(res, 200, { requests: result.rows.map(formatRequest) });
    }

    // GET /api/requests/all
    if (pathname === '/api/requests/all' && method === 'GET') {
      const result = await query('SELECT * FROM download_requests ORDER BY created_at DESC');
      return sendJson(res, 200, { requests: result.rows.map(formatRequest) });
    }

    // GET /api/requests/pending
    if (pathname === '/api/requests/pending' && method === 'GET') {
      const result = await query("SELECT * FROM download_requests WHERE status = 'pending' ORDER BY created_at DESC");
      return sendJson(res, 200, { requests: result.rows.map(formatRequest) });
    }

    // POST /api/requests/:id/respond
    const respondMatch = pathname.match(/^\/api\/requests\/(.+)\/respond$/);
    if (respondMatch && method === 'POST') {
      const requestId = respondMatch[1];
      const { status, adminResponse } = await getRequestBody(req);
      await query(`
        UPDATE download_requests 
        SET status = $1, admin_response = $2, responded_at = NOW() 
        WHERE id = $3
      `, [status, adminResponse || '', requestId]);
      return sendJson(res, 200, { message: `Request status set to ${status}` });
    }

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────

    // GET /api/notifications
    if (pathname === '/api/notifications' && method === 'GET') {
      const userId = url.searchParams.get('userId');
      const result = await query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      return sendJson(res, 200, {
        notifications: result.rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          title: r.title,
          message: r.message,
          type: r.type,
          meta: r.meta || {},
          isRead: r.is_read,
          createdAt: r.created_at
        }))
      });
    }

    // POST /api/notifications
    if (pathname === '/api/notifications' && method === 'POST') {
      const data = await getRequestBody(req);
      const id = data.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO notifications (id, user_id, title, message, type, meta, is_read, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
      `, [id, data.userId, data.title, data.message, data.type, JSON.stringify(data.meta || {})]);
      return sendJson(res, 201, { id });
    }

    // PUT /api/notifications/:id/read
    const notifReadMatch = pathname.match(/^\/api\/notifications\/(.+)\/read$/);
    if (notifReadMatch && method === 'PUT') {
      const notifId = notifReadMatch[1];
      await query('UPDATE notifications SET is_read = true WHERE id = $1', [notifId]);
      return sendJson(res, 200, { message: 'Notification marked read' });
    }

    // POST /api/notifications/read-all
    if (pathname === '/api/notifications/read-all' && method === 'POST') {
      const { userId } = await getRequestBody(req);
      await query('UPDATE notifications SET is_read = true WHERE user_id = $1', [userId]);
      return sendJson(res, 200, { message: 'All notifications marked read' });
    }

    // GET /api/recycle-bin
    if (pathname === '/api/recycle-bin' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT deleted_items FROM registers WHERE business_id = $1', [businessId]);
      const allItems = [];
      for (const row of result.rows) {
        if (row.deleted_items && Array.isArray(row.deleted_items)) {
          allItems.push(...row.deleted_items);
        }
      }
      allItems.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
      return sendJson(res, 200, { deletedItems: allItems });
    }

    // GET /api/backups
    if (pathname === '/api/backups' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query(
        'SELECT id, business_id, created_at, label, register_count, folder_count, total_entries, size_kb FROM backups WHERE business_id = $1 ORDER BY created_at DESC',
        [businessId]
      );
      return sendJson(res, 200, result.rows.map(r => ({
        id: r.id,
        businessId: Number(r.business_id),
        createdAt: r.created_at,
        label: r.label,
        registerCount: r.register_count,
        folderCount: r.folder_count,
        totalEntries: r.total_entries,
        sizeKb: r.size_kb
      })));
    }

    // POST /api/backups
    if (pathname === '/api/backups' && method === 'POST') {
      const { businessId, label } = await getRequestBody(req);
      if (!businessId) return sendError(res, 400, 'businessId is required');

      // 1. Get folders
      const foldersRes = await query('SELECT * FROM folders WHERE business_id = $1 ORDER BY name ASC', [businessId]);
      const folders = foldersRes.rows.map(r => ({
        id: Number(r.id),
        businessId: Number(r.business_id),
        name: r.name,
        createdAt: r.created_at
      }));

      // 2. Get active registers and their entries
      const regsRes = await query('SELECT * FROM registers WHERE business_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [businessId]);
      const validRegisters = [];
      for (const row of regsRes.rows) {
        const regId = Number(row.id);
        const entriesRes = await query('SELECT * FROM entries WHERE register_id = $1 ORDER BY row_number ASC', [regId]);
        const regDetail = formatRegister(row);
        regDetail.entries = entriesRes.rows.map(r => ({
          id: Number(r.id),
          registerId: Number(r.register_id),
          rowNumber: r.row_number,
          cells: r.cells,
          cellStyles: r.cell_styles,
          pageIndex: r.page_index,
          createdAt: r.created_at
        }));
        validRegisters.push(regDetail);
      }

      const totalEntries = validRegisters.reduce((sum, r) => sum + (r.entries?.length ?? 0), 0);
      const id = `backup_${Date.now()}`;
      const now = new Date().toISOString();
      const displayLabel = label || `Backup ${new Date(now).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

      const snapshot = {
        meta: {
          id,
          businessId,
          createdAt: now,
          label: displayLabel,
          registerCount: validRegisters.length,
          folderCount: folders.length,
          totalEntries,
          sizeKb: 0
        },
        registers: validRegisters,
        folders
      };

      const jsonSize = Math.round(JSON.stringify(snapshot).length / 1024);
      snapshot.meta.sizeKb = jsonSize;

      await query(`
        INSERT INTO backups (id, business_id, created_at, label, register_count, folder_count, total_entries, size_kb, snapshot)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        id,
        businessId,
        now,
        displayLabel,
        validRegisters.length,
        folders.length,
        totalEntries,
        jsonSize,
        JSON.stringify(snapshot)
      ]);

      // Log action
      const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES ($1, $2, $3, 'Backup Created', $4, NOW())
      `, [logId, 'system', 'System', `Created backup: ${displayLabel} (${validRegisters.length} registers, ${totalEntries} entries)`]);

      return sendJson(res, 201, snapshot.meta);
    }

    // POST /api/backups/:id/restore
    const backupRestoreMatch = pathname.match(/^\/api\/backups\/(.+)\/restore$/);
    if (backupRestoreMatch && method === 'POST') {
      const backupId = backupRestoreMatch[1];
      const backupRes = await query('SELECT * FROM backups WHERE id = $1', [backupId]);
      if (backupRes.rowCount === 0) return sendError(res, 404, 'Backup not found');

      const backup = backupRes.rows[0];
      const snapshot = backup.snapshot;
      const { meta, folders, registers } = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
      const businessId = Number(meta.businessId);

      await query('BEGIN');
      try {
        await query('DELETE FROM entries WHERE register_id IN (SELECT id FROM registers WHERE business_id = $1)', [businessId]);
        await query('DELETE FROM registers WHERE business_id = $1', [businessId]);
        await query('DELETE FROM folders WHERE business_id = $1', [businessId]);

        for (const folder of folders) {
          await query(`
            INSERT INTO folders (id, business_id, name, created_at)
            VALUES ($1, $2, $3, $4)
          `, [folder.id, folder.businessId, folder.name, folder.createdAt]);
        }

        for (const reg of registers) {
          await query(`
            INSERT INTO registers (
              id, business_id, folder_id, name, icon, icon_color, category, template, 
              created_at, updated_at, entry_count, deleted_at, deleted_by, deleted_by_email, deleted_by_id, 
              columns, pages, share_link, shared_with, deleted_items, migration_completed, entries_per_chunk
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `, [
            Number(reg.id),
            businessId,
            reg.folderId ? Number(reg.folderId) : null,
            reg.name,
            reg.icon || '',
            reg.iconColor || '',
            reg.category || '',
            reg.template || '',
            reg.createdAt,
            reg.updatedAt,
            reg.entryCount || 0,
            reg.deletedAt,
            reg.deletedBy || null,
            reg.deletedByEmail || null,
            reg.deletedById ? String(reg.deletedById) : null,
            JSON.stringify(reg.columns || []),
            JSON.stringify(reg.pages || []),
            reg.shareLink || null,
            JSON.stringify(reg.sharedWith || []),
            JSON.stringify(reg.deletedItems || []),
            reg.migrationCompleted ?? true,
            reg.entriesPerChunk || 50
          ]);

          const entries = reg.entries || [];
          if (entries.length > 0) {
            const batchSize = 200;
            for (let i = 0; i < entries.length; i += batchSize) {
              const batch = entries.slice(i, i + batchSize);
              const valuePhrases = [];
              const queryParams = [];

              batch.forEach((entry, idx) => {
                const offset = idx * 7;
                valuePhrases.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                queryParams.push(
                  Number(entry.id),
                  Number(reg.id),
                  Number(entry.rowNumber || 1),
                  JSON.stringify(entry.cells || {}),
                  entry.cellStyles ? JSON.stringify(entry.cellStyles) : null,
                  Number(entry.pageIndex || 0),
                  entry.createdAt
                );
              });

              const queryText = `
                INSERT INTO entries (id, register_id, row_number, cells, cell_styles, page_index, created_at)
                VALUES ${valuePhrases.join(', ')}
              `;
              await query(queryText, queryParams);
            }
          }
        }

        await query('COMMIT');

        const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        await query(`
          INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
          VALUES ($1, $2, $3, 'Backup Restored', $4, NOW())
        `, [logId, 'system', 'System', `Restored backup: ${meta.label} (${registers.length} registers)`]);

        return sendJson(res, 200, { message: 'Backup restored successfully' });
      } catch (err) {
        await query('ROLLBACK');
        console.error('Failed to restore backup:', err);
        return sendError(res, 500, 'Restoration failed: ' + err.message);
      }
    }

    // DELETE /api/backups/:id
    const deleteBackupMatch = pathname.match(/^\/api\/backups\/(.+)$/);
    if (deleteBackupMatch && method === 'DELETE') {
      const backupId = deleteBackupMatch[1];
      await query('DELETE FROM backups WHERE id = $1', [backupId]);
      return sendJson(res, 200, { message: 'Backup deleted successfully' });
    }

    // If no route matches, return 404
    return sendError(res, 404, `Route ${pathname} not found`);

  } catch (error) {
    console.error(`[API Error] error executing request ${method} ${pathname}:`, error);
    return sendError(res, 500, error.message || 'Internal Server Error');
  }
}

// Map database request format to frontend camelCase property names
function formatRequest(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    type: r.type,
    registerId: r.register_id ? Number(r.register_id) : undefined,
    registerName: r.register_name,
    description: r.description,
    scope: r.scope || {},
    status: r.status,
    createdAt: r.created_at,
    adminResponse: r.admin_response,
    respondedAt: r.responded_at
  };
}

function parseBigInt(val) {
  if (val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
