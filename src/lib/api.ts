// Firestore-backed API client for RecordBook Web
// Firebase imports removed
import { TEMPLATES, type Template, type TemplateColumn } from './templates';
// Local filesystem completely unmounted from regular API.

// ==================== AUTH ====================
export interface User {
  id: number | string;
  phone?: string;
  email?: string;
  name: string | null;
  createdAt: string;
  role?: 'superadmin' | 'admin' | 'sheet_admin' | 'user';
  status?: 'active' | 'inactive';
  lastLogin?: string;
  permissions?: {
    canView?: boolean;
    canEdit?: boolean;
    canDownload?: boolean;
    isAdmin?: boolean;
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

export interface SendOtpResponse { message: string; devOtp?: string; }
export interface VerifyOtpResponse { token: string; user: User; }

export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  void phone;
  return { message: 'OTP sent', devOtp: '123456' };
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResponse> {
  void otp;
  return {
    token: 'mock-token',
    user: { id: 1, phone, name: 'Test User', createdAt: new Date().toISOString() },
  };
}

export async function getMe(): Promise<User> {
  return { id: 1, phone: '9999999999', name: 'Test User', createdAt: new Date().toISOString() };
}

// ==================== BUSINESSES ====================
export interface Business { id: number; name: string; ownerId: number; createdAt: string; }

export async function listBusinesses(): Promise<Business[]> {
  const res = await fetch('/api/businesses');
  if (!res.ok) throw new Error('Failed to fetch businesses');
  return res.json();
}

export async function createBusiness(name: string): Promise<Business> {
  const res = await fetch('/api/businesses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create business');
  return res.json();
}

// ==================== FOLDERS ====================
export interface Folder {
  id: number;
  businessId: number;
  name: string;
  createdAt: string;
}

export async function listFolders(businessId: number): Promise<Folder[]> {
  const res = await fetch(`/api/folders?businessId=${businessId}`);
  if (!res.ok) throw new Error('Failed to fetch folders');
  return res.json();
}

export async function createFolder(businessId: number, name: string): Promise<Folder> {
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessId, name })
  });
  if (!res.ok) throw new Error('Failed to create folder');
  return res.json();
}

export async function deleteFolder(folderId: number): Promise<void> {
  const res = await fetch(`/api/folders/${folderId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete folder');
}

export async function renameFolder(folderId: number, newName: string): Promise<Folder> {
  const res = await fetch(`/api/folders/${folderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  if (!res.ok) throw new Error('Failed to rename folder');
  return res.json();
}


// ==================== REGISTERS ====================
export interface RegisterSummary {
  id: number; businessId: number; folderId?: number; name: string; icon: string; iconColor?: string;
  category: string; template: string; createdAt: string; updatedAt: string; entryCount: number;
  lastActivity?: string; deletedAt?: string;
  deletedBy?: string;
  deletedByEmail?: string;
  deletedById?: string | number;
}

export interface Column {
  id: number; registerId: number; name: string; type: string; position: number;
  dropdownOptions?: string[]; formula?: string; width?: number; summary?: string;
  linkedTo?: { registerId: number; columnId: number; role?: 'source' | 'target' };
  mandatory?: boolean;
  unique?: boolean;
  doubleEntryWarning?: boolean;
  bgColor?: string;
}

export interface CellStyle {
  textColor?: string;
  bgColor?: string;
  textAlign?: 'left' | 'center' | 'right';
}

export interface Entry {
  id: number; registerId: number; rowNumber: number;
  cells: Record<string, string>; createdAt: string; pageIndex?: number;
  cellStyles?: Record<string, CellStyle>;
}

export interface Page { id: number; name: string; index: number; }

export interface RegisterDetail extends RegisterSummary {
  columns: Column[]; entries: Entry[]; pages: Page[];
  shareLink?: string; sharedWith?: SharedUser[];
  deletedItems?: DeletedItem[];
  migrationCompleted?: boolean;
  entriesPerChunk?: number;
}

export interface SharedUser {
  id: number; name: string; phone: string; permission: 'view' | 'edit'; addedAt: string;
}

export interface DeletedItem {
  id: number;
  type: 'row' | 'column';
  deletedAt: string;
  registerName: string;
  registerId: number;
  // For rows
  entry?: Entry;
  originalIndex?: number;
  // For columns
  column?: Column;
  columnCellData?: Record<string, string>; // entryId -> cellValue
  // User metadata who deleted this
  deletedBy?: string;
  deletedByEmail?: string;
  deletedById?: string | number;
}

export interface HistoryEntry {
  id: number;
  businessId: number;
  action: string;
  details: string;
  timestamp: string;
  userName?: string;
  userId?: string | number;
  userEmail?: string;
  registerName?: string;
  registerId?: number;
  entryId?: number;
}

export interface SearchResult {
  registerId: number;
  registerName: string;
  folderId?: number;
  entryId: number;
  rowNumber: number;
  matchedText: string;
  matchedColumnId?: string;
  pageIndex?: number;
}

export async function searchAllRegisters(businessId: number, searchTerm: string): Promise<SearchResult[]> {
  const q = searchTerm.toLowerCase();
  if (!q) return [];

  const summaries = await listRegisters(businessId);
  const results: SearchResult[] = [];

  const allRegs = await Promise.all(summaries.map(s => getRegister(s.id).catch(() => null)));

  for (const reg of allRegs) {
    if (!reg || reg.deletedAt) continue;

    // Check if register name matches
    if (reg.name.toLowerCase().includes(q)) {
      results.push({
        registerId: reg.id,
        registerName: reg.name,
        folderId: reg.folderId,
        entryId: -1,
        rowNumber: -1,
        matchedText: reg.name,
      });
    }

    // Check entries
    for (const entry of reg.entries) {
      for (const colId in entry.cells) {
        const val = entry.cells[colId] || '';
        if (val.toLowerCase().includes(q)) {
          results.push({
            registerId: reg.id,
            registerName: reg.name,
            folderId: reg.folderId,
            entryId: entry.id,
            rowNumber: entry.rowNumber,
            matchedText: val,
            matchedColumnId: colId,
            pageIndex: entry.pageIndex,
          });
          break; // Stop checking this entry once we found a match
        }
      }
    }
  }

  return results;
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
const ENTRIES_PER_CHUNK = 50;

// In-memory cache so reads never hit Firestore after the first load
const firestoreRegisterCache = new Map<number, RegisterDetail>();
// Tracks active, pending Firestore fetches to deduplicate concurrent loads
const inFlightRegisterFetches = new Map<number, Promise<RegisterDetail>>();

export function clearRegisterCache(registerId?: number): void {
  if (registerId !== undefined) {
    const key = Number(registerId);
    firestoreRegisterCache.delete(key);
    inFlightRegisterFetches.delete(key);
    console.log(`[Cache] Cleared in-memory cache and in-flight fetches for register #${key}`);
  } else {
    firestoreRegisterCache.clear();
    inFlightRegisterFetches.clear();
    console.log('[Cache] Cleared all in-memory register caches and in-flight fetches');
  }
}
// Mutation queue: ensures operations on the same register run serially to prevent race conditions
const registerMutationQueues = new Map<string | number, Promise<any>>();
// Tracks how many mutations are currently pending/running globally
let pendingMutationsCount = 0;
// Tracks active mutations specifically per register to avoid cache conflicts
const activeMutationsPerRegister = new Map<string, number>();
const mutationListeners = new Set<(count: number) => void>();
let lastGeneratedId = 0;

function generateId(): number {
  const now = Date.now();
  lastGeneratedId = now <= lastGeneratedId ? lastGeneratedId + 1 : now;
  return lastGeneratedId;
}

export function subscribeToMutationStatus(callback: (count: number) => void) {
  mutationListeners.add(callback);
  callback(pendingMutationsCount);
  return () => mutationListeners.delete(callback);
}

/** Direct read of the current pending mutation count (no React render delays) */
export function getPendingMutationsCount(): number {
  return pendingMutationsCount;
}

function updateMutationCount(delta: number) {
  pendingMutationsCount += delta;
  mutationListeners.forEach(cb => cb(pendingMutationsCount));
}

async function runQueuedMutation<T>(registerId: number | string, op: () => Promise<T>): Promise<T> {
  const key = registerId.toString();
  const currentQueue = (registerMutationQueues.get(key) || Promise.resolve()).catch(() => {});
  updateMutationCount(1);
  const currentActive = activeMutationsPerRegister.get(key) || 0;
  activeMutationsPerRegister.set(key, currentActive + 1);

  const next = currentQueue.then(async () => {
    const regId = Number(registerId);
    if (!isNaN(regId)) {
      clearRegisterCache(regId);
    }
    return op();
  }).finally(() => {
    updateMutationCount(-1);
    const count = activeMutationsPerRegister.get(key) || 1;
    if (count <= 1) {
      activeMutationsPerRegister.delete(key);
    } else {
      activeMutationsPerRegister.set(key, count - 1);
    }
  }).catch((err) => {
    console.error(`Mutation failed for register ${key}:`, err);
    throw err;
  });
  registerMutationQueues.set(key, next);
  return next;
}

/** Helper to populate auto-increment values for existing rows */
function populateAutoIncrement(reg: RegisterDetail, columnId: number) {
  const colIdStr = columnId.toString();
  let maxVal = 0;
  reg.entries.forEach(e => {
    const v = parseInt(e.cells?.[colIdStr] || '0', 10);
    if (!isNaN(v) && v > maxVal) maxVal = v;
  });
  reg.entries.forEach(e => {
    if (!e.cells) e.cells = {};
    if (!e.cells[colIdStr] || e.cells[colIdStr].trim() === '') {
      maxVal++;
      e.cells[colIdStr] = maxVal.toString();
    }
  });
}

/**
 * Updates the column name to include or remove currency symbols based on the type.
 * Ensures the header visually matches the column format.
 */
function updateColumnSymbol(col: Column, newType: string) {
  // Remove existing symbols or bracketed currency indicators (e.g. "Price (Rs)" -> "Price")
  let cleanName = col.name.replace(/\s*\([₹$]\)$|\s*\(Rs\)$|\s*\(₹\)$/i, '').trim();

  if (newType === 'currency') {
    col.name = `${cleanName} (₹)`;
  } else {
    // For all other types, revert to the clean name without symbols
    col.name = cleanName;
  }
}

/**
 * Re-calculates rowNumber for all entries in a register based on their order in the array.
 * rowNumber is absolute across all pages (1, 2, 3...).
 */
function renumberRows(reg: RegisterDetail) {
  reg.entries.forEach((e, i) => {
    e.rowNumber = i + 1;
  });
}

async function getRegDoc(registerId: number): Promise<RegisterDetail> {
  const cached = firestoreRegisterCache.get(registerId);
  if (cached) {
    return structuredClone(cached);
  }

  let fetchPromise = inFlightRegisterFetches.get(registerId);
  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const res = await fetch(`/api/registers/${registerId}`);
        if (!res.ok) throw new Error('Register not found');
        const data = await res.json();
        firestoreRegisterCache.set(registerId, data);
        return data;
      } finally {
        inFlightRegisterFetches.delete(registerId);
      }
    })();
    inFlightRegisterFetches.set(registerId, fetchPromise);
  }

  const result = await fetchPromise;
  return structuredClone(result);
}

