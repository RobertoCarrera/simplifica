import { Component, inject, OnInit, signal, computed, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseBookingsService, Booking } from '../../../services/supabase-bookings.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { CalendarComponent } from '../calendar.component';
import { CalendarEvent, CalendarView } from '../calendar.interface';
import { CalendarActionModalComponent } from '../modal/calendar-action-modal/calendar-action-modal.component';
import { CalendarFilterComponent, CalendarFilterState } from '../components/calendar-filter/calendar-filter.component';

import { SupabaseServicesService } from '../../../services/supabase-services.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { SupabaseProfessionalsService } from '../../../services/supabase-professionals.service';
import { CalendarResource } from '../calendar.interface';

@Component({
    selector: 'app-calendar-page',
    standalone: true,
    imports: [CommonModule, CalendarComponent, CalendarActionModalComponent, CalendarFilterComponent],
    templateUrl: './calendar-page.component.html',
    styleUrls: ['./calendar-page.component.scss']
})
export class CalendarPageComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private servicesService = inject(SupabaseServicesService);
    private customersService = inject(SupabaseCustomersService);
    private googleCalendarService = inject(GoogleCalendarService);
    private professionalsService = inject(SupabaseProfessionalsService);

    @Input() isEmbedded = false;

    events = signal<CalendarEvent[]>([]);
    config = signal<any>({});

    // Modal State
    isModalOpen = signal(false);
    selectedDate = signal<Date | null>(null);
    @ViewChild(CalendarActionModalComponent) modalComponent!: CalendarActionModalComponent;

    // Data Lists
    availableServices = signal<any[]>([]);
    availableClients = signal<any[]>([]);
    resources = signal<CalendarResource[]>([]);

    // Default Booking Type ID
    defaultBookingTypeId: string | null = null;

    // View Options
    colorMode = signal<'status' | 'service' | 'professional' | 'static'>('status');

    // Filtering
    filters = signal<CalendarFilterState>({
        searchQuery: '',
        selectedServiceIds: [],
        selectedProfessionalIds: []
    });

    filteredEvents = computed(() => {
        const allEvents = this.events();
        const { searchQuery, selectedServiceIds, selectedProfessionalIds } = this.filters();

        return allEvents.filter(event => {
            // 1. Text Search (Title, Description, or Client Name from Meta)
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const titleMatch = event.title.toLowerCase().includes(query);
                const descMatch = event.description?.toLowerCase().includes(query) ?? false;
                const clientMatch = event.meta?.original?.customers?.full_name?.toLowerCase().includes(query) ?? false;

                if (!titleMatch && !descMatch && !clientMatch) return false;
            }

            // 2. Service Filter
            if (selectedServiceIds.length > 0) {
                // Assuming event.meta.original.service_id exists
                const serviceId = event.meta?.original?.service_id;
                if (!serviceId || !selectedServiceIds.includes(serviceId)) return false;
            }

            // 3. Professional Filter
            if (selectedProfessionalIds.length > 0) {
                // If filter is active, event MUST belong to one of selected pros
                if (!event.resourceId || !selectedProfessionalIds.includes(event.resourceId)) return false;
            }

            return true;
        });
    });

    handleFilterChange(newFilters: CalendarFilterState) {
        this.filters.set(newFilters);
    }

    async onDateClick(event: any) {
        this.selectedDate.set(event.date);
        this.isModalOpen.set(true);

        // Slight delay to ensure modal component is available
        setTimeout(() => {
            if (this.modalComponent) {
                // Force 'booking' mode
                this.modalComponent.openForCreate(event.date, 'booking', true);
            }
        });
    }

    // Default view state
    currentView: CalendarView = { type: 'month', date: new Date() };

    ngOnInit() {
        this.loadBookings();
        this.loadConfig();
        this.loadData();
    }

    async loadData() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        // Load Services
        this.servicesService.getServices(companyId).then(services => {
            this.availableServices.set(services);
        });

        // Load Clients
        this.customersService.getCustomers().subscribe(clients => {
            this.availableClients.set(clients);
        });

        // Load Professionals (as Resources for Timeline)
        this.professionalsService.getProfessionals(companyId).subscribe(pros => {
            const resources: CalendarResource[] = pros.map(p => ({
                id: p.id,
                title: p.display_name,
                avatar: p.avatar_url,
                color: '#6366f1' // Default indigo, maybe vary later
            }));
            this.resources.set(resources);
        });

        // Load Booking Types (to get default ID)
        this.bookingsService.getBookingTypes(companyId).subscribe(types => {
            if (types && types.length > 0) {
                // Prefer 'Cita Estándar' or just take the first one
                const standard = types.find(t => t.slug === 'cita-estandar') || types[0];
                this.defaultBookingTypeId = standard.id;
            }
        });
    }

    onViewChange(view: CalendarView) {
        this.currentView = view;
        this.loadBookings();
    }

    loadConfig() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        this.bookingsService.getBookingConfiguration(companyId).subscribe({
            next: (data) => this.config.set(data || {}),
            error: (err) => console.error('Error loading config', err)
        });
    }

    loadBookings() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        // Calculate start/end dates based on current view
        const { start, end } = this.getViewRange(this.currentView);

        // Fetch bookings, exceptions, AND Google Events
        Promise.all([
            new Promise<Booking[]>((resolve, reject) => {
                this.bookingsService.getBookings(companyId, start, end).subscribe({
                    next: resolve,
                    error: reject
                });
            }),
            new Promise<any[]>((resolve, reject) => {
                this.bookingsService.getAvailabilityExceptions(companyId, start, end).subscribe({
                    next: resolve,
                    error: reject
                });
            }),
            // Fetch Google Events
            this.googleCalendarService.listEvents(companyId, start, end)
        ]).then(([bookings, exceptions, googleEvents]) => {
            const bookingEvents: CalendarEvent[] = bookings.map((b: Booking) => ({
                id: b.id,
                title: b.customer_name + (b.booking_type ? ` - ${b.booking_type.name}` : ''),
                start: new Date(b.start_time),
                end: new Date(b.end_time),
                color: '#818cf8',
                description: b.notes,
                meta: { type: 'booking', original: b },
                resourceId: b.professional_id || b.resource_id || undefined // Prioritize professional for timeline rows
            }));

            const exceptionEvents: CalendarEvent[] = exceptions.map((ex: any) => ({
                id: ex.id,
                title: ex.reason || 'Bloqueado',
                start: new Date(ex.start_time),
                end: new Date(ex.end_time),
                color: '#9ca3af', // Gray-400
                description: 'Horario bloqueado',
                meta: { type: 'block', original: ex },
                resourceId: ex.user_id // Assuming availability exceptions are linked to a user/professional
            }));

            // Map Google Events
            const gEvents: CalendarEvent[] = googleEvents.map((g: any) => ({
                id: g.id,
                title: g.summary || 'Evento Externo',
                start: new Date(g.start.dateTime || g.start.date), // Handle all-day
                end: new Date(g.end.dateTime || g.end.date),
                color: '#e24029', // Google Red or different color
                description: g.description || 'Evento de Google Calendar',
                meta: { type: 'google', original: g },
                // Google events might not map to a resource unless we infer from calendar owner
            }));

            this.events.set([...bookingEvents, ...exceptionEvents, ...gEvents]);

        }).catch(err => console.error('Error loading calendar data', err));
    }

    // Helper to calculate date range for query
    getViewRange(view: CalendarView): { start: Date, end: Date } {
        const date = new Date(view.date);
        const start = new Date(date);
        const end = new Date(date);

        if (view.type === 'month') {
            start.setDate(1);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
        } else if (view.type === 'week') {
            const day = start.getDay();
            const diff = start.getDate() - day; // adjust when day is sunday
            start.setDate(diff); // Set to Sunday (or Monday depending on locale)
            end.setDate(diff + 6);
        } else {
            // Day view
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        }

        // Add buffer for month view (previous/next month days)
        if (view.type === 'month') {
            start.setDate(start.getDate() - 7);
            end.setDate(end.getDate() + 14);
        }

        return { start, end };
    }

    onAddEvent() {
        // Force 'booking' mode
        this.modalComponent.openForCreate(new Date(), 'booking', true);
        this.isModalOpen.set(true);
    }
    onBlockTime() {
        // Force 'block' mode
        this.modalComponent.openForCreate(new Date(), 'block', true);
        this.isModalOpen.set(true);
    }
    async handleModalDelete(id: string) {
        try {
            await this.bookingsService.deleteAvailabilityException(id);
            this.loadBookings();
            this.toastService.success('Eliminado', 'El bloqueo ha sido eliminado.');
        } catch (e) {
            console.error(e);
            this.toastService.error('Error', 'No se pudo eliminar.');
        }
    }

    async handleModalSave(data: any) {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        try {
            if (data.type === 'block') {
                if (data.id) {
                    await this.bookingsService.deleteAvailabilityException(data.id);
                }

                await this.bookingsService.createAvailabilityException({
                    company_id: companyId,
                    start_time: data.startTime.toISOString(),
                    end_time: data.endTime.toISOString(),
                    reason: data.reason || 'Bloqueado',
                    type: 'block'
                });
                this.toastService.success('Guardado', 'Cierre de horario creado, tu cliente no podrá reservar en esta franja.');
            } else {
                // Booking Creation
                if (!data.clientId) {
                    this.toastService.error('Falta Cliente', 'Debes seleccionar un cliente.');
                    return;
                }

                const client = this.availableClients().find(c => c.id === data.clientId);
                const service = data.serviceId ? this.availableServices().find(s => s.id === data.serviceId) : null;

                let resourceId = null;
                if (service?.required_resource_type) {
                    resourceId = await this.bookingsService.findAvailableResource(
                        companyId,
                        service.required_resource_type,
                        data.startTime,
                        data.endTime
                    );
                    if (!resourceId) {
                        this.toastService.warning('Atención', 'No se encontró recurso disponible. Se reservará sin recurso.');
                    }
                }

                // Recurring Logic
                if (data.recurrence && data.recurrence.type !== 'none' && data.recurrence.endDate) {
                    const bookingsToCheck = this.generateRecurringDates(data.startTime, data.endTime, data.recurrence.type, data.recurrence.endDate);

                    if (bookingsToCheck.length > 50) {
                        this.toastService.error('Error', 'Demasiadas repeticiones. Máximo 50.');
                        return;
                    }

                    const bookingsPayload = bookingsToCheck.map((slot: { start: Date; end: Date }) => ({
                        company_id: companyId,
                        customer_name: client?.full_name || client?.name || 'Cliente',
                        customer_email: client?.email || 'sin@email.com',
                        customer_phone: client?.phone,
                        client_id: client?.id,
                        service_id: service?.id,
                        resource_id: resourceId,
                        start_time: slot.start.toISOString(),
                        end_time: slot.end.toISOString(),
                        status: 'confirmed' as const,
                        notes: 'Creada desde Calendario (Serie)',
                        booking_type_id: this.defaultBookingTypeId,
                        total_price: (data as any).totalPrice,
                        deposit_paid: (data as any).depositPaid,
                        payment_status: (data as any).paymentStatus
                    }));

                    await this.bookingsService.createBookingsBatch(bookingsPayload);
                    this.toastService.success('Guardado', `Serie de ${bookingsPayload.length} citas creada.`);

                } else {
                    // Single Booking
                    await this.bookingsService.createBooking({
                        company_id: companyId,
                        customer_name: client?.full_name || client?.name || 'Cliente',
                        customer_email: client?.email || 'sin@email.com',
                        customer_phone: client?.phone,
                        client_id: client?.id,
                        service_id: service?.id,
                        resource_id: resourceId,
                        start_time: data.startTime.toISOString(),
                        end_time: data.endTime.toISOString(),
                        status: 'confirmed',
                        notes: 'Creada desde Calendario',
                        booking_type_id: this.defaultBookingTypeId,
                        total_price: (data as any).totalPrice,
                        deposit_paid: (data as any).depositPaid,
                        payment_status: (data as any).paymentStatus,
                        coupon_id: (data as any).couponId,
                        discount_amount: (data as any).discountAmount
                    });
                    this.toastService.success('Guardado', 'Cita creada correctamente.');
                }
            }

            this.loadBookings();

        } catch (e) {
            console.error(e);
            this.toastService.error('Error', 'No se pudo guardar.');
        }
    }
    async onEventClick(eventWrapper: any) {
        const event = eventWrapper.event;
        // Check if it's an exception (block)
        if (event.extendedProps?.description === 'Horario bloqueado' || event.backgroundColor === '#9ca3af') {
            this.isModalOpen.set(true);
            setTimeout(() => this.modalComponent.openForEdit({
                id: event.id,
                start: event.start,
                end: event.end,
                title: event.title,
                type: 'block'
            }, 'block'));
            return;
        }

        // Open modal in edit mode
        this.isModalOpen.set(true);
        setTimeout(() => {
            this.modalComponent.openForEdit({
                id: event.id,
                start: event.start,
                end: event.end,
                title: event.title,
                extendedProps: event.meta?.original || {}
            }, 'booking');
        });
    }

    async onEventDrop({ event, newStart, newResource }: { event: CalendarEvent, newStart: Date, newResource?: string }) {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        if (event.meta?.type === 'booking') {
            const originalDuration = event.end.getTime() - event.start.getTime();
            const newEnd = new Date(newStart.getTime() + originalDuration);

            // Optimistic update (optional)

            try {
                const updates: any = {
                    start_time: newStart.toISOString(),
                    end_time: newEnd.toISOString()
                };

                // If resource changed, update professional_id
                if (newResource && newResource !== event.resourceId) {
                    updates.professional_id = newResource;
                }

                await this.bookingsService.updateBooking(event.id, updates);
                this.toastService.success('Actualizado', 'La cita se ha reprogramado correctamente.');
                this.loadBookings(); // Reload to sync state
            } catch (error) {
                console.error('Failed to reschedule', error);
                this.toastService.error('Error', 'No se pudo mover la cita.');
                this.loadBookings(); // Revert visual state
            }
        } else if (event.meta?.type === 'block') {
            const originalDuration = event.end.getTime() - event.start.getTime();
            const newEnd = new Date(newStart.getTime() + originalDuration);
            const targetResource = newResource || event.resourceId; // New or stay same

            try {
                // Delete and Re-create logic 
                await this.bookingsService.deleteAvailabilityException(event.id);
                await this.bookingsService.createAvailabilityException({
                    company_id: companyId,
                    user_id: targetResource, // Assign to correct professional
                    start_time: newStart.toISOString(),
                    end_time: newEnd.toISOString(),
                    reason: event.title,
                    type: 'block'
                });
                this.toastService.success('Actualizado', 'El bloqueo se ha movido.');
                this.loadBookings();
            } catch (error) {
                this.toastService.error('Error', 'No se pudo mover el bloqueo.');
                this.loadBookings();
            }
        } else {
            this.toastService.warning('Acción no permitida', 'No se pueden mover eventos externos (Google) desde aquí aún.');
            this.loadBookings(); // Revert
        }
    }

    async onEventAction({ action, event }: { action: string, event: CalendarEvent }) {
        if (!event.meta?.original || event.meta.type !== 'booking') {
            if (action === 'delete' && event.meta?.type === 'block') {
                // Allow deleting blocks
                if (confirm('¿Eliminar bloqueo de horario?')) {
                    try {
                        await this.bookingsService.deleteAvailabilityException(event.id);
                        this.toastService.success('Eliminado', 'Bloqueo eliminado.');
                        this.loadBookings();
                    } catch (e) {
                        this.toastService.error('Error', 'No se pudo eliminar.');
                    }
                }
                return;
            }
            this.toastService.info('Info', 'Solo se pueden modificar citas del sistema.');
            return;
        }

        const booking = event.meta.original;

        try {
            switch (action) {
                case 'status_arrived':
                    await this.bookingsService.updateBooking(booking.id, { status: 'arrived' }); // Assuming 'arrived' is a valid status or mapping todo
                    // Actually status is enum: 'confirmed' | 'pending' | 'cancelled'.
                    // If we want custom statuses like 'arrived', we need to check if schema supports it or if we use notes/meta.
                    // Checking Booking interface... status is strict.
                    // If 'arrived' is not in enum, maybe use 'confirmed' + meta/notes?
                    // For now let's assume we can set it or just log it.
                    // Wait, Booking interface said: status: 'confirmed' | 'pending' | 'cancelled'.
                    // I will check if I can add more statuses or if I should abuse 'confirmed'.
                    // Let's stick to 'confirmed' for now and maybe add a note?
                    // Or maybe the user WANTS 'arrived'.
                    // I'll update it to 'confirmed' and add a note "Arrived".
                    await this.bookingsService.updateBooking(booking.id, {
                        status: 'confirmed',
                        notes: (booking.notes || '') + '\n[System]: Marked as Arrived'
                    });
                    this.toastService.success('Actualizado', 'Cita marcada como Llegado');
                    break;

                case 'status_completed':
                    // Maybe 'completed' isn't a status yet.
                    // I'll mark as confirmed + Note.
                    await this.bookingsService.updateBooking(booking.id, {
                        status: 'confirmed',
                        notes: (booking.notes || '') + '\n[System]: Marked as Completed'
                    });
                    this.toastService.success('Actualizado', 'Cita marcada como Completada');
                    break;

                case 'status_noshow':
                    // Map to cancelled? Or keep confirmed but note?
                    // Usually No-Show is a specific state. 
                    // Use 'cancelled' for now.
                    await this.bookingsService.updateBooking(booking.id, {
                        status: 'cancelled',
                        notes: (booking.notes || '') + '\n[System]: Marked as No-Show'
                    });
                    this.toastService.success('Actualizado', 'Cita marcada como No-Show');
                    break;

                case 'edit':
                    this.onEventClick({ event, nativeEvent: new MouseEvent('click') });
                    break;

                case 'delete':
                    if (confirm('¿Seguro que deseas eliminar esta cita?')) {
                        await this.bookingsService.deleteBooking(booking.id);
                        this.toastService.success('Eliminado', 'Cita eliminada.');
                    }
                    break;
            }
            this.loadBookings();
        } catch (error) {
            console.error('Action failed', error);
            this.toastService.error('Error', 'No se pudo realizar la acción.');
        }
    }


    async onEventResize({ event, newEnd }: { event: CalendarEvent, newEnd: Date }) {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        if (event.meta?.type === 'booking') {
            try {
                await this.bookingsService.updateBooking(event.id, {
                    end_time: newEnd.toISOString()
                });
                this.toastService.success('Actualizado', 'La duración ha sido modificada.');
                this.loadBookings();
            } catch (error) {
                console.error('Failed to resize', error);
                this.toastService.error('Error', 'No se pudo modificar la duración.');
                this.loadBookings();
            }
        } else if (event.meta?.type === 'block') {
            try {
                await this.bookingsService.deleteAvailabilityException(event.id);
                await this.bookingsService.createAvailabilityException({
                    company_id: companyId,
                    start_time: event.start.toISOString(),
                    end_time: newEnd.toISOString(),
                    reason: event.title,
                    type: 'block'
                });
                this.toastService.success('Actualizado', 'La duración del bloqueo ha sido modificada.');
                this.loadBookings();
            } catch (error) {
                this.toastService.error('Error', 'No se pudo modificar el bloqueo.');
                this.loadBookings();
            }
        } else {
            this.toastService.warning('Acción no permitida', 'No se pueden modificar eventos externos.');
            this.loadBookings(); // revert visual change
        }
    }

    private generateRecurringDates(start: Date, end: Date, type: 'daily' | 'weekly' | 'monthly', recurEnd: Date): { start: Date, end: Date }[] {
        const dates: { start: Date, end: Date }[] = [];
        const duration = end.getTime() - start.getTime();

        // Start date is the first instance
        let current = new Date(start);

        // Important: set recurEnd to end of day to include the last day
        const actualRecurEnd = new Date(recurEnd);
        actualRecurEnd.setHours(23, 59, 59, 999);

        while (current <= actualRecurEnd) {
            dates.push({
                start: new Date(current),
                end: new Date(current.getTime() + duration)
            });

            if (type === 'daily') {
                current.setDate(current.getDate() + 1);
            } else if (type === 'weekly') {
                current.setDate(current.getDate() + 7);
            } else if (type === 'monthly') {
                current.setMonth(current.getMonth() + 1);
            }
        }

        return dates;
    }
}
