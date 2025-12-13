import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { AuthService } from '../../../services/auth.service';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { 
  Quote, 
  QuoteStatus, 
  QUOTE_STATUS_LABELS, 
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired
} from '../../../models/quote.model';
import { SkeletonComponent } from '../../../components/skeleton/skeleton.component';

@Component({
  selector: 'app-quote-list',
  imports: [CommonModule, RouterModule, FormsModule, SkeletonComponent],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.scss'
})
export class QuoteListComponent implements OnInit, OnDestroy {
  private quotesService = inject(SupabaseQuotesService);
  private settingsService = inject(SupabaseSettingsService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  quotes = signal<Quote[]>([]);
  filteredQuotes = signal<Quote[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  // Search and filters
  searchTerm = '';
  statusFilter = '';
  dateFilter = '';

  // Custom dropdown states
  statusDropdownOpen = signal(false);
  dateDropdownOpen = signal(false);

  // Filter options
  statusOptions = [
    { value: '', label: 'Todos los estados' },
    { value: 'draft', label: 'Borrador' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'sent', label: 'Enviado' },
    { value: 'accepted', label: 'Aceptado' },
    { value: 'rejected', label: 'Rechazado' }
  ];

  dateOptions = [
    { value: '', label: 'Todas las fechas' },
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Esta semana' },
    { value: 'month', label: 'Este mes' },
    { value: 'year', label: 'Este año' }
  ];

  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;

  // Tax configuration (derived from settings)
  pricesIncludeTax = signal<boolean>(false);
  ivaEnabled = signal<boolean>(true);
  ivaRate = signal<number>(21);
  irpfEnabled = signal<boolean>(false);
  irpfRate = signal<number>(15);

  subscription: RealtimeChannel | null = null;

  ngOnInit() {
    // Check for query params (status filter from home)
    this.route.queryParams.subscribe(params => {
      if (params['status']) {
        // Map Spanish status names to internal status values
        const statusMap: { [key: string]: string } = {
          'borrador': 'draft',
          'pendiente': 'pending',
          'enviado': 'sent',
          'aceptado': 'accepted',
          'rechazado': 'rejected'
        };
        this.statusFilter = statusMap[params['status']] || params['status'];
      }
    });

    this.loadTaxSettings().finally(() => {
      this.loadQuotes();
      // Setup realtime after quotes are loaded
      this.setupRealtimeSubscription();
    });
  }

  ngOnDestroy() {
    // Subscription cleanup is handled by effect, but good practice to ensure
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private async loadTaxSettings(): Promise<void> {
    try {
      const [app, company] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings())
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
    } catch {
      // keep defaults
    }
  }

  loadQuotes() {
    this.loading.set(true);
    this.quotesService.getQuotes().subscribe({
      next: (result) => {
        this.quotes.set(result.data);
        this.applyFilters();
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar presupuestos: ' + err.message);
        this.loading.set(false);
      }
    });
  }

  onSearchChange(term: string) {
    this.searchTerm = term;
    this.applyFilters();
  }

  onFilterChange() {
    this.applyFilters();
  }

  private applyFilters() {
    let filtered = this.quotes();

    // Search filter
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(q => {
        const number = formatQuoteNumber(q).toLowerCase();
        const client = (q.client?.business_name || q.client?.name || '').toLowerCase();
        const title = (q.title || '').toLowerCase();
        return number.includes(term) || client.includes(term) || title.includes(term);
      });
    }

    // Status filter
    if (this.statusFilter) {
      filtered = filtered.filter(q => q.status === this.statusFilter);
    }

    // Date filter
    if (this.dateFilter) {
      const now = new Date();
      filtered = filtered.filter(q => {
        const quoteDate = new Date(q.quote_date || q.created_at);
        switch (this.dateFilter) {
          case 'today':
            return quoteDate.toDateString() === now.toDateString();
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return quoteDate >= weekAgo;
          case 'month':
            return quoteDate.getMonth() === now.getMonth() && quoteDate.getFullYear() === now.getFullYear();
          case 'year':
            return quoteDate.getFullYear() === now.getFullYear();
          default:
            return true;
        }
      });
    }

    this.filteredQuotes.set(filtered);
  }

  createQuote() {
    this.router.navigate(['/presupuestos/new']);
  }

  viewQuote(id: string) {
    this.router.navigate(['/presupuestos', id]);
  }

  editQuote(id: string) {
    this.router.navigate(['/presupuestos/edit', id]);
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
  }

  isExpired(quote: Quote) {
    return isQuoteExpired(quote);
  }

  formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  formatDate(date: string) {
    return new Date(date).toLocaleDateString('es-ES');
  }

  getStatusBadgeClass(status: QuoteStatus) {
    return `badge bg-${this.statusColors[status]}`;
  }

  getStatusLabel(status: QuoteStatus): string {
    return this.statusLabels[status] || status;
  }

  // Dropdown toggles
  toggleStatusDropdown() {
    this.statusDropdownOpen.update(v => !v);
    this.dateDropdownOpen.set(false);
  }

  toggleDateDropdown() {
    this.dateDropdownOpen.update(v => !v);
    this.statusDropdownOpen.set(false);
  }

  selectStatusFilter(value: string) {
    this.statusFilter = value;
    this.statusDropdownOpen.set(false);
    this.applyFilters();
  }

  selectDateFilter(value: string) {
    this.dateFilter = value;
    this.dateDropdownOpen.set(false);
    this.applyFilters();
  }

  getSelectedStatusLabel(): string {
    return this.statusOptions.find(o => o.value === this.statusFilter)?.label || 'Todos los estados';
  }

  getSelectedDateLabel(): string {
    return this.dateOptions.find(o => o.value === this.dateFilter)?.label || 'Todas las fechas';
  }

  getAcceptedCount(): number {
    return this.quotes().filter(q => q.status === 'accepted').length;
  }

  getPendingCount(): number {
    return this.quotes().filter(q => q.status === 'draft' || q.status === 'sent').length;
  }

  getTotalAmount(): number {
    return this.quotes().reduce((sum, q) => sum + this.displayTotal(q), 0);
  }

  // Compute display total with VAT according to settings for consistency with form/detail
  displayTotal(quote: Quote): number {
    const items = (quote.items || []) as any[];
    if (!items.length) {
      // If no items, use stored total (this is the real amount to pay)
      return Number(quote.total_amount || 0);
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
    
    // SIEMPRE devolver el total real (lo que paga el cliente)
    const total = subtotal + taxAmount - irpf;
    return Math.round(total * 100) / 100;
  }

  deleteQuote(id: string) {
    if (confirm('¿Estás seguro de que quieres eliminar este presupuesto?')) {
      this.quotesService.deleteQuote(id).subscribe({
        next: () => {
          this.loadQuotes();
        },
        error: (err) => {
          this.error.set('Error al eliminar presupuesto: ' + err.message);
        }
      });
    }
  }

  downloadPdf(id: string){
    this.quotesService.getQuotePdfUrl(id).subscribe({
      next: (signed) => window.open(signed, '_blank'),
      error: (e) => {
        const msg = 'No se pudo generar el PDF: ' + (e?.message || e);
        this.error.set(msg);
      }
    });
  }

  // Format recurrence for display
  formatRecurrence(quote: Quote): string {
    if (!quote.recurrence_type || quote.recurrence_type === 'none') return '';
    
    const interval = quote.recurrence_interval || 1;
    const type = quote.recurrence_type;
    
    const typeLabels: { [key: string]: string } = {
      'daily': 'día(s)',
      'weekly': 'semana(s)',
      'monthly': 'mes(es)',
      'yearly': 'año(s)'
    };
    
    const label = typeLabels[type] || type;
    const text = interval === 1 ? `Cada ${label.replace('(s)', '').replace('es', '')}` : `Cada ${interval} ${label}`;
    
    if (quote.next_run_at) {
      const nextDate = new Date(quote.next_run_at);
      return `${text} (próximo: ${nextDate.toLocaleDateString('es-ES')})`;
    }
    
    return text;
  }

  formatRecurrenceShort(quote: Quote): string {
    if (!quote.recurrence_type || quote.recurrence_type === 'none') return '';
    
    const interval = quote.recurrence_interval || 1;
    const type = quote.recurrence_type;
    
    const typeShort: { [key: string]: string } = {
      'daily': 'D',
      'weekly': 'S',
      'monthly': 'M',
      'yearly': 'A'
    };
    
    const short = typeShort[type] || type[0].toUpperCase();
    return interval === 1 ? short : `${interval}${short}`;
  }

  getRecurrenceLetter(recurrenceType: string | null | undefined): string {
    if (!recurrenceType || recurrenceType === 'none') return 'P';
    
    const typeMap: { [key: string]: string } = {
      'daily': 'D',
      'weekly': 'S',
      'monthly': 'M',
      'quarterly': 'T',
      'yearly': 'A'
    };
    
    return typeMap[recurrenceType] || 'P';
  }

  setupRealtimeSubscription() {
    if (this.subscription) return;

    this.subscription = this.quotesService.subscribeToQuoteChanges((payload) => {
      if (payload.eventType === 'UPDATE') {
        this.handleQuoteUpdate(payload.new);
      } else if (payload.eventType === 'INSERT') {
        this.handleQuoteInsert(payload.new);
      } else if (payload.eventType === 'DELETE') {
        this.handleQuoteDelete(payload.old.id);
      }
    });
  }

  handleQuoteUpdate(updatedQuote: any) {
    this.quotes.update(quotes => 
      quotes.map(q => {
        if (q.id === updatedQuote.id) {
          // Preserve joined fields (like client) that are not in the payload
          return { ...q, ...updatedQuote };
        }
        return q;
      })
    );
    this.applyFilters();
  }

  handleQuoteInsert(newQuote: any) {
    // For inserts, we might miss joined data (client name), so we could fetch it
    // But for now, we just add it to the list
    this.quotes.update(quotes => [newQuote, ...quotes]);
    this.applyFilters();
  }

  handleQuoteDelete(quoteId: string) {
    this.quotes.update(quotes => quotes.filter(q => q.id !== quoteId));
    this.applyFilters();
  }
}

