import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { ToastService } from '../../../services/toast.service';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { 
  Quote, 
  QuoteItem,
  QuoteStatus, 
  QUOTE_STATUS_LABELS, 
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired,
  canConvertToInvoice
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-detail',
  imports: [CommonModule, RouterModule],
  templateUrl: './quote-detail.component.html',
  styleUrl: './quote-detail.component.scss'
})
export class QuoteDetailComponent implements OnInit, OnDestroy {
  private quotesService = inject(SupabaseQuotesService);
  private settingsService = inject(SupabaseSettingsService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);

  quote = signal<Quote | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  sendingEmail = signal(false);
  converting = signal(false);
  mobileMenuOpen = signal(false);
  historyExpanded = signal(false);
  
  subscription: RealtimeChannel | null = null;

  // Conversion policy from settings
  conversionPolicy = signal<'manual' | 'automatic' | 'scheduled'>('manual');
  askBeforeConvert = signal<boolean>(true);

  QuoteStatus = QuoteStatus;
  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;

  // Tax configuration (derived from settings)
  pricesIncludeTax = signal<boolean>(false);
  ivaEnabled = signal<boolean>(true);
  ivaRate = signal<number>(21);
  irpfEnabled = signal<boolean>(false);
  irpfRate = signal<number>(15);

  ngOnInit() {
    // Load tax settings first, then load quote
    this.loadTaxSettings().finally(() => {
      this.route.params.subscribe(params => {
        if (params['id']) {
          this.loadQuote(params['id']);
        }
      });
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private async loadTaxSettings(): Promise<void> {
    try {
      const [app, company, effectivePolicy] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings()),
        this.settingsService.getEffectiveConvertPolicy()
      ]);
      const effectivePricesIncludeTax = (company?.prices_include_tax ?? null) ?? (app?.default_prices_include_tax ?? false);
      const effectiveIvaEnabled = (company?.iva_enabled ?? null) ?? (app?.default_iva_enabled ?? true);
      const effectiveIvaRate = (company?.iva_rate ?? null) ?? (app?.default_iva_rate ?? 21);
      const effectiveIrpfEnabled = (company?.irpf_enabled ?? null) ?? (app?.default_irpf_enabled ?? false);
      const effectiveIrpfRate = (company?.irpf_rate ?? null) ?? (app?.default_irpf_rate ?? 15);

      this.pricesIncludeTax.set(!!effectivePricesIncludeTax);
      this.ivaEnabled.set(!!effectiveIvaEnabled);
      this.ivaRate.set(Number(effectiveIvaRate || 0));
      this.irpfEnabled.set(!!effectiveIrpfEnabled);
      this.irpfRate.set(Number(effectiveIrpfRate || 0));
      
      // Set conversion policy
      this.conversionPolicy.set(effectivePolicy.policy);
      this.askBeforeConvert.set(effectivePolicy.askBeforeConvert);
    } catch {
      // keep defaults
    }
  }

