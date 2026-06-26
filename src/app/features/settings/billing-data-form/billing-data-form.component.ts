import { Component, OnInit, OnDestroy, inject, signal, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, firstValueFrom } from 'rxjs';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-billing-data-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslocoPipe],
  template: `<div class="animate-fadeIn">
      @if (isClient) {
        <div class="mb-6 flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-100 dark:border-yellow-800">
          <i class="fas fa-lock text-yellow-600 dark:text-yellow-500 mt-1"></i>
          <div class="text-sm">
            <p class="font-semibold text-yellow-800 dark:text-yellow-400">{{ 'settings.facturacion.datosProtegidos' | transloco }}</p>
            <p class="text-yellow-700 dark:text-yellow-500 mt-1">{{ 'settings.facturacion.datosNoModificablesDirectamente' | transloco }}</p>
          </div>
        </div>
      }
      <div class="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <i class="fas fa-file-invoice-dollar text-emerald-600"></i>
          {{ 'settings.facturacion.datosDeFaturacion' | transloco }}
        </h2>
        <p class="text-gray-500 dark:text-gray-400 mt-1">{{ 'settings.facturacion.informacionFiscal' | transloco }}</p>
      </div>
      <form [formGroup]="billingForm" (ngSubmit)="save()" class="space-y-8">
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center">
            <i class="fas fa-building mr-2 text-gray-400"></i>
            {{ 'settings.facturacion.identificacionFiscal' | transloco }}
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.razonSocial' | transloco }}@if (!isClient) { <span class="text-red-500">*</span> }</label>
              <div class="relative">
                <input type="text" formControlName="business_name" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" [placeholder]="'settings.facturacion.razonSocial' | transloco" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
              </div>
            </div>
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.nombreComercial' | transloco }}</label>
              <div class="relative">
                <input type="text" formControlName="trade_name" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" [placeholder]="'settings.facturacion.nombreComercial' | transloco" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
              </div>
            </div>
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.cifNif' | transloco }}@if (!isClient) { <span class="text-red-500">*</span> }</label>
              <div class="relative">
                <input type="text" formControlName="cif_nif" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white font-mono uppercase" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" placeholder="B12345678" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
              </div>
            </div>
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.emailFacturas' | transloco }}</label>
              <div class="relative">
                <input type="email" formControlName="billing_email" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" placeholder="facturacion@miempresa.com" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
              </div>
              <p class="text-xs text-gray-500 mt-1">{{ 'settings.facturacion.emailVacio' | transloco }}</p>
            </div>
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center"><i class="fas fa-university mr-2 text-gray-400"></i> {{ 'settings.facturacion.datosBancarios' | transloco }}</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.metodoPago' | transloco }}</label>
              <select formControlName="payment_method" class="form-select w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-colors" [attr.disabled]="isClient ? true : null" [class.cursor-not-allowed]="isClient" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient">
                <option value="">{{ 'settings.facturacion.seleccionar' | transloco }}</option>
                @for (opt of paymentMethodOptions; track opt.value) { <option [value]="opt.value">{{ opt.label }}</option> }
              </select>
            </div>
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.regionFiscal' | transloco }}</label>
              <select formControlName="tax_region" class="form-select w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-colors" [attr.disabled]="isClient ? true : null" [class.cursor-not-allowed]="isClient" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient">
                @for (opt of taxRegionOptions; track opt.value) { <option [value]="opt.value">{{ opt.label }}</option> }
              </select>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 mt-4">{{ 'settings.facturacion.ibanLabel' | transloco }} <span class="text-xs text-gray-500 font-normal">{{ 'settings.facturacion.ibanParaDomiciliaciones' | transloco }}</span></label>
              <div class="relative">
                <input [type]="showIban() ? 'text' : 'password'" formControlName="iban" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white font-mono pr-10" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" placeholder="ES00 0000 0000 0000 0000 0000" />
                <button type="button" (click)="toggleIban()" class="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"><i class="fas" [class.fa-eye]="!showIban()" [class.fa-eye-slash]="showIban()"></i></button>
                @if (isClient) { <i class="fas fa-lock absolute right-10 top-3 text-gray-400"></i> }
              </div>
            </div>
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800 p-6 rounded-xl border border-gray-200 dark:border-gray-700" formGroupName="address">
          <h3 class="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center"><i class="fas fa-map-marker-alt mr-2 text-gray-400"></i> {{ 'settings.facturacion.direccionFiscal' | transloco }}</h3>
          <div class="space-y-4">
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.direccion' | transloco }}</label>
              <div class="relative">
                <input type="text" formControlName="street" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" [placeholder]="'settings.facturacion.direccion' | transloco" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.ciudad' | transloco }}</label>
                <div class="relative">
                  <input type="text" formControlName="city" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
                </div>
              </div>
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.codigoPostal' | transloco }}</label>
                <div class="relative">
                  <input type="text" formControlName="zip" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
                </div>
              </div>
              <div class="form-group">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.provinciaEstado' | transloco }}</label>
                <div class="relative">
                  <input type="text" formControlName="province" [readonly]="isClient" class="form-input w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 transition-colors text-gray-900 dark:text-white" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient" [class.cursor-not-allowed]="isClient" [class.text-gray-500]="isClient" [class.bg-white]="!isClient" [class.focus:bg-white]="!isClient" />@if (isClient) { <i class="fas fa-lock absolute right-3 top-3 text-gray-400"></i> }
                </div>
              </div>
            </div>
            <div class="form-group">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{{ 'settings.facturacion.pais' | transloco }}</label>
              <select formControlName="country" class="form-select w-full px-4 py-2.5 rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white transition-colors" [attr.disabled]="isClient ? true : null" [class.cursor-not-allowed]="isClient" [class.bg-gray-100]="isClient" [class.dark:bg-gray-700]="isClient">
                <option value="ESP">{{ 'settings.facturacion.espana' | transloco }}</option>
              </select>
            </div>
          </div>
        </div>
        @if (!isClient) {
          <div class="flex justify-end pt-4 pb-8">
            <button type="submit" class="w-full md:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2 transform active:scale-95" [disabled]="loading() || billingForm.invalid">
              @if (loading()) { <span class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> }
              @if (!loading()) { <i class="fas fa-save text-lg"></i> }
              <span class="text-base">{{ loading() ? ('settings.facturacion.guardando' | transloco) : ('settings.facturacion.guardarDatosFacturacion' | transloco) }}</span>
            </button>
          </div>
        }
      </form>
`,
})
export class BillingDataFormComponent implements OnInit, OnDestroy {
  readonly clientId = input<string | null>(null);