async function saveRegDocImmediate(reg: RegisterDetail, includeEntries = false): Promise<void> {
  firestoreRegisterCache.set(reg.id, reg);
  const payload = includeEntries ? reg : { ...reg, entries: undefined };
  const res = await fetch(`/api/registers/${reg.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to save register metadata');
}

async function saveMainDocOnly(reg: RegisterDetail): Promise<void> {
  await saveRegDocImmediate(reg);
}

async function saveAddedEntryFast(reg: RegisterDetail, newEntryIndex: number): Promise<void> {
  return Promise.resolve();
}

async function saveAddedEntryOnly(reg: RegisterDetail, newEntryIndex: number): Promise<void> {
  return Promise.resolve();
}


async function flushPendingWrite(registerId: number): Promise<void> {
  // Now redundant with serial queueing, but kept for interface compatibility
  const queue = registerMutationQueues.get(registerId);
  if (queue) await queue;
}

/**
 * Flush all pending debounced writes across all registers to Firestore.
 */
export async function flushAllPendingWrites(): Promise<void> {
  await Promise.all(Array.from(registerMutationQueues.values()));
}

// Export so the query can bust the cache when needed (e.g., switching between registers)
export function bustRegisterCache(registerId: number): void {
  // Flush any pending write first so it's not lost
  flushPendingWrite(registerId);
  firestoreRegisterCache.delete(registerId);
}


// ── Public API ───────────────────────────────────────────────────────────────

export async function listRegisters(businessId: number): Promise<RegisterSummary[]> {
  const res = await fetch(`/api/registers?businessId=${businessId}`);
  if (!res.ok) throw new Error('Failed to list registers');
  return res.json();
}

export async function listDeletedRegisters(businessId: number): Promise<RegisterSummary[]> {
  const res = await fetch(`/api/registers/deleted?businessId=${businessId}`);
  if (!res.ok) throw new Error('Failed to list deleted registers');
  return res.json();
}

export async function getRegisterColumnsOnly(registerId: number): Promise<RegisterDetail> {
  const res = await fetch(`/api/registers/${registerId}/columns`);
  if (!res.ok) throw new Error('Failed to fetch columns');
  return res.json();
}

export async function getRegister(registerId: number, bypassCache = true): Promise<RegisterDetail> {
  if (bypassCache) {
    clearRegisterCache(registerId);
  }
  const reg = await getRegDoc(registerId);
  if (!reg.pages || reg.pages.length === 0) reg.pages = [{ id: 1, name: 'Page 1', index: 0 }];
  if (!reg.entries) reg.entries = [];
  if (!reg.columns) reg.columns = [];
  reg.columns.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return reg;
}

export async function createRegister(data: {
  businessId: number; folderId?: number; name: string; icon?: string; iconColor?: string;
  category?: string; template?: string;
  columns?: Array<{
    name: string;
    type: string;
    dropdownOptions?: string[];
    formula?: string;
    width?: number;
    summary?: string;
  }>;
}): Promise<RegisterSummary> {
  const columns = (data.columns || []).map((c, i) => ({
    id: generateId(),
    name: c.name,
    type: c.type,
    position: i,
    dropdownOptions: c.dropdownOptions,
    formula: c.formula,
    width: c.width,
    summary: c.summary,
  }));
  
  const res = await fetch('/api/registers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessId: data.businessId,
      folderId: data.folderId,
      name: data.name,
      icon: data.icon,
      iconColor: data.iconColor,
      category: data.category,
      template: data.template,
      columns
    })
  });
  
  if (!res.ok) throw new Error('Failed to create register');
  const summary = await res.json();
  
  await getRegister(summary.id);
  
  await logAction(data.businessId, 'Create Register', `Created register: ${data.name}`, { registerId: summary.id, registerName: data.name });
  return summary;
}

export async function deleteRegister(registerId: number): Promise<void> {
  const reg = await getRegDoc(registerId);
  const savedUser = JSON.parse(
    sessionStorage.getItem('recordbook_user') ||
    'null'
  );
  
  const res = await fetch(`/api/registers/${registerId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deletedBy: savedUser?.name || 'User',
      deletedByEmail: savedUser?.email || '',
      deletedById: savedUser?.id || ''
    })
  });
  if (!res.ok) throw new Error('Failed to delete register');
  
  firestoreRegisterCache.delete(registerId);
  await logAction(reg.businessId, 'Trash Register', `Moved register to recycle bin: ${reg.name}`, { registerId, registerName: reg.name });
}

export async function permanentlyDeleteRegister(registerId: number): Promise<void> {
  const reg = await getRegDoc(registerId);
  const res = await fetch(`/api/registers/${registerId}/hard`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to permanently delete register');
  
  firestoreRegisterCache.delete(registerId);
  await logAction(reg.businessId, 'Delete Register', `Permanently deleted register: ${reg.name}`, { registerId, registerName: reg.name });
}

export async function restoreRegister(registerId: number): Promise<void> {
  const reg = await getRegDoc(registerId);
  const res = await fetch(`/api/registers/${registerId}/restore`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to restore register');
  
  await logAction(reg.businessId, 'Restore Register', `Restored register: ${reg.name}`, { registerId, registerName: reg.name });
}

export async function renameRegister(registerId: number, newName: string): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const oldName = reg.name;
    reg.name = newName;
    reg.updatedAt = new Date().toISOString();
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Rename Register', `Renamed register from "${oldName}" to "${newName}"`, { registerId, registerName: newName });
    return reg;
  });
}

export async function duplicateRegister(registerId: number): Promise<RegisterSummary> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const newId = generateId();
    const duplicated: RegisterDetail = {
      ...JSON.parse(JSON.stringify(reg)), id: newId, name: `${reg.name} (Copy)`,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), entryCount: reg.entries.length,
      migrationCompleted: true,
    };
    duplicated.columns = duplicated.columns.map((c: Column, i: number) => ({ ...c, id: newId + i + 1, registerId: newId }));
    duplicated.entries = duplicated.entries.map((e: Entry, i: number) => ({ ...e, id: newId + 1000 + i, registerId: newId }));
    duplicated.pages = duplicated.pages.map((p: Page, i: number) => ({ ...p, id: newId + 2000 + i }));
    await saveRegDocImmediate(duplicated, true);
    return duplicated;
  });
}

export async function moveRegisterToFolder(registerId: number, folderId: number | null): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (folderId !== null) {
      reg.folderId = folderId;
    } else {
      delete reg.folderId;
    }
    await saveRegDocImmediate(reg);
  });
}

export async function moveRegistersToFolder(registerIds: number[], folderId: number | null): Promise<void> {
  await Promise.all(
    registerIds.map(registerId =>
      runQueuedMutation(registerId, async () => {
        const reg = await getRegDoc(registerId);
        if (folderId !== null) {
          reg.folderId = folderId;
        } else {
          delete reg.folderId;
        }
        await saveRegDocImmediate(reg);
      })
    )
  );
}

// ── Excel Import: Column-type alias map ──────────────────────────────────────
// Maps common Excel header patterns → { type, dropdownOptions? }
// Keys are lowercase. Matching uses both exact and substring checks.
interface ColumnHint { type: string; dropdownOptions?: string[] }

