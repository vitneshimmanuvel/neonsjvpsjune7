export interface ActivityLog {
  id: string | number;
  userId?: string | number;
  userName?: string;
  userEmail?: string;
  action: string;
  details: string;
  timestamp: string;
  registerId?: string | number;
  registerName?: string;
  entryId?: number;
  businessId?: number;
}

/**
 * Client-side deduplication and cleanup of activity logs.
 * Groups/filters twin/paired logs (e.g. low-level cell action vs detailed high-level action)
 * happening at essentially the same time by the same user to present a clean activity log.
 */
export function cleanActivityLogs<T extends ActivityLog>(activities: T[]): T[] {
  if (!activities || !Array.isArray(activities)) return [];

  // Sort activities by timestamp descending
  const sorted = [...activities].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const result: T[] = [];
  const visited = new Set<string | number>();

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    if (visited.has(current.id)) continue;

    const currentMs = new Date(current.timestamp).getTime();
    let matchIdx = -1;

    // Look ahead (since sorted is DESC, we are looking at older logs or logs with same/similar time)
    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      if (visited.has(other.id)) continue;

      // Check if done by the same user
      if (other.userId !== current.userId) continue;

      // Time difference must be within 3 seconds
      const otherMs = new Date(other.timestamp).getTime();
      if (Math.abs(currentMs - otherMs) > 3000) continue;

      // Must be related to same register if register IDs are present
      const sameReg = (current.registerId && other.registerId) 
        ? String(current.registerId) === String(other.registerId) 
        : true;

      // Must be related to same entry if entry IDs are present
      const sameEntry = (current.entryId && other.entryId) 
        ? Number(current.entryId) === Number(other.entryId) 
        : true;

      if (!sameReg || !sameEntry) continue;

      const actA = current.action.toLowerCase().replace(/_/g, ' ').trim();
      const actB = other.action.toLowerCase().replace(/_/g, ' ').trim();

      // 1. Edit cells vs Edit row pair
      const isEditPair = 
        (actA === 'edit cells' && actB === 'edit row') ||
        (actA === 'edit row' && actB === 'edit cells');

      // 2. Add Row (low-level add_row vs high-level Add Row)
      const isAddPair = 
        (actA === 'add row' || actA === 'insert row') && 
        (actB === 'add row' || actB === 'insert row');

      // 3. Delete Row (low-level delete_row vs high-level Delete Row)
      const isDeletePair = actA === 'delete row' && actB === 'delete row';

      // 4. Column Add pair
      const isColumnPair = actA === 'add column' && actB === 'add column';

      // 5. Column Delete pair
      const isDeleteColumnPair = actA === 'delete column' && actB === 'delete column';

      if (isEditPair || isAddPair || isDeletePair || isColumnPair || isDeleteColumnPair) {
        matchIdx = j;
        break;
      }
    }

    let merged = { ...current };

    if (matchIdx !== -1) {
      const other = sorted[matchIdx];
      visited.add(other.id);

      const actA = current.action.toLowerCase().replace(/_/g, ' ').trim();
      const actB = other.action.toLowerCase().replace(/_/g, ' ').trim();
      const detailsA = current.details || '';
      const detailsB = other.details || '';

      if (actA === 'edit row' || actB === 'edit row' || actA === 'edit cells' || actB === 'edit cells') {
        // Prefer the row edit detailed log (the one containing "changed from")
        const rowEditLog = detailsA.includes('changed from') ? current : other;
        merged = { ...rowEditLog };
        merged.action = 'edit_cells';
      } else if (actA === 'add row' || actB === 'add row' || actA === 'insert row' || actB === 'insert row') {
        // Merge row num and register name into a unified nice details string
        let rowNumText = '';
        let registerText = '';

        const rowNumMatch = (detailsA + ' ' + detailsB).match(/(?:row|create row)\s*#(\d+)/i);
        if (rowNumMatch) {
          rowNumText = `row #${rowNumMatch[1]}`;
        }

        const regMatch = (detailsA + ' ' + detailsB).match(/to\s+"([^"]+)"/i);
        if (regMatch) {
          registerText = `to "${regMatch[1]}"`;
        }

        if (rowNumText && registerText) {
          if (detailsA.includes('Duplicated') || detailsB.includes('Duplicated')) {
            merged.details = `Duplicated row to create ${rowNumText} ${registerText}`;
          } else if (detailsA.includes('Inserted') || detailsB.includes('Inserted')) {
            const posMatch = (detailsA + ' ' + detailsB).match(/position\s*(\d+)/i);
            const posText = posMatch ? ` at position ${posMatch[1]}` : '';
            merged.details = `Inserted new ${rowNumText}${posText} ${registerText}`;
          } else {
            merged.details = `Added new ${rowNumText} ${registerText}`;
          }
        } else {
          merged.details = detailsA.length > detailsB.length ? detailsA : detailsB;
        }
        merged.action = 'add_row';
      } else if (actA === 'delete row' || actB === 'delete row') {
        // Keep the one containing "from" sheet detail
        if (detailsA.includes('from')) {
          merged = { ...current };
        } else if (detailsB.includes('from')) {
          merged = { ...other };
        } else {
          merged.details = detailsA.length > detailsB.length ? detailsA : detailsB;
        }
        merged.action = 'delete_row';
      } else if (actA === 'add column' || actB === 'add column') {
        // Keep the one containing "to" register detail
        if (detailsA.includes('to')) {
          merged = { ...current };
        } else if (detailsB.includes('to')) {
          merged = { ...other };
        } else {
          merged.details = detailsA.length > detailsB.length ? detailsA : detailsB;
        }
        merged.action = 'add_column';
      } else if (actA === 'delete column' || actB === 'delete column') {
        // Keep the one containing "from" register detail
        if (detailsA.includes('from')) {
          merged = { ...current };
        } else if (detailsB.includes('from')) {
          merged = { ...other };
        } else {
          merged.details = detailsA.length > detailsB.length ? detailsA : detailsB;
        }
        merged.action = 'delete_column';
      }
    }

    // Post-deduplication normalization (covers non-merged logs as well)
    const normAct = merged.action.toLowerCase().replace(/_/g, ' ').trim();
    if (normAct === 'edit row' || normAct === 'edit cells' || normAct === 'rename column') {
      merged.action = 'edit_cells';
    } else if (normAct === 'add row' || normAct === 'insert row' || normAct === 'restore row') {
      merged.action = 'add_row';
    } else if (normAct === 'delete row') {
      merged.action = 'delete_row';
    } else if (normAct === 'delete rows' || normAct === 'bulk delete rows') {
      merged.action = 'bulk_delete_rows';
    } else if (normAct === 'add column' || normAct === 'restore column') {
      merged.action = 'add_column';
    } else if (normAct === 'delete column') {
      merged.action = 'delete_column';
    }

    result.push(merged);
  }

  return result;
}
