import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Toast } from '../models/toast.interface';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private transloco = inject(TranslocoService);
  private toasts = signal<Toast[]>([]);
  
  // Getter para que los componentes puedan leer las notificaciones
  get toasts$() {
    return this.toasts.asReadonly();
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private addToast(
    type: Toast['type'],
    title: string,
    message: string,
    duration = 5000,
    persistent = false,
    key?: string,
    action?: { label: string; link: string }
  ): string {
    const toast: Toast = {
      id: this.generateId(),
      type,
      title,
      message,
      duration: persistent ? Infinity : duration,
      key,
      action
    };

    this.toasts.update(current => [...current, toast]);

    // Auto-remove only if not persistent
    if (!persistent) {
      setTimeout(() => {
        this.removeToast(toast.id);
      }, duration);
    }
    return toast.id;
  }

  removeToast(id: string): void {
    this.toasts.update(current => current.filter(toast => toast.id !== id));
  }

  // Update an existing toast by id (or logical key) with a partial patch
  updateToast(idOrKey: string, patch: Partial<Toast>): void {
    this.toasts.update(current => {
      const idx = current.findIndex(t => t.id === idOrKey || t.key === idOrKey);
      if (idx === -1) return current;
      const prev = current[idx];
      const next: Toast = { ...prev, ...patch } as Toast;
      const arr = current.slice();
      arr[idx] = next;

      // If duration becomes finite now (e.g., closing a persistent toast after finish), schedule auto-remove
      if (prev.duration === Infinity && next.duration !== Infinity && typeof next.duration === 'number' && next.duration > 0) {
        setTimeout(() => this.removeToast(next.id), next.duration);
      }
      return arr;
    });
  }

  // Public methods
  success(title: string, message: string, duration?: number, persistent = false, key?: string, action?: { label: string; link: string }): string {
    return this.addToast('success', title, message, duration, persistent, key, action);
  }

  error(title: string, message: string, duration?: number, persistent = false, key?: string, action?: { label: string; link: string }): string {
    return this.addToast('error', title, message, duration, persistent, key, action);
  }

  warning(title: string, message: string, duration?: number, persistent = false, key?: string, action?: { label: string; link: string }): string {
    return this.addToast('warning', title, message, duration, persistent, key, action);
  }

  info(title: string, message: string, duration?: number, persistent = false, key?: string, action?: { label: string; link: string }): string {
    return this.addToast('info', title, message, duration, persistent, key, action);
  }

  clear(): void {
    this.toasts.set([]);
  }

  /** Translate an i18n key with optional parameters */
  t(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
  }
}
