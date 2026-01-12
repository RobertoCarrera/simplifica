import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { SupabaseBookingsService, Booking } from '../../../services/supabase-bookings.service';
import { ToastService } from '../../../services/toast.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CalendarComponent } from '../../calendar/calendar.component';

@Component({
    selector: 'app-portal-my-bookings',
    standalone: true,
    imports: [CommonModule, RouterModule, SkeletonComponent, CalendarComponent],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      <div class="max-w-4xl mx-auto">
        
        <!-- Header -->
        <div class="mb-8">
            <div class="flex items-center gap-4 mb-4">
                <a routerLink="/portal/reservas" class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
                    <i class="fas fa-arrow-left text-xl"></i>
                </a>
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Mis Reservas</h1>
                    <p class="text-gray-600 dark:text-gray-400 mt-1">Gestiona tus citas próximas e historial.</p>
                </div>
            </div>

            <!-- View Toggle & Actions -->
            <div class="flex justify-between items-center">
                <div class="bg-white dark:bg-slate-800 rounded-lg p-1 border border-gray-200 dark:border-slate-700 inline-flex">
                    <button (click)="viewMode.set('list')" 
                            class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                            [ngClass]="viewMode() === 'list' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'">
                        <i class="fas fa-list mr-2"></i> Lista
                    </button>
                    <button (click)="viewMode.set('calendar')" 
                            class="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                            [ngClass]="viewMode() === 'calendar' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'">
                        <i class="far fa-calendar-alt mr-2"></i> Calendario
                    </button>
                </div>

                <button routerLink="/portal/reservas" class="hidden sm:flex bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors items-center shadow-lg hover:shadow-xl">
                    <i class="fas fa-plus mr-2"></i> Nueva Reserva
                </button>
            </div>
        </div>

        <!-- Loading -->
        <div *ngIf="loading()" class="space-y-4">
           <app-skeleton type="list" [count]="3"></app-skeleton>
        </div>

        <!-- Empty State -->
        <div *ngIf="!loading() && bookings().length === 0" class="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm">
           <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
              <i class="far fa-calendar text-2xl text-blue-600 dark:text-blue-400"></i>
           </div>
           <h3 class="text-lg font-medium text-gray-900 dark:text-white">No tienes reservas</h3>
           <p class="text-gray-500 dark:text-gray-400 mt-2 mb-6">Aún no has realizado ninguna reserva con nosotros.</p>
           <button routerLink="/portal/reservas" class="text-blue-600 dark:text-blue-400 font-bold hover:underline">
              Reservar ahora
           </button>
        </div>

        <!-- List View -->
        <div *ngIf="!loading() && bookings().length > 0 && viewMode() === 'list'" class="space-y-4 animate-fade-in-up">
           
           <div *ngFor="let booking of bookings()" class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
               
               <!-- Info -->
               <div class="flex items-start gap-4">
                   <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg flex-col leading-none">
                       <span>{{ booking.start_time | date:'d' }}</span>
                       <span class="text-xs uppercase">{{ booking.start_time | date:'MMM' }}</span>
                   </div>
                   <div>
                       <h3 class="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                           {{ booking.service?.name || 'Servicio' }}
                           <span class="text-xs px-2 py-0.5 rounded-full" 
                                 [ngClass]="{
                                   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300': booking.status === 'confirmed',
                                   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300': booking.status === 'pending',
                                   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300': booking.status === 'cancelled'
                                 }">
                               {{ booking.status === 'confirmed' ? 'Confirmada' : (booking.status === 'pending' ? 'Pendiente' : 'Cancelada') }}
                           </span>
                       </h3>
                       <div class="text-gray-600 dark:text-gray-400 text-sm mt-1 flex items-center gap-4">
                           <span><i class="far fa-clock mr-1"></i> {{ booking.start_time | date:'shortTime' }} - {{ booking.end_time | date:'shortTime' }}</span>
                           <span *ngIf="booking.google_event_id" class="text-green-600 dark:text-green-400 text-xs flex items-center" title="Sincronizado con Google Calendar">
                               <i class="fab fa-google mr-1"></i> Sync
                           </span>
                       </div>
                   </div>
               </div>

               <!-- Actions -->
               <div class="flex items-center gap-3">
                   <button *ngIf="canCancel(booking)" 
                           (click)="cancelBooking(booking)" 
                           [disabled]="processingId() === booking.id"
                           class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50">
                       <span *ngIf="processingId() === booking.id"><i class="fas fa-spinner fa-spin mr-1"></i> Cancelando...</span>
                       <span *ngIf="processingId() !== booking.id"><i class="far fa-trash-alt mr-1"></i> Cancelar</span>
                   </button>
               </div>

           </div>
        </div>

        <!-- Calendar View -->
        <div *ngIf="!loading() && bookings().length > 0 && viewMode() === 'calendar'" class="animate-fade-in-up">
            <app-calendar 
                [events]="calendarEvents()"
                [editable]="false"
                [selectable]="false"
                [showAddButton]="false"
                (eventClick)="onCalendarEventClick($event)"
            ></app-calendar>
        </div>

      </div>
    </div>
    `,
    styles: [`
      .animate-fade-in-up { animation: fadeInUp 0.5s ease-out; }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `]
})
export class PortalMyBookingsComponent implements OnInit {
    private authService = inject(AuthService);
    private bookingsService = inject(SupabaseBookingsService);
    private toastService = inject(ToastService);

    loading = signal(true);
    bookings = signal<Booking[]>([]);
    calendarEvents = computed(() => {
        return this.bookings().map(b => ({
            id: b.id,
            title: b.service?.name || 'Cita',
            start: new Date(b.start_time),
            end: new Date(b.end_time),
            description: b.notes,
            // Colors based on status
            color: b.status === 'confirmed' ? '#22c55e' : (b.status === 'cancelled' ? '#ef4444' : '#eab308')
        }));
    });

    viewMode = signal<'list' | 'calendar'>('list');
    processingId = signal<string | null>(null);

    ngOnInit() {
        this.loadBookings();
    }

    async loadBookings() {
        try {
            const companyId = this.authService.currentCompanyId();
            if (!companyId) return;

            this.bookingsService.getMyBookings(companyId).subscribe({
                next: (data) => {
                    this.bookings.set(data);
                    this.loading.set(false);
                },
                error: (err) => {
                    console.error(err);
                    this.loading.set(false);
                }
            });
        } catch (e) {
            console.error(e);
            this.loading.set(false);
        }
    }

    canCancel(booking: Booking): boolean {
        // Can cancel if status is not cancelled AND start time is in future
        if (booking.status === 'cancelled') return false;
        const now = new Date();
        const start = new Date(booking.start_time);
        return start > now;
    }

    async cancelBooking(booking: Booking) {
        if (!confirm('¿Estás seguro de que quieres cancelar esta reserva?')) return;

        this.processingId.set(booking.id);
        try {
            await this.bookingsService.deleteBooking(booking.id);
            this.toastService.success('Cancelada', 'Reserva cancelada correctamente');

            // Refresh local state
            this.bookings.update(list => list.filter(b => b.id !== booking.id));

        } catch (e) {
            console.error(e);
            this.toastService.error('Error', 'Error al cancelar la reserva');
        } finally {
            this.processingId.set(null);
        }
    }

    onCalendarEventClick(eventWrapper: any) {
        const eventId = eventWrapper.event.id;
        const booking = this.bookings().find(b => b.id === eventId);
        if (booking && this.canCancel(booking)) {
            this.cancelBooking(booking);
        }
    }
}
