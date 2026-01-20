import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientPortalService } from '../../../services/client-portal.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-client-notification-preferences',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full flex flex-col bg-white dark:bg-gray-800">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white">Preferencias de Notificación</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">Gestiona cómo quieres recibir nuestras comunicaciones.</p>
      </div>

      <!-- Content -->
      <div class="p-6">
        <div *ngIf="loading" class="flex justify-center py-8">
           <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>

        <div *ngIf="!loading" class="max-w-2xl mx-auto space-y-6">
          
          <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <span class="material-icons text-blue-500 text-sm">email</span>
                  Notificaciones por Email
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Recibe confirmaciones de reservas, respuestas a tickets y recordatorios importantes.</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" [(ngModel)]="prefs.email_notifications" (change)="savePreferences()" class="sr-only peer">
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 dark:peer-focus:ring-blue-900 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
})
export class ClientNotificationPreferencesComponent implements OnInit {
  private portalService = inject(ClientPortalService);
  private toast = inject(ToastService);

  loading = true;
  prefs = { email_notifications: true, sms_notifications: false, marketing_accepted: false };

  async ngOnInit() {
    await this.loadPreferences();
  }

  async loadPreferences() {
    this.loading = true;
    const { data } = await this.portalService.getPreferences();
    if (data) {
      this.prefs = data as any;
    }
    this.loading = false;
  }

  async savePreferences() {
    try {
      await this.portalService.updatePreferences(this.prefs);
      this.toast.success('Preferencias guardadas', 'Se han actualizado tus opciones');
    } catch (e) {
      this.toast.error('Error', 'No se pudieron guardar las preferencias');
      // Optionally revert check logic here
    }
  }
}
