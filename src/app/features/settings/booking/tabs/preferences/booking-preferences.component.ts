import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseSettingsService } from '../../../../../services/supabase-settings.service';
import { ToastService } from '../../../../../services/toast.service';
import { AuthService } from '../../../../../services/auth.service';

@Component({
    selector: 'app-booking-preferences',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">Configuración de Reservas</h3>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Intervalo de Slots -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Intervalo de Slots (minutos)</label>
                <div class="text-xs text-gray-500 mb-2">Cada cuánto se generan las opciones de hora (ej. 15min = 09:00, 09:15...)</div>
                <input type="number" [(ngModel)]="preferences.slot_interval_minutes" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
            </div>

            <!-- Antelación Mínima -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Antelación Mínima (minutos)</label>
                <div class="text-xs text-gray-500 mb-2">Cuanto tiempo antes se puede reservar (ej. 60min = 1 hora antes)</div>
                <input type="number" [(ngModel)]="preferences.min_advance_minutes" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
            </div>

            <!-- Horizonte de Reserva -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Horizonte de Reserva (días)</label>
                <div class="text-xs text-gray-500 mb-2">Con cuántos días de antelación se puede reservar</div>
                <input type="number" [(ngModel)]="preferences.max_future_days" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
            </div>

             <!-- Buffer Antes -->
             <!-- 
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Margen Antes (minutos)</label>
                <div class="text-xs text-gray-500 mb-2">Tiempo libre bloqueado antes de cada cita</div>
                <input type="number" [(ngModel)]="preferences.buffer_before_minutes" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
            </div>
            -->

            <!-- Buffer Después -->
            <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Margen Después (minutos)</label>
                <div class="text-xs text-gray-500 mb-2">Tiempo libre bloqueado después de cada cita (para limpieza, notas...)</div>
                <input type="number" [(ngModel)]="preferences.buffer_after_minutes" class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
            </div>

        </div>

        <div class="mt-8 flex justify-end">
            <button (click)="save()" [disabled]="saving()" class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors flex items-center">
                <span *ngIf="saving()" class="mr-2 animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                {{ saving() ? 'Guardando...' : 'Guardar Configuración' }}
            </button>
        </div>
    </div>
    `
})
export class BookingPreferencesComponent implements OnInit {
    private settingsService = inject(SupabaseSettingsService);
    private toast = inject(ToastService);
    private auth = inject(AuthService);

    saving = signal(false);

    preferences = {
        slot_interval_minutes: 30,
        min_advance_minutes: 60,
        max_future_days: 60,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0
    };

    ngOnInit() {
        this.loadSettings();
    }

    async loadSettings() {
        this.settingsService.getCompanySettings().subscribe(settings => {
            if (settings?.booking_preferences) {
                // Merge defaults with saved
                this.preferences = { ...this.preferences, ...settings.booking_preferences };
            }
        });
    }

    async save() {
        this.saving.set(true);
        const companyId = this.auth.companyId();
        if (!companyId) return;

        this.settingsService.updateCompanySettings({
            booking_preferences: this.preferences
        }, companyId).subscribe({
            next: () => {
                this.toast.success('Guardado', 'Configuración actualizada');
                this.saving.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toast.error('Error', 'No se pudo guardar la configuración');
                this.saving.set(false);
            }
        });
    }
}
