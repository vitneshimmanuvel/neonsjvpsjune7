import { query } from '../db-lib/db.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

// Helper to send login notification email to user
async function sendLoginNotificationEmail(userEmail, userName, role) {
  try {
    const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    const loginTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || `"AG Admin Alert" <no-reply@sjvps.com>`,
      to: userEmail,
      subject: `🔒 Security Alert: Account Login Detected (${userName})`,
      text: `Hello ${userName},\n\nWe detected a new login to your AG Account (${userEmail}) at ${loginTime}.\nRole: ${role}\n\nIf this was you, no action is required. If you did not recognize this activity, please contact your administrator immediately.`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
            <div style="background: #1a73e8; color: white; padding: 8px 12px; border-radius: 8px; font-weight: 800; font-size: 16px;">AG</div>
            <h2 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Account Login Notification</h2>
          </div>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #334155; font-size: 14.5px; line-height: 1.5;">A successful login to your AG account was registered with the following details:</p>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
              <tr><td style="padding: 4px 0; color: #64748b;">User:</td><td style="padding: 4px 0; font-weight: 600;">${userName} (${userEmail})</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">Role:</td><td style="padding: 4px 0; font-weight: 600; text-transform: capitalize;">${role}</td></tr>
              <tr><td style="padding: 4px 0; color: #64748b;">Time:</td><td style="padding: 4px 0; font-weight: 600;">${loginTime} (IST)</td></tr>
            </table>
          </div>

          <p style="color: #64748b; font-size: 13px; line-height: 1.5;">If this was you, you can safely ignore this email. If you did not initiate this login, please notify your administrator right away.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
          <p style="color: #94a3b8; font-size: 11.5px; margin: 0;">AG Trust Workspace Security Team • Automatic System Notification</p>
        </div>
      `
    };

    if (smtpUser && smtpPass) {
      const cleanPass = smtpPass.replace(/\s+/g, '');
      const transporter = (smtpHost.includes('gmail.com') || !process.env.SMTP_HOST)
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: cleanPass }
          })
        : nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: cleanPass },
            tls: { rejectUnauthorized: false }
          });
      await transporter.sendMail(mailOptions);
      console.log(`[Email Alert Sent] Login notification sent to ${userEmail}`);
    } else {
      console.log(`[Email Alert Prepared] Login email notification ready for ${userEmail}:`, mailOptions.subject);
    }
  } catch (err) {
    console.error('[Email Notification Error]', err.message);
  }
}

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

      // 1. Notify Admin Panel: Add in-app notification for all admin / superadmin users
      try {
        const adminUsers = await query("SELECT id FROM users WHERE role = 'admin' OR role = 'superadmin'");
        for (const adminRow of adminUsers.rows) {
          const notifId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
          await query(`
            INSERT INTO notifications (id, user_id, title, message, type, meta, is_read, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, false, NOW())
          `, [
            notifId,
            adminRow.id,
            'User Login Alert',
            `User ${user.name} (${user.email}) logged into the system`,
            'info',
            JSON.stringify({ userId: user.id, userName: user.name, userEmail: user.email, role: user.role, event: 'login' })
          ]);
        }
      } catch (notifErr) {
        console.error('Failed to create admin login notifications:', notifErr);
      }

      // 2. Send email notification to user's email address
      sendLoginNotificationEmail(user.email, user.name, user.role).catch(err => {
        console.error('Email dispatch error on login:', err);
      });

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

    // ─── USER PRESENCE & ONLINE STATUS ────────────────────────────────────────

    if (!globalThis._activePresence) {
      globalThis._activePresence = new Map();
    }

    // POST /api/presence/heartbeat
    if (pathname === '/api/presence/heartbeat' && method === 'POST') {
      const data = await getRequestBody(req);
      if (data.userId) {
        globalThis._activePresence.set(String(data.userId), {
          userId: String(data.userId),
          userName: data.userName || 'User',
          email: data.email || '',
          role: data.role || 'user',
          currentActivity: data.currentActivity || 'Active in app',
          lastActive: Date.now()
        });
      }
      return sendJson(res, 200, { success: true });
    }

    // GET /api/presence/online
    if (pathname === '/api/presence/online' && method === 'GET') {
      const now = Date.now();
      const onlineUsersMap = new Map();

      // 1. Load active users from in-memory presence store
      for (const [uid, presence] of globalThis._activePresence.entries()) {
        const diffMs = now - presence.lastActive;
        // Keep users active within the last 30 minutes
        if (diffMs <= 30 * 60 * 1000) {
          const status = diffMs <= 3 * 60 * 1000 ? 'online' : 'idle';
          onlineUsersMap.set(uid, {
            id: presence.userId,
            name: presence.userName,
            email: presence.email,
            role: presence.role,
            currentActivity: presence.currentActivity,
            lastActive: new Date(presence.lastActive).toISOString(),
            status
          });
        }
      }

      // 2. Fetch latest registered users from DB to supplement presence if missing
      try {
        const dbUsers = await query('SELECT id, name, email, role, status, last_login FROM users');
        const dbActivities = await query(`
          SELECT DISTINCT ON (user_id) user_id, details, register_name, timestamp 
          FROM activity_logs 
          WHERE user_id IS NOT NULL 
          ORDER BY user_id, timestamp DESC
        `);

        const activityMap = new Map();
        for (const act of dbActivities.rows) {
          activityMap.set(String(act.user_id), act);
        }

        for (const u of dbUsers.rows) {
          const uid = String(u.id);
          if (!onlineUsersMap.has(uid) && u.status !== 'inactive') {
            const lastAct = activityMap.get(uid);
            const lastTimeStr = lastAct?.timestamp || u.last_login;
            if (lastTimeStr) {
              const lastTime = new Date(lastTimeStr).getTime();
              const diffMs = now - lastTime;
              if (diffMs <= 24 * 60 * 60 * 1000) { // Active within 24 hrs
                const status = diffMs <= 3 * 60 * 1000 ? 'online' : (diffMs <= 15 * 60 * 1000 ? 'idle' : 'offline');
                const activityText = lastAct?.register_name 
                  ? `Last active in ${lastAct.register_name}` 
                  : (lastAct?.details || 'Signed in');
                onlineUsersMap.set(uid, {
                  id: uid,
                  name: u.name,
                  email: u.email,
                  role: u.role,
                  currentActivity: activityText,
                  lastActive: new Date(lastTime).toISOString(),
                  status
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch DB presence fallback:', err);
      }

      const usersList = Array.from(onlineUsersMap.values()).sort((a, b) => {
        const order = { online: 0, idle: 1, offline: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
      });

      return sendJson(res, 200, { users: usersList });
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
        await query('UPDATE users SET last_login = NOW() WHERE id = $1', [decoded.id]).catch(() => {});
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
      const result = await query('SELECT * FROM businesses ORDER BY name ASC, id ASC');
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

        if (data.entries) {
          const entries = data.entries;

          // Delete any entries that are no longer in the payload
          const entryIds = entries.map(e => Number(e.id));
          if (entryIds.length > 0) {
            const placeholders = entryIds.map((_, idx) => `$${idx + 2}`).join(', ');
            await query(`DELETE FROM entries WHERE register_id = $1 AND id NOT IN (${placeholders})`, [regId, ...entryIds]);
          } else {
            await query('DELETE FROM entries WHERE register_id = $1', [regId]);
          }

          if (entries.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < entries.length; i += batchSize) {
              const batch = entries.slice(i, i + batchSize);
              const valuePhrases = [];
              const queryParams = [];

              batch.forEach((entry, idx) => {
                const offset = idx * 7;
                valuePhrases.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                queryParams.push(
                  Number(entry.id),
                  regId,
                  Number(entry.rowNumber || 1),
                  JSON.stringify(entry.cells || {}),
                  entry.cellStyles ? JSON.stringify(entry.cellStyles) : null,
                  Number(entry.pageIndex || 0),
                  entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString()
                );
              });

              const queryText = `
                INSERT INTO entries (id, register_id, row_number, cells, cell_styles, page_index, created_at)
                VALUES ${valuePhrases.join(', ')}
                ON CONFLICT (id) DO UPDATE SET
                  row_number = EXCLUDED.row_number,
                  cells = EXCLUDED.cells,
                  cell_styles = EXCLUDED.cell_styles,
                  page_index = EXCLUDED.page_index
              `;
              await query(queryText, queryParams);
            }
          }
        }

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
      const registerId = url.searchParams.get('registerId');
      const entryId = url.searchParams.get('entryId');
      const limitVal = parseInt(url.searchParams.get('limit') || '200', 10);
      const offsetVal = parseInt(url.searchParams.get('offset') || '0', 10);

      let queryText = 'SELECT * FROM activity_logs';
      const params = [];
      const conditions = [];

      if (registerId) {
        params.push(String(registerId));
        conditions.push(`register_id = $${params.length}`);
      }
      if (entryId) {
        params.push(String(entryId));
        conditions.push(`entry_id = $${params.length}`);
      }

      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }

      const safeLimit = isNaN(limitVal) ? 200 : limitVal;
      const safeOffset = isNaN(offsetVal) ? 0 : offsetVal;
      queryText += ` ORDER BY timestamp DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

      const result = await query(queryText, params);
      return sendJson(res, 200, {
        activities: result.rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          userName: r.user_name,
          action: r.action,
          details: r.details,
          timestamp: r.timestamp,
          registerId: r.register_id,
          registerName: r.register_name,
          entryId: r.entry_id ? Number(r.entry_id) : undefined
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
          registerName: r.register_name,
          entryId: r.entry_id ? Number(r.entry_id) : undefined
        }))
      });
    }

    // POST /api/activity
    if (pathname === '/api/activity' && method === 'POST') {
      const data = await getRequestBody(req);
      const id = data.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp, register_id, register_name, entry_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        id,
        data.userId || null,
        data.userName || null,
        data.action || '',
        data.details || '',
        parseDate(data.timestamp) || new Date().toISOString(),
        data.registerId ? String(data.registerId) : null,
        data.registerName || null,
        data.entryId ? String(data.entryId) : null
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

    // POST /api/backups/send-email
    // Server-side ZIP generation to avoid 413 payload limits
    if (pathname === '/api/backups/send-email' && method === 'POST') {
      try {
        const body = await getRequestBody(req);
        const { targetEmail = 'jackyme1291@gmail.com', businessId: mailBizId } = body;

        if (!mailBizId) {
          return sendError(res, 400, 'businessId is required');
        }

        // 1. Fetch folders
        const foldersRes = await query('SELECT * FROM folders WHERE business_id = $1 ORDER BY name ASC', [mailBizId]);
        const folderMap = new Map();
        foldersRes.rows.forEach(r => folderMap.set(Number(r.id), r.name));

        // 2. Fetch all active registers
        const regsRes = await query('SELECT * FROM registers WHERE business_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [mailBizId]);
        const regIds = regsRes.rows.map(r => Number(r.id));

        // 3. Fetch ALL entries in ONE bulk query (instead of 271 individual queries)
        let allEntries = [];
        if (regIds.length > 0) {
          const placeholders = regIds.map((_, i) => `$${i + 1}`).join(',');
          const entriesRes = await query(
            `SELECT * FROM entries WHERE register_id IN (${placeholders}) ORDER BY register_id, row_number ASC`,
            regIds
          );
          allEntries = entriesRes.rows;
        }

        // Group entries by register_id in memory
        const entriesByRegId = new Map();
        allEntries.forEach(e => {
          const rid = Number(e.register_id);
          if (!entriesByRegId.has(rid)) entriesByRegId.set(rid, []);
          entriesByRegId.get(rid).push(e);
        });

        // 4. Build CSV files per register and add to ZIP
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        let totalEntries = allEntries.length;

        const escCsv = (val) => {
          const s = String(val ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        };

        for (const row of regsRes.rows) {
          const regId = Number(row.id);
          const regName = row.name || `Register_${regId}`;
          const folderId = row.folder_id ? Number(row.folder_id) : null;
          const folderName = folderId ? (folderMap.get(folderId) || 'Unorganized') : 'Unorganized';

          let columns = [];
          try {
            columns = Array.isArray(row.columns) ? row.columns : JSON.parse(row.columns || '[]');
          } catch (e) {
            columns = [];
          }
          columns.sort((a, b) => (a.position || 0) - (b.position || 0));
          const visibleCols = columns.filter(c => c.type !== 'image' && c.type !== 'signature');

          const regEntries = entriesByRegId.get(regId) || [];

          const headerRow = ['S.No.', ...visibleCols.map(c => escCsv(c.name))].join(',');
          const dataRows = regEntries.map((entry, idx) => {
            const cells = entry.cells || {};
            const rowData = [idx + 1];
            visibleCols.forEach(c => {
              const colId = String(c.id);
              const val = cells[colId] ?? '';
              if (c.type === 'checkbox') {
                rowData.push(String(val) === 'true' ? 'YES' : '');
              } else {
                rowData.push(escCsv(val));
              }
            });
            return rowData.join(',');
          });

          const csvContent = [headerRow, ...dataRows].join('\n');
          const safeRegName = regName.replace(/[\\/:*?"<>|]/g, '_');
          zip.file(`${folderName}/${safeRegName}.csv`, csvContent);
        }

        // 4. Generate ZIP buffer
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

        // 5. Prepare email
        const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
        const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        const sentTime = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'full',
          timeStyle: 'short'
        });

        const now = new Date();
        const timestamp = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
        const filename = `AG_Trust_Backup_[${timestamp}].zip`;
        const registerCount = regsRes.rows.length;
        const zipSizeKB = Math.round(zipBuffer.length / 1024);

        const mailOptions = {
          from: process.env.SMTP_FROM || `"AG Trust Backup" <no-reply@sjvps.com>`,
          to: targetEmail,
          subject: `📦 AG Trust Backup — ${registerCount} registers, ${totalEntries} entries`,
          text: `AG Trust Workspace Backup\n\nSent: ${sentTime}\nRegisters: ${registerCount}\nEntries: ${totalEntries}\nFile Size: ${zipSizeKB} KB\n\nPlease find the attached backup ZIP file.`,
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 14px;">
                <div style="background: #1e293b; color: white; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 16px;">AG TRUST</div>
                <h2 style="margin: 0; color: #0f172a; font-size: 19px; font-weight: 700;">Database Backup Delivery</h2>
              </div>
              <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello,</p>
              <p style="color: #334155; font-size: 14.5px; line-height: 1.5;">Your AG Trust workspace backup has been generated and is attached to this email.</p>

              <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                  <tr><td style="padding: 6px 0; color: #64748b;">File:</td><td style="padding: 6px 0; font-weight: 700; color: #1e293b;">${filename}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Registers:</td><td style="padding: 6px 0; font-weight: 600;">${registerCount}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Total Entries:</td><td style="padding: 6px 0; font-weight: 600;">${totalEntries}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Size:</td><td style="padding: 6px 0; font-weight: 600;">${zipSizeKB} KB</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Delivered To:</td><td style="padding: 6px 0; font-weight: 600;">${targetEmail}</td></tr>
                  <tr><td style="padding: 6px 0; color: #64748b;">Date & Time:</td><td style="padding: 6px 0; font-weight: 600;">${sentTime} (IST)</td></tr>
                </table>
              </div>

              <p style="color: #64748b; font-size: 13px; line-height: 1.5;">Keep this backup ZIP file safe for future data restoration or record-keeping.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
              <p style="color: #94a3b8; font-size: 11.5px; margin: 0;">AG Trust Workspace Security & Backup Service</p>
            </div>
          `,
          attachments: [
            {
              filename,
              content: zipBuffer
            }
          ]
        };

        if (!smtpUser || !smtpPass) {
          return sendError(res, 400, 'SMTP_USER or SMTP_PASS is missing in Vercel Environment Variables. Please verify environment variables in Vercel Settings.');
        }

        const cleanPass = smtpPass.replace(/\s+/g, '');
        const transporter = (smtpHost.includes('gmail.com') || !process.env.SMTP_HOST)
          ? nodemailer.createTransport({
              service: 'gmail',
              auth: { user: smtpUser, pass: cleanPass }
            })
          : nodemailer.createTransport({
              host: smtpHost,
              port: smtpPort,
              secure: smtpPort === 465,
              auth: { user: smtpUser, pass: cleanPass },
              tls: { rejectUnauthorized: false }
            });

        await transporter.sendMail(mailOptions);
        return sendJson(res, 200, { message: `Backup email sent successfully to ${targetEmail}`, registerCount, totalEntries });
      } catch (err) {
        console.error('Mail Backup Error:', err);
        return sendError(res, 500, 'Failed to send mail backup: ' + err.message);
      }
    }

    // ─── SAVED FORMULAS ──────────────────────────────────────────────────────

    // Auto-create table if needed (runs once per cold start)
    if (pathname.startsWith('/api/saved-formulas') && !globalThis._savedFormulasTableCreated) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS saved_formulas (
            id TEXT PRIMARY KEY,
            business_id BIGINT NOT NULL,
            name TEXT NOT NULL,
            formula TEXT NOT NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        globalThis._savedFormulasTableCreated = true;
      } catch (e) {
        console.error('Failed to auto-create saved_formulas table:', e);
      }
    }

    // GET /api/saved-formulas?businessId=X
    if (pathname === '/api/saved-formulas' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT * FROM saved_formulas WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
      return sendJson(res, 200, {
        formulas: result.rows.map(r => ({
          id: r.id,
          businessId: Number(r.business_id),
          name: r.name,
          formula: r.formula,
          createdBy: r.created_by,
          createdAt: r.created_at
        }))
      });
    }

    // POST /api/saved-formulas
    if (pathname === '/api/saved-formulas' && method === 'POST') {
      const data = await getRequestBody(req);
      if (!data.businessId) return sendError(res, 400, 'businessId is required');
      if (!data.name || !data.name.trim()) return sendError(res, 400, 'name is required');
      if (!data.formula || !data.formula.trim()) return sendError(res, 400, 'formula is required');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO saved_formulas (id, business_id, name, formula, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [id, data.businessId, data.name.trim(), data.formula.trim(), data.createdBy || null]);

      return sendJson(res, 201, {
        id,
        businessId: Number(data.businessId),
        name: data.name.trim(),
        formula: data.formula.trim(),
        createdBy: data.createdBy || null
      });
    }

    // DELETE /api/saved-formulas/:id
    const savedFormulaMatch = pathname.match(/^\/api\/saved-formulas\/(.+)$/);
    if (savedFormulaMatch && method === 'DELETE') {
      const formulaId = savedFormulaMatch[1];
      await query('DELETE FROM saved_formulas WHERE id = $1', [formulaId]);
      return sendJson(res, 200, { message: 'Saved formula deleted' });
    }
    // ─── SAVED DROPDOWNS ─────────────────────────────────────────────────────

    // Auto-create table if needed (runs once per cold start)
    if (pathname.startsWith('/api/saved-dropdowns') && !globalThis._savedDropdownsTableCreated) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS saved_dropdowns (
            id TEXT PRIMARY KEY,
            business_id BIGINT NOT NULL,
            name TEXT NOT NULL,
            options TEXT NOT NULL,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        globalThis._savedDropdownsTableCreated = true;
      } catch (e) {
        console.error('Failed to auto-create saved_dropdowns table:', e);
      }
    }

    // GET /api/saved-dropdowns?businessId=X
    if (pathname === '/api/saved-dropdowns' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT * FROM saved_dropdowns WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
      return sendJson(res, 200, {
        dropdowns: result.rows.map(r => ({
          id: r.id,
          businessId: Number(r.business_id),
          name: r.name,
          options: r.options,
          createdBy: r.created_by,
          createdAt: r.created_at
        }))
      });
    }

    // POST /api/saved-dropdowns
    if (pathname === '/api/saved-dropdowns' && method === 'POST') {
      const data = await getRequestBody(req);
      if (!data.businessId) return sendError(res, 400, 'businessId is required');
      if (!data.name || !data.name.trim()) return sendError(res, 400, 'name is required');
      if (!data.options) return sendError(res, 400, 'options are required');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO saved_dropdowns (id, business_id, name, options, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [id, data.businessId, data.name.trim(), data.options, data.createdBy || null]);

      return sendJson(res, 201, {
        id,
        businessId: Number(data.businessId),
        name: data.name.trim(),
        options: data.options,
        createdBy: data.createdBy || null
      });
    }

    // DELETE /api/saved-dropdowns/:id
    const savedDropdownMatch = pathname.match(/^\/api\/saved-dropdowns\/(.+)$/);
    if (savedDropdownMatch && method === 'DELETE') {
      const dropdownId = savedDropdownMatch[1];
      await query('DELETE FROM saved_dropdowns WHERE id = $1', [dropdownId]);
      return sendJson(res, 200, { message: 'Saved dropdown deleted' });
    }

    // ─── SAVED TEMPLATES ──────────────────────────────────────────────────────

    // Auto-create table if needed (runs once per cold start)
    if (pathname.startsWith('/api/saved-templates') && !globalThis._savedTemplatesTableCreated) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS saved_templates (
            id TEXT PRIMARY KEY,
            business_id BIGINT NOT NULL,
            name TEXT NOT NULL,
            columns TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        globalThis._savedTemplatesTableCreated = true;
      } catch (e) {
        console.error('Failed to auto-create saved_templates table:', e);
      }
    }

    // GET /api/saved-templates?businessId=X
    if (pathname === '/api/saved-templates' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT * FROM saved_templates WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
      return sendJson(res, 200, {
        templates: result.rows.map(r => ({
          id: r.id,
          businessId: Number(r.business_id),
          name: r.name,
          columns: typeof r.columns === 'string' ? JSON.parse(r.columns) : r.columns,
          createdAt: r.created_at
        }))
      });
    }

    // POST /api/saved-templates
    if (pathname === '/api/saved-templates' && method === 'POST') {
      const data = await getRequestBody(req);
      if (!data.businessId) return sendError(res, 400, 'businessId is required');
      if (!data.name || !data.name.trim()) return sendError(res, 400, 'name is required');
      if (!data.columns) return sendError(res, 400, 'columns are required');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO saved_templates (id, business_id, name, columns, created_at)
        VALUES ($1, $2, $3, $4, NOW())
      `, [id, data.businessId, data.name.trim(), typeof data.columns === 'string' ? data.columns : JSON.stringify(data.columns)]);

      return sendJson(res, 201, {
        id,
        businessId: Number(data.businessId),
        name: data.name.trim(),
        columns: typeof data.columns === 'string' ? JSON.parse(data.columns) : data.columns
      });
    }

    // DELETE /api/saved-templates/:id
    const savedTemplateMatch = pathname.match(/^\/api\/saved-templates\/(.+)$/);
    if (savedTemplateMatch && method === 'DELETE') {
      const templateId = savedTemplateMatch[1];
      await query('DELETE FROM saved_templates WHERE id = $1', [templateId]);
      return sendJson(res, 200, { message: 'Saved template deleted' });
    }

    // ─── SAVED REGISTER SHORTCUTS ────────────────────────────────────────────

    // Auto-create table if needed (runs once per cold start)
    if (pathname.startsWith('/api/saved-shortcuts') && !globalThis._savedShortcutsTableCreated) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS saved_register_shortcuts (
            id TEXT PRIMARY KEY,
            business_id BIGINT NOT NULL,
            name TEXT NOT NULL,
            register_id BIGINT NOT NULL,
            register_name TEXT NOT NULL,
            search_query TEXT,
            filters TEXT NOT NULL,
            summary_column_id BIGINT,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        // Ensure the column exists on existing installations
        await query(`
          ALTER TABLE saved_register_shortcuts ADD COLUMN IF NOT EXISTS summary_column_id BIGINT;
        `);
        globalThis._savedShortcutsTableCreated = true;
      } catch (e) {
        console.error('Failed to auto-create saved_register_shortcuts table:', e);
      }
    }

    // GET /api/saved-shortcuts?businessId=X
    if (pathname === '/api/saved-shortcuts' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT * FROM saved_register_shortcuts WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
      return sendJson(res, 200, {
        shortcuts: result.rows.map(r => ({
          id: r.id,
          businessId: Number(r.business_id),
          name: r.name,
          registerId: Number(r.register_id),
          registerName: r.register_name,
          searchQuery: r.search_query || '',
          filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters,
          createdAt: r.created_at
        }))
      });
    }

    // POST /api/saved-shortcuts
    if (pathname === '/api/saved-shortcuts' && method === 'POST') {
      const data = await getRequestBody(req);
      if (!data.businessId) return sendError(res, 400, 'businessId is required');
      if (!data.name || !data.name.trim()) return sendError(res, 400, 'name is required');
      if (!data.registerId) return sendError(res, 400, 'registerId is required');
      if (!data.registerName) return sendError(res, 400, 'registerName is required');

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO saved_register_shortcuts (id, business_id, name, register_id, register_name, search_query, filters, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        id, 
        data.businessId, 
        data.name.trim(), 
        data.registerId, 
        data.registerName, 
        data.searchQuery || '', 
        typeof data.filters === 'string' ? data.filters : JSON.stringify(data.filters || [])
      ]);

      return sendJson(res, 201, {
        id,
        businessId: Number(data.businessId),
        name: data.name.trim(),
        registerId: Number(data.registerId),
        registerName: data.registerName,
        searchQuery: data.searchQuery || '',
        filters: typeof data.filters === 'string' ? JSON.parse(data.filters) : (data.filters || [])
      });
    }

    // PUT /api/saved-shortcuts/:id
    const savedShortcutPutMatch = pathname.match(/^\/api\/saved-shortcuts\/(.+)$/);
    if (savedShortcutPutMatch && method === 'PUT') {
      const shortcutId = savedShortcutPutMatch[1];
      const data = await getRequestBody(req);
      if (!data.name || !data.name.trim()) return sendError(res, 400, 'name is required');

      await query('UPDATE saved_register_shortcuts SET name = $1 WHERE id = $2', [data.name.trim(), shortcutId]);
      return sendJson(res, 200, { id: shortcutId, name: data.name.trim() });
    }

    // DELETE /api/saved-shortcuts/:id
    const savedShortcutMatch = pathname.match(/^\/api\/saved-shortcuts\/(.+)$/);
    if (savedShortcutMatch && method === 'DELETE') {
      const shortcutId = savedShortcutMatch[1];
      await query('DELETE FROM saved_register_shortcuts WHERE id = $1', [shortcutId]);
      return sendJson(res, 200, { message: 'Saved shortcut deleted' });
    }

    // ─── DASHBOARD CONFIGURATION ─────────────────────────────────────────────

    // Auto-create table if needed (runs once per cold start)
    if (pathname.startsWith('/api/dashboard-config') && !globalThis._dashboardConfigTableCreated) {
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS dashboard_configurations (
            business_id BIGINT PRIMARY KEY,
            configured_sum_metrics TEXT NOT NULL,
            shortcuts_order TEXT NOT NULL
          )
        `);
        globalThis._dashboardConfigTableCreated = true;
      } catch (e) {
        console.error('Failed to auto-create dashboard_configurations table:', e);
      }
    }

    // GET /api/dashboard-config?businessId=X
    if (pathname === '/api/dashboard-config' && method === 'GET') {
      const businessId = parseBigInt(url.searchParams.get('businessId'));
      if (!businessId) return sendError(res, 400, 'businessId is required');
      const result = await query('SELECT * FROM dashboard_configurations WHERE business_id = $1', [businessId]);
      if (result.rowCount === 0) {
        return sendJson(res, 200, { configuredSumMetrics: [], shortcutsOrder: [] });
      }
      const row = result.rows[0];
      return sendJson(res, 200, {
        configuredSumMetrics: typeof row.configured_sum_metrics === 'string' ? JSON.parse(row.configured_sum_metrics) : row.configured_sum_metrics,
        shortcutsOrder: typeof row.shortcuts_order === 'string' ? JSON.parse(row.shortcuts_order) : row.shortcuts_order
      });
    }

    // POST /api/dashboard-config
    if (pathname === '/api/dashboard-config' && method === 'POST') {
      const data = await getRequestBody(req);
      if (!data.businessId) return sendError(res, 400, 'businessId is required');
      
      const metricsJson = JSON.stringify(data.configuredSumMetrics || []);
      const orderJson = JSON.stringify(data.shortcutsOrder || []);

      await query(`
        INSERT INTO dashboard_configurations (business_id, configured_sum_metrics, shortcuts_order)
        VALUES ($1, $2, $3)
        ON CONFLICT (business_id) DO UPDATE SET
          configured_sum_metrics = EXCLUDED.configured_sum_metrics,
          shortcuts_order = EXCLUDED.shortcuts_order
      `, [data.businessId, metricsJson, orderJson]);

      return sendJson(res, 200, { message: 'Dashboard configuration updated successfully' });
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
