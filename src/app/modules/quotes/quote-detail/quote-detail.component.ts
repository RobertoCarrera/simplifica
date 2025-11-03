import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { ToastService } from '../../../services/toast.service';
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
export class QuoteDetailComponent implements OnInit {
  private quotesService = inject(SupabaseQuotesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toastService = inject(ToastService);

  quote = signal<Quote | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  sendingEmail = signal(false);
  

  QuoteStatus = QuoteStatus;
  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;

  ngOnInit() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.loadQuote(params['id']);
      }
    });
  }

  loadQuote(id: string) {
    this.loading.set(true);
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loading.set(false);
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

  sendQuote() {
    const q = this.quote();
    if (q && q.status === QuoteStatus.DRAFT) {
      this.quotesService.sendQuote(q.id).subscribe({
        next: () => this.loadQuote(q.id),
        error: (err) => this.error.set('Error: ' + err.message)
      });
    }
  }

  markAsAccepted() {
    const q = this.quote();
    if (q) {
      this.quotesService.acceptQuote(q.id).subscribe({
        next: () => this.loadQuote(q.id),
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
      // TODO: Implement PDF generation
      alert('Función de descarga PDF en desarrollo');
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
    if (q && canConvertToInvoice(q)) {
      if (confirm('¿Convertir este presupuesto en factura?')) {
        this.quotesService.convertToInvoice(q.id).subscribe({
          next: (result) => {
            alert('Presupuesto convertido a factura exitosamente');
            this.router.navigate(['/invoices', result.invoice_id]);
          },
          error: (err) => this.error.set('Error: ' + err.message)
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

  calculateItemTotal(item: QuoteItem): number {
    let total = item.quantity * item.unit_price;
    
    // Apply discount
    if (item.discount_percent && item.discount_percent > 0) {
      total = total * (1 - item.discount_percent / 100);
    }
    
    // Apply tax
    if (item.tax_rate && item.tax_rate > 0) {
      total = total * (1 + item.tax_rate / 100);
    }
    
    return total;
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
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

  backToList() {
    this.router.navigate(['/presupuestos']);
  }
}


