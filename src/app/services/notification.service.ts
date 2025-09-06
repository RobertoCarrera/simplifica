import { Injectable, signal } from '@angular/core';
import { ToastMessage } from '../models/toast-message';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private toasts = signal<ToastMessage[]>([]);
  
  // Señal reactiva para los componentes
  toasts$ = this.toasts.asReadonly();

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private addToast(toast: Omit<ToastMessage, 'id'>): void {
    const id = this.generateId();
    const newToast: ToastMessage = {
      ...toast,
      id
    };

    this.toasts.update(toasts => [...toasts, newToast]);

    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, newToast.duration);
    }
  }

  removeToast(id: string): void {
    this.toasts.update(toasts => toasts.filter(toast => toast.id !== id));
  }

  clearAll(): void {
    this.toasts.set([]);
  }

  // Métodos públicos para mostrar diferentes tipos de notificaciones
  showSuccess(title: string, message: string, duration: number = 5000): void {
    this.addToast({ type: 'success', title, message, duration });
  }

  showError(title: string, message: string, duration: number = 5000): void {
    this.addToast({ type: 'error', title, message, duration });
  }

  showWarning(title: string, message: string, duration: number = 5000): void {
    this.addToast({ type: 'warning', title, message, duration });
  }

  showInfo(title: string, message: string, duration: number = 5000): void {
    this.addToast({ type: 'info', title, message, duration });
  }

  // Métodos de conveniencia para operaciones comunes del CRM
  clientCreated(clientName: string): void {
    this.showSuccess('Cliente creado', `${clientName} ha sido agregado exitosamente`);
  }

  clientUpdated(clientName: string): void {
    this.showSuccess('Cliente actualizado', `Los datos de ${clientName} han sido actualizados`);
  }

  clientDeleted(clientName: string): void {
    this.showInfo('Cliente eliminado', `${clientName} ha sido eliminado del sistema`);
  }

  ticketCreated(ticketNumber: string): void {
    this.showSuccess('Ticket creado', `Ticket #${ticketNumber} creado exitosamente`);
  }

  ticketUpdated(ticketNumber: string): void {
    this.showSuccess('Ticket actualizado', `Ticket #${ticketNumber} ha sido actualizado`);
  }

  productAdded(productName: string): void {
    this.showSuccess('Producto agregado', `${productName} ha sido agregado al catálogo`);
  }

  operationFailed(operation: string, error?: string): void {
    const message = error || 'Ha ocurrido un error inesperado';
    this.showError('Error en operación', `${operation}: ${message}`);
  }

  connectionError(): void {
    this.showError('Error de conexión', 'No se pudo conectar con el servidor');
  }

  dataLoadError(): void {
    this.showError('Error al cargar datos', 'No se pudieron cargar los datos solicitados');
  }

  saveSuccess(): void {
    this.showSuccess('Guardado exitoso', 'Los cambios han sido guardados correctamente');
  }

  validationError(field: string): void {
    this.showWarning('Error de validación', `El campo ${field} contiene errores`);
  }

  permissionDenied(): void {
    this.showError('Permisos insuficientes', 'No tienes permisos para realizar esta acción');
  }

  sessionExpired(): void {
    this.showWarning('Sesión expirada', 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente');
  }
}
