import { Component, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseServicesService, Service } from '../../../services/supabase-services.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { ToastService } from '../../../services/toast.service';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

@Component({
    selector: 'app-portal-bookings',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, SkeletonComponent],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-slate-900 p-4">
      <div class="max-w-5xl mx-auto">
        
        <!-- Header -->
        <div class="mb-8 flex justify-between items-start">
          <div>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Reservar Cita</h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">Selecciona un servicio y encuentra el mejor momento para ti.</p>
          </div>
          <button routerLink="/portal/mis-reservas" class="bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center">
             <i class="far fa-list-alt mr-2"></i> Ver mis reservas
          </button>
        </div>

        <!-- Loading -->
        <div *ngIf="loading()" class="grid grid-cols-1 md:grid-cols-2 gap-6">
           <app-skeleton type="card" height="150px"></app-skeleton>
           <app-skeleton type="card" height="150px"></app-skeleton>
        </div>

        <!-- Step 1: Service Selection -->
        <div *ngIf="!loading() && !selectedService()" class="animate-fade-in">
           <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">1. Selecciona un Servicio</h2>
           
           <div *ngIf="services().length === 0" class="text-center p-10 bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700">
              <i class="far fa-calendar-times text-4xl text-gray-300 mb-3"></i>
              <p class="text-gray-500">No hay servicios disponibles para reservar en este momento.</p>
           </div>

           <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div *ngFor="let service of services()" 
                   (click)="selectService(service)"
                   class="group cursor-pointer bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-500 hover:shadow-lg transition-all p-6 relative overflow-hidden">
                   
                   <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <i class="far fa-calendar-check text-6xl text-blue-500"></i>
                   </div>

                   <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ service.name }}</h3>
                   <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">{{ service.description || 'Sin descripción' }}</p>
                   
                   <div class="flex items-center justify-between mt-auto">
                      <div class="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700/50 px-3 py-1 rounded-full">
                         <i class="far fa-clock mr-2"></i> {{ service.duration_minutes || 60 }} min
                      </div>
                      <span class="text-blue-600 dark:text-blue-400 font-bold group-hover:translate-x-1 transition-transform flex items-center">
                         Seleccionar <i class="fas fa-arrow-right ml-2"></i>
                      </span>
                   </div>
              </div>
           </div>
        </div>

        <!-- Step 2: Calendar & Time -->
        <div *ngIf="selectedService()" class="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 animate-fade-in-up">
            <div class="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-slate-700 pb-4">
                <div>
                   <button (click)="selectedService.set(null)" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-1 flex items-center">
                      <i class="fas fa-arrow-left mr-1"></i> Volver a servicios
                   </button>
                   <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
                      {{ selectedService()?.name }}
                      <span class="text-base font-normal text-gray-500 ml-2">({{ selectedService()?.duration_minutes || 60 }} min)</span>
                   </h2>
                </div>
            </div>

            <div class="flex flex-col md:flex-row gap-8">
                <!-- Date Picker -->
                <div class="w-full md:w-1/3">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Selecciona una fecha</label>
                    <input type="date" 
                           [ngModel]="selectedDateStr()" 
                           (ngModelChange)="onDateChange($event)"
                           class="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                           [min]="minDateStr">
                           
                    <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-800 dark:text-blue-300">
                        <i class="fas fa-info-circle mr-2"></i>
                        Selecciona un día para ver los horarios disponibles.
                    </div>
                </div>

                <!-- Slots -->
                <div class="w-full md:w-2/3">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Horarios Disponibles para el {{ selectedDateStr() | date:'fullDate' }}
                    </h3>

                    <div *ngIf="loadingSlots()" class="flex justify-center py-10">
                        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                    </div>

                    <div *ngIf="!loadingSlots() && slots().length === 0" class="text-center py-8 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
                        <p class="text-gray-500 dark:text-gray-400">No hay horarios disponibles para esta fecha.</p>
                        <p class="text-sm text-gray-400 mt-1">Intenta seleccionar otro día.</p>
                    </div>

                    <div *ngIf="!loadingSlots() && slots().length > 0" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        <button *ngFor="let slot of slots()" 
                                (click)="selectSlot(slot)"
                                [class.bg-blue-600]="selectedSlot() === slot"
                                [class.text-white]="selectedSlot() === slot"
                                [class.bg-white]="selectedSlot() !== slot"
                                [class.text-gray-700]="selectedSlot() !== slot"
                                [class.dark:bg-slate-700]="selectedSlot() !== slot"
                                [class.dark:text-gray-200]="selectedSlot() !== slot"
                                class="py-3 px-2 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-blue-500 hover:shadow-sm transition-all text-center font-medium text-sm">
                            {{ slot | date:'HH:mm' }}
                        </button>
                    </div>

                    <!-- Confirm Button -->
                    <div *ngIf="selectedSlot()" class="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                        <button (click)="bookSlot()" 
                                [disabled]="booking()"
                                class="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 transform flex items-center gap-2">
                            <span *ngIf="booking()" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                            {{ booking() ? 'Reservando...' : 'Confirmar Reserva' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  `,
    styles: [`
    .animate-fade-in { animation: fadeIn 0.3s ease-out; }
    .animate-fade-in-up { animation: fadeInUp 0.4s ease-out; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class PortalBookingsComponent implements OnInit {
    private authService = inject(AuthService);
    private servicesService = inject(SupabaseServicesService);
    private bookingsService = inject(SupabaseBookingsService);
    private supabaseClient = inject(SupabaseClientService);
    private toastService = inject(ToastService);

    loading = signal(true);
    services = signal<Service[]>([]);
    selectedService = signal<Service | null>(null);

    // Calendar
    selectedDateStr = signal<string>(new Date().toISOString().split('T')[0]);
    minDateStr = new Date().toISOString().split('T')[0];
    loadingSlots = signal(false);
    slots = signal<Date[]>([]);
    selectedSlot = signal<Date | null>(null);

    booking = signal(false);

    ngOnInit() {
        this.loadBookableServices();
    }

    onDateChange(newDate: string) {
        this.selectedDateStr.set(newDate);
        this.fetchSlots(newDate);
    }

    bookingPreferences = signal<any>(null); // Store fetched preferences
    bookingTypes = signal<any[]>([]);

    async loadBookableServices() {
        this.loading.set(true);
        try {
            const companyId = this.authService.currentCompanyId();
            if (!companyId) {
                console.warn('No company ID found');
                this.loading.set(false);
                return;
            }

            // Parallel fetch: Services + Booking Config + Booking Types
            const [allServices, config, bTypes] = await Promise.all([
                this.servicesService.getServices(companyId),
                this.bookingsService.getBookingConfiguration(companyId).toPromise(),
                this.bookingsService.getBookingTypes(companyId).toPromise()
            ]);

            this.bookingPreferences.set(config || {});
            this.bookingTypes.set(bTypes || []);
            // Filter by is_bookable AND is_active
            this.services.set(allServices.filter(s => s.is_bookable && s.is_active));
            this.loading.set(false);

        } catch (e) {
            console.error(e);
            this.loading.set(false);
        }
    }

    selectService(service: Service) {
        this.selectedService.set(service);
        // Auto-fetch slots for default selected date (today/tomorrow)
        this.fetchSlots(this.selectedDateStr());
    }

    async fetchSlots(dateStr: string) {
        const service = this.selectedService();
        if (!service) return;

        this.loadingSlots.set(true);
        this.slots.set([]);
        this.selectedSlot.set(null); // Reset selection

        try {
            const companyId = this.authService.currentCompanyId();
            if (!companyId) return;

            // 0. Check Max Future Days
            const prefs = this.bookingPreferences() || {};
            const maxDays = prefs.max_future_days || 60;
            const targetDate = new Date(dateStr);
            const today = new Date();
            const maxDate = new Date();
            maxDate.setDate(today.getDate() + maxDays);

            if (targetDate > maxDate) {
                this.loadingSlots.set(false);
                return; // Beyond authorized horizon
            }

            // Fetch company schedule (Owner's schedule)
            const schedules = await new Promise<any[]>((resolve, reject) => {
                this.bookingsService.getCompanyDefaultSchedule(companyId!).subscribe({
                    next: (data) => resolve(data),
                    error: (err) => reject(err)
                });
            });

            console.log('🗓️ Debug - Company ID:', companyId);
            console.log('🗓️ Debug - All Schedules fetched:', schedules);

            const startOfDay = new Date(dateStr);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(dateStr);
            endOfDay.setHours(23, 59, 59, 999);

            // Javascript getDay(): 0=Sun, 1=Mon...
            const dayOfWeek = startOfDay.getDay();

            // Filter relevant schedules for this day
            const daySchedules = schedules.filter(s => s.day_of_week === dayOfWeek && !s.is_unavailable);
            console.log('🗓️ Debug - Schedules for day', dayOfWeek, ':', daySchedules);

            if (daySchedules.length === 0) {
                this.loadingSlots.set(false);
                return; // No availability today
            }

            // 1. Fetch Google FreeBusy
            const payload = {
                action: 'freebusy',
                companyId: companyId, // Fixed parameter name to match backend expectation if needed, or check backend code
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString()
            };

            const { data, error } = await this.supabaseClient.instance.functions.invoke('google-calendar', {
                body: payload
            });

            let busyIntervals: { start: string, end: string }[] = [];

            if (data && !error) {
                busyIntervals = this.parseBusyIntervals(data);
            } else if (error) {
                console.warn('Google Calendar check unavailable:', error);
                // We continue with just internal schedule
            }

            // 2. Generate Slots based on Schedules
            const durationMinutes = service.duration_minutes || 60;
            const slotInterval = prefs.slot_interval_minutes || 30; // Default 30 min step
            const minAdvance = prefs.min_advance_minutes || 60; // Default 60 min advance notice
            const bufferAfter = prefs.buffer_after_minutes || 0;

            const generatedSlots: Date[] = [];
            const now = Date.now();
            const minTime = now + (minAdvance * 60000);

            daySchedules.forEach(schedule => {
                // Parse schedule string "HH:MM:SS"
                const [startH, startM] = schedule.start_time.split(':').map(Number);
                const [endH, endM] = schedule.end_time.split(':').map(Number);

                let currentSlot = new Date(startOfDay);
                currentSlot.setHours(startH, startM, 0, 0);

                const segmentEnd = new Date(startOfDay);
                segmentEnd.setHours(endH, endM, 0, 0);

                // Iterate with slotInterval
                // Condition: start + duration + buffer <= segmentEnd
                while (currentSlot.getTime() + (durationMinutes + bufferAfter) * 60000 <= segmentEnd.getTime()) {
                    const slotEnd = new Date(currentSlot.getTime() + durationMinutes * 60000);

                    // Exclude past slots or slots too soon
                    if (currentSlot.getTime() < minTime) {
                        // Advance by interval
                        currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
                        continue;
                    }

                    // Check overlap with Busy Intervals
                    // NOTE: Does the buffer also need to be free? Usually yes.
                    // effectiveEnd = slotEnd + buffer
                    const effectiveEnd = new Date(slotEnd.getTime() + bufferAfter * 60000);

                    const isBusy = busyIntervals.some(busy => {
                        const busyStart = new Date(busy.start).getTime();
                        const busyEnd = new Date(busy.end).getTime();
                        const slotStart = currentSlot.getTime();
                        const slotEndTime = effectiveEnd.getTime(); // Check availability including buffer
                        return (slotStart < busyEnd && slotEndTime > busyStart);
                    });

                    if (!isBusy) {
                        generatedSlots.push(new Date(currentSlot));
                    }

                    // Advance by interval
                    currentSlot = new Date(currentSlot.getTime() + slotInterval * 60000);
                }
            });

            // Sort slots (since we might have multiple blocks)
            generatedSlots.sort((a, b) => a.getTime() - b.getTime());

            // Deduplicate (if multiple blocks overlap or weird intervals)
            const uniqueSlots = generatedSlots.filter((date, i, self) =>
                i === self.findIndex(d => d.getTime() === date.getTime())
            );

            this.slots.set(uniqueSlots);

        } catch (e) {
            console.error(e);
            this.toastService.error('Error', 'No se pudieron cargar los horarios.');
        } finally {
            this.loadingSlots.set(false);
        }
    }

    selectSlot(slot: Date) {
        this.selectedSlot.set(slot);
    }

    parseBusyIntervals(data: any): { start: string, end: string }[] {
        // Google returns { calendars: { 'id': { busy: [] } } }
        // We merge all busy slots from all calendars returned
        const intervals: { start: string, end: string }[] = [];
        if (data?.calendars) {
            Object.values(data.calendars).forEach((cal: any) => {
                if (cal.busy && Array.isArray(cal.busy)) {
                    intervals.push(...cal.busy);
                }
            });
        }
        return intervals;
    }

    async bookSlot() {
        const slot = this.selectedSlot();
        const service = this.selectedService();
        const client = this.authService.userProfile;
        const companyId = this.authService.currentCompanyId();

        if (!slot || !service || !companyId) return;

        this.booking.set(true);

        try {
            // Calculate end time
            const duration = service.duration_minutes || 60;
            const endTime = new Date(slot.getTime() + duration * 60000);

            const bookingData: any = {
                company_id: companyId,
                service_id: service.id,
                booking_type_id: this.bookingTypes()[0]?.id, // Default to first available type
                customer_name: client?.full_name || client?.email || 'Cliente Portal',
                customer_email: client?.email || 'no-email@example.com',
                start_time: slot.toISOString(),
                end_time: endTime.toISOString(),
                status: 'confirmed', // Or pending if approval needed
                notes: 'Reserva desde Portal de Cliente'
                // professional_id, resource_id left null for now
            };

            await this.bookingsService.createBooking(bookingData);

            this.toastService.success('Reserva Confirmada', `Tu cita para ${service.name} ha sido reservada.`);

            // Reset flow
            // Maybe redirect to bookings list or home?
            this.selectedDateStr.set(new Date().toISOString().split('T')[0]);
            this.selectedSlot.set(null);
            this.selectedService.set(null);

        } catch (e) {
            console.error(e);
            this.toastService.error('Error', 'No se pudo crear la reserva.');
        } finally {
            this.booking.set(false);
        }
    }
}