const COLUMN_ALIASES: Record<string, ColumnHint> = {
  // ── Date fields ──
  'dob': { type: 'date' },
  'date of birth': { type: 'date' },
  'd.o.b': { type: 'date' },
  'date': { type: 'date' },
  'admission date': { type: 'date' },
  'joining date': { type: 'date' },
  'join date': { type: 'date' },
  'paid date': { type: 'date' },
  'due date': { type: 'date' },
  'start date': { type: 'date' },
  'end date': { type: 'date' },
  'expiry': { type: 'date' },
  'expiry date': { type: 'date' },

  // ── Grade / Standard / Class ──
  'grade': { type: 'dropdown', dropdownOptions: ['PRE-KG', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'] },
  'class': { type: 'dropdown', dropdownOptions: ['PRE-KG', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'] },
  'standard': { type: 'dropdown', dropdownOptions: ['PRE-KG', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'] },
  'std': { type: 'dropdown', dropdownOptions: ['PRE-KG', 'LKG', 'UKG', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'] },
  'section': { type: 'dropdown', dropdownOptions: ['A', 'B', 'C', 'D', 'E'] },

  // ── Gender ──
  'gender': { type: 'dropdown', dropdownOptions: ['Male', 'Female', 'Other'] },
  'sex': { type: 'dropdown', dropdownOptions: ['Male', 'Female', 'Other'] },

  // ── Community / Caste ──
  'community': { type: 'dropdown', dropdownOptions: ['OC', 'BC', 'MBC', 'SC', 'ST', 'Other'] },
  'com': { type: 'dropdown', dropdownOptions: ['OC', 'BC', 'MBC', 'SC', 'ST', 'Other'] },
  'caste': { type: 'dropdown', dropdownOptions: ['OC', 'BC', 'MBC', 'SC', 'ST', 'Other'] },
  'category': { type: 'dropdown', dropdownOptions: ['OC', 'BC', 'MBC', 'SC', 'ST', 'Other'] },

  // ── Status ──
  'status': { type: 'dropdown', dropdownOptions: ['Active', 'Inactive', 'Pending'] },
  'old/new': { type: 'dropdown', dropdownOptions: ['OLD', 'NEW'] },
  'old / new': { type: 'dropdown', dropdownOptions: ['OLD', 'NEW'] },
  'sib stu': { type: 'checkbox' },
  'sibling': { type: 'checkbox' },

  // ── Religion ──
  'religion': { type: 'dropdown', dropdownOptions: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other'] },

  // ── Blood Group ──
  'blood group': { type: 'dropdown', dropdownOptions: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  'blood grp': { type: 'dropdown', dropdownOptions: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },

  // ── Payment mode ──
  'payment mode': { type: 'dropdown', dropdownOptions: ['Cash', 'UPI', 'Card', 'Credit', 'Cheque'] },
  'mode of payment': { type: 'dropdown', dropdownOptions: ['Cash', 'UPI', 'Card', 'Credit', 'Cheque'] },

  // ── Numeric fields ──
  's.no': { type: 'number' },
  's.no.': { type: 'number' },
  'sno': { type: 'number' },
  'sl no': { type: 'number' },
  'sl.no': { type: 'number' },
  'sl.no.': { type: 'number' },
  'serial': { type: 'number' },
  'serial no': { type: 'number' },
  'roll no': { type: 'number' },
  'roll number': { type: 'number' },
  'age': { type: 'number' },
  'amount': { type: 'number' },
  'total': { type: 'number' },
  'balance': { type: 'number' },
  'fees': { type: 'number' },
  'fee': { type: 'number' },
  'price': { type: 'number' },
  'qty': { type: 'number' },
  'quantity': { type: 'number' },
};

// Substring patterns checked when the exact alias lookup misses
const COLUMN_SUBSTRING_HINTS: { pattern: string; hint: ColumnHint }[] = [
  { pattern: 'date', hint: { type: 'date' } },
  { pattern: 'phone', hint: { type: 'text' } },
  { pattern: 'mobile', hint: { type: 'text' } },
  { pattern: 'contact', hint: { type: 'text' } },
  { pattern: 'number', hint: { type: 'text' } },  // fallback — could be roll no, phone no, etc.
  { pattern: 'address', hint: { type: 'text' } },
  { pattern: 'email', hint: { type: 'text' } },
  { pattern: 'remark', hint: { type: 'text' } },
  { pattern: 'note', hint: { type: 'text' } },
];

/**
 * Convert an Excel serial date number to a DD-MM-YYYY string.
 * Excel serial: days since 1900-01-01 (with the Lotus 1-2-3 leap year bug).
 */
function excelSerialToDateStr(serial: number): string {
  // Excel epoch: Jan 0 1900 (i.e. Dec 31 1899).
  // 25569 is the number of days between Jan 1 1900 and Jan 1 1970.
  const utcDays = serial - 25569;
  const ms = utcDays * 86400 * 1000;
  const d = new Date(ms);

  // Use UTC methods to avoid timezone shifts
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();

  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Robustly convert any date-like value (string, number, Date) to DD-MM-YYYY.
 * Enforces consistency across import, display, and storage.
 */
export function formatDateToDDMMYYYY(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  // 1. Handle Excel Serial Dates (including floating point timestamps)
  const numVal = typeof val === 'number' ? val : Number(val);
  if (!isNaN(numVal) && looksLikeExcelSerial(numVal)) {
    return excelSerialToDateStr(Math.floor(numVal));
  }

  // 2. Handle JS Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const y = val.getFullYear();
    return `${d}-${m}-${y}`;
  }

  // 3. Handle String input
  let s = String(val).trim();
  if (!s) return '';

  // Standardize separators to -
  s = s.replace(/[\/.]/g, '-');

  const parts = s.split('-');
  if (parts.length === 3) {
    let p1 = parts[0].padStart(2, '0');
    let p2 = parts[1].padStart(2, '0');
    let p3 = parts[2];

    // Handle YYYY/MM/DD or YYYY-MM-DD
    if (p1.length === 4) {
      return `${p3.padStart(2, '0')}-${p2}-${p1}`;
    }

    // Handle 2-digit years
    if (p3.length === 2) {
      const year = parseInt(p3);
      p3 = (year < 50 ? '20' : '19') + p3;
    }

    const n1 = parseInt(p1);
    const n2 = parseInt(p2);

    // If it's ambiguous (both <= 12), we might need to know the source.
    // The user explicitly stated that dates are coming in as MM/DD/YYYY incorrectly.
    // So if n1 <= 12 and n2 > 12, it's definitely MM/DD/YYYY -> Swap.
    // If both are <= 12, it's ambiguous, but we prioritize DD-MM-YYYY as the target.

    if (n1 <= 12 && n2 > 12) {
      // Clearly MM/DD/YYYY (e.g. 05/15/2023) -> Swap to DD-MM-YYYY (15-05-2023)
      return `${p2}-${p1}-${p3}`;
    }

    // Normal case or ambiguous: assume p1 is Day, p2 is Month.
    return `${p1}-${p2}-${p3}`;
  }

  // Final fallback: try native Date parsing
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return s;
}


/** Check if a value looks like a plausible Excel serial date (roughly 1968 to 2077). */
function looksLikeExcelSerial(val: unknown): boolean {
  if (typeof val !== 'number') return false;
  return val >= 25000 && val <= 65000;
}

/**
 * Resolve a column's type by:
 *  1. Exact template column match (case-insensitive)
 *  2. Exact alias map lookup
 *  3. Substring alias patterns
 *  4. Data-driven detection (sample actual values)
 */
function resolveColumnType(
  header: string,
  bestTemplate: Template | null,
  sampleValues: (string | number | boolean | null)[],
): { type: string; dropdownOptions?: string[]; formula?: string } {
  const lowerH = header.toLowerCase().trim();

  // 1. Exact case-insensitive template column match
  if (bestTemplate) {
    const tplCol = bestTemplate.columns.find(
      (c: TemplateColumn) => c.name.toLowerCase().trim() === lowerH,
    );
    if (tplCol) {
      return { type: tplCol.type, dropdownOptions: tplCol.dropdownOptions, formula: tplCol.formula };
    }
  }

  // 2. Exact alias map lookup
  if (COLUMN_ALIASES[lowerH]) {
    return { ...COLUMN_ALIASES[lowerH] };
  }

  // 3. Substring alias patterns
  for (const { pattern, hint } of COLUMN_SUBSTRING_HINTS) {
    if (lowerH.includes(pattern)) {
      return { ...hint };
    }
  }

  // Also check alias keys as substrings (e.g., header "STUDENT GRADE" contains "grade")
  for (const [aliasKey, aliasHint] of Object.entries(COLUMN_ALIASES)) {
    if (lowerH.includes(aliasKey) || aliasKey.includes(lowerH)) {
      return { ...aliasHint };
    }
  }

  // 4. Data-driven detection: sample non-empty values
  const nonEmpty = sampleValues
    .filter((v) => v !== null && v !== undefined && v !== '')
    .slice(0, 20); // sample up to 20 rows

  if (nonEmpty.length > 0) {
    // Check if most values look like dates (DD-MM-YYYY, YYYY-MM-DD, etc.)
    const datePattern = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;
    const dateCount = nonEmpty.filter((v) => {
      const sVal = String(v).trim();
      const match = sVal.match(datePattern);
      if (!match) return false;
      const year = parseInt(match[3]);
      // Ignore year 1900 dates (which are actually misclassified serial numbers 1, 2, 3)
      if (match[3].length === 4 && year === 1900) return false;
      if (match[1].length === 4 && parseInt(match[1]) === 1900) return false;
      return true;
    }).length;
    if (dateCount >= nonEmpty.length * 0.6) {
      return { type: 'date' };
    }

    // Check if values are Excel serial dates (all numbers in a plausible date range)
    // ONLY do this if the header suggests a date, to avoid converting IDs, roll numbers, or amounts.
    const hasDateKeyword = lowerH.includes('date') || lowerH.includes('dob') || lowerH.includes('birth') || lowerH.includes('joining') || lowerH.includes('day') || lowerH.includes('due') || lowerH.includes('expiry');
    if (hasDateKeyword) {
      const serialDateCount = nonEmpty.filter((v) => looksLikeExcelSerial(v)).length;
      if (serialDateCount >= nonEmpty.length * 0.6) {
        return { type: 'date' };
      }
    }

    // Check if all values are numbers
    const numCount = nonEmpty.filter((v) => !isNaN(Number(v))).length;
    if (numCount >= nonEmpty.length * 0.8) {
      return { type: 'number' };
    }
  }

  return { type: 'text' };
}

export const importExcelData = async (
  businessId: number,
  name: string,
  data: Record<string, string | number | boolean | null>[],
  folderId?: number,
  metadata?: any[]
): Promise<RegisterSummary> => {
  if (!data || data.length === 0) throw new Error("No data found in the spreadsheet");

  const headers = Object.keys(data[0]);

  // ── Find best-matching template (case-insensitive + alias-aware) ──
  let bestTemplate: Template | null = null;
  let maxMatches = 0;

  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  for (const cat in TEMPLATES) {
    for (const tpl of TEMPLATES[cat]) {
      if (!tpl.columns.length) continue; // skip "Blank Register"
      let matchCount = 0;
      for (const tc of tpl.columns) {
        const tcLower = tc.name.toLowerCase().trim();
        // Exact match or header-contains-template or template-contains-header
        if (normalizedHeaders.some(nh =>
          nh === tcLower ||
          nh.includes(tcLower) ||
          tcLower.includes(nh)
        )) {
          matchCount++;
        }
      }
      if (matchCount > maxMatches && matchCount >= 2) {
        maxMatches = matchCount;
        bestTemplate = tpl;
      }
    }
  }

  // ── Build column definitions ──
  // Filter out 'S.No.' if it's the first column (likely from a previous export)
  const filteredHeaders = headers.filter((h, i) => i > 0 || (h.toLowerCase() !== 's.no.' && h.toLowerCase() !== 's.no'));

  const columns = filteredHeaders.map((h, i) => {
    // Collect sample values for this column from the data
    const sampleValues = data.slice(0, 30).map(row => row[h]);

    let resolved: any;
    if (metadata) {
      const meta = metadata.find(m => m['Column Name'] === h);
      if (meta) {
        const parsedWidth = meta['Width'] ? parseInt(meta['Width']) : undefined;
        resolved = {
          type: meta['Type'] || 'text',
          dropdownOptions: meta['Dropdown Options'] ? meta['Dropdown Options'].split(',').filter(Boolean) : undefined,
          formula: meta['Formula'] || undefined,
          width: isNaN(parsedWidth as any) ? undefined : parsedWidth,
          summary: meta['Summary'] || undefined
        };
      }
    }

    if (!resolved) {
      resolved = resolveColumnType(h, bestTemplate, sampleValues);
    }

    return {
      name: h || `Column ${i + 1}`,
      type: resolved.type,
      dropdownOptions: resolved.dropdownOptions,
      formula: resolved.formula,
      width: resolved.width,
      summary: resolved.summary,
    };
  });

  const summary = await createRegister({ businessId, folderId, name, columns: columns as any });
  const createdReg = await getRegister(summary.id);

  // Clear the 3 default empty rows that createRegister adds, then populate from Excel data.
  // Work with the cached copy directly — no redundant getRegDoc round-trip needed.
  createdReg.entries = [];

  // Identify if there is an S.No column to preserve row numbering
  const sNoHeader = headers.find((h, i) => i === 0 && (h.toLowerCase() === 's.no.' || h.toLowerCase() === 's.no' || h.toLowerCase() === 'sr.no' || h.toLowerCase() === 'sr.no.'));

  data.forEach((row, rowIndex) => {
    const cells: Record<string, string> = {};
    createdReg.columns.forEach((col) => {
      let val = row[col.name];
      if (val !== undefined && val !== null && val !== '') {
        // If SheetJS mistakenly converted a small serial number (like 1, 2, 3) to a 1900 date string (like "01/01/1900" or "01-01-1900"),
        // convert it back to the original serial number to prevent it from saving as a date.
        const sVal = String(val).trim();
        const dateMatch = sVal.replace(/[\/.]/g, '-').match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        const dateMatchYMD = sVal.replace(/[\/.]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        
        let is1900Date = false;
        let day = 1, month = 1, year = 1900;
        
        if (dateMatch) {
          day = parseInt(dateMatch[1]);
          month = parseInt(dateMatch[2]);
          year = parseInt(dateMatch[3]);
          if (year === 1900) is1900Date = true;
        } else if (dateMatchYMD) {
          year = parseInt(dateMatchYMD[1]);
          month = parseInt(dateMatchYMD[2]);
          day = parseInt(dateMatchYMD[3]);
          if (year === 1900) is1900Date = true;
        }
        
        if (is1900Date) {
          const monthDays = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
          let serial = day;
          for (let m = 1; m < month; m++) {
            serial += monthDays[m];
          }
          val = serial.toString();
        }

        // Use unified date formatter for consistency across import, display, and storage
        if (col.type === 'date') {
          val = formatDateToDDMMYYYY(val);
        }
        cells[col.id.toString()] = String(val);
      }
    });

    let rowNumber = rowIndex + 1;
    if (sNoHeader && row[sNoHeader]) {
      const parsed = parseInt(String(row[sNoHeader]));
      if (!isNaN(parsed)) rowNumber = parsed;
    }

    // Stable ID: use offset to avoid Number.MAX_SAFE_INTEGER precision loss.
    createdReg.entries.push({
      id: createdReg.id + 10000 + rowIndex,
      registerId: createdReg.id,
      rowNumber,
      cells,
      createdAt: new Date().toISOString(),
      pageIndex: 0,
    });
  });

  createdReg.entryCount = createdReg.entries.length;
  await saveRegDocImmediate(createdReg, true);
  return createdReg;
};

// ─── Formula Engine ──────────────────────────────────────────────────────────
// Supports: {Column Name} references, +  -  *  /  ()  ^  %  Math functions

function parseAndEval(expr: string): number {
  expr = expr.trim();
  let pos = 0;

  function peek(): string { return expr[pos] || ''; }
  function consume(): string { return expr[pos++] || ''; }
  function skipWS() { while (pos < expr.length && expr[pos] === ' ') pos++; }

  function parseExpr(): number { return parseAddSub(); }

  function parseAddSub(): number {
    let left = parseMulDiv();
    skipWS();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      skipWS();
      const right = parseMulDiv();
      left = op === '+' ? left + right : left - right;
      skipWS();
    }
    return left;
  }

  function parseMulDiv(): number {
    let left = parsePow();
    skipWS();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      skipWS();
      const right = parsePow();
      if (op === '/' && right === 0) return NaN;
      left = op === '*' ? left * right : left / right;
      skipWS();
    }
    return left;
  }

  function parsePow(): number {
    const base = parseUnary();
    skipWS();
    if (peek() === '^') {
      consume();
      skipWS();
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    skipWS();
    if (peek() === '-') { consume(); return -parsePrimary(); }
    if (peek() === '+') { consume(); return parsePrimary(); }
    return parsePrimary();
  }

  function parseNumber(): number {
    let num = '';
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) { num += consume(); }
    return parseFloat(num) || 0;
  }

  const MATH_FNS: Record<string, (a: number) => number> = {
    abs: Math.abs, sqrt: Math.sqrt, ceil: Math.ceil, floor: Math.floor,
    round: Math.round, log: Math.log, log10: Math.log10,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
  };

  function parsePrimary(): number {
    skipWS();
    if (peek() === '(') {
      consume();
      const val = parseExpr();
      skipWS();
      if (peek() === ')') consume();
      return val;
    }
    if (/[a-zA-Z]/.test(peek())) {
      let name = '';
      while (pos < expr.length && /[a-zA-Z0-9_]/.test(expr[pos])) { name += consume(); }
      skipWS();
      if (peek() === '(') {
        consume();
        const arg = parseExpr();
        skipWS();
        if (peek() === ')') consume();
        const fn = MATH_FNS[name.toLowerCase()];
        if (fn) return fn(arg);
        return 0;
      }
      return 0;
    }
    return parseNumber();
  }

  return parseExpr();
}

const _sortedColumnsCache = new WeakMap<any[], any[]>();
const _regexCache = new Map<string, RegExp>();
function getColumnRegex(name: string): RegExp {
  const cached = _regexCache.get(name);
  if (cached) return cached;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('\\{' + escaped + '\\}', 'gi');
  _regexCache.set(name, regex);
  return regex;
}

// Cache evaluated formulas per entry object to avoid redundant heavy calculations (especially in stats loops)
let _formulaResultCache = new WeakMap<Entry, Map<string, string>>();
let _lastColumnsRef: Column[] | null = null;

export function evaluateFormula(formula: string, entry: Entry, columns: Column[]): string {
  if (!formula || formula.trim() === '') return '';

  // Invalidate and clear formula result cache if columns list changed (reordered, added, deleted, renamed, or modified)
  if (columns !== _lastColumnsRef) {
    _lastColumnsRef = columns;
    _formulaResultCache = new WeakMap<Entry, Map<string, string>>();
  }

  // Check cache first
  let entryCache = _formulaResultCache.get(entry);
  if (!entryCache) {
    entryCache = new Map<string, string>();
    _formulaResultCache.set(entry, entryCache);
  }
  const cachedResult = entryCache.get(formula);
  if (cachedResult !== undefined) return cachedResult;

  try {
    let sorted = _sortedColumnsCache.get(columns);
    if (!sorted) {
      sorted = [...columns].sort((a, b) => b.name.length - a.name.length);
      _sortedColumnsCache.set(columns, sorted);
    }

    let expression = formula;
    // Check if formula contains any curly braces before doing expensive replacements
    if (!expression.includes('{')) {
      const result = parseAndEval(expression);
      return (typeof result === 'number' && isFinite(result)) ? result.toString() : '';
    }

    for (const col of sorted) {
      const colPlaceholder = `{${col.name}}`;
      if (!expression.toLowerCase().includes(colPlaceholder.toLowerCase())) continue;

      const regex = getColumnRegex(col.name);
      const rawVal = entry.cells?.[col.id.toString()] ?? '';
      let numStr: string;

      if (col.type === 'formula' && col.formula) {
        const nested = evaluateFormula(col.formula, entry, columns);
        numStr = (nested === '') ? '0' : nested;
      } else {
        // Strip currency symbols and commas first
        const cleaned = rawVal.replace(/[₹$,]/g, '').trim();
        // Ignore values with suffixes like "x" in calculations
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
          numStr = parseFloat(cleaned).toString();
        } else {
          numStr = '0';
        }
      }
      expression = expression.replace(regex, numStr);
    }

    expression = expression.replace(/\{[^}]*\}/g, '0');
    expression = expression.trim();
    if (expression === '') return '';

    let finalResult = '';
    const result = parseAndEval(expression);
    if (typeof result === 'number' && isFinite(result)) {
      if (Number.isInteger(result)) {
        finalResult = result.toString();
      } else {
        const fixed = parseFloat(result.toFixed(2));
        finalResult = fixed.toString();
      }
    }

    entryCache.set(formula, finalResult);
    return finalResult;
  } catch {
    entryCache.set(formula, '');
    return '';
  }
}


// ─── Column Operations ──────────────────────────────────────────────────────

export async function addColumn(registerId: number, data: { name: string; type: string; dropdownOptions?: string[]; formula?: string }): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    reg.columns.sort((a, b) => a.position - b.position); // ensure canonical order
    const colId = generateId();
    const col: Column = {
      id: colId, registerId, name: data.name, type: data.type,
      position: reg.columns.length, dropdownOptions: data.dropdownOptions, formula: data.formula,
    };
    reg.columns.push(col);
    reg.columns.forEach((c, i) => c.position = i); // re-normalise
    if (data.type === 'auto_increment') {
      populateAutoIncrement(reg, colId);
    }
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Add Column', `Added column "${data.name}" (${data.type}) to "${reg.name}"`, { registerId, registerName: reg.name });
    return reg;
  });
}

export async function deleteColumn(registerId: number, columnId: number): Promise<RegisterDetail> {
  const result = await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find(c => c.id.toString() === columnId.toString());
    if (!col) return { reg };
    if (col.type === 'formula') {
      throw new Error('Formula columns cannot be deleted');
    }
    const colName = col.name;
    const linkedTo = col.linkedTo;

    // Collect cell data for this column before removing
    const columnCellData: Record<string, string> = {};
    reg.entries.forEach((e) => {
      const val = e.cells?.[columnId.toString()];
      if (val !== undefined && val !== '') {
        columnCellData[e.id.toString()] = val;
      }
    });

    // Move to bin
    const savedUser = JSON.parse(
      sessionStorage.getItem('recordbook_user') ||
      'null'
    );
    if (!reg.deletedItems) reg.deletedItems = [];
    reg.deletedItems.push({
      id: generateId(),
      type: 'column',
      deletedAt: new Date().toISOString(),
      registerName: reg.name,
      registerId: reg.id,
      column: { ...col },
      columnCellData,
      deletedBy: savedUser?.name || 'User',
      deletedByEmail: savedUser?.email || '',
      deletedById: savedUser?.id || '',
    });

    reg.columns = reg.columns.filter((c) => c.id.toString() !== columnId.toString());
    reg.columns.sort((a, b) => a.position - b.position); // ensure canonical order before re-normalise
    reg.columns.forEach((c, i) => c.position = i);
    // Cleanup entry data
    reg.entries.forEach((e) => { if (e.cells) delete e.cells[columnId.toString()]; });
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Delete Column', `Deleted column "${colName}" from "${reg.name}"`, { registerId, registerName: reg.name });
    return { reg, linkedTo };
  });

  const { reg, linkedTo } = result;

  if (linkedTo) {
    // Run queued mutation on counterpart register to clear the reference
    await runQueuedMutation(linkedTo.registerId, async () => {
      const targetReg = await getRegDoc(linkedTo.registerId);
      const targetCol = targetReg.columns.find(c => c.id === linkedTo.columnId);
      if (targetCol) {
        delete targetCol.linkedTo;
        await saveRegDocImmediate(targetReg);
      }
    }).catch(e => console.error("Failed to clean up counterpart linkedTo on column delete:", e));
  }

  return reg;
}

/**
 * Restore a previously deleted column with all its cell data.
 * Uses splice at the exact original position so the column lands
 * back in the correct slot, then re-normalises all positions.
 */
export async function restoreColumn(
  registerId: number,
  column: Column,
  cellData: Record<string, string>,  // entryId -> cellValue
): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);

    // Splice at the exact original index (clamped to current length)
    reg.columns.sort((a, b) => a.position - b.position); // ensure canonical order
    const insertAt = Math.min(column.position, reg.columns.length);
    reg.columns.splice(insertAt, 0, column);

    // Re-normalise positions so they're 0, 1, 2, …
    reg.columns.forEach((c, i) => c.position = i);

    // Restore cell data for this column across all entries
    const colIdStr = column.id.toString();
    reg.entries.forEach(e => {
      const val = cellData[e.id.toString()];
      if (val !== undefined) {
        if (!e.cells) e.cells = {};
        e.cells[colIdStr] = val;
      }
    });

    await saveRegDocImmediate(reg, true);
    return reg;
  });
}

