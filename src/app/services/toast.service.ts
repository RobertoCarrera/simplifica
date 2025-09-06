import { Injectable, signal } from '@angular/core';
import { Toast } from '../models/toast.interface';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts = signal<Toast[]>([]);
  
  // Getter para que los componentes puedan leer las notificaciones
  get toasts$() {
    return this.toasts.asReadonly();
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private addToast(type: Toast['type'], title: string, message: string, duration = 5000): void {
    const toast: Toast = {
      id: this.generateId(),
      type,
      title,
      message,
      duration
    };

    this.toasts.update(current => [...current, toast]);

    // Auto-remove after duration
    setTimeout(() => {
      this.removeToast(toast.id);
    }, duration);
  }

  removeToast(id: string): void {
    this.toasts.update(current => current.filter(toast => toast.id !== id));
  }

  // Public methods
  success(title: string, message: string, duration?: number): void {
    this.addToast('success', title, message, duration);
  }

  error(title: string, message: string, duration?: number): void {
    this.addToast('error', title, message, duration);
  }

  warning(title: string, message: string, duration?: number): void {
    this.addToast('warning', title, message, duration);
  }

  info(title: string, message: string, duration?: number): void {
    this.addToast('info', title, message, duration);
  }

  clear(): void {
    this.toasts.set([]);
  }
}
