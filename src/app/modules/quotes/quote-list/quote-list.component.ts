import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { 
  Quote, 
  QuoteStatus, 
  QUOTE_STATUS_LABELS, 
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired
} from '../../../models/quote.model';

@Component({
  selector: 'app-quote-list',
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './quote-list.component.html',
  styleUrl: './quote-list.component.scss'
})
export class QuoteListComponent implements OnInit {
  private quotesService = inject(SupabaseQuotesService);
  private router = inject(Router);

  quotes = signal<Quote[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  statusLabels = QUOTE_STATUS_LABELS;
  statusColors = QUOTE_STATUS_COLORS;

  ngOnInit() {
    this.loadQuotes();
  }

  loadQuotes() {
    this.loading.set(true);
    this.quotesService.getQuotes().subscribe({
      next: (result) => {
        this.quotes.set(result.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar presupuestos: ' + err.message);
        this.loading.set(false);
      }
    });
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

  getAcceptedCount(): number {
    return this.quotes().filter(q => q.status === 'accepted').length;
  }

  getPendingCount(): number {
    return this.quotes().filter(q => q.status === 'draft' || q.status === 'sent').length;
  }

  getTotalAmount(): number {
    return this.quotes().reduce((sum, q) => sum + (q.total_amount || 0), 0);
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
}

