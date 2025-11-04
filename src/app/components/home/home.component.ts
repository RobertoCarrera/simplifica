import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { SupabaseTicketsService, TicketStats } from '../../services/supabase-tickets.service';
import { SupabaseServicesService } from '../../services/supabase-services.service';
import { ProductsService } from '../../services/products.service';
import { CustomerStats } from '../../services/supabase-customers.service';

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
  private servicesService = inject(SupabaseServicesService);
  private productsService = inject(ProductsService);

  customersCount = 0;
  servicesCount = 0;
  productsCount = 0;
  ticketsStats: TicketStats | null = null;
  recentTickets: any[] = [];
  stats = signal<CustomerStats | null>(null);

  ngOnInit(): void {
    this.loadCounts();
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

      // Services
      try {
        const services = await this.servicesService.getServices(undefined as any);
        this.servicesCount = Array.isArray(services) ? services.length : 0;
      } catch (err) {
        console.warn('Home: error cargando servicios', err);
      }
  
      // Subscribe to stats
      this.customersService.stats$.subscribe(stats => {
        this.stats.set(stats);
      });
  

      // Products (observable)
      try {
        this.productsService.getProducts().subscribe(list => {
          this.productsCount = Array.isArray(list) ? list.length : 0;
        }, err => {
          console.warn('Home: error cargando productos', err);
        });
      } catch (err) {
        console.warn('Home: error cargando productos', err);
      }

    } catch (error) {
      console.error('Home: error en loadCounts', error);
    }
  }
}