export async function renameColumn(
  registerId: number,
  columnId: number,
  newName: string,
  preventSync?: boolean
): Promise<RegisterDetail> {
  const result = await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');
    const oldName = col.name;
    col.name = newName;
    updateColumnSymbol(col, col.type);
    const finalNewName = col.name;

    // Update any formulas referencing this column name
    if (oldName !== finalNewName) {
      const escapedOldName = oldName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\{${escapedOldName}\\}`, 'gi');
      reg.columns.forEach((c) => {
        if (c.type === 'formula' && c.formula) {
          c.formula = c.formula.replace(regex, `{${finalNewName}}`);
        }
      });
    }

    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Rename Column', `Renamed column "${oldName}" to "${finalNewName}" in "${reg.name}"`, { registerId, registerName: reg.name });
    return { reg, col, finalNewName };
  });

  const { reg, col, finalNewName } = result;

  if (!preventSync && col.linkedTo) {
    await renameColumn(col.linkedTo.registerId, col.linkedTo.columnId, finalNewName, true)
      .catch(e => console.error("Failed to sync column rename change:", e));
  }

  return reg;
}

export async function updateColumnDropdownOptions(
  registerId: number,
  columnId: number,
  options: string[],
  preventSync?: boolean
): Promise<RegisterDetail> {
  const result = await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');
    col.dropdownOptions = options;
    await saveRegDocImmediate(reg);
    return { reg, col };
  });

  const { reg, col } = result;

  if (!preventSync && col.linkedTo) {
    await updateColumnDropdownOptions(col.linkedTo.registerId, col.linkedTo.columnId, options, true)
      .catch(e => console.error("Failed to sync column dropdown options change:", e));
  }

  return reg;
}

export async function duplicateColumn(registerId: number, columnId: number): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    reg.columns.sort((a, b) => a.position - b.position); // ensure canonical order
    const original = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!original) throw new Error('Column not found');
    const newColId = generateId();
    const newCol: Column = {
      ...original,
      id: newColId,
      name: `${original.name} (Copy)`,
      position: reg.columns.length,
    };
    reg.columns.push(newCol);
    reg.columns.forEach((c, i) => c.position = i); // re-normalise
    reg.entries.forEach((entry) => {
      const val = entry.cells?.[columnId.toString()];
      if (val !== undefined) {
        if (!entry.cells) entry.cells = {};
        entry.cells[newColId.toString()] = val;
      }
    });
    await saveRegDocImmediate(reg, true);
    return reg;
  });
}

export async function moveColumn(registerId: number, columnId: number, direction: 'left' | 'right'): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    reg.columns.sort((a, b) => a.position - b.position); // ensure array index === position
    const idx = reg.columns.findIndex((c) => c.id.toString() === columnId.toString());
    if (idx === -1) throw new Error('Column not found');
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < reg.columns.length) {
      [reg.columns[idx], reg.columns[targetIdx]] = [reg.columns[targetIdx], reg.columns[idx]];
      reg.columns.forEach((c, i) => c.position = i);
      await saveRegDocImmediate(reg);
    }
    return reg;
  });
}

export async function updateColumnWidth(registerId: number, columnId: number, width: number): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (col) {
      col.width = width;
      await saveRegDocImmediate(reg);
    }
    return reg;
  });
}

export async function updateColumnSummary(registerId: number, columnId: number, summary: string): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (col) {
      col.summary = summary;
      await saveRegDocImmediate(reg);
    }
    return reg;
  });
}

export async function updateColumnBgColor(registerId: number, columnId: number, bgColor: string | undefined): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (col) {
      if (bgColor) {
        col.bgColor = bgColor;
      } else {
        delete col.bgColor;
      }
      await saveRegDocImmediate(reg);
    }
    return reg;
  });
}

export async function reorderColumn(registerId: number, columnId: number, targetIndex: number): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    reg.columns.sort((a, b) => a.position - b.position); // ensure array index === position
    const idx = reg.columns.findIndex((c) => c.id.toString() === columnId.toString());
    if (idx === -1) throw new Error('Column not found');

    // Remove the column from its original position
    const [col] = reg.columns.splice(idx, 1);

    // Insert it at the target position
    const clampedTarget = Math.max(0, Math.min(targetIndex, reg.columns.length));
    reg.columns.splice(clampedTarget, 0, col);

    // Update the position properties
    reg.columns.forEach((c, i) => c.position = i);

    await saveRegDocImmediate(reg);
    return reg;
  });
}

export async function changeColumnType(
  registerId: number,
  columnId: number,
  newType: string,
  options?: { formula?: string; dropdownOptions?: string[] },
  preventSync?: boolean
): Promise<RegisterDetail> {
  const result = await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');

    const oldType = col.type;
    col.type = newType;
    updateColumnSymbol(col, newType);

    // Reset specific fields when changing type
    if (newType === 'formula') {
      col.formula = options?.formula;
    } else {
      col.formula = undefined;
    }

    if (newType === 'dropdown') {
      col.dropdownOptions = options?.dropdownOptions;
    } else {
      col.dropdownOptions = undefined;
    }

    // Dynamic Column Formatting Logic: Clean data when switching to currency
    if (newType === 'currency') {
      const colIdStr = columnId.toString();
      reg.entries.forEach(entry => {
        const val = entry.cells?.[colIdStr];
        if (val) {
          // Strip common currency symbols and commas to keep it numeric
          const cleaned = val.replace(/[₹$,]/g, '').trim();
          // If it looks like a valid number after cleaning, save it cleaned
          if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
            if (!entry.cells) entry.cells = {};
            entry.cells[colIdStr] = cleaned;
          }
        }
      });
    }

    // Auto-populate existing rows if switching TO auto_increment
    if (newType === 'auto_increment' && oldType !== 'auto_increment') {
      populateAutoIncrement(reg, columnId);
    }

    // Only rewrite ALL chunks when entry data is actually modified (currency
    // cleaning or auto_increment population). For simple type changes
    // (text→dropdown, etc.) only update the main document metadata — this
    // prevents overwriting chunks that may have been recently written by
    // updateEntryDirect, fixing the race condition that causes cell edits to
    // be lost.
    const entryDataModified = (newType === 'currency') ||
                               (newType === 'auto_increment' && oldType !== 'auto_increment');
    if (entryDataModified) {
      await saveRegDocImmediate(reg, true);
    } else {
      await saveMainDocOnly(reg);
    }
    await logAction(reg.businessId, 'Change Column Type', `Changed column "${col.name}" type from "${oldType}" to "${newType}" in "${reg.name}"`, { registerId, registerName: reg.name });
    return { reg, col };
  });

  const { reg, col } = result;

  if (!preventSync && col.linkedTo) {
    await changeColumnType(col.linkedTo.registerId, col.linkedTo.columnId, newType, options, true)
      .catch(e => console.error("Failed to sync column type change:", e));
  }

  return reg;
}

export async function setColumnMandatory(registerId: number, columnId: number, mandatory: boolean): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');
    (col as any).mandatory = mandatory;
    await saveRegDocImmediate(reg);
    return reg;
  });
}

export async function setColumnUnique(registerId: number, columnId: number, unique: boolean): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');
    (col as any).unique = unique;
    await saveRegDocImmediate(reg);
    return reg;
  });
}

export async function setColumnDoubleEntryWarning(registerId: number, columnId: number, doubleEntryWarning: boolean): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id.toString() === columnId.toString());
    if (!col) throw new Error('Column not found');
    (col as any).doubleEntryWarning = doubleEntryWarning;
    await saveRegDocImmediate(reg);
    return reg;
  });
}

export async function clearColumnData(registerId: number, columnId: number): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const colIdStr = columnId.toString();
    reg.entries.forEach((entry) => {
      if (entry.cells) delete entry.cells[colIdStr];
    });
    await saveRegDocImmediate(reg);
    return reg;
  });
}

export async function insertColumn(registerId: number, data: { name: string; type: string; dropdownOptions?: string[]; formula?: string }, position: number): Promise<RegisterDetail> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const colId = generateId();
    const col: Column = {
      id: colId, registerId, name: data.name, type: data.type,
      position, dropdownOptions: data.dropdownOptions, formula: data.formula,
    };
    updateColumnSymbol(col, data.type);
    reg.columns.sort((a, b) => a.position - b.position); // ensure array index === position
    reg.columns.splice(position, 0, col);
    reg.columns.forEach((c, i) => c.position = i);
    if (data.type === 'auto_increment') {
      populateAutoIncrement(reg, colId);
    }
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Add Column', `Added column "${data.name}" (${data.type}) to "${reg.name}"`, { registerId, registerName: reg.name });
    return reg;
  });
}

export async function freezeColumn(registerId: number, columnId: number, frozen: boolean): Promise<Column> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id === columnId);
    if (!col) return {} as any;
    (col as any).frozen = frozen;
    await saveRegDocImmediate(reg);
    return col;
  });
}

export async function hideColumn(registerId: number, columnId: number, hidden: boolean): Promise<Column> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find((c) => c.id === columnId);
    if (!col) return {} as any;
    (col as any).hidden = hidden;
    await saveRegDocImmediate(reg);
    return col;
  });
}

// ─── Entry Operations ────────────────────────────────────────────────────────

export async function addEntry(registerId: number, cells: Record<string, string> = {}, pageIndex: number = 0): Promise<Entry> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const pageEntries = reg.entries.filter((e) => (e.pageIndex || 0) === pageIndex);

    const autoIncrCols = reg.columns.filter(c => c.type === 'auto_increment');
    for (const col of autoIncrCols) {
      const colIdStr = col.id.toString();
      if (!cells[colIdStr]) {
        let maxVal = 0;
        for (const e of pageEntries) {
          const v = parseInt(e.cells?.[colIdStr] || '0', 10);
          if (!isNaN(v) && v > maxVal) maxVal = v;
        }
        cells[colIdStr] = (maxVal + 1).toString();
      }
    }

    const entry: Entry = {
      id: generateId(), registerId, rowNumber: reg.entries.length + 1,
      cells, createdAt: new Date().toISOString(), pageIndex,
    };
    
    const res = await fetch(`/api/registers/${registerId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('Failed to add entry');

    reg.entries.push(entry);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    firestoreRegisterCache.set(reg.id, reg);

    const preview = Object.entries(cells).slice(0, 3).map(([id, val]) => {
      const c = reg.columns.find(col => col.id.toString() === id);
      return `${c?.name || id}: ${val}`;
    }).join(', ');
    logAction(reg.businessId, 'Add Row', `Added new row to "${reg.name}"${preview ? ` (${preview}...)` : ''}`, { registerId, registerName: reg.name, entryId: entry.id }).catch(() => {});

    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of targetRegIds) {
      await _syncAddRow(targetRegId);
    }

    for (const [colIdStr, value] of Object.entries(cells)) {
      if (value === undefined || value === null) continue;
      const col = reg.columns.find(c => c.id.toString() === colIdStr);
      if (col?.linkedTo && col.linkedTo.role === 'source') {
        await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, entry.rowNumber, value);
      }
    }

    return entry;
  });
}

