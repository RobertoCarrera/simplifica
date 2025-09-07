import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';

export interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  entity: string;
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingActions: number;
  lastSync: Date | null;
  isSyncing: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineStorageService {
  private dbName = 'SimplificaOfflineDB';
  private version = 1;
  private db: IDBDatabase | null = null;
  
  // Signals
  private _syncStatus = signal<SyncStatus>({
    isOnline: navigator.onLine,
    pendingActions: 0,
    lastSync: null,
    isSyncing: false
  });

  readonly syncStatus = this._syncStatus.asReadonly();
  readonly hasPendingActions = computed(() => this.syncStatus().pendingActions > 0);

  // Stores for different entities
  private stores = {
    customers: 'customers',
    tickets: 'tickets',
    works: 'works',
    products: 'products',
    companies: 'companies',
    actions: 'pending_actions', // Para acciones offline
    settings: 'app_settings'
  };

  constructor() {
    this.initDB();
    this.setupNetworkListeners();
  }

  private async initDB(): Promise<void> {
    try {
      this.db = await this.openDB();
      await this.loadPendingActionsCount();
    } catch (error) {
      console.error('Error initializing offline database:', error);
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        Object.values(this.stores).forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            
            // Add indexes for better querying
            if (storeName === 'pending_actions') {
              store.createIndex('timestamp', 'timestamp');
              store.createIndex('type', 'type');
              store.createIndex('entity', 'entity');
            } else if (storeName !== 'app_settings') {
              store.createIndex('updated_at', 'updated_at');
              store.createIndex('created_at', 'created_at');
            }
          }
        });
      };
    });
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.updateSyncStatus({ isOnline: true });
      this.syncPendingActions();
    });

    window.addEventListener('offline', () => {
      this.updateSyncStatus({ isOnline: false });
    });
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this._syncStatus.update(current => ({ ...current, ...updates }));
  }

  // Generic CRUD operations for offline storage
  async create<T extends { id: string }>(storeName: string, data: T): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const request = store.add({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        _offline: true
      });

      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async read<T>(storeName: string, id?: string): Promise<T | T[]> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      if (id) {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } else {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }
    });
  }

  async update<T extends { id: string }>(storeName: string, data: T): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const request = store.put({
        ...data,
        updated_at: new Date().toISOString(),
        _offline: true
      });

      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Offline action management
  async addPendingAction(action: Omit<OfflineAction, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const fullAction: OfflineAction = {
      ...action,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: action.maxRetries || 3
    };

    await this.create(this.stores.actions, fullAction);
    await this.loadPendingActionsCount();
  }

  async getPendingActions(): Promise<OfflineAction[]> {
    return (await this.read(this.stores.actions)) as OfflineAction[];
  }

  async removePendingAction(actionId: string): Promise<void> {
    await this.delete(this.stores.actions, actionId);
    await this.loadPendingActionsCount();
  }

  private async loadPendingActionsCount(): Promise<void> {
    try {
      const actions = await this.getPendingActions();
      this.updateSyncStatus({ pendingActions: actions.length });
    } catch (error) {
      console.error('Error loading pending actions count:', error);
    }
  }

  // Sync functionality
  async syncPendingActions(): Promise<void> {
    if (!navigator.onLine || this.syncStatus().isSyncing) {
      return;
    }

    this.updateSyncStatus({ isSyncing: true });

    try {
      const pendingActions = await this.getPendingActions();
      
      for (const action of pendingActions) {
        try {
          await this.executeAction(action);
          await this.removePendingAction(action.id);
        } catch (error) {
          console.error('Error syncing action:', error);
          
          // Increment retry count
          const updatedAction = {
            ...action,
            retryCount: action.retryCount + 1
          };

          if (updatedAction.retryCount >= updatedAction.maxRetries) {
            console.warn('Max retries reached for action:', action.id);
            await this.removePendingAction(action.id);
          } else {
            await this.update(this.stores.actions, updatedAction);
          }
        }
      }

      this.updateSyncStatus({ 
        lastSync: new Date(),
        isSyncing: false
      });

    } catch (error) {
      console.error('Error during sync:', error);
      this.updateSyncStatus({ isSyncing: false });
    }
  }

  private async executeAction(action: OfflineAction): Promise<void> {
    // En un entorno real, aquí harías las llamadas HTTP al backend
    console.log('Executing action:', action);
    
    // Simular delay de red
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Ejemplo de implementación:
    // switch (action.type) {
    //   case 'create':
    //     await this.http.post(`/api/${action.entity}`, action.data).toPromise();
    //     break;
    //   case 'update':
    //     await this.http.put(`/api/${action.entity}/${action.data.id}`, action.data).toPromise();
    //     break;
    //   case 'delete':
    //     await this.http.delete(`/api/${action.entity}/${action.data.id}`).toPromise();
    //     break;
    // }
  }

  // Entity-specific helper methods
  async saveCustomerOffline(customer: any): Promise<void> {
    if (navigator.onLine) {
      // Save directly to server if online
      return;
    }

    if (customer.id) {
      await this.update(this.stores.customers, customer);
      await this.addPendingAction({
        type: 'update',
        entity: 'customers',
        data: customer,
        maxRetries: 3
      });
    } else {
      const newCustomer = { ...customer, id: this.generateId() };
      await this.create(this.stores.customers, newCustomer);
      await this.addPendingAction({
        type: 'create',
        entity: 'customers',
        data: newCustomer,
        maxRetries: 3
      });
    }
  }

  async saveTicketOffline(ticket: any): Promise<void> {
    if (navigator.onLine) {
      return;
    }

    if (ticket.id) {
      await this.update(this.stores.tickets, ticket);
      await this.addPendingAction({
        type: 'update',
        entity: 'tickets',
        data: ticket,
        maxRetries: 3
      });
    } else {
      const newTicket = { ...ticket, id: this.generateId() };
      await this.create(this.stores.tickets, newTicket);
      await this.addPendingAction({
        type: 'create',
        entity: 'tickets',
        data: newTicket,
        maxRetries: 3
      });
    }
  }

  // Settings management
  async saveSetting(key: string, value: any): Promise<void> {
    await this.update(this.stores.settings, { id: key, value });
  }

  async getSetting(key: string): Promise<any> {
    try {
      const result = await this.read(this.stores.settings, key) as any;
      return result?.value;
    } catch (error) {
      return null;
    }
  }

  // Cache management
  async clearCache(): Promise<void> {
    if (!this.db) return;

    const storeNames = Object.values(this.stores).filter(name => name !== this.stores.actions);
    
    for (const storeName of storeNames) {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      await new Promise<void>((resolve) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
      });
    }
  }

  async getCacheSize(): Promise<number> {
    // Estimate cache size
    let totalSize = 0;
    
    for (const storeName of Object.values(this.stores)) {
      try {
        const data = await this.read(storeName) as any[];
        totalSize += JSON.stringify(data).length;
      } catch (error) {
        // Store might not exist yet
      }
    }
    
    return totalSize;
  }

  private generateId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for components
  async getOfflineCustomers(): Promise<any[]> {
    return (await this.read(this.stores.customers)) as any[];
  }

  async getOfflineTickets(): Promise<any[]> {
    return (await this.read(this.stores.tickets)) as any[];
  }

  async getOfflineWorks(): Promise<any[]> {
    return (await this.read(this.stores.works)) as any[];
  }

  async getOfflineProducts(): Promise<any[]> {
    return (await this.read(this.stores.products)) as any[];
  }
}
