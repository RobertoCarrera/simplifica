import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { SupabaseTicketsService, TicketStats } from '../../services/supabase-tickets.service';
import { SupabaseServicesService } from '../../services/supabase-services.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container">
      <header class="home-header">
        <h1><i class="fas fa-home"></i> Inicio</h1>
        <p class="subtitle">Resumen del sistema</p>
      </header>

      <div class="cards-grid">
        <a routerLink="/clientes" class="card card-blue">
          <div class="card-icon">
            <i class="fas fa-users"></i>
          </div>
          <div class="card-content">
            <h3>Clientes</h3>
            <span class="count">{{ customersCount }}</span>
          </div>
        </a>

        <a routerLink="/tickets" class="card card-yellow">
          <div class="card-icon">
            <i class="fas fa-ticket-alt"></i>
          </div>
          <div class="card-content">
            <h3>Tickets</h3>
            <span class="count">{{ ticketsStats?.total ?? 0 }}</span>
            @if (ticketsStats) {
              <div class="stats">
                <span>{{ ticketsStats.open }} abiertos</span>
                <span>{{ ticketsStats.inProgress }} en progreso</span>
              </div>
            }
          </div>
        </a>

        <a routerLink="/servicios" class="card card-green">
          <div class="card-icon">
            <i class="fas fa-cogs"></i>
          </div>
          <div class="card-content">
            <h3>Servicios</h3>
            <span class="count">{{ servicesCount }}</span>
          </div>
        </a>
      </div>

      @if (recentTickets.length > 0) {
        <section class="recent">
          <h4><i class="fas fa-clock"></i> Últimos tickets</h4>
          <div class="tickets-list">
            <a *ngFor="let t of recentTickets" class="ticket-item" [routerLink]="['/ticket', t.id]">
              <span class="ticket-number">#{{ t.ticket_number }}</span>
              <span class="ticket-title">{{ t.title }}</span>
            </a>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
    .home-container { 
      padding: 2rem; 
      max-width: 1200px; 
      margin: 0 auto; 
    }
    
    .home-header { 
      margin-bottom: 2rem; 
    }
    
    .home-header h1 { 
      margin: 0; 
      font-size: 1.875rem; 
      font-weight: 600;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .subtitle { 
      color: #6b7280; 
      margin: 0.5rem 0 0 0; 
      font-size: 1rem;
    }

    .cards-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
      gap: 1.5rem; 
      margin-bottom: 2rem; 
    }
    
    .card { 
      display: flex; 
      align-items: flex-start; 
      gap: 1rem; 
      padding: 1.5rem; 
      border-radius: 0.75rem; 
      text-decoration: none;
      color: inherit;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    
    .card-icon { 
      flex-shrink: 0;
      width: 3rem;
      height: 3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 0.5rem;
      background: rgba(255, 255, 255, 0.2);
    }
    
    .card-icon i { 
      font-size: 1.5rem; 
    }
    
    .card-content { 
      flex: 1;
      min-width: 0;
    }
    
    .card-content h3 { 
      margin: 0 0 0.5rem 0; 
      font-size: 1.125rem; 
      font-weight: 500;
    }
    
    .count { 
      font-size: 2rem; 
      font-weight: 700; 
      display: block;
      margin-bottom: 0.25rem;
      line-height: 1;
    }
    
    .stats { 
      font-size: 0.875rem; 
      opacity: 0.8; 
      display: flex; 
      gap: 0.75rem; 
      flex-wrap: wrap;
    }
    
    .card-blue { 
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
      color: white;
    }
    
    .card-yellow { 
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
      color: white;
    }
    
    .card-green { 
      background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
      color: white;
    }

    .recent { 
      background: #f9fafb;
      border-radius: 0.75rem;
      padding: 1.5rem;
      border: 1px solid #e5e7eb;
    }
    
    .recent h4 { 
      margin: 0 0 1rem 0; 
      font-size: 1.125rem; 
      font-weight: 500;
      color: #1f2937;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .tickets-list { 
      display: flex; 
      flex-direction: column; 
      gap: 0.75rem; 
    }
    
    .ticket-item { 
      display: flex; 
      gap: 0.75rem; 
      padding: 0.75rem; 
      background: white; 
      border-radius: 0.5rem; 
      border-left: 3px solid #3b82f6;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }
    
    .ticket-number { 
      font-weight: 600; 
      color: #3b82f6; 
      min-width: 5rem;
      flex-shrink: 0;
    }
    
    .ticket-title { 
      color: #374151; 
      flex: 1;
    }

    @media (max-width: 768px) {
      .home-container { 
        padding: 1rem; 
      }
      
      .cards-grid { 
        grid-template-columns: 1fr; 
        gap: 1rem; 
      }
      
      .card { 
        padding: 1.25rem; 
      }
      
      .card-icon { 
        width: 2.5rem;
        height: 2.5rem;
      }
      
      .card-icon i { 
        font-size: 1.25rem; 
      }
      
      .count { 
        font-size: 1.75rem; 
      }
    }
    `
  ]
})
export class HomeComponent implements OnInit {
  private customersService = inject(SupabaseCustomersService);
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);

  customersCount = 0;
  servicesCount = 0;
  ticketsStats: TicketStats | null = null;
  recentTickets: any[] = [];

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

    } catch (error) {
      console.error('Home: error en loadCounts', error);
    }
  }
}
