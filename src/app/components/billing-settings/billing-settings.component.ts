import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { PaymentIntegrationsService, PaymentIntegration } from '../../services/payment-integrations.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../services/supabase-settings.service';

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  templateUrl: './billing-settings.component.html'
})
export class BillingSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private paymentService = inject(PaymentIntegrationsService);
  private modulesService = inject(SupabaseModulesService);
  private settingsService = inject(SupabaseSettingsService);
  private router = inject(Router);

  // Authorization check
  isAuthorized = computed(() => {
    const role = this.authService.userRole();
    return role === 'owner' || role === 'admin';
  });

  // Company ID from auth
  companyId = computed(() => this.authService.companyId());

  // Loading states
  loading = signal(false);
  savingPaypal = signal(false);
  savingStripe = signal(false);
  testingPaypal = signal(false);
  testingStripe = signal(false);

  // Integration data
  paypalIntegration = signal<PaymentIntegration | null>(null);
  stripeIntegration = signal<PaymentIntegration | null>(null);

  // Module check - is Verifactu enabled?
  hasVerifactuModule = signal(false);
  hasFacturacionModule = signal(false);

  // Company settings for local payment
  allowLocalPayment = signal(false);
  savingLocalPayment = signal(false);

  // Forms
  paypalForm!: FormGroup;
  stripeForm!: FormGroup;

  // UI state
  showPaypalSecret = signal(false);
  showStripeSecret = signal(false);
  activeTab = signal<'paypal' | 'stripe' | 'general'>('general');

  ngOnInit(): void {
    this.initForms();
    this.loadIntegrations();
    this.loadModuleStatus();
    this.loadCompanySettings();
  }

  private initForms(): void {
    this.paypalForm = this.fb.group({
      clientId: ['', [Validators.required]],
      clientSecret: ['', [Validators.required]],
      isSandbox: [true],
      isActive: [false]
    });

    this.stripeForm = this.fb.group({
      publishableKey: ['', [Validators.required]],
      secretKey: ['', [Validators.required]],
      webhookSecret: [''],
      isSandbox: [true],
      isActive: [false]
    });
  }

  private async loadModuleStatus(): Promise<void> {
    try {
      const modules = this.modulesService.modulesSignal();
      if (modules) {
        this.hasVerifactuModule.set(modules.some(m => m.key === 'moduloVerifactu' && m.enabled));
        this.hasFacturacionModule.set(modules.some(m => m.key === 'moduloFacturas' && m.enabled));
      } else {
        // Fetch if not cached
        this.modulesService.fetchEffectiveModules().subscribe({
          next: (mods) => {
            this.hasVerifactuModule.set(mods.some(m => m.key === 'moduloVerifactu' && m.enabled));
            this.hasFacturacionModule.set(mods.some(m => m.key === 'moduloFacturas' && m.enabled));
          }
        });
      }
    } catch (e) {
      console.warn('Error loading module status', e);
    }
  }

  private async loadCompanySettings(): Promise<void> {
    try {
      this.settingsService.getCompanySettings().subscribe({
        next: (settings) => {
          if (settings) {
            this.allowLocalPayment.set(settings.allow_local_payment ?? false);
          }
        },
        error: (e) => {
          console.warn('Error loading company settings:', e);
        }
      });
    } catch (e) {
      console.warn('Error loading company settings', e);
    }
  }

  async toggleLocalPayment(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;

    this.savingLocalPayment.set(true);
    try {
      await this.settingsService.updateCompanySettings({
        allow_local_payment: newValue
      }).toPromise();
      
      this.allowLocalPayment.set(newValue);
      this.toast.success('Guardado', newValue ? 'Pago en local activado' : 'Pago en local desactivado');
    } catch (e: any) {
      // Revert checkbox on error
      checkbox.checked = !newValue;
      this.toast.error('Error', 'No se pudo guardar la configuración');
    } finally {
      this.savingLocalPayment.set(false);
    }
  }

  private async loadIntegrations(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;

    this.loading.set(true);
    try {
      const integrations = await this.paymentService.getIntegrations(companyId);
      
      const paypal = integrations.find(i => i.provider === 'paypal');
      const stripe = integrations.find(i => i.provider === 'stripe');

      this.paypalIntegration.set(paypal || null);
      this.stripeIntegration.set(stripe || null);

      // Patch forms with existing data (masked)
      if (paypal) {
        this.paypalForm.patchValue({
          clientId: paypal.credentials_masked?.clientId || '',
          clientSecret: '••••••••', // Always masked
          isSandbox: paypal.is_sandbox,
          isActive: paypal.is_active
        });
      }

      if (stripe) {
        this.stripeForm.patchValue({
          publishableKey: stripe.credentials_masked?.publishableKey || '',
          secretKey: '••••••••', // Always masked
          webhookSecret: stripe.webhook_secret_encrypted ? '••••••••' : '',
          isSandbox: stripe.is_sandbox,
          isActive: stripe.is_active
        });
      }
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudieron cargar las integraciones');
    } finally {
      this.loading.set(false);
    }
  }

  async savePaypal(): Promise<void> {
    if (!this.paypalForm.valid) {
      this.toast.warning('Formulario incompleto', 'Rellena todos los campos requeridos');
      return;
    }

    const companyId = this.companyId();
    if (!companyId) return;

    this.savingPaypal.set(true);
    try {
      const values = this.paypalForm.value;
      
      // Only send credentials if they've been changed (not masked)
      const credentials: Record<string, string> = {};
      if (values.clientId && !values.clientId.includes('•')) {
        credentials['clientId'] = values.clientId;
      }
      if (values.clientSecret && !values.clientSecret.includes('•')) {
        credentials['clientSecret'] = values.clientSecret;
      }

      await this.paymentService.saveIntegration(companyId, 'paypal', {
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        is_sandbox: values.isSandbox,
        is_active: values.isActive
      });

      this.toast.success('PayPal', 'Configuración guardada correctamente');
      await this.loadIntegrations();
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo guardar la configuración de PayPal');
    } finally {
      this.savingPaypal.set(false);
    }
  }

  async saveStripe(): Promise<void> {
    if (!this.stripeForm.valid) {
      this.toast.warning('Formulario incompleto', 'Rellena todos los campos requeridos');
      return;
    }

    const companyId = this.companyId();
    if (!companyId) return;

    this.savingStripe.set(true);
    try {
      const values = this.stripeForm.value;
      
      const credentials: Record<string, string> = {};
      if (values.publishableKey && !values.publishableKey.includes('•')) {
        credentials['publishableKey'] = values.publishableKey;
      }
      if (values.secretKey && !values.secretKey.includes('•')) {
        credentials['secretKey'] = values.secretKey;
      }

      await this.paymentService.saveIntegration(companyId, 'stripe', {
        credentials: Object.keys(credentials).length > 0 ? credentials : undefined,
        webhook_secret: values.webhookSecret && !values.webhookSecret.includes('•') ? values.webhookSecret : undefined,
        is_sandbox: values.isSandbox,
        is_active: values.isActive
      });

      this.toast.success('Stripe', 'Configuración guardada correctamente');
      await this.loadIntegrations();
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo guardar la configuración de Stripe');
    } finally {
      this.savingStripe.set(false);
    }
  }

  async testPaypal(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;

    this.testingPaypal.set(true);
    try {
      const result = await this.paymentService.testConnection(companyId, 'paypal');
      console.log('[billing-settings] PayPal test result:', result);
      if (result.success) {
        this.toast.success('PayPal', 'Conexión verificada correctamente');
        console.log('[billing-settings] PayPal details:', result.details);
      } else {
        this.toast.error('PayPal', result.error || 'Error en la verificación');
        console.error('[billing-settings] PayPal error:', result.error, result.details);
      }
      // Reload to update verification status
      await this.loadIntegrations();
    } catch (e: any) {
      console.error('[billing-settings] PayPal test exception:', e);
      this.toast.error('Error', e?.message || 'No se pudo verificar la conexión');
    } finally {
      this.testingPaypal.set(false);
    }
  }

  async testStripe(): Promise<void> {
    const companyId = this.companyId();
    if (!companyId) return;

    this.testingStripe.set(true);
    try {
      const result = await this.paymentService.testConnection(companyId, 'stripe');
      if (result.success) {
        this.toast.success('Stripe', 'Conexión verificada correctamente');
      } else {
        this.toast.error('Stripe', result.error || 'Error en la verificación');
      }
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo verificar la conexión');
    } finally {
      this.testingStripe.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/configuracion']);
  }

  setActiveTab(tab: 'paypal' | 'stripe' | 'general'): void {
    this.activeTab.set(tab);
  }
}
