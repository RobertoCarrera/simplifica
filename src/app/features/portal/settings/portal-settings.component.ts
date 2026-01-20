import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { ToastService } from '../../../services/toast.service';
import { ClientGdprPanelComponent } from '../../customers/components/client-gdpr-panel/client-gdpr-panel.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-portal-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientGdprPanelComponent],
  template: `
    <div class="max-w-5xl mx-auto p-4 md:p-8">
      
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-2">Configuración</h1>
        <p class="text-gray-500">Gestiona tus preferencias de comunicación y privacidad.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <!-- Sidebar Navigation -->
        <div class="lg:col-span-1 space-y-2">
          
          <button (click)="activeTab = 'notifications'" 
            [class]="activeTab === 'notifications' ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-50'"
            class="w-full text-left px-4 py-3 rounded-r-lg font-medium transition-colors flex items-center">
            <span class="material-icons mr-3">notifications</span> Notificaciones
          </button>

          <button (click)="activeTab = 'gdpr'" 
            [class]="activeTab === 'gdpr' ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'text-gray-600 hover:bg-gray-50'"
            class="w-full text-left px-4 py-3 rounded-r-lg font-medium transition-colors flex items-center">
            <span class="material-icons mr-3">shield</span> Privacidad y Datos
          </button>
        </div>

        <!-- Content Area -->
        <div class="lg:col-span-2 space-y-6">

          <!-- NOTIFICATIONS TAB -->
          <div *ngIf="activeTab === 'notifications'" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-fade-in">
            <h2 class="text-xl font-bold text-gray-800 mb-6">Preferencias de Notificación</h2>
            
            <div *ngIf="loadingPrefs" class="py-8 flex justify-center">
               <div class="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
            </div>

            <div *ngIf="!loadingPrefs" class="space-y-6">
              
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-medium text-gray-900">Notificaciones por Email</h3>
                  <p class="text-sm text-gray-500">Recibe confirmaciones de reservas y cambios.</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prefs.email_notifications" (change)="savePreferences()" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <hr class="border-gray-100">

              <div class="flex items-center justify-between opacity-50 pointer-events-none"> <!-- SMS disabled for now -->
                <div>
                  <h3 class="font-medium text-gray-900">Notificaciones por SMS <span class="bg-gray-100 text-xs px-2 py-0.5 rounded text-gray-500 ml-2">Próximamente</span></h3>
                  <p class="text-sm text-gray-500">Recibe recordatorios directos en tu móvil.</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prefs.sms_notifications" disabled class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 rounded-full peer after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                </label>
              </div>

               <hr class="border-gray-100">

               <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-medium text-gray-900">Comunicaciones Comerciales</h3>
                  <p class="text-sm text-gray-500">Recibe ofertas y novedades exclusivas.</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" [(ngModel)]="prefs.marketing_accepted" (change)="savePreferences()" class="sr-only peer">
                  <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

            </div>
          </div>

          <!-- GDPR TAB -->
          <div *ngIf="activeTab === 'gdpr'" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-fade-in">
             <app-client-gdpr-panel
                *ngIf="user"
                [clientId]="user.client_id || ''"
                [clientEmail]="user.email || ''"
                [clientName]="user.full_name || user.name || ''"
                [readOnly]="false">
            </app-client-gdpr-panel>
          </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out forwards;
    }
  `]
})
export class PortalSettingsComponent implements OnInit {
  private auth = inject(AuthService);
  private portalService = inject(ClientPortalService);
  private toast = inject(ToastService);

  activeTab: 'notifications' | 'gdpr' = 'notifications';
  user: any = null;

  // Preferences State
  loadingPrefs = false;
  prefs = { email_notifications: true, sms_notifications: false, marketing_accepted: false };

  async ngOnInit() {
    this.user = await firstValueFrom(this.auth.userProfile$);
    this.loadPreferences();
  }

  // --- Preferences Methods ---
  async loadPreferences() {
    this.loadingPrefs = true;
    const { data } = await this.portalService.getPreferences();
    if (data) {
      this.prefs = data;
    }
    this.loadingPrefs = false;
  }

  async savePreferences() {
    // Auto-save on toggle
    try {
      await this.portalService.updatePreferences(this.prefs);
      this.toast.success('Preferencias guardadas', 'Se han actualizado tus opciones');
    } catch (e) {
      this.toast.error('Error', 'Error al guardar preferencias');
      // Revert?
    }
  }
}
