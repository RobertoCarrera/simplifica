import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  ClientPortalService,
  ClientPortalTicket,
  ClientPortalQuote,
} from '../../../services/client-portal.service';
import { PortalTicketWizardComponent } from '../ticket-wizard/portal-ticket-wizard.component';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

@Component({
  selector: 'app-portal-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, PortalTicketWizardComponent],
  template: `
    <div class="max-w-6xl mx-auto p-4">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-2xl font-bold">Portal del Cliente</h1>
        <div class="flex items-center gap-3">
          <a
            routerLink="/configuracion"
            class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            title="Configuración"
          >
            <i class="fas fa-cog"></i>
          </a>
          <button
            (click)="showWizard = true"
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <i class="fas fa-plus"></i> Nuevo Ticket
          </button>
        </div>
      </div>

      @if (showWizard) {
        <app-portal-ticket-wizard (close)="showWizard = false" (ticketCreated)="onTicketCreated()">
        </app-portal-ticket-wizard>
      }

      <!-- Waitlist CTA — only shown when moduloReservas is enabled -->
      @if (waitlistModuleEnabled) {
        <div
          class="mb-6 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4 flex items-center justify-between gap-4"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0"
            >
              <i class="fas fa-user-clock"></i>
            </div>
            <div>
              <p class="font-semibold text-gray-900 dark:text-white text-sm">Lista de espera</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Suscríbete a servicios para ser notificado cuando haya disponibilidad.
              </p>
            </div>
          </div>
          <a
            routerLink="/waitlist"
            class="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow-sm"
          >
            <i class="fas fa-list-ul"></i>
            Ver lista de espera
          </a>
        </div>
      }

      <div class="grid md:grid-cols-2 gap-6">
        <section class="bg-white rounded-xl shadow p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Tus tickets</h2>
            <div class="flex items-center gap-3">
              <span class="text-sm text-gray-500">{{ tickets.length }} total</span>
            </div>
          </div>
          @if (loadingTickets) {
            <div class="text-gray-600">Cargando tickets…</div>
          }
          @if (!loadingTickets && tickets.length === 0) {
            <div class="text-gray-500">No hay tickets.</div>
          }
          <ul class="divide-y">
            @for (t of tickets; track t) {
              <li class="py-3 flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium" [class.font-extrabold]="t.is_opened === false">
                      {{ t.title }}
                    </h3>
                    @if (t.is_opened === false) {
                      <span
                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
                        >Nuevo</span
                      >
                    }
                  </div>
                  @if (t.description) {
                    <p class="text-sm text-gray-600 line-clamp-2">{{ t.description }}</p>
                  }
                  <p class="text-xs text-gray-400 mt-1">
                    Actualizado: {{ t.updated_at | date: 'short' }}
                  </p>
                </div>
                <button class="text-sm text-indigo-600 hover:underline" (click)="openTicket(t)">
                  Abrir
                </button>
              </li>
            }
          </ul>
        </section>

        <section class="bg-white rounded-xl shadow p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold">Tus presupuestos</h2>
            <span class="text-sm text-gray-500">{{ quotes.length }} total</span>
          </div>
          @if (loadingQuotes) {
            <div class="text-gray-600">Cargando presupuestos…</div>
          }
          @if (!loadingQuotes && quotes.length === 0) {
            <div class="text-gray-500">No hay presupuestos.</div>
          }
          <ul class="divide-y">
            @for (q of quotes; track q) {
              <li class="py-3">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">{{ q.full_quote_number }} — {{ q.title }}</div>
                    <div class="text-xs text-gray-500">
                      {{ q.quote_date | date }} · Estado: {{ q.status }} · Total:
                      {{ q.total_amount | number: '1.2-2' }} €
                    </div>
                  </div>
                </div>
              </li>
            }
          </ul>
        </section>
      </div>
    </div>
  `,
})
export class PortalDashboardComponent implements OnInit {
  private portal = inject(ClientPortalService);
  private modulesService = inject(SupabaseModulesService);

  tickets: ClientPortalTicket[] = [];
  quotes: ClientPortalQuote[] = [];
  loadingTickets = false;
  loadingQuotes = false;
  showWizard = false;
  waitlistModuleEnabled = false;

  async ngOnInit() {
    await Promise.all([this.loadTickets(), this.loadQuotes(), this.checkWaitlistModule()]);
  }

  private async checkWaitlistModule(): Promise<void> {
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods) => {
        this.waitlistModuleEnabled = mods.some((m) => m.key === 'moduloReservas' && m.enabled);
      },
      error: () => {
        this.waitlistModuleEnabled = false;
      },
    });
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