/**
 * Inserts a new entry at a specific index within the register's entry array.
 * Automatically shifts rowNumbers for subsequent entries in the same page.
 */
export async function insertEntry(registerId: number, cells: Record<string, string> = {}, pageIndex: number = 0, atIndex: number): Promise<Entry> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const pageEntries = reg.entries.filter((e) => (e.pageIndex || 0) === pageIndex);

    const autoIncrCols = reg.columns.filter(c => c.type === 'auto_increment');
    for (const col of autoIncrCols) {
      const colIdStr = col.id.toString();
      if (!cells[colIdStr]) {
        let maxVal = 0;
        for (const e of pageEntries) {
          const v = parseInt(e.cells?.[colIdStr] || '0', 10);
          if (!isNaN(v) && v > maxVal) maxVal = v;
        }
        cells[colIdStr] = (maxVal + 1).toString();
      }
    }

    const entry: Entry = {
      id: generateId(), registerId, rowNumber: atIndex + 1,
      cells, createdAt: new Date().toISOString(), pageIndex,
    };

    const res = await fetch(`/api/registers/${registerId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!res.ok) throw new Error('Failed to insert entry');

    reg.entries.splice(atIndex, 0, entry);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    firestoreRegisterCache.set(reg.id, reg);
    await saveRegDocImmediate(reg);

    const preview = Object.entries(cells).slice(0, 3).map(([id, val]) => {
      const c = reg.columns.find(col => col.id.toString() === id);
      return `${c?.name || id}: ${val}`;
    }).join(', ');
    await logAction(reg.businessId, 'Insert Row', `Inserted row at position ${atIndex + 1} in "${reg.name}"${preview ? ` (${preview}...)` : ''}`, { registerId, registerName: reg.name, entryId: entry.id });

    const insertTargetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        insertTargetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of insertTargetRegIds) {
      await _syncInsertRow(targetRegId, atIndex);
    }

    for (const [colIdStr, value] of Object.entries(cells)) {
      if (value === undefined || value === null) continue;
      const col = reg.columns.find(c => c.id.toString() === colIdStr);
      if (col?.linkedTo && col.linkedTo.role === 'source') {
        await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, entry.rowNumber, value);
      }
    }

    return entry;
  });
}


export async function updateEntry(registerId: number, entryId: number, cells: Record<string, string>): Promise<Entry> {
  const reg = await getRegDoc(registerId);
  const entryIndex = reg.entries.findIndex((e) => e.id === entryId);
  if (entryIndex === -1) throw new Error('Entry not found');
  const entry = reg.entries[entryIndex];

  const autoColIds = new Set(reg.columns.filter(c => c.type === 'auto_increment').map(c => c.id.toString()));
  const safeCells = Object.fromEntries(
    Object.entries(cells).filter(([colId]) => !autoColIds.has(colId))
  );

  const oldCells = { ...entry.cells };
  entry.cells = { ...entry.cells, ...safeCells };

  const res = await fetch(`/api/registers/${registerId}/entries/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells: entry.cells, cellStyles: entry.cellStyles, pageIndex: entry.pageIndex, rowNumber: entry.rowNumber })
  });
  if (!res.ok) throw new Error('Failed to update entry');

  firestoreRegisterCache.set(reg.id, reg);

  const changes = Object.entries(safeCells)
    .filter(([id, val]) => (oldCells[id] || '') !== (val || ''))
    .map(([id, val]) => {
      const c = reg.columns.find(col => col.id.toString() === id);
      const colName = c?.name || id;
      const oldVal = oldCells[id] || '';
      const newVal = val || '';
      return `${colName} changed from "${oldVal}" to "${newVal}"`;
    }).join(', ');

  const details = changes
    ? `Updated row #${entry.rowNumber} in "${reg.name}": ${changes}`
    : `Updated row #${entry.rowNumber} in "${reg.name}"`;
  await logAction(reg.businessId, 'Edit Row', details, { registerId, registerName: reg.name, entryId });

  for (const [colIdStr, value] of Object.entries(cells)) {
    const col = reg.columns.find(c => c.id.toString() === colIdStr);
    if (col?.linkedTo && col.linkedTo.role === 'source') {
      await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, entry.rowNumber, value);
    }
  }

  return entry;
}

