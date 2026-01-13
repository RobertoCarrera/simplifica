import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ClientPortalService, ClientPortalTicket, ClientPortalQuote, ClientPortalBooking } from '../../../services/client-portal.service';
import { PortalTicketWizardComponent } from '../ticket-wizard/portal-ticket-wizard.component';
import { PortalBookingWizardComponent } from '../ticket-wizard/portal-booking-wizard.component';

@Component({
  selector: 'app-portal-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, PortalTicketWizardComponent, PortalBookingWizardComponent],
  template: `
  <div class="max-w-6xl mx-auto p-4">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Portal del Cliente</h1>
      <div class="flex items-center gap-3">
        <a routerLink="/configuracion" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2" title="Configuración">
          <i class="fas fa-cog"></i>
        </a>
        <button (click)="showWizard = true" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
          <i class="fas fa-plus"></i> Nuevo Ticket
        </button>
        <button (click)="showBookingWizard = true" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2">
            <i class="fas fa-calendar-plus"></i> Nueva Reserva
        </button>
      </div>
    </div>

    <app-portal-ticket-wizard *ngIf="showWizard" 
      (close)="showWizard = false" 
      (ticketCreated)="onTicketCreated()">
    </app-portal-ticket-wizard>
    
    <app-portal-booking-wizard *ngIf="showBookingWizard"
        (close)="showBookingWizard = false"
        (bookingCreated)="onBookingCreated()">
    </app-portal-booking-wizard>

    <div class="grid md:grid-cols-2 gap-6">
      <!-- Bookings Section -->
      <section class="bg-white rounded-xl shadow p-4 md:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Mis Reservas</h2>
          <span class="text-sm text-gray-500">{{ bookings.length }} total</span>
        </div>
        <div *ngIf="loadingBookings" class="text-gray-600">Cargando reservas...</div>
        <div *ngIf="!loadingBookings && bookings.length === 0" class="text-gray-500">No tienes reservas activas.</div>
        
        <div class="overflow-x-auto" *ngIf="bookings.length > 0">
            <table class="w-full text-left text-sm text-gray-600">
                <thead class="bg-gray-50 text-gray-700 font-medium">
                    <tr>
                        <th class="px-4 py-2">Fecha</th>
                        <th class="px-4 py-2">Servicio</th>
                        <th class="px-4 py-2">Profesional</th>
                        <th class="px-4 py-2">Estado</th>
                        <th class="px-4 py-2 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    <tr *ngFor="let b of bookings" class="hover:bg-gray-50">
                        <td class="px-4 py-3">
                            <div class="font-medium text-gray-900">{{ b.start_time | date:'mediumDate' }}</div>
                            <div class="text-xs">{{ b.start_time | date:'shortTime' }} - {{ b.end_time | date:'shortTime' }}</div>
                        </td>
                        <td class="px-4 py-3">{{ b.service_name }}</td>
                        <td class="px-4 py-3">{{ b.professional_name || 'Cualquiera' }}</td>
                        <td class="px-4 py-3">
                            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                [ngClass]="{
                                    'bg-green-100 text-green-800': b.status === 'confirmed',
                                    'bg-yellow-100 text-yellow-800': b.status === 'pending',
                                    'bg-red-100 text-red-800': b.status === 'cancelled'
                                }">
                                {{ b.status === 'confirmed' ? 'Confirmada' : (b.status === 'pending' ? 'Pendiente' : 'Cancelada') }}
                            </span>
                        </td>
                        <td class="px-4 py-3 text-right">
                            <button *ngIf="b.status !== 'cancelled'" 
                                (click)="cancelBooking(b)"
                                class="text-red-600 hover:text-red-800 text-xs font-medium border border-red-200 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                                Cancelar
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
      </section>

      <section class="bg-white rounded-xl shadow p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Tus tickets</h2>
          <div class="flex items-center gap-3">
             <span class="text-sm text-gray-500">{{ tickets.length }} total</span>
          </div>
        </div>
        <div *ngIf="loadingTickets" class="text-gray-600">Cargando tickets…</div>
        <div *ngIf="!loadingTickets && tickets.length === 0" class="text-gray-500">No hay tickets.</div>
        <ul class="divide-y">
          <li *ngFor="let t of tickets" class="py-3 flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-medium" [class.font-extrabold]="t.is_opened === false">{{ t.title }}</h3>
                <span *ngIf="t.is_opened === false" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Nuevo</span>
              </div>
              <p class="text-sm text-gray-600 line-clamp-2" *ngIf="t.description">{{ t.description }}</p>
              <p class="text-xs text-gray-400 mt-1">Actualizado: {{ t.updated_at | date:'short' }}</p>
            </div>
            <button class="text-sm text-indigo-600 hover:underline" (click)="openTicket(t)">Abrir</button>
          </li>
        </ul>
      </section>

      <section class="bg-white rounded-xl shadow p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Tus presupuestos</h2>
          <span class="text-sm text-gray-500">{{ quotes.length }} total</span>
        </div>
        <div *ngIf="loadingQuotes" class="text-gray-600">Cargando presupuestos…</div>
        <div *ngIf="!loadingQuotes && quotes.length === 0" class="text-gray-500">No hay presupuestos.</div>
        <ul class="divide-y">
          <li *ngFor="let q of quotes" class="py-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">{{ q.full_quote_number }} — {{ q.title }}</div>
                <div class="text-xs text-gray-500">{{ q.quote_date | date }} · Estado: {{ q.status }} · Total: {{ q.total_amount | number:'1.2-2' }} €</div>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
  `
})
export class PortalDashboardComponent implements OnInit {
  private portal = inject(ClientPortalService);

  tickets: ClientPortalTicket[] = [];
  quotes: ClientPortalQuote[] = [];
  bookings: ClientPortalBooking[] = [];
  loadingTickets = false;
  loadingQuotes = false;
  loadingBookings = false;
  showWizard = false;
  showBookingWizard = false;

  async ngOnInit() {
    await Promise.all([this.loadTickets(), this.loadQuotes(), this.loadBookings()]);
  }

  async loadTickets() {
    this.loadingTickets = true;
    const { data } = await this.portal.listTickets();
    this.tickets = data;
    this.loadingTickets = false;
  }

  async onTicketCreated() {
    this.showWizard = false;
    await this.loadTickets();
    await this.loadTickets();
  }

  async onBookingCreated() {
    this.showBookingWizard = false;
    await Promise.all([
      this.loadBookings(),
      this.loadQuotes(),
      this.loadTickets()
    ]);
  }

  async loadQuotes() {
    this.loadingQuotes = true;
    const { data } = await this.portal.listQuotes();
    this.quotes = data;
    this.loadingQuotes = false;
  }

  async openTicket(ticket: ClientPortalTicket) {
    // Mark as opened in DB and update local state.
    await this.portal.markTicketOpened(ticket.id);
    ticket.is_opened = true;
  }

  async loadBookings() {
    this.loadingBookings = true;
    const { data } = await this.portal.listBookings();
    this.bookings = data || [];
    this.loadingBookings = false;
  }

  async cancelBooking(booking: ClientPortalBooking) {
    if (!confirm('¿Estás seguro de que deseas cancelar esta reserva?')) return;

    const reason = prompt('Motivo de la cancelación (opcional):') || undefined;

    const res = await this.portal.cancelBooking(booking.id, reason);
    if (res.success) {
      alert('Reserva cancelada correctamente.');
      await this.loadBookings();
    } else {
      alert('No se pudo cancelar: ' + (res.error || 'Error desconocido'));
    }
  }
}
