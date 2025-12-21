import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { ClientPortalService } from '../../../services/client-portal.service';
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
  private portal = inject(ClientPortalService);

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
      if (id) {
        this.loadQuote(id);
      }
    });
  }

  loadQuote(id: string) {
    this.loading.set(true);
    // Use client portal endpoint (Edge Function) to respect client RLS and mapping
    this.portal.getQuote(id).then(({ data, error }) => {
      if (error || !data) {
        this.error.set('No se pudo cargar el presupuesto.');
        this.loading.set(false);
        return;
      }
      this.quote.set(data as any);
      this.loading.set(false);
    }).catch(() => {
      this.error.set('No se pudo cargar el presupuesto.');
      this.loading.set(false);
    });
  }

  acceptQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas aceptar este presupuesto?')) {
        this.processing.set(true);
        this.portal.respondToQuote(q.id, 'accept').then(({ data, error }) => {
          if (error) {
            this.error.set('Error al aceptar: ' + (error?.message || error));
            this.processing.set(false);
            return;
          }
          const updatedQuote: Quote = (data as any) || { ...q, status: QuoteStatus.ACCEPTED, accepted_at: new Date().toISOString() } as any;
          this.quote.set(updatedQuote);
          this.processing.set(false);
          this.successMessage.set('¡Presupuesto aceptado!');
        }).catch((err)=>{
          this.error.set('Error al aceptar: ' + (err?.message || err));
          this.processing.set(false);
        });
      }
    }
  }

  rejectQuote() {
    const q = this.quote();
    if (q && canAcceptQuote(q)) {
      if (confirm('¿Estás seguro de que deseas rechazar este presupuesto?')) {
        this.processing.set(true);
        this.portal.respondToQuote(q.id, 'reject').then(({ data, error }) => {
          if (error) {
            this.error.set('Error al rechazar: ' + (error?.message || error));
            this.processing.set(false);
            return;
          }
          const updated = (data as any) || { ...q, status: QuoteStatus.REJECTED, rejected_at: new Date().toISOString() } as any;
          this.quote.set(updated);
          this.processing.set(false);
          this.successMessage.set('Presupuesto rechazado.');
        }).catch((err)=>{
          this.error.set('Error al rechazar: ' + (err?.message || err));
          this.processing.set(false);
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