  loadQuote(id: string) {
    this.loading.set(true);
    
    // Clean up previous subscription if exists
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loading.set(false);

        // Setup Realtime subscription
        this.subscription = this.quotesService.subscribeToQuoteDetailChanges(id, (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            // Update local state preserving joined data
            this.quote.update(current => {
              if (!current) return null;
              return { ...current, ...payload.new };
            });
          }
        });
      },
      error: (err) => {
        this.error.set('Error al cargar presupuesto: ' + err.message);
        this.loading.set(false);
      }
    });
  }

  editQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      this.router.navigate(['/presupuestos/edit', q.id]);
    }
  }

  finalizeQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      this.quotesService.finalizeQuote(q.id).subscribe({
        next: (updated) => {
          this.loadQuote(q.id);
          if (updated.status === QuoteStatus.SENT) {
            this.toastService.success('Enviado', 'Presupuesto finalizado y enviado por email');
          } else {
            this.toastService.success('Finalizado', 'Presupuesto listo para el cliente (Pendiente)');
          }
        },
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  markAsSent() {
    const q = this.quote();
    if (q) {
      this.quotesService.sendQuote(q.id).subscribe({
        next: () => {
          this.loadQuote(q.id);
          this.toastService.success('Estado actualizado', 'El presupuesto ha sido marcado como enviado');
        },
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  markAsAccepted() {
    const q = this.quote();
    if (q) {
      this.quotesService.acceptQuote(q.id).subscribe({
        next: (result) => {
          this.loadQuote(q.id);
          if (result.converted && result.invoice_id) {
            this.toastService.success('Aceptado y convertido', 'El presupuesto ha sido aceptado y convertido a factura automáticamente');
          } else if (result.quote.scheduled_conversion_date) {
            this.toastService.info('Aceptado y programado', `El presupuesto ha sido aceptado. Se convertirá a factura el ${new Date(result.quote.scheduled_conversion_date).toLocaleDateString('es-ES')}`);
          } else {
            this.toastService.success('Aceptado', 'El presupuesto ha sido marcado como aceptado');
          }
        },
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  markAsRejected() {
    const q = this.quote();
    if (q) {
      this.quotesService.rejectQuote(q.id).subscribe({
        next: () => this.loadQuote(q.id),
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  downloadPDF() {
    const q = this.quote();
    if (q) {
      this.quotesService.getQuotePdfUrl(q.id).subscribe({
        next: (signed) => window.open(signed, '_blank'),
        error: (e) => {
          const msg = 'No se pudo generar el PDF: ' + (e?.message || e);
          this.error.set(msg);
          try { this.toastService.error('Error', msg); } catch {}
        }
      });
    }
  }

  sendByEmail() {
    const q = this.quote();
    if (!q) return;
    const to = q.client?.email?.trim();
    if (!to) {
  const msg = 'El cliente no tiene un email configurado. Añádelo en la ficha del cliente para poder enviar el presupuesto.';
  this.error.set(msg);
  try { this.toastService.error('Error al enviar', msg); } catch {}
      return;
    }
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailRegex.test(to)) {
  const msg = 'El email del cliente no es válido. Por favor, revisa el formato (ej. usuario@dominio.com).';
  this.error.set(msg);
  try { this.toastService.error('Email inválido', msg); } catch {}
      return;
    }
    const num = formatQuoteNumber(q);
    const subject = num ? `Tu presupuesto ${num}` : 'Tu presupuesto';
    const message = 'Te enviamos tu presupuesto para revisión.';
    this.sendingEmail.set(true);
    this.quotesService.sendQuoteEmail(q.id, to, subject, message).subscribe({
      next: () => {
        this.sendingEmail.set(false);
        try { this.toastService.success('Email enviado', 'Presupuesto enviado correctamente'); } catch {}
      },
      error: (e) => {
        this.sendingEmail.set(false);
        const msg = 'Error al enviar email: ' + (e?.message || e);
        this.error.set(msg);
        try { this.toastService.error('Error al enviar', msg); } catch {}
      }
    });
  }

  convertToInvoice() {
    const q = this.quote();
    // Prevent double-click
    if (this.converting()) return;
    
    if (q && canConvertToInvoice(q)) {
      if (confirm('¿Convertir este presupuesto en factura?')) {
        this.converting.set(true);
        this.quotesService.convertToInvoice(q.id).subscribe({
          next: (result) => {
            try { this.toastService.success('Conversión completada', 'Presupuesto convertido a factura'); } catch {}
            this.router.navigate(['/invoices', result.invoice_id]);
            // No reset converting - we're navigating away
          },
          error: (err) => {
            this.converting.set(false);
            this.error.set('Error: ' + err.message);
          }
        });
      }
    }
  }

  deleteQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      if (confirm('¿Eliminar este presupuesto?')) {
        this.quotesService.deleteQuote(q.id).subscribe({
          next: () => this.router.navigate(['/presupuestos']),
          error: (err) => this.error.set('Error: ' + err.message)
        });
      }
    }
  }

  // Display helpers aligned with tax settings
  private calcBreakdown(): { subtotal: number; taxAmount: number; irpf: number; total: number } {
    const q = this.quote();
    const items = (q?.items || []) as any[];
    if (!items.length) {
      const subtotal = Number(q?.subtotal || 0);
      const taxAmount = Number(q?.tax_amount || 0);
      const irpf = 0;
      const total = Number(q?.total_amount || subtotal + taxAmount);
      return { subtotal, taxAmount, irpf, total };
    }

    let subtotal = 0;
    let taxAmount = 0;
    let baseNetForIrpf = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const price = Number((item.unit_price ?? item.price ?? item.price_per_unit) || 0);
      const discount = Number(item.discount_percent || 0);
      const taxRate = Number(item.tax_rate || 0);

      if (this.pricesIncludeTax() && this.ivaEnabled() && taxRate > 0) {
        const gross = qty * price;
        const netBeforeDiscount = gross / (1 + taxRate / 100);
        const itemDiscount = netBeforeDiscount * (discount / 100);
        const itemNet = netBeforeDiscount - itemDiscount;
        const itemTax = itemNet * (taxRate / 100);
        subtotal += itemNet;
        taxAmount += itemTax;
        baseNetForIrpf += itemNet;
      } else {
        const itemSubtotal = qty * price;
        const itemDiscount = itemSubtotal * (discount / 100);
        const itemNet = itemSubtotal - itemDiscount;
        const itemTax = (this.ivaEnabled() ? itemNet * (taxRate / 100) : 0);
        subtotal += itemNet;
        taxAmount += itemTax;
        baseNetForIrpf += itemNet;
      }
    }

    const irpf = this.irpfEnabled() ? baseNetForIrpf * (this.irpfRate() / 100) : 0;
    const total = subtotal + taxAmount - irpf;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      irpf: Math.round(irpf * 100) / 100,
      total: Math.round(total * 100) / 100
    };
  }

  displayItemUnitPrice(item: QuoteItem): number {
    return Number((item.unit_price ?? (item as any).price ?? (item as any).price_per_unit) || 0);
  }

  displayItemTotal(item: QuoteItem): number {
    const qty = Number(item.quantity) || 0;
    const price = this.displayItemUnitPrice(item);
    const discount = Number(item.discount_percent || 0);
    const taxRate = Number(item.tax_rate || 0);

    if (this.pricesIncludeTax() && this.ivaEnabled() && taxRate > 0) {
      const gross = qty * price;
      const netBeforeDiscount = gross / (1 + taxRate / 100);
      const itemDiscount = netBeforeDiscount * (discount / 100);
      const itemNet = netBeforeDiscount - itemDiscount;
      const itemTax = itemNet * (taxRate / 100);
      return Math.round((itemNet + itemTax) * 100) / 100;
    } else {
      const itemSubtotal = qty * price;
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemNet = itemSubtotal - itemDiscount;
      const itemTax = (this.ivaEnabled() ? itemNet * (taxRate / 100) : 0);
      return Math.round((itemNet + itemTax) * 100) / 100;
    }
  }

  displaySubtotal(): number { return this.calcBreakdown().subtotal; }
  displayTaxAmount(): number { return this.calcBreakdown().taxAmount; }
  displayIrpfAmount(): number { return this.calcBreakdown().irpf; }
  displayTotal(): number {
    // SIEMPRE mostramos el total real (subtotal + IVA - IRPF)
    // El total es lo que el cliente paga, independientemente de si los precios incluyen IVA o no
    return this.calcBreakdown().total;
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
  }

  // Display helpers for periodicidad/variante
  getBillingPeriodLabel(period?: string | null): string | null {
    if (!period) return null;
    const map: Record<string, string> = {
      'one-time': 'Pago único',
      'one_time': 'Pago único',
      'monthly': 'Mensual',
      'quarterly': 'Trimestral',
      'annually': 'Anual',
      'annual': 'Anual',
      'yearly': 'Anual',
      'custom': 'Personalizado'
    };
    return map[period] || period;
  }

  // Normalize known billing period values to a canonical key used for comparison
  private normalizeBillingPeriod(period?: string | null): string | null {
    if (!period) return null;
    const p = period.toString().toLowerCase();
    if (p === 'one-time' || p === 'one_time' || p === 'one time' || p === 'one') return 'one_time';
    if (p === 'monthly' || p === 'month') return 'monthly';
    if (p === 'quarterly' || p === 'quarter') return 'quarterly';
    if (p === 'annually' || p === 'annual' || p === 'yearly' || p === 'year') return 'annual';
    if (p === 'custom') return 'custom';
    return p;
  }

  /**
   * Determine a single label for the quote billing period.
   * - If no items have billing_period -> null (the template won't show the row)
   * - If all items with billing_period share the same normalized period -> return its label
   * - Otherwise return 'Mixta'
   */
  getQuoteBillingPeriodLabel(): string | null {
    const q = this.quote();
    if (!q || !q.items || !q.items.length) return null;
    const periods = new Set<string>();
    for (const it of q.items) {
      const norm = this.normalizeBillingPeriod((it as any).billing_period);
      if (norm) periods.add(norm);
    }
    if (periods.size === 0) return null;
    if (periods.size === 1) {
      // single period -> map back to label
      const only = Array.from(periods)[0];
      // map canonical keys to labels (reuse getBillingPeriodLabel keys)
      switch (only) {
        case 'one_time': return this.getBillingPeriodLabel('one_time') || 'Pago único';
        case 'monthly': return this.getBillingPeriodLabel('monthly') || 'Mensual';
        case 'quarterly': return this.getBillingPeriodLabel('quarterly') || 'Trimestral';
        case 'annual': return this.getBillingPeriodLabel('annual') || 'Anual';
        case 'custom': return this.getBillingPeriodLabel('custom') || 'Personalizado';
        default: return this.getBillingPeriodLabel(only) || only;
      }
    }
    return 'Mixta';
  }

  extractVariantName(item: QuoteItem): string | null {
    try {
      const anyItem: any = item as any;
      // Prefer populated relation from query
      if (anyItem.variant && anyItem.variant.variant_name) {
        return anyItem.variant.variant_name as string;
      }
      if (!anyItem.variant_id) return null;
      // Fallback: attempt to parse from description suffix
      const desc = (item.description || '').toString();
      const parts = desc.split(' - ');
      return parts.length > 1 ? parts[parts.length - 1] : null;
    } catch {
      return null;
    }
  }

  hasAnyBillingPeriod(): boolean {
    const q = this.quote();
    return !!q?.items?.some((i: any) => i?.billing_period);
  }

  getStatusLabel(status: QuoteStatus): string {
    return this.statusLabels[status] || status;
  }

  isExpired(validUntil: string): boolean {
    return new Date(validUntil) < new Date();
  }

  canConvert(quote: Quote) {
    return canConvertToInvoice(quote);
  }

  hasDiscount(quote: Quote): boolean {
    return quote.discount_amount !== undefined && 
           quote.discount_amount !== null && 
           quote.discount_amount > 0;
  }

  formatCurrency(amount: number | undefined): string {
    if (amount === undefined || amount === null) {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(0);
    }
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('es-ES');
  }

  getStatusBadgeClass(status: QuoteStatus) {
    return `badge bg-${this.statusColors[status]}`;
  }

  // Recurrence helpers
  hasRecurrence(): boolean {
    const t = (this.quote()?.recurrence_type as string) || 'none';
    return !!t && t !== 'none';
  }

  getRecurrenceLabel(): string | null {
    const q = this.quote();
    if (!q) return null;
    const t = (q.recurrence_type as any) || 'none';
    const map: Record<string, string> = {
      none: 'Puntual',
      weekly: 'Semanal',
      monthly: 'Mensual',
      quarterly: 'Trimestral',
      yearly: 'Anual'
    };
    const base = map[t] || 'Puntual';
    if (t === 'none') return base;
    let details = '';
    // Día: para weekly (0-6) o mensual/anual (1-28)
    if (q.recurrence_day !== null && q.recurrence_day !== undefined) {
      if (t === 'weekly') {
        const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        details = ` · ${days[Math.max(0, Math.min(6, q.recurrence_day as number))]}`;
      } else if (['monthly','quarterly','yearly'].includes(t)) {
        details = ` · día ${q.recurrence_day}`;
      }
    }
    return `${base}${details}`;
  }

  getConversionStatusLabel(): string | null {
    const q = this.quote();
    if (!q) return null;
    const map: Record<string, string> = {
      pending: 'pendiente',
      scheduled: 'programada',
      processing: 'en proceso',
      converted: 'convertida',
      not_converted: 'no convertida'
    };
    if (!q.conversion_status) return null;
    const key = q.conversion_status as keyof typeof map;
    if (q.conversion_status === 'not_converted') return null; // ocultar chip si no hay conversión programada/realizada
    return map[key] || q.conversion_status.replace(/_/g, ' ');
  }

  backToList() {
    this.router.navigate(['/presupuestos']);
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.set(!this.mobileMenuOpen());
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  toggleHistory() {
    this.historyExpanded.set(!this.historyExpanded());
  }
}