/**
 * Lightweight cell update: patches the in-memory cache and writes ONLY the
 * affected chunk to Firestore — instead of rewriting every chunk.
 * Used by the debounced cell-edit handler for maximum speed during rapid data entry.
 */
export async function updateEntryDirect(
  registerId: number,
  entryId: number,
  cells: Record<string, string>
): Promise<Entry | null> {
  return updateEntry(registerId, entryId, cells);
}

function ensureTargetRows(targetReg: RegisterDetail, maxRowNumber: number) {
  targetReg.entries.sort((a, b) => Number(a.rowNumber) - Number(b.rowNumber));

  for (let r = 1; r <= maxRowNumber; r++) {
    const entry = targetReg.entries.find(e => Number(e.rowNumber) === Number(r));
    if (!entry) {
      const newEntry: Entry = {
        id: generateId(),
        registerId: targetReg.id,
        rowNumber: r,
        cells: {},
        createdAt: new Date().toISOString(),
        pageIndex: 0
      };
      
      const insertIdx = targetReg.entries.findIndex(e => Number(e.rowNumber) > Number(r));
      if (insertIdx === -1) {
        targetReg.entries.push(newEntry);
      } else {
        targetReg.entries.splice(insertIdx, 0, newEntry);
      }
    }
  }
  renumberRows(targetReg);
  targetReg.entryCount = targetReg.entries.length;
}

async function _syncAddRow(targetRegisterId: number) {
  return runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    const newRowNumber = reg.entries.length + 1;
    const newEntry: Entry = {
      id: generateId(),
      registerId: targetRegisterId,
      rowNumber: newRowNumber,
      cells: {},
      createdAt: new Date().toISOString(),
      pageIndex: 0
    };

    const res = await fetch(`/api/registers/${targetRegisterId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry)
    });
    if (!res.ok) throw new Error('Failed to add entry in sync');

    reg.entries.push(newEntry);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
  }).catch(e => console.error('Failed to sync add row:', e));
}

async function _syncInsertRow(targetRegisterId: number, atIndex: number) {
  return runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    
    ensureTargetRows(reg, atIndex);

    const newEntry: Entry = {
      id: generateId(),
      registerId: targetRegisterId,
      rowNumber: atIndex + 1,
      cells: {},
      createdAt: new Date().toISOString(),
      pageIndex: 0
    };

    const res = await fetch(`/api/registers/${targetRegisterId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry)
    });
    if (!res.ok) throw new Error('Failed to insert entry in sync');

    reg.entries.splice(atIndex, 0, newEntry);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
  }).catch(e => console.error('Failed to sync insert row:', e));
}

async function _syncDeleteRow(targetRegisterId: number, rowNumber: number) {
  return runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    const entryIndex = reg.entries.findIndex((e) => Number(e.rowNumber) === Number(rowNumber));
    if (entryIndex === -1) return;
    const entry = reg.entries[entryIndex];

    const res = await fetch(`/api/registers/${targetRegisterId}/entries/${entry.id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete entry in sync');

    reg.entries.splice(entryIndex, 1);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
  }).catch(e => console.error('Failed to sync delete row:', e));
}

async function _syncBulkDeleteRows(targetRegisterId: number, rowNumbers: number[]) {
  return runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    const rowSet = new Set(rowNumbers.map(Number));
    
    const entriesToDelete = reg.entries.filter(e => rowSet.has(Number(e.rowNumber)));
    if (entriesToDelete.length === 0) return;

    for (const entry of entriesToDelete) {
      await fetch(`/api/registers/${targetRegisterId}/entries/${entry.id}`, {
        method: 'DELETE'
      });
    }

    const idsToDelete = new Set(entriesToDelete.map(e => e.id));
    reg.entries = reg.entries.filter(e => !idsToDelete.has(e.id));
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
  }).catch(e => console.error('Failed to sync bulk delete rows:', e));
}

async function _syncReorderRows(targetRegisterId: number, originalRowNumbersOrder: number[]) {
  return runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    
    const entryMap = new Map<number, Entry>();
    reg.entries.forEach(e => {
      entryMap.set(Number(e.rowNumber), e);
    });

    const newEntries: Entry[] = [];
    const usedIds = new Set<number>();

    originalRowNumbersOrder.forEach(rn => {
      const entry = entryMap.get(Number(rn));
      if (entry) {
        newEntries.push(entry);
        usedIds.add(entry.id);
      }
    });

    reg.entries.forEach(entry => {
      if (!usedIds.has(entry.id)) {
        newEntries.push(entry);
      }
    });

    reg.entries = newEntries;
    renumberRows(reg);
    reg.updatedAt = new Date().toISOString();
    await saveRegDocImmediate(reg, true);
  }).catch(e => console.error('Failed to sync reorder rows:', e));
}

// Internal helper to sync
async function _syncLinkedColumn(targetRegisterId: number, targetColumnId: number, rowNumber: number, value: string) {
  return runQueuedMutation(targetRegisterId, async () => {
    const targetReg = await getRegDoc(targetRegisterId);
    ensureTargetRows(targetReg, rowNumber);
    let targetEntry = targetReg.entries.find(e => Number(e.rowNumber) === Number(rowNumber));
    if (targetEntry) {
      if (!targetEntry.cells) targetEntry.cells = {};
      targetEntry.cells[targetColumnId.toString()] = value;
      targetReg.updatedAt = new Date().toISOString();
      await saveRegDocImmediate(targetReg);
    }
  }).catch(e => console.error('Failed to sync linked column:', e));
}

export async function linkColumn(
  registerId: number,
  columnId: number,
  targetRegisterId: number,
  targetColumnId: number
): Promise<void> {
  // 1. Fetch source register to extract the column's entries and metadata
  let sourceEntriesData: { rowNumber: number; value: string }[] = [];
  let sourceColName = '';
  let sourceColType = '';
  let sourceColDropdownOptions: string[] | undefined;
  let sourceMaxRowNumber = 0;
  
  await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find(c => c.id === columnId);
    if (col) {
      col.linkedTo = { registerId: targetRegisterId, columnId: targetColumnId, role: 'source' };
      // Capture source column metadata
      sourceColName = col.name;
      sourceColType = col.type;
      sourceColDropdownOptions = col.dropdownOptions;
      sourceMaxRowNumber = reg.entries.length;
      // Gather existing values
      const colIdStr = columnId.toString();
      reg.entries.forEach(e => {
        const val = e.cells?.[colIdStr];
        if (val !== undefined) {
          sourceEntriesData.push({ rowNumber: e.rowNumber, value: val });
        }
      });
      await saveRegDocImmediate(reg);
    }
  });

  // 2. Update target register: set the metadata, sync name/type, and copy the entries
  await runQueuedMutation(targetRegisterId, async () => {
    const reg = await getRegDoc(targetRegisterId);
    const col = reg.columns.find(c => c.id === targetColumnId);
    if (col) {
      col.linkedTo = { registerId, columnId, role: 'target' };
      // Sync column name and type from source
      if (sourceColName) col.name = sourceColName;
      if (sourceColType) col.type = sourceColType;
      if (sourceColDropdownOptions) col.dropdownOptions = sourceColDropdownOptions;
      
      // Ensure target register has contiguous rows up to sourceMaxRowNumber
      ensureTargetRows(reg, sourceMaxRowNumber);

      const targetColIdStr = targetColumnId.toString();

      // Clear existing data in target column before applying source data
      reg.entries.forEach(e => {
        if (e.cells && targetColIdStr in e.cells) {
          delete e.cells[targetColIdStr];
        }
      });

      sourceEntriesData.forEach(({ rowNumber, value }) => {
        let targetEntry = reg.entries.find(e => Number(e.rowNumber) === Number(rowNumber));
        if (targetEntry) {
          if (!targetEntry.cells) targetEntry.cells = {};
          targetEntry.cells[targetColIdStr] = value;
        }
      });
      
      // Update target register entry count
      reg.entryCount = reg.entries.length;
      await saveRegDocImmediate(reg);
    }
  });
}


export async function unlinkColumn(
  registerId: number,
  columnId: number,
  clearData?: boolean
): Promise<void> {
  let targetRegisterId: number | undefined;
  let targetColumnId: number | undefined;

  // 1. Clear linkedTo on current column and optionally clear data
  await runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const col = reg.columns.find(c => c.id === columnId);
    if (col && col.linkedTo) {
      targetRegisterId = col.linkedTo.registerId;
      targetColumnId = col.linkedTo.columnId;
      delete col.linkedTo;
      if (clearData) {
        const colIdStr = columnId.toString();
        reg.entries.forEach(entry => {
          if (entry.cells) delete entry.cells[colIdStr];
        });
      }
      await saveRegDocImmediate(reg);
    }
  });

  // 2. Clear linkedTo on target/other column if found
  if (targetRegisterId !== undefined && targetColumnId !== undefined) {
    const finalTargetRegisterId: number = targetRegisterId;
    const finalTargetColumnId: number = targetColumnId;
    await runQueuedMutation(finalTargetRegisterId, async () => {
      const reg = await getRegDoc(finalTargetRegisterId);
      const col = reg.columns.find(c => c.id === finalTargetColumnId);
      if (col) {
        delete col.linkedTo;
        if (clearData) {
          const colIdStr = finalTargetColumnId.toString();
          reg.entries.forEach(entry => {
            if (entry.cells) delete entry.cells[colIdStr];
          });
        }
        await saveRegDocImmediate(reg);
      }
    });
  }
}



export async function updateEntryCellStyles(registerId: number, entryId: number, cellStyles: Record<string, CellStyle>): Promise<Entry> {
  const reg = await getRegDoc(registerId);
  const entry = reg.entries.find((e) => e.id === entryId);
  if (!entry) throw new Error('Entry not found');

  entry.cellStyles = { ...(entry.cellStyles || {}), ...cellStyles };

  const res = await fetch(`/api/registers/${registerId}/entries/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells: entry.cells, cellStyles: entry.cellStyles, pageIndex: entry.pageIndex, rowNumber: entry.rowNumber })
  });
  if (!res.ok) throw new Error('Failed to update cell styles');

  firestoreRegisterCache.set(reg.id, reg);
  return entry;
}

