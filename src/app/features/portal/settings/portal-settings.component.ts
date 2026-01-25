import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ClientGdprPanelComponent } from '../../customers/components/client-gdpr-panel/client-gdpr-panel.component';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { ToastService } from '../../../services/toast.service';
import { Customer } from '../../../models/customer';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-portal-settings',
  standalone: true,
  imports: [CommonModule, ClientGdprPanelComponent, FormsModule],
  template: `
    <div class="max-w-4xl mx-auto p-6 space-y-8">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Configuración y Perfil</h1>
      </div>

      <div *ngIf="isLoading" class="text-center py-10">
        <i class="fas fa-spinner fa-spin text-3xl text-primary-500"></i>
        <p class="mt-2 text-gray-500">Cargando información...</p>
      </div>

      <div *ngIf="!isLoading && customer" class="space-y-8 animate-fadeIn">
        
        <!-- BILLING SECTION -->
        <div class="bg-white dark:bg-gray-800 shadow rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <i class="fas fa-file-invoice-dollar text-primary-500"></i>
            Datos de Facturación
          </h2>
          <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm">
            Esta información se utilizará para emitir tus facturas. Por favor, asegúrate de que esté actualizada.
          </p>

          <form (ngSubmit)="saveBilling()" class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Identity -->
            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón Social / Nombre</label>
                <input [value]="customer.business_name || customer.name" disabled class="form-input w-full bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-gray-500">
                <p class="text-xs text-gray-400 mt-1">Contacta con soporte para modificar este dato.</p>
            </div>
            
            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CIF / NIF</label>
                <input [value]="customer.cif_nif || customer.dni" disabled class="form-input w-full bg-gray-100 dark:bg-gray-700 cursor-not-allowed text-gray-500">
            </div>

            <!-- Email -->
            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email de Facturación</label>
                <input [(ngModel)]="customer.billing_email" name="billing_email" type="email" class="form-input w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="ejemplo@empresa.com">
            </div>

            <!-- Address (Simplified for now or read from address relation if complex) -->
            <!-- Direct access to fields if flatten, or nested if object. The service returns Customer with properties. -->
            <!-- We will assume they can update their basic address info here if fields exist on Customer or we map them.
                 Based on FormNewCustomer, address is related. We'll simplify and just allow IBAN/BIC for now as requested.
            -->

            <!-- Payment -->
            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Método de Pago Preferido</label>
                <select [(ngModel)]="customer.payment_method" name="payment_method" class="form-select w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                  <option value="">Seleccionar...</option>
                  <option value="transfer">Transferencia</option>
                  <option value="direct_debit">Domiciliación</option>
                  <option value="card">Tarjeta</option>
                  <option value="paypal">PayPal</option>
                  <option value="stripe">Stripe</option>
                  <option value="bizum">Bizum</option>
                </select>
            </div>

            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IBAN</label>
                <input [(ngModel)]="customer.iban" name="iban" class="form-input w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono" placeholder="ES00 ...">
            </div>

            <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SWIFT / BIC</label>
                <input [(ngModel)]="customer.bic" name="bic" class="form-input w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono">
            </div>

            <!-- Actions -->
            <div class="col-span-1 md:col-span-2 flex justify-end pt-4 border-t dark:border-gray-700">
                <button type="submit" [disabled]="isSaving" class="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2">
                    <i *ngIf="isSaving" class="fas fa-spinner fa-spin"></i>
                    {{ isSaving ? 'Guardando...' : 'Guardar Datos de Facturación' }}
                </button>
            </div>
          </form>
        </div>

        <!-- GDPR Panel -->
        <app-client-gdpr-panel
          [clientId]="customer.id || ''"
          [clientEmail]="customer.email || ''"
          [clientName]="userName"
          [readOnly]="false">
        </app-client-gdpr-panel>

      </div>
    </div>
  `
})
export class PortalSettingsComponent implements OnInit {
  private auth = inject(AuthService);
  private customersService = inject(SupabaseCustomersService);
  private toast = inject(ToastService);

  user: any = null;
  userName: string = '';
  customer: Customer | null = null;
  isLoading = true;
  isSaving = false;

  async ngOnInit() {
    try {
      this.user = await firstValueFrom(this.auth.userProfile$);
      if (this.user) {
        const u = this.user as any;
        this.userName = (u.first_name || '') + ' ' + (u.last_name || '');
        this.userName = this.userName.trim() || u.email || 'Cliente';

        if (this.user.client_id) {
          await this.loadCustomer(this.user.client_id);
        } else {
          // If no client_id, maybe we should warn or hide?
          this.isLoading = false;
        }
      } else {
        this.isLoading = false;
      }
    } catch (e) {
      console.error(e);
      this.isLoading = false;
    }
  }

  async loadCustomer(id: string) {
    try {
      this.customer = await firstValueFrom(this.customersService.getCustomer(id));
    } catch (error) {
      console.error('Error loading customer profile', error);
      this.toast.error('Error', 'No se pudo cargar el perfil de cliente.');
    } finally {
      this.isLoading = false;
    }
  }

  async saveBilling() {
    if (!this.customer || !this.customer.id) return;

    this.isSaving = true;
    try {
      // Prepare update payload
      const updates: any = {
        billing_email: this.customer.billing_email,
        iban: this.customer.iban,
        bic: this.customer.bic,
        payment_method: this.customer.payment_method
      };

      await firstValueFrom(this.customersService.updateCustomer(this.customer.id, updates));
      this.toast.success('Guardado', 'Tus datos de facturación se han actualizado correctamente.');
    } catch (error) {
      console.error('Error updating billing info', error);
      this.toast.error('Error', 'No se pudieron guardar los cambios.');
    } finally {
      this.isSaving = false;
    }
  }
}
