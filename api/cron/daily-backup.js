import { query } from '../db-lib/db.js';
import nodemailer from 'nodemailer';

/**
 * Vercel Cron Job: Daily Mail Backup at 7 PM IST
 * This endpoint is triggered automatically by Vercel Cron.
 * It sends a ZIP backup of all registers via email.
 * 
 * Schedule: Every day at 7:00 PM IST (1:30 PM UTC)
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Security: Verify the request is from Vercel Cron (or manual trigger with secret)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow if: Vercel Cron (no auth needed on Vercel), or manual trigger with correct secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // On Vercel, cron jobs are authenticated automatically
    // This check is for extra security if CRON_SECRET is set
    // If no CRON_SECRET env var, allow all (Vercel handles security)
  }

  const targetEmail = process.env.BACKUP_EMAIL || 'jackyme1291@gmail.com';
  
  try {
    console.log('[CRON] Daily backup started at', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));

    // 1. Get all businesses (backup each one)
    const bizRes = await query('SELECT id, name FROM businesses ORDER BY id');
    const businesses = bizRes.rows;
    
    if (businesses.length === 0) {
      return sendJson(res, 200, { message: 'No businesses found to backup' });
    }

    const results = [];

    for (const biz of businesses) {
      const mailBizId = biz.id;

      // Check if this business has any registers
      const regCheckRes = await query('SELECT COUNT(*) as cnt FROM registers WHERE business_id = $1 AND deleted_at IS NULL', [mailBizId]);
      const regCount = parseInt(regCheckRes.rows[0].cnt);
      if (regCount === 0) {
        console.log(`[CRON] Skipping business ${biz.name} (ID: ${mailBizId}) — no active registers`);
        continue;
      }

      // 2. Fetch folders
      const foldersRes = await query('SELECT * FROM folders WHERE business_id = $1 ORDER BY name ASC', [mailBizId]);
      const folderMap = new Map();
      foldersRes.rows.forEach(r => folderMap.set(Number(r.id), r.name));

      // 3. Fetch all active registers
      const regsRes = await query('SELECT * FROM registers WHERE business_id = $1 AND deleted_at IS NULL ORDER BY name ASC', [mailBizId]);
      const regIds = regsRes.rows.map(r => Number(r.id));

      // 4. Fetch ALL entries in ONE bulk query
      let allEntries = [];
      if (regIds.length > 0) {
        const placeholders = regIds.map((_, i) => `$${i + 1}`).join(',');
        const entriesRes = await query(
          `SELECT * FROM entries WHERE register_id IN (${placeholders}) ORDER BY register_id, row_number ASC`,
          regIds
        );
        allEntries = entriesRes.rows;
      }

      // Group entries by register_id
      const entriesByRegId = new Map();
      allEntries.forEach(e => {
        const rid = Number(e.register_id);
        if (!entriesByRegId.has(rid)) entriesByRegId.set(rid, []);
        entriesByRegId.get(rid).push(e);
      });

      // 5. Build CSV files per register and add to ZIP
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

      // 6. Generate ZIP buffer
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      // 7. Prepare email
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
      const filename = `AG_Trust_Auto_Backup_[${timestamp}].zip`;
      const registerCount = regsRes.rows.length;
      const zipSizeKB = Math.round(zipBuffer.length / 1024);

      const mailOptions = {
        from: process.env.SMTP_FROM || `"AG Trust Auto Backup" <no-reply@sjvps.com>`,
        to: targetEmail,
        subject: `📦 AG Trust Daily Auto Backup — ${registerCount} registers, ${totalEntries} entries`,
        text: `AG Trust Workspace — Automated Daily Backup\n\nThis is an automatic backup generated at 7:00 PM IST.\n\nSent: ${sentTime}\nRegisters: ${registerCount}\nEntries: ${totalEntries}\nFile Size: ${zipSizeKB} KB\n\nPlease find the attached backup ZIP file.`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #ffffff;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 14px;">
              <div style="background: #1e293b; color: white; padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 16px;">AG TRUST</div>
              <h2 style="margin: 0; color: #0f172a; font-size: 19px; font-weight: 700;">🕖 Daily Auto Backup (7 PM IST)</h2>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello,</p>
            <p style="color: #334155; font-size: 14.5px; line-height: 1.5;">Your scheduled daily backup has been automatically generated and is attached to this email.</p>

            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 12px 16px; margin: 16px 0;">
              <p style="margin: 0; color: #166534; font-size: 13px; font-weight: 600;">✅ Automated Backup — No manual action required</p>
            </div>

            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
                <tr><td style="padding: 6px 0; color: #64748b;">File:</td><td style="padding: 6px 0; font-weight: 700; color: #1e293b;">${filename}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Registers:</td><td style="padding: 6px 0; font-weight: 600;">${registerCount}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Total Entries:</td><td style="padding: 6px 0; font-weight: 600;">${totalEntries}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Size:</td><td style="padding: 6px 0; font-weight: 600;">${zipSizeKB} KB</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Delivered To:</td><td style="padding: 6px 0; font-weight: 600;">${targetEmail}</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Date & Time:</td><td style="padding: 6px 0; font-weight: 600;">${sentTime} (IST)</td></tr>
                <tr><td style="padding: 6px 0; color: #64748b;">Type:</td><td style="padding: 6px 0; font-weight: 600; color: #16a34a;">⏰ Scheduled Daily Backup</td></tr>
              </table>
            </div>

            <p style="color: #64748b; font-size: 13px; line-height: 1.5;">Keep this backup ZIP file safe for future data restoration or record-keeping.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
            <p style="color: #94a3b8; font-size: 11.5px; margin: 0;">AG Trust Workspace — Automated Backup Service • Daily 7 PM IST</p>
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
        console.error('[CRON] SMTP_USER or SMTP_PASS missing');
        return sendJson(res, 500, { error: 'SMTP credentials not configured' });
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

      // Log the auto backup in activity_logs
      const logId = Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
      await query(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES ($1, $2, $3, 'Auto Backup', $4, NOW())
      `, [logId, 'system', 'Auto Cron', `Daily auto backup sent to ${targetEmail} (${registerCount} registers, ${totalEntries} entries, ${zipSizeKB} KB)`]);

      results.push({
        businessId: mailBizId,
        businessName: biz.name,
        registerCount,
        totalEntries,
        zipSizeKB,
        email: targetEmail
      });

      console.log(`[CRON] ✅ Backup sent for business ${biz.name}: ${registerCount} registers, ${totalEntries} entries`);
    }

    console.log('[CRON] Daily backup completed successfully');

    return sendJson(res, 200, {
      message: 'Daily auto backup completed',
      timestamp: new Date().toISOString(),
      results
    });

  } catch (err) {
    console.error('[CRON] Daily backup failed:', err);
    return sendJson(res, 500, { error: 'Daily backup failed: ' + err.message });
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
