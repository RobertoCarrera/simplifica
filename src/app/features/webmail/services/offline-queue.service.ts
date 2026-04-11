import { Injectable, signal, NgZone } from '@angular/core';

export interface QueuedMessage {
  id: string;
  payload: any;
  accountId: string;
  queuedAt: number;
  retryCount: number;
  lastError?: string;
}

const DB_NAME = 'simplifica-webmail';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';
const MAX_RETRIES = 3;

@Injectable({ providedIn: 'root' })
export class OfflineQueueService {
  queue = signal<QueuedMessage[]>([]);
  isOnline = signal<boolean>(navigator.onLine);
  isProcessing = signal<boolean>(false);

  private db: IDBDatabase | null = null;
  private processing = false;

  constructor(private zone: NgZone) {
    this.initDB();
    this.setupNetworkListeners();
    this.loadQueue();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
          store.createIndex('accountId', 'accountId', { unique: false });
        }
      };
    });
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.zone.run(() => {
        this.isOnline.set(true);
        this.processQueue();
      });
    });
    window.addEventListener('offline', () => {
      this.zone.run(() => this.isOnline.set(false));
    });
  }

  private async loadQueue(): Promise<void> {
    if (!this.db) return;
    const tx = this.db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve) => {
      request.onsuccess = () => this.queue.set(request.result || []);
      request.onerror = () => { this.queue.set([]); resolve(); };
    });
  }

  async enqueue(payload: any, accountId: string): Promise<string> {
    const id = crypto.randomUUID();
    const queued: QueuedMessage = {
      id, payload, accountId,
      queuedAt: Date.now(),
      retryCount: 0,
    };

    if (!this.db) await this.initDB();

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const request = tx.objectStore(STORE_NAME).add(queued);
      request.onsuccess = () => {
        this.queue.update(q => [...q, queued]);
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async dequeue(id: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const request = tx.objectStore(STORE_NAME).delete(id);
      request.onsuccess = () => {
        this.queue.update(q => q.filter(m => m.id !== id));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async updateRetry(id: string, retryCount: number, lastError?: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const msg = getReq.result as QueuedMessage | undefined;
        if (msg) {
          msg.retryCount = retryCount;
          msg.lastError = lastError;
          const putReq = store.put(msg);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        } else {
          resolve();
        }
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async processQueue(sendFn: (payload: any, accountId: string) => Promise<any>): Promise<{ success: number; failed: number }> {
    if (this.processing || !this.isOnline()) return { success: 0, failed: 0 };

    this.processing = true;
    this.isProcessing.set(true);

    const pending = this.queue().filter(m => m.retryCount < MAX_RETRIES);
    let success = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await sendFn(item.payload, item.accountId);
        await this.dequeue(item.id);
        success++;
      } catch (error: any) {
        failed++;
        await this.updateRetry(item.id, item.retryCount + 1, error?.message || String(error));
      }
    }

    this.processing = false;
    this.isProcessing.set(false);
    return { success, failed };
  }

  get pendingCount(): number {
    return this.queue().filter(m => m.retryCount < MAX_RETRIES).length;
  }
}
