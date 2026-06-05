import { type Entry } from './api';

export type LedgerStatus = 'pending' | 'persisting' | 'success' | 'failed';

export interface LedgerItem {
  id: string;
  action: string;
  chunkIndex: number;
  timestamp: number;
  sizeKb: number;
  status: LedgerStatus;
  error?: string;
}

export interface ChunkCapacityInfo {
  chunkIndex: number;
  entryCount: number;
  estimatedSizeByte: number;
  percentage: number;
  heavyEntries: Array<{ rowNumber: number; sizeByte: number }>;
}

export class DataPersistenceModule {
  private static ENTRIES_PER_CHUNK = 50;
  private static FIRESTORE_LIMIT = 1048576; // 1 MB physical limit
  private static DANGER_THRESHOLD = 980000; // Warning threshold around 980 KB

  private static ledger: LedgerItem[] = [];
  private static subscribers: Set<(ledger: LedgerItem[]) => void> = new Set();

  /**
   * Subscribes to transaction ledger updates.
   */
  public static subscribe(callback: (ledger: LedgerItem[]) => void): () => void {
    this.subscribers.add(callback);
    // Initial call
    callback([...this.ledger]);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private static notify(): void {
    const data = [...this.ledger];
    this.subscribers.forEach((cb) => cb(data));
  }

  /**
   * Adds an item to the transaction ledger.
   */
  public static addLedgerItem(action: string, chunkIndex: number, payloadSizeByte: number, status: LedgerStatus = 'pending'): string {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newItem: LedgerItem = {
      id,
      action,
      chunkIndex,
      timestamp: Date.now(),
      sizeKb: parseFloat((payloadSizeByte / 1024).toFixed(2)),
      status
    };

    // Cap ledger items to last 50 for performance
    this.ledger = [newItem, ...this.ledger].slice(0, 50);
    this.notify();
    return id;
  }

  /**
   * Updates an existing ledger item's status.
   */
  public static updateLedgerStatus(id: string, status: LedgerStatus, error?: string): void {
    let changed = false;
    this.ledger = this.ledger.map((item) => {
      if (item.id === id) {
        changed = true;
        return { ...item, status, ...(error ? { error } : {}) };
      }
      return item;
    });

    if (changed) {
      this.notify();
    }
  }

  /**
   * Retrieves all active ledger items.
   */
  public static getLedger(): LedgerItem[] {
    return [...this.ledger];
  }

  /**
   * Analyzes all entries of a register to calculate size allocations across chunks (50 rows per chunk).
   */
  public static getChunkCapacities(entries: Entry[]): ChunkCapacityInfo[] {
    const capacities: ChunkCapacityInfo[] = [];

    for (let i = 0; i < entries.length; i += this.ENTRIES_PER_CHUNK) {
      const chunkIndex = Math.floor(i / this.ENTRIES_PER_CHUNK);
      const chunkEntries = entries.slice(i, i + this.ENTRIES_PER_CHUNK);

      // Estimate the exact serialized size
      const serialized = JSON.stringify({ entries: chunkEntries });
      const sizeByte = serialized.length;
      const percentage = parseFloat(((sizeByte / this.FIRESTORE_LIMIT) * 100).toFixed(1));

      // Find heavy entries in this chunk (individual entry size > 30KB represents large image payload)
      const heavyEntries: Array<{ rowNumber: number; sizeByte: number }> = [];
      chunkEntries.forEach((entry, idx) => {
        const entrySize = JSON.stringify(entry).length;
        if (entrySize > 30 * 1024) {
          // Absolute row number in register
          const rowNumber = i + idx + 1;
          heavyEntries.push({ rowNumber, sizeByte: entrySize });
        }
      });

      // Sort heavy entries in descending order
      heavyEntries.sort((a, b) => b.sizeByte - a.sizeByte);

      capacities.push({
        chunkIndex,
        entryCount: chunkEntries.length,
        estimatedSizeByte: sizeByte,
        percentage: Math.min(100, percentage),
        heavyEntries
      });
    }

    return capacities;
  }

  /**
   * Checks whether a write operation is safe under the Firestore 1MB limits.
   * Compares the target chunk with the updated entry inserted.
   */
  public static checkWriteSizeSafety(
    allEntries: Entry[],
    newOrModifiedEntry: Entry,
    targetEntryId: number
  ): { isSafe: boolean; warningMessage?: string; targetChunkIndex: number; estimatedSizeByte: number } {
    // Find index of the entry inside allEntries list
    let entryIndex = allEntries.findIndex((e) => e.id === targetEntryId);
    
    // If it's a new entry (not yet in the list), estimate placing it at the end
    if (entryIndex === -1) {
      entryIndex = allEntries.length;
    }

    const targetChunkIndex = Math.floor(entryIndex / this.ENTRIES_PER_CHUNK);
    const chunkStart = targetChunkIndex * this.ENTRIES_PER_CHUNK;

    // Create a copy of the chunk entries, substituting/inserting the modified one
    const chunkEntriesCopy = allEntries.slice(chunkStart, chunkStart + this.ENTRIES_PER_CHUNK);
    
    // Substitute or push
    const relativeIndex = entryIndex - chunkStart;
    if (relativeIndex < chunkEntriesCopy.length) {
      chunkEntriesCopy[relativeIndex] = newOrModifiedEntry;
    } else {
      chunkEntriesCopy.push(newOrModifiedEntry);
    }

    // Measure estimated JSON size
    const serialized = JSON.stringify({ entries: chunkEntriesCopy });
    const estimatedSizeByte = serialized.length;
    const isSafe = estimatedSizeByte <= this.DANGER_THRESHOLD;

    let warningMessage: string | undefined = undefined;
    if (!isSafe) {
      const overLimitBy = estimatedSizeByte - this.DANGER_THRESHOLD;
      warningMessage = 
        `Warning: Saving this image will cause Database Chunk ${targetChunkIndex} to exceed safety capacity. ` +
        `Size: ${parseFloat((estimatedSizeByte / 1024).toFixed(1))} KB / 1024 KB. ` +
        `Please open the Image Optimizer and increase your compression parameters (reduce max width or quality) ` +
        `to safely commit this row without data loss.`;
    }

    return {
      isSafe,
      warningMessage,
      targetChunkIndex,
      estimatedSizeByte
    };
  }
}
