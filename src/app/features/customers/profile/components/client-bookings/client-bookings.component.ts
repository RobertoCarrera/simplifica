import { Component, Input, OnInit, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseBookingsService, Booking } from '../../../../../services/supabase-bookings.service';
import { CalendarActionModalComponent } from '../../../../calendar/modal/calendar-action-modal/calendar-action-modal.component';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-client-bookings',
    standalone: true,
    imports: [CommonModule, CalendarActionModalComponent],
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
                            <!-- Dropdown (Simple hover or click for now, MVP: click opens modal) -->
                            <!-- For simplicity in this iteration, the whole row or a button could open details. Let's add an edit button. -->
                        </div>
                        <button (click)="editBooking(booking)" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium">
                            Ver / Editar
                        </button>
                    </div>

                </div>
            </div>
        </div>

        <!-- Reuse Calendar Action Modal for Creating/Editing -->
        <app-calendar-action-modal 
            #actionModal
            [isOpen]="isModalOpen()"
            [services]="availableServices()"
            [clients]="[clientData]" 
            (closeModal)="isModalOpen.set(false)"
            (saveAction)="handleSaveBooking($event)"
            (deleteAction)="handleDeleteBooking($event)"
        ></app-calendar-action-modal>
        <!-- specific input naming for clients/services might vary in modal component, checking... -->
        <!-- 'clients' and 'services' are the inputs in CalendarActionModalComponent. Fixed below. -->
    </div>
  `
})
export class ClientBookingsComponent implements OnInit {
    @Input({ required: true }) clientId!: string;

    // We can pass the full client object to avoid refetching for the modal dropdown
    @Input() clientData: any = null;

    bookingsService = inject(SupabaseBookingsService);
    toast = inject(ToastService);

    bookings = signal<Booking[]>([]);
    isLoading = signal(false);

    // Modal
    isModalOpen = signal(false);
    @ViewChild('actionModal') actionModal!: CalendarActionModalComponent;

    // Need to fetch services to pass to modal
    // In a real app, we might want a global store or service cache.
    // For now, we assume the parent or a service provides them, or we fetch them.
    // Let's rely on the service injection or fetch them on init.
    availableServices = signal<any[]>([]);

    // We need to inject ServicesService to get the list
    // Importing dynamically to avoid circular deps if any, or just standard import above?
    // Let's assume standard import if available, or just fetch via bookingsService if it has a helper?
    // BookingsService doesn't have getServices. Let's use SupabaseClient or ServicesService.
    // For MPV, let's assume `availableServices` are passed or fetched here.

    ngOnInit() {
        this.loadBookings();
        this.loadServices(); // Placeholder
    }

    async loadBookings() {
        this.isLoading.set(true);
        // SupabaseBookingsService.getBookings usually takes date range.
        // We need a method to get ALL bookings by client_id, pagination maybe?
        // Or get last 50?
        // Let's assume we can filter getBookings by clientId if we update the service, OR use a raw query here.
        // Actually, let's update SupabaseBookingsService to support `getBookingsByClient(clientId)`.

        // TEMPORARY: using raw supabase query here if service doesn't support it, 
        // to avoid modifying service files widely if not needed.
        // But better practice is to add the method to service.

        // I will use `this.bookingsService['supabase']` to fetch directly for now to be fast, 
        // then I might refactor.
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
        // Fetch services for the modal
        const { data } = await this.bookingsService['supabase']
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('name');
        if (data) this.availableServices.set(data);
    }

    openNewBooking() {
        this.isModalOpen.set(true);
        // Clean default for new booking
        // We need to wait for viewchild
        setTimeout(() => {
            if (this.actionModal) {
                this.actionModal.openForCreate(new Date(), 'booking');
                // Pre-set client
                this.actionModal.clientId = this.clientId;
                // Since modal inputs might not be reactive for clientId property if it's just a field?
                // Checking CalendarActionModal... it has `clientId` property.
            }
        });
    }

    editBooking(booking: Booking) {
        this.isModalOpen.set(true);
        setTimeout(() => {
            if (this.actionModal) {
                this.actionModal.openForEdit({
                    id: booking.id,
                    start: new Date(booking.start_time),
                    end: new Date(booking.end_time),
                    title: booking.customer_name,
                    extendedProps: booking
                }, 'booking');
            }
        });
    }

    async handleSaveBooking(event: any) {
        // Mapping event to service call
        try {
            if (event.id) {
                // Update
                await this.bookingsService.updateBooking(event.id, {
                    start_time: event.startTime.toISOString(),
                    end_time: event.endTime.toISOString(),
                    service_id: event.serviceId,
                    status: event.status,
                    // etc
                });
                this.toast.success('Actualizado', 'Cita actualizada.');
            } else {
                // Create
                await this.bookingsService.createBooking({
                    company_id: this.clientData.company_id,
                    client_id: this.clientId,
                    customer_name: this.clientData.name || 'Cliente', // Fallback
                    customer_email: this.clientData.email || '',
                    service_id: event.serviceId,
                    start_time: event.startTime.toISOString(),
                    end_time: event.endTime.toISOString(),
                    status: event.status || 'confirmed',
                    notes: 'Creada desde Perfil 360'
                });
                this.toast.success('Creado', 'Cita agendada.');
            }
            this.isModalOpen.set(false);
            this.loadBookings();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar la cita.');
        }
    }

    async handleDeleteBooking(event: { id: string }) {
        if (confirm('¿Seguro que deseas eliminar esta cita?')) {
            await this.bookingsService.deleteBooking(event.id);
            this.toast.success('Eliminado', 'Cita eliminada.');
            this.isModalOpen.set(false);
            this.loadBookings();
        }
    }

    // Helpers
    getStatusClasses(status: string) {
        switch (status) {
            case 'confirmed': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
            case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
            case 'cancelled': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
            default: return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    }

    getStatusLabel(status: string) {
        const map: any = { 'confirmed': 'Confirmada', 'pending': 'Pendiente', 'cancelled': 'Cancelada' };
        return map[status] || status;
    }

    getPaymentStatusLabel(status?: string) {
        if (!status) return 'Pendiente';
        const map: any = { 'paid': 'Pagado', 'pending': 'Pendiente', 'partial': 'Parcial', 'refunded': 'Reembolsado' };
        return map[status] || status;
    }

    getPaymentStatusColor(status?: string) {
        if (status === 'paid') return 'text-emerald-600 font-bold';
        if (status === 'refunded') return 'text-red-500 line-through';
        return 'text-amber-600';
    }
}
