import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { 
  Quote, 
  QuoteItem,
  QuoteStatus, 
  QUOTE_STATUS_LABELS,
  formatQuoteNumber,
  canAcceptQuote,
  getDaysUntilExpiration
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-client-view',
  imports: [CommonModule],
  templateUrl: './quote-client-view.component.html',
  styleUrl: './quote-client-view.component.scss'
})
export class QuoteClientViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private quotesService = inject(SupabaseQuotesService);

  quote = signal<Quote | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  processing = signal(false);
  successMessage = signal<string | null>(null);

  QuoteStatus = QuoteStatus;
  currentYear = new Date().getFullYear();

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = params['id'];
      const token = params['token'];
      
      if (id && token) {
        this.loadQuote(id, token);
      }
    });
  }

  loadQuote(id: string, token: string) {
    this.loading.set(true);
    
    this.quotesService.getQuote(id).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loading.set(false);
        
        if (quote.status === QuoteStatus.SENT) {
          this.markAsViewed(id);
        }
      },
      error: (err) => {
        this.error.set('No se pudo cargar el presupuesto. Verifica el enlace.');
        this.loading.set(false);
      }
    });
  }

  markAsViewed(id: string) {
    this.quotesService.markQuoteAsViewed(id).subscribe();
  }

  acceptQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas aceptar este presupuesto?')) {
        this.processing.set(true);
        this.quotesService.acceptQuote(q.id).subscribe({
          next: (updated) => {
            this.quote.set(updated);
            this.processing.set(false);
            this.successMessage.set('¡Presupuesto aceptado! Recibirás la factura pronto.');
          },
          error: (err) => {
            this.error.set('Error al aceptar: ' + err.message);
            this.processing.set(false);
          }
        });
      }
    }
  }

  rejectQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas rechazar este presupuesto?')) {
        this.processing.set(true);
        this.quotesService.rejectQuote(q.id).subscribe({
          next: (updated) => {
            this.quote.set(updated);
            this.processing.set(false);
            this.successMessage.set('Presupuesto rechazado.');
          },
          error: (err) => {
            this.error.set('Error al rechazar: ' + err.message);
            this.processing.set(false);
          }
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

  canAccept(quote: Quote) {
    return canAcceptQuote(quote);
  }

  hasDiscount(quote: Quote): boolean {
    return quote.discount_amount !== undefined && 
           quote.discount_amount !== null && 
           quote.discount_amount > 0;
  }

  formatQuoteNumber(quote: Quote) {
    return formatQuoteNumber(quote);
  }

  getStatusLabel(status: QuoteStatus): string {
    return QUOTE_STATUS_LABELS[status] || status;
  }

  isExpired(validUntil: string): boolean {
    return new Date(validUntil) < new Date();
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

  getDaysRemaining(quote: Quote) {
    return getDaysUntilExpiration(quote);
  }
}


