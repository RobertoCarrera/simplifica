import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { SupabaseTicketsService, TicketStats } from '../../services/supabase-tickets.service';
import { CustomerStats } from '../../services/supabase-customers.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from '../../services/supabase-client.service';

interface QuoteStats {
  pendingSinceLastSession: number;
  acceptedSinceLastSession: number;
}

interface TopProduct {
  productId: string;
  productName: string;
  totalQuantitySold: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {
  private customersService = inject(SupabaseCustomersService);
  private ticketsService = inject(SupabaseTicketsService);
  private router = inject(Router);
  // Use centralized Supabase client to reuse auth session
  private supabase: SupabaseClient = inject(SupabaseClientService).instance;

  customersCount = 0;
  ticketsStats: TicketStats | null = null;
  recentTickets: any[] = [];
  stats = signal<CustomerStats | null>(null);
  quoteStats = signal<QuoteStats>({ pendingSinceLastSession: 0, acceptedSinceLastSession: 0 });
  topProducts = signal<TopProduct[]>([]);

  ngOnInit(): void {
    this.loadCounts();
    this.loadQuoteStats();
    this.loadTopProducts();
  }

  private async loadCounts() {
    try {
      // Customers (observable)
      this.customersService.getCustomers().subscribe(list => {
        this.customersCount = Array.isArray(list) ? list.length : 0;
      }, err => {
        console.warn('Home: error cargando clientes', err);
      });

      // Tickets (async) - solo cargar si hay datos reales
      try {
        const tickets = await this.ticketsService.getTickets(undefined as any);
        // Verificar que no son tickets mock (tienen IDs que empiezan con 'ticket-')
        const realTickets = Array.isArray(tickets) ? tickets.filter(t => !t.id.startsWith('ticket-')) : [];
        this.recentTickets = realTickets.slice(0, 3);
        
        if (realTickets.length > 0) {
          const stats = await this.ticketsService.getTicketStats(undefined as any);
          this.ticketsStats = stats;
        }
      } catch (err) {
        console.warn('Home: error cargando tickets', err);
      }

      // Subscribe to stats
      this.customersService.stats$.subscribe(stats => {
        this.stats.set(stats);
      });

    } catch (error) {
      console.error('Home: error en loadCounts', error);
    }
  }

  private async loadQuoteStats() {
    try {
      const { data: session } = await this.supabase.auth.getSession();
      if (!session?.session) return;

      const response = await this.supabase.functions.invoke('quotes-stats');
      if (response.data) {
        this.quoteStats.set(response.data);
      }
    } catch (error) {
      console.warn('Home: error cargando estadísticas de presupuestos', error);
    }
  }

  private async loadTopProducts() {
    try {
      const { data: session } = await this.supabase.auth.getSession();
      if (!session?.session) return;

      const response = await this.supabase.functions.invoke('top-products');
      if (response.data?.topProducts) {
        this.topProducts.set(response.data.topProducts);
      }
    } catch (error) {
      console.warn('Home: error cargando top productos', error);
    }
  }

  navigateToQuotes(status?: string) {
    if (status) {
      this.router.navigate(['/presupuestos'], { queryParams: { status } });
    } else {
      this.router.navigate(['/presupuestos']);
    }
  }
}
