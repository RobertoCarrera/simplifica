import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ClientPortalService, ClientPortalTicket, ClientPortalQuote } from '../../services/client-portal.service';

@Component({
  selector: 'app-portal-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="max-w-6xl mx-auto p-4">
    <h1 class="text-2xl font-bold mb-6">Portal del Cliente</h1>

    <div class="grid md:grid-cols-2 gap-6">
      <section class="bg-white rounded-xl shadow p-4">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold">Tus tickets</h2>
          <span class="text-sm text-gray-500">{{ tickets.length }} total</span>
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
  loadingTickets = false;
  loadingQuotes = false;

  async ngOnInit() {
    await Promise.all([this.loadTickets(), this.loadQuotes()]);
  }

  async loadTickets() {
    this.loadingTickets = true;
    const { data } = await this.portal.listTickets();
    this.tickets = data;
    this.loadingTickets = false;
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
}
