import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseBookingsService, Booking } from '../../../../../services/supabase-bookings.service';
// import { CalendarActionModalComponent } from '../../../../calendar/modal/calendar-action-modal/calendar-action-modal.component';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-client-bookings',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="space-y-6">
        <!-- Header Actions -->
        <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Agenda del Cliente</h3>
            <button (click)="openNewBooking()" 
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
                <i class="fas fa-plus"></i> Nueva Cita
            </button>
        </div>

        <!-- Bookings List -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
            
            <div *ngIf="isLoading()" class="p-8 flex justify-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>

            <div *ngIf="!isLoading() && bookings().length === 0" class="p-8 text-center text-gray-500 dark:text-gray-400">
                <i class="fas fa-calendar-times text-4xl mb-3 opacity-50"></i>
                <p>No hay citas registradas para este cliente.</p>
            </div>

            <div *ngIf="!isLoading() && bookings().length > 0" class="divide-y divide-gray-100 dark:divide-slate-700">
                <div *ngFor="let booking of bookings()" class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    
                    <!-- Info -->
                    <div class="flex items-start gap-4">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg flex flex-col items-center justify-center border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700">
                            <span class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{{ booking.start_time | date:'MMM' }}</span>
                            <span class="text-lg font-bold text-gray-900 dark:text-white">{{ booking.start_time | date:'dd' }}</span>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-gray-900 dark:text-white">
                                {{ booking.service?.name || 'Servicio Personalizado' }}
                            </h4>
                            <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                                <span><i class="fas fa-clock mr-1"></i> {{ booking.start_time | date:'shortTime' }} - {{ booking.end_time | date:'shortTime' }}</span>
                                <span *ngIf="booking.professional?.user?.name" class="hidden sm:inline">
                                    <i class="fas fa-user-tie mr-1 ml-2"></i> {{ booking.professional?.user?.name }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Status & Price -->
                    <div class="flex items-center gap-4 ml-16 sm:ml-0">
                         <!-- Status Badge -->
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-medium border"
                            [ngClass]="getStatusClasses(booking.status)">
                            {{ getStatusLabel(booking.status) }}
                        </span>

                        <!-- Price -->
                        <div class="text-right min-w-[80px]">
                            <span class="block text-sm font-bold text-gray-900 dark:text-white">
                                {{ booking.total_price || 0 | currency:'EUR' }}
                            </span>
                            <span class="text-xs" [ngClass]="getPaymentStatusColor(booking.payment_status)">
                                {{ getPaymentStatusLabel(booking.payment_status) }}
                            </span>
                        </div>

                        <!-- Actions -->
                        <div class="relative group">
                            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                        <button (click)="editBooking(booking)" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium">
                            Ver / Editar
                        </button>
                    </div>

                </div>
            </div>
        </div>

        <!-- Reuse Calendar Action Modal for Creating/Editing -->
        <!-- TODO: Restore modal once available -->
        <!-- <app-calendar-action-modal 
            #actionModal
            [isOpen]="isModalOpen()"
            [services]="availableServices()"
            [clients]="[clientData]" 
            (closeModal)="isModalOpen.set(false)"
            (saveAction)="handleSaveBooking($event)"
            (deleteAction)="handleDeleteBooking($event)"
        ></app-calendar-action-modal> -->
    </div>
  `
})
export class ClientBookingsComponent implements OnInit {
    @Input({ required: true }) clientId!: string;
    @Input() clientData: any = null;

    bookingsService = inject(SupabaseBookingsService);
    toast = inject(ToastService);

    bookings = signal<Booking[]>([]);
    isLoading = signal(false);

    // Modal
    isModalOpen = signal(false);
    // @ViewChild('actionModal') actionModal!: CalendarActionModalComponent;

    availableServices = signal<any[]>([]);

    ngOnInit() {
        this.loadBookings();
        this.loadServices();
    }

    async loadBookings() {
        this.isLoading.set(true);
        try {
            const { data, error } = await this.bookingsService['supabase']
                .from('bookings')
                .select('*, booking_type:booking_types(name), service:services(name), professional:professionals(user:users(name))')
                .eq('client_id', this.clientId)
                .order('start_time', { ascending: false })
                .limit(50);

            if (error) throw error;
            this.bookings.set(data as any[]);
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudieron cargar las citas.');
        } finally {
            this.isLoading.set(false);
        }
    }

    async loadServices() {
        // Fetch services for the modal (when active)
        const { data } = await this.bookingsService['supabase']
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (data) this.availableServices.set(data);
    }

    openNewBooking() {
        // this.isModalOpen.set(true);
        // ...
        this.toast.info('En construcción', 'La funcionalidad de crear cita desde perfil estará disponible pronto.');
    }

    editBooking(booking: Booking) {
        // this.isModalOpen.set(true);
        // ...
        this.toast.info('En construcción', 'La funcionalidad de editar cita desde perfil estará disponible pronto.');
    }

    async handleSaveBooking(event: any) {
        // ... existing logic ...
    }

    // Helpers
    getStatusClasses(status: string): string {
        switch (status) {
            case 'confirmed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
            case 'cancelled': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    }

    getStatusLabel(status: string): string {
        const map: any = { 'confirmed': 'Confirmada', 'pending': 'Pendiente', 'cancelled': 'Cancelada' };
        return map[status] || status;
    }

    getPaymentStatusColor(status?: string): string {
        if (status === 'paid') return 'text-green-600 dark:text-green-400';
        if (status === 'pending') return 'text-yellow-600 dark:text-yellow-400';
        return 'text-gray-500';
    }

    getPaymentStatusLabel(status?: string): string {
        const map: any = { 'paid': 'Pagado', 'pending': 'Pendiente', 'partial': 'Parcial', 'refunded': 'Reembolsado' };
        return status ? (map[status] || 'No pagado') : 'No pagado';
    }
}