export async function updateEntriesOrder(registerId: number, sortedEntries: Entry[]): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    
    // Capture original row numbers of entries in their new sequence
    const reorderMapping = sortedEntries.map(sortedEntry => {
      const originalEntry = reg.entries.find(e => e.id === sortedEntry.id);
      return originalEntry ? originalEntry.rowNumber : null;
    }).filter((rn): rn is number => rn !== null);

    // Overwrite the entire entries array with the new sorted array
    reg.entries = sortedEntries;
    renumberRows(reg); // Update row numbers to match the new order
    reg.updatedAt = new Date().toISOString();
    await saveRegDocImmediate(reg, true);

    // Sync to target registers
    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of targetRegIds) {
      await _syncReorderRows(targetRegId, reorderMapping);
    }
  });
}

export async function deleteEntry(registerId: number, entryId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const entryIndex = reg.entries.findIndex((e) => e.id === entryId);
    if (entryIndex === -1) return;
    const entry = reg.entries[entryIndex];

    const savedUser = JSON.parse(
      sessionStorage.getItem('recordbook_user') ||
      'null'
    );
    if (!reg.deletedItems) reg.deletedItems = [];
    reg.deletedItems.push({
      id: generateId(),
      type: 'row',
      deletedAt: new Date().toISOString(),
      registerName: reg.name,
      registerId: reg.id,
      entry: { ...entry },
      originalIndex: entryIndex,
      deletedBy: savedUser?.name || 'User',
      deletedByEmail: savedUser?.email || '',
      deletedById: savedUser?.id || '',
    });

    const res = await fetch(`/api/registers/${registerId}/entries/${entryId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete entry');

    // Sync to target registers BEFORE we mutate the source entries array
    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of targetRegIds) {
      await _syncDeleteRow(targetRegId, entry.rowNumber);
    }

    reg.entries = reg.entries.filter((e) => e.id !== entryId);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Delete Row', `Deleted row #${entry.rowNumber} from "${reg.name}"`, { registerId, registerName: reg.name, entryId });
  });
}

/**
 * Restore a previously deleted entry at its original index, preserving the original ID and data.
 * Used by undo to exactly reconstruct deleted rows.
 */
export async function restoreEntry(registerId: number, entry: Entry, originalIndex?: number): Promise<Entry> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const insertIndex = (originalIndex !== undefined && originalIndex >= 0 && originalIndex <= reg.entries.length)
      ? originalIndex
      : reg.entries.length;

    // Sync to target registers first
    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of targetRegIds) {
      if (insertIndex === reg.entries.length) {
        await _syncAddRow(targetRegId);
      } else {
        await _syncInsertRow(targetRegId, insertIndex);
      }
    }

    if (originalIndex !== undefined && originalIndex >= 0 && originalIndex <= reg.entries.length) {
      reg.entries.splice(originalIndex, 0, entry);
    } else {
      reg.entries.push(entry);
    }
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    reg.updatedAt = new Date().toISOString();
    await saveRegDocImmediate(reg, true);

    // Sync cells
    for (const [colIdStr, value] of Object.entries(entry.cells)) {
      if (value === undefined || value === null) continue;
      const col = reg.columns.find(c => c.id.toString() === colIdStr);
      if (col?.linkedTo && col.linkedTo.role === 'source') {
        await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, entry.rowNumber, value);
      }
    }

    return entry;
  });
}

/**
 * Restore multiple previously deleted entries, preserving original IDs and data.
 * Entries are inserted in their original order. Used by undo for bulk delete.
 */
export async function bulkRestoreEntries(registerId: number, entries: { entry: Entry; index: number }[]): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const sorted = [...entries].sort((a, b) => a.index - b.index);

    for (const { entry, index } of sorted) {
      const targetRegIds = new Set<number>();
      for (const col of reg.columns) {
        if (col.linkedTo && col.linkedTo.role === 'source') {
          targetRegIds.add(col.linkedTo.registerId);
        }
      }
      for (const targetRegId of targetRegIds) {
        if (index >= 0 && index <= reg.entries.length) {
          await _syncInsertRow(targetRegId, index);
        } else {
          await _syncAddRow(targetRegId);
        }
      }

      if (index >= 0 && index <= reg.entries.length) {
        reg.entries.splice(index, 0, entry);
      } else {
        reg.entries.push(entry);
      }
      renumberRows(reg);

      // Sync cells
      for (const [colIdStr, value] of Object.entries(entry.cells)) {
        if (value === undefined || value === null) continue;
        const col = reg.columns.find(c => c.id.toString() === colIdStr);
        if (col?.linkedTo && col.linkedTo.role === 'source') {
          await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, entry.rowNumber, value);
        }
      }
    }

    reg.entryCount = reg.entries.length;
    reg.updatedAt = new Date().toISOString();
    await saveRegDocImmediate(reg);
  });
}

export async function duplicateEntry(registerId: number, entryId: number): Promise<Entry> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const original = reg.entries.find((e) => e.id === entryId);
    if (!original) throw new Error('Entry not found');
    const duplicate: Entry = {
      id: generateId(), registerId, rowNumber: 0,
      cells: { ...original.cells }, createdAt: new Date().toISOString(), pageIndex: original.pageIndex,
    };
    reg.entries.push(duplicate);
    renumberRows(reg);
    reg.entryCount = reg.entries.length;
    await saveAddedEntryOnly(reg, reg.entries.length - 1);

    // Sync new row and cell values to target registers
    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    for (const targetRegId of targetRegIds) {
      await _syncAddRow(targetRegId);
    }

    for (const [colIdStr, value] of Object.entries(duplicate.cells)) {
      if (value === undefined || value === null) continue;
      const col = reg.columns.find(c => c.id.toString() === colIdStr);
      if (col?.linkedTo && col.linkedTo.role === 'source') {
        await _syncLinkedColumn(col.linkedTo.registerId, col.linkedTo.columnId, duplicate.rowNumber, value);
      }
    }

    return duplicate;
  });
}

export async function bulkDeleteEntries(registerId: number, entryIds: number[]): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.deletedItems) reg.deletedItems = [];

    // Move each entry to bin
    const idsSet = new Set(entryIds);
    reg.entries.forEach((e, idx) => {
      if (idsSet.has(e.id)) {
        reg.deletedItems!.push({
          id: generateId(),
          type: 'row',
          deletedAt: new Date().toISOString(),
          registerName: reg.name,
          registerId: reg.id,
          entry: { ...e },
          originalIndex: idx,
        });
      }
    });

    // Sync to target registers BEFORE we mutate the source entries array
    const targetRegIds = new Set<number>();
    for (const col of reg.columns) {
      if (col.linkedTo && col.linkedTo.role === 'source') {
        targetRegIds.add(col.linkedTo.registerId);
      }
    }
    const deletedRowNumbers = reg.entries.filter(e => idsSet.has(e.id)).map(e => e.rowNumber);
    for (const targetRegId of targetRegIds) {
      await _syncBulkDeleteRows(targetRegId, deletedRowNumbers);
    }

    reg.entries = reg.entries.filter((e) => !idsSet.has(e.id));
    renumberRows(reg); // Fix sequence after bulk delete
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
    await logAction(reg.businessId, 'Delete Rows', `Moved ${entryIds.length} rows to bin from "${reg.name}"`, { registerId, registerName: reg.name });
  });
}

// ─── Page Operations ─────────────────────────────────────────────────────────

export async function addPage(registerId: number, pageName?: string): Promise<Page> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.pages) reg.pages = [{ id: 1, name: 'Page 1', index: 0 }];
    const newPage: Page = { id: generateId(), name: pageName || `Page ${reg.pages.length + 1}`, index: reg.pages.length };
    reg.pages.push(newPage);
    await saveRegDocImmediate(reg);
    return newPage;
  });
}

