import { Injectable, signal, computed } from '@angular/core';

/**
 * Deprecated notification system (replaced by toast-notification).
 * This is a safe no-op stub kept to avoid breaking existing imports.
 * Do not use. Use ToastService instead.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  // Minimal reactive API to satisfy existing consumers
  private _notifications = signal<any[]>([]);
  readonly notifications$ = this._notifications.asReadonly();
  readonly unreadCount = computed(() => 0);

  constructor() {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[Deprecated] NotificationService is disabled. Use ToastService instead.');
    }
  }

  // No-op methods to preserve compatibility
  createNotification(_n: any): string { return crypto?.randomUUID?.() ?? String(Date.now()); }
  markAllAsRead(): void {/* no-op */}
  markAsRead(_id: string): void {/* no-op */}
  applyFilter(_f: any): void {/* no-op */}
  clearFilter(): void {/* no-op */}
  updateSettings(_s: any): void {/* no-op */}
  addRule(_r: any): string { return crypto?.randomUUID?.() ?? String(Date.now()); }
  updateRule(_id: string, _u: any): void {/* no-op */}
  deleteRule(_id: string): void {/* no-op */}
  createTemplate(_t: any): string { return crypto?.randomUUID?.() ?? String(Date.now()); }
  useTemplate(_id: string, _vars: Record<string, string>): string { return crypto?.randomUUID?.() ?? String(Date.now()); }
}