  private fb = inject(FormBuilder);
  private customersService = inject(SupabaseCustomersService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  loading = signal(false);
  showIban = signal(false);
  isClient = false;

  billingForm: FormGroup = this.fb.group({
    business_name: [''],
    trade_name: [''],
    cif_nif: [''],
    billing_email: ['', [Validators.email]],
    payment_method: [''],
    iban: [''],
    bic: [''],
    tax_region: [''],
    address: this.fb.group({
      street: [''], city: [''], zip: [''], province: [''], country: ['ESP'],
    }),
  });

  paymentMethodOptions = [
    { value: 'transfer', label: 'Transferencia' },
    { value: 'direct_debit', label: 'Domiciliación' },
    { value: 'cash', label: 'Efectivo' },
    { value: 'card', label: 'Tarjeta' },
    { value: 'bizum', label: 'Bizum' },
  ];

  taxRegionOptions = [
    { value: 'peninsula_baleares', label: 'Peninsula y Baleares' },
    { value: 'canarias', label: 'Canarias' },
    { value: 'ceuta_melilla', label: 'Ceuta y Melilla' },
  ];

  private destroy$ = new Subject<void>();
  private resolvedClientId: string | null = null;

  constructor() {
    effect(() => {
      const cid = this.clientId();
      if (cid && cid !== this.resolvedClientId) {
        this.resolvedClientId = cid;
        this.loadFromCustomer(cid);
      }
    });
  }

  ngOnInit() {
    if (!this.clientId()) {
      const profile = this.authService.userProfileSignal?.();
      const role = profile?.role;
      if ((role === 'client' || role === 'owner') && profile?.client_id) {
        this.resolvedClientId = profile.client_id;
        this.loadFromCustomer(profile.client_id);
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleIban() {
    this.showIban.update((v) => !v);
  }

  async loadFromCustomer(customerId: string) {
    this.loading.set(true);
    try {
      const customer: any = await firstValueFrom(this.customersService.getCustomer(customerId));
      const addressData = customer?.direccion || {};
      this.billingForm.patchValue({
        business_name: customer.business_name || '',
        trade_name: customer.trade_name || '',
        cif_nif: customer.cif_nif || '',
        billing_email: customer.billing_email || '',
        payment_method: customer.payment_method || '',
        iban: customer.iban || '',
        bic: customer.bic || '',
        tax_region: customer.tax_region || '',
        address: {
          street: addressData.nombre || '',
          city: addressData.localidad?.nombre || '',
          zip: addressData.localidad?.CP || '',
          province: addressData.localidad?.provincia || '',
          country: addressData.localidad?.pais || 'ESP',
        },
      });
      const role = this.authService.userProfileSignal?.()?.role;
      this.isClient = role === 'client';
      if (this.isClient) this.billingForm.disable();
      else this.billingForm.enable();
    } catch (err) {
      console.warn('Error loading customer billing data:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    if (!this.billingForm.valid || !this.resolvedClientId) return;
    this.loading.set(true);
    try {
      const billingData = this.billingForm.value;
      await firstValueFrom(this.customersService.updateCustomer(this.resolvedClientId, billingData));
      this.toast.success('Datos de facturacion actualizados', 'success');
      await this.loadFromCustomer(this.resolvedClientId);
    } catch (err: any) {
      this.toast.error('Error al actualizar datos de facturacion', err?.message || 'Error');
      console.error('Error updating billing:', err);
    } finally {
      this.loading.set(false);
    }
  }
}