export async function renamePage(registerId: number, pageId: number, newName: string): Promise<Page> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const page = reg.pages?.find((p) => p.id === pageId);
    if (!page) throw new Error('Page not found');
    page.name = newName;
    await saveRegDocImmediate(reg);
    return page;
  });
}

export async function deletePage(registerId: number, pageId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.pages || reg.pages.length <= 1) throw new Error('Cannot delete the only page');
    const targetPage = reg.pages.find((p) => p.id === pageId);
    if (!targetPage) throw new Error('Page not found');
    const targetPageIndex = targetPage.index;
    reg.pages = reg.pages.filter((p) => p.id !== pageId);
    reg.entries = reg.entries.filter((e) => (e.pageIndex || 0) !== targetPageIndex);
    reg.entryCount = reg.entries.length;
    await saveRegDocImmediate(reg);
  });
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

export async function generateShareLink(registerId: number): Promise<string> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    const link = `https://rekord.app/share/${registerId}/${Date.now().toString(36)}`;
    reg.shareLink = link;
    await saveRegDocImmediate(reg);
    return link;
  });
}

export async function addSharedUser(registerId: number, phone: string, permission: 'view' | 'edit'): Promise<SharedUser> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.sharedWith) reg.sharedWith = [];
    const user: SharedUser = {
      id: generateId(), name: `User ${phone.slice(-4)}`, phone, permission, addedAt: new Date().toISOString(),
    };
    reg.sharedWith.push(user);
    await saveRegDocImmediate(reg);
    return user;
  });
}

export async function removeSharedUser(registerId: number, userId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (reg.sharedWith) reg.sharedWith = reg.sharedWith.filter((u) => u.id !== userId);
    await saveRegDocImmediate(reg);
  });
}

// ─── Utilities (pure, no DB) ─────────────────────────────────────────────────

/** Manually trigger a save — kept for Ctrl+S compat (now a no-op since data is always in Firestore) */
export function saveToStorage(): boolean {
  return true;
}

export function generateCSV(register: RegisterDetail, pageIndex: number = 0): string {
  const cols = register.columns;
  const entries = register.entries.filter((e) => (e.pageIndex || 0) === pageIndex);
  const headers = ['S.No.', ...cols.map((c) => c.name)];
  const headerRow = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  const dataRows = entries.map((entry) => {
    const row = [entry.rowNumber.toString(), ...cols.map((col) => {
      const val = entry.cells?.[col.id.toString()] || '';
      return `"${val.replace(/"/g, '""')}"`;
    })];
    return row.join(',');
  });
  return [headerRow, ...dataRows].join('\n');
}

export interface ColumnStats { sum: number; average: number; count: number; min: number; max: number; filled: number; empty: number; }

export function calculateColumnStats(entries: Entry[], columnId: string): ColumnStats {
  const values = entries.map((e) => e.cells?.[columnId]).filter((v) => v !== undefined && v !== null && v !== '');
  // Ignore values with "x" in column stats
  const numbers = values
    .filter(v => !String(v).toLowerCase().includes('x'))
    .map((v) => parseFloat(v!.replace(/[₹$,]/g, '')))
    .filter((n) => !isNaN(n));
  return {
    sum: numbers.reduce((a, b) => a + b, 0),
    average: numbers.length > 0 ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0,
    count: values.length, min: numbers.length > 0 ? Math.min(...numbers) : 0,
    max: numbers.length > 0 ? Math.max(...numbers) : 0, filled: values.length,
    empty: entries.length - values.length
  };
}

export async function logAction(
  businessId: number,
  action: string,
  details: string,
  meta?: { registerId?: number; registerName?: string; entryId?: number }
): Promise<void> {
  try {
    const savedUser = JSON.parse(
      sessionStorage.getItem('recordbook_user') ||
      'null'
    );
    const res = await fetch('/api/activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: savedUser?.id || '',
        userName: savedUser?.name || 'User',
        action,
        details,
        registerId: meta?.registerId,
        registerName: meta?.registerName,
        entryId: meta?.entryId,
        timestamp: new Date().toISOString()
      })
    });
    if (!res.ok) console.error('Failed to write backend log');
  } catch (err) {
    console.error('Failed to log action:', err);
  }
}

export async function listHistory(businessId: number): Promise<HistoryEntry[]> {
  const res = await fetch('/api/activity');
  if (!res.ok) throw new Error('Failed to fetch activity logs');
  const data = await res.json();
  return data.activities;
}

export async function listRowHistory(registerId: number, entryId: number): Promise<HistoryEntry[]> {
  const res = await fetch(`/api/activity?registerId=${registerId}&entryId=${entryId}`);
  if (!res.ok) throw new Error('Failed to fetch row history');
  const data = await res.json();
  return data.activities;
}

// ── Bin Management (Rows & Columns) ──────────────────────────────────────────

/**
 * Get all deleted items (rows + columns) across all registers for a business.
 */
export async function getAllDeletedItems(businessId: number): Promise<DeletedItem[]> {
  const res = await fetch(`/api/recycle-bin?businessId=${businessId}`);
  if (!res.ok) throw new Error('Failed to fetch deleted items');
  const data = await res.json();
  return data.deletedItems;
}

/**
 * Get deleted items for a specific register.
 */
export async function getRegisterDeletedItems(registerId: number): Promise<DeletedItem[]> {
  const reg = await getRegDoc(registerId);
  return (reg.deletedItems || []).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/**
 * Restore a deleted item (row or column) from the bin back to its register.
 */
export async function restoreDeletedItem(registerId: number, deletedItemId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.deletedItems) return;

    const itemIndex = reg.deletedItems.findIndex(i => i.id === deletedItemId);
    if (itemIndex === -1) return;

    const item = reg.deletedItems[itemIndex];

    if (item.type === 'row' && item.entry) {
      // Restore the row at its original index
      const insertAt = Math.min(item.originalIndex ?? reg.entries.length, reg.entries.length);
      reg.entries.splice(insertAt, 0, item.entry);
      reg.entryCount = reg.entries.length;
      await logAction(reg.businessId, 'Restore Row', `Restored row from bin in "${reg.name}"`, { registerId, registerName: reg.name });
    } else if (item.type === 'column' && item.column) {
      // Restore column at its original position
      const insertAt = Math.min(item.column.position, reg.columns.length);
      reg.columns.splice(insertAt, 0, item.column);
      reg.columns.forEach((c, i) => c.position = i);

      // Restore cell data
      if (item.columnCellData) {
        const colIdStr = item.column.id.toString();
        reg.entries.forEach(e => {
          const val = item.columnCellData![e.id.toString()];
          if (val !== undefined) {
            if (!e.cells) e.cells = {};
            e.cells[colIdStr] = val;
          }
        });
      }
      await logAction(reg.businessId, 'Restore Column', `Restored column "${item.column.name}" from bin in "${reg.name}"`, { registerId, registerName: reg.name });
    }

    // Remove from bin
    reg.deletedItems.splice(itemIndex, 1);
    renumberRows(reg);
    await saveRegDocImmediate(reg, true);
  });
}

/**
 * Permanently delete an item from the bin.
 */
export async function permanentlyDeleteItem(registerId: number, deletedItemId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    if (!reg.deletedItems) return;
    reg.deletedItems = reg.deletedItems.filter(i => i.id !== deletedItemId);
    await saveRegDocImmediate(reg);
  });
}

/**
 * Clear all deleted items from a register's bin.
 */
export async function emptyRegisterBin(registerId: number): Promise<void> {
  return runQueuedMutation(registerId, async () => {
    const reg = await getRegDoc(registerId);
    reg.deletedItems = [];
    await saveRegDocImmediate(reg);
  });
}

/**
 * Permanently empty the entire recycle bin for a business.
 * This deletes all deleted registers permanently AND clears deletedItems in all active registers.
 */
export async function emptyRecycleBin(businessId: number): Promise<void> {
  // 1. Permanently delete all deleted registers
  const deletedRegs = await listDeletedRegisters(businessId);
  for (const reg of deletedRegs) {
    await permanentlyDeleteRegister(reg.id);
  }

  // 2. Clear all deleted items from active registers
  const summaries = await listRegisters(businessId);
  for (const reg of summaries) {
    await emptyRegisterBin(reg.id);
  }
}

// ==================== BACKUPS ====================

export interface BackupMeta {
  id: string;
  businessId: number;
  createdAt: string;
  label: string;
  registerCount: number;
  folderCount: number;
  totalEntries: number;
  sizeKb: number;
}

export interface BackupSnapshot {
  meta: BackupMeta;
  registers: RegisterDetail[];
  folders: Folder[];
}

/**
 * Create a full backup of all registers and folders for a business.
 */
export async function createBackup(businessId: number, label?: string): Promise<BackupMeta> {
  const res = await fetch('/api/backups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ businessId, label })
  });
  if (!res.ok) throw new Error('Failed to create backup');
  return res.json();
}

/**
 * List all available backups for a business, newest first.
 */
export async function listBackups(businessId: number): Promise<BackupMeta[]> {
  const res = await fetch(`/api/backups?businessId=${businessId}`);
  if (!res.ok) throw new Error('Failed to fetch backups');
  return res.json();
}

/**
 * Restore a backup — overwrites all current registers and folders with the backup snapshot.
 * WARNING: This is destructive. Current data will be replaced.
 */
export async function restoreBackup(backupId: string): Promise<void> {
  const res = await fetch(`/api/backups/${backupId}/restore`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to restore backup');
  firestoreRegisterCache.clear();
}

/**
 * Delete a backup permanently.
 */
export async function deleteBackup(backupId: string): Promise<void> {
  const res = await fetch(`/api/backups/${backupId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to delete backup');
}

/**
 * Check if a new backup is due (every 3 days).
 * Returns true if no backup exists or last backup is older than 3 days.
 */
export async function isBackupDue(businessId: number): Promise<boolean> {
  const backups = await listBackups(businessId);
  if (backups.length === 0) return true;
  const lastBackup = new Date(backups[0].createdAt);
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return lastBackup < threeDaysAgo;
}

/**
 * Compress and resize an image before uploading to stay under Firestore's 1MB limit.
 * Resizes the image to a max width/height of 1000px and applies JPEG compression (quality 0.7).
 */
export function compressImage(file: File, maxWidth = 600, maxHeight = 600, quality = 0.5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    // Intelligent quality scaling based on file size to optimize Firestore chunk limits
    let finalQuality = quality;
    if (file.size < 50 * 1024) {
      finalQuality = 0.7; // Keep higher quality for already tiny files (< 50 KB)
    } else if (file.size > 2 * 1024 * 1024) {
      finalQuality = 0.4; // Compress more aggressively for huge files (> 2 MB)
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Bounding box calculation
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string); // Fallback to raw base64
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Convert to highly compressed JPEG base64
        const compressedBase64 = canvas.toDataURL('image/jpeg', finalQuality);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        reject(new Error('Image failed to load'));
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('File reading failed'));
    };
    reader.readAsDataURL(file);
  });
}

