import { Component, EventEmitter, Output, Input, inject, signal, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PaymentIntegrationsService } from '../../../services/payment-integrations.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { AuthService } from '../../../services/auth.service';
import { PaymentMethodSelectorComponent, PaymentSelection } from '../../../features/payments/selector/payment-method-selector.component';
import { firstValueFrom } from 'rxjs';

@Component({
    selector: 'app-portal-booking-wizard',
    standalone: true,
    imports: [CommonModule, FormsModule, PaymentMethodSelectorComponent],
    template: `
    <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        
        <!-- Payment Selector (Hidden/Overlay) -->
        <app-payment-method-selector
            #paymentSelector
            (selected)="onPaymentMethodSelected($event)"
            (cancelled)="onPaymentSelectionCancelled()"
        ></app-payment-method-selector>

        <!-- Header -->
        <div class="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h2 class="text-xl font-bold text-gray-800">Nueva Reserva</h2>
          <button (click)="close.emit()" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- content -->
        <div class="flex-1 overflow-y-auto p-6">
            
            <!-- Step 1: Select Service -->
            <div *ngIf="step() === 1">
                <h3 class="text-lg font-semibold mb-4">Selecciona un Servicio</h3>
                <div *ngIf="loadingServices" class="text-center py-8 text-gray-500">Cargando servicios...</div>
                
                <div class="grid gap-3">
                    <button *ngFor="let s of services" 
                        (click)="selectService(s)"
                        class="text-left p-4 rounded-lg border hover:border-blue-500 hover:bg-blue-50 transition-all group">
                        <div class="flex justify-between items-center">
                            <span class="font-medium text-gray-900 group-hover:text-blue-700">{{ s.name }}</span>
                            <span class="text-gray-500 text-sm">{{ s.duration_minutes }} min</span>
                        </div>
                        <p class="text-sm text-gray-500 mt-1" *ngIf="s.price > 0">{{ s.price | currency:'EUR' }}</p>
                    </button>
                </div>
            </div>

            <!-- Step 2: Select Date & Time -->
            <div *ngIf="step() === 2">
                <div class="flex items-center gap-2 mb-4">
                    <button (click)="step.set(1)" class="text-sm text-gray-500 hover:text-gray-800">
                       <i class="fas fa-arrow-left"></i> Volver
                    </button>
                    <h3 class="text-lg font-semibold">Elige fecha y hora</h3>
                </div>

                <div class="flex flex-col md:flex-row gap-6">
                    <!-- Date Picker (Simple Native Input for MVP) -->
                    <div class="w-full md:w-1/3">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                        <input type="date" [ngModel]="selectedDateStr" (ngModelChange)="onDateChange($event)"
                            class="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            [min]="minDate">
                    </div>

                    <!-- Slots -->
                    <div class="flex-1">
                        <div *ngIf="loadingSlots" class="text-center py-4 text-gray-500">Buscando disponibilidad...</div>
                        <div *ngIf="!loadingSlots && slots.length === 0" class="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
                            No hay turnos disponibles para esta fecha.
                        </div>

                        <div class="grid grid-cols-3 gap-2" *ngIf="slots.length > 0">
                            <button *ngFor="let slot of slots"
                                (click)="selectSlot(slot)"
                                [class.bg-blue-600]="selectedSlot === slot"
                                [class.text-white]="selectedSlot === slot"
                                [class.bg-white]="selectedSlot !== slot"
                                [class.hover:bg-gray-50]="selectedSlot !== slot"
                                class="border rounded px-3 py-2 text-sm font-medium text-center transition-colors">
                                {{ slot | date:'HH:mm' }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Step 3: Confirmation -->
            <div *ngIf="step() === 3">
                <div class="flex items-center gap-2 mb-4">
                    <button (click)="step.set(2)" class="text-sm text-gray-500 hover:text-gray-800">
                        <i class="fas fa-arrow-left"></i> Volver
                    </button>
                    <h3 class="text-lg font-semibold">Confirmar Reserva</h3>
                </div>

                <div class="bg-blue-50 rounded-lg p-6 border border-blue-100 mb-6">
                    <div class="grid gap-4">
                        <div>
                            <span class="block text-xs font-semibold text-blue-600 uppercase tracking-wide">Servicio</span>
                            <span class="text-lg font-medium text-gray-900">{{ selectedService?.name }}</span>
                            <span class="text-sm text-gray-600 ml-2">({{ selectedService?.duration_minutes }} min)</span>
                        </div>
                        <div>
                            <span class="block text-xs font-semibold text-blue-600 uppercase tracking-wide">Fecha y Hora</span>
                            <span class="text-lg font-medium text-gray-900">{{ selectedSlot | date:'fullDate' }}</span>
                            <div class="text-gray-700">{{ selectedSlot | date:'shortTime' }}</div>
                        </div>
                    </div>
                </div>

                <!-- Intake Form (if applicable) -->
                <div *ngIf="selectedService?.form_schema?.length > 0" class="mb-6">
                    <h4 class="font-semibold text-gray-800 mb-3">Información Adicional</h4>
                    <div class="space-y-4">
                        <div *ngFor="let q of selectedService.form_schema" class="form-group">
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                {{ q.label }} <span *ngIf="q.required" class="text-red-500">*</span>
                            </label>
                            
                            <!-- Text Input -->
                            <input *ngIf="q.type === 'text'" type="text" 
                                    [(ngModel)]="formAnswers[q.id]" 
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-blue-500"
                                    [required]="q.required">

                            <!-- Textarea -->
                            <textarea *ngIf="q.type === 'textarea'" 
                                    [(ngModel)]="formAnswers[q.id]" rows="3"
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-blue-500"
                                    [required]="q.required"></textarea>

                            <!-- Checkbox -->
                            <div *ngIf="q.type === 'checkbox'" class="flex items-center">
                                <input type="checkbox" [(ngModel)]="formAnswers[q.id]" 
                                    class="h-5 w-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500">
                                <span class="ml-2 text-sm text-gray-600">Sí</span>
                            </div>

                            <!-- Legacy support or fallback if ID missing? Schema builder ensures IDs. -->
                        </div>
                    </div>
                </div>

                <div class="flex justify-end">
                    <button (click)="confirmBooking()" 
                        [disabled]="submitting"
                        class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2">
                        <i *ngIf="submitting" class="fas fa-circle-notch fa-spin"></i>
                        {{ submitting ? 'Confirmando...' : 'Confirmar Reserva' }}
                    </button>
                </div>
            </div>
            
        </div>
      </div>
    </div>
  `
})
export class PortalBookingWizardComponent {
    @Input() bookingToReschedule: any = null; // ClientPortalBooking
    @Output() close = new EventEmitter<void>();
    @Output() bookingCreated = new EventEmitter<void>();

    private portal = inject(ClientPortalService);
    private auth = inject(AuthService);
    private paymentIntegrations = inject(PaymentIntegrationsService);

    @ViewChild('paymentSelector') paymentSelector!: PaymentMethodSelectorComponent;

    step = signal(1);
    loadingServices = false;
    services: any[] = [];
    selectedService: any = null;

    selectedDateStr: string = new Date().toISOString().split('T')[0];
    minDate: string = new Date().toISOString().split('T')[0];
    loadingSlots = false;
    slots: Date[] = [];
    selectedSlot: Date | null = null;

    submitting = false;

    // Intake Form
    formAnswers: Record<string, any> = {};

    constructor() { }

    ngOnInit() {
        if (this.bookingToReschedule) {
            // Reschedule Mode: Skip Step 1
            this.selectedService = {
                name: this.bookingToReschedule.service_name,
                duration_minutes: this.bookingToReschedule.service_duration,
                id: 'EXISTING_SERVICE_ID_IGNORED'
            };
            this.step.set(2);
            this.loadSlotsForDate(this.selectedDateStr);
        } else {
            // New Booking Mode
            this.loadServices();
        }
    }

    async loadServices() {
        this.loadingServices = true;
        const { data } = await this.portal.listPublicServices();
        this.services = data || [];
        this.loadingServices = false;
    }

    selectService(service: any) {
        this.selectedService = service;
        this.step.set(2);
        this.loadSlotsForDate(this.selectedDateStr);
    }

    onDateChange(date: string) {
        this.selectedDateStr = date;
        this.loadSlotsForDate(date);
    }

    async loadSlotsForDate(dateStr: string) {
        if (!this.selectedService || !dateStr) return;
        this.loadingSlots = true;
        this.selectedSlot = null;

        // Calculate start/end of day
        const start = new Date(dateStr);
        start.setHours(0, 0, 0, 0);
        const end = new Date(dateStr);
        end.setHours(23, 59, 59, 999);

        const companyId = (await firstValueFrom(this.auth.userProfile$))?.company_id;
        if (!companyId) return;

        const { data } = await this.portal.getAvailabilityData(companyId, start, end);

        if (data) {
            this.slots = this.calculateFreeSlots(data.schedules, data.bookings, this.selectedService.duration_minutes, dateStr);
        }

        this.loadingSlots = false;
    }

    calculateFreeSlots(schedules: any[], bookings: any[], duration: number, dateStr: string): Date[] {
        // Basic Algo:
        // 1. Determine working hours for the day (Merge schedules)
        // 2. Determine busy blocks (Bookings)
        // 3. Iterate time in steps (e.g. 30min) and check if Slot fits in Work AND doesn't overlap Busy.

        // Assume 30 min step
        const STEP = 30;
        const slots: Date[] = [];

        // Simplify: Just find ONE generic working range for the company for now (e.g. 9-17)
        // OR iterate all schedules.
        // Let's create a timeline of "Capacity"
        // Since we don't have Professional selection in Step 1 (optional), we check if ANY pro is free.

        // Generate candidate slots
        const dayStart = new Date(dateStr);
        dayStart.setHours(8, 0, 0); // Earliest possible
        const dayEnd = new Date(dateStr);
        dayEnd.setHours(20, 0, 0); // Latest possible

        let current = new Date(dayStart);

        while (current.getTime() + duration * 60000 <= dayEnd.getTime()) {
            const slotEnd = new Date(current.getTime() + duration * 60000);

            // Check if ANY pro is available
            // A pro is available if:
            // 1. Current slot is within their Schedule
            // 2. Current slot does NOT overlap their Bookings

            // Group schedules by user_id
            const userIds = [...new Set(schedules.map<string>((s: any) => s.user_id))];

            let isAvailable = false;

            for (const uid of userIds) {
                // Check Schedule
                const userSched = schedules.find((s: any) => s.user_id === uid && s.day_of_week === current.getDay());
                // Note: day_of_week 0=Sun. check DB format. usually 0-6.
                // If JS getDay() matches DB.

                // If no schedule for this day, skip user
                if (!userSched) continue;

                // Time comparison strings "HH:MM:SS"
                const schedStartVal = this.timeToMins(userSched.start_time);
                const schedEndVal = this.timeToMins(userSched.end_time);
                const slotStartVal = current.getHours() * 60 + current.getMinutes();
                const slotEndVal = slotEnd.getHours() * 60 + slotEnd.getMinutes();

                if (slotStartVal < schedStartVal || slotEndVal > schedEndVal) continue; // Out of shift

                // Check Bookings
                const userBookings = bookings.filter((b: any) => b.professional_id === uid);
                const hasOverlap = userBookings.some((b: any) => {
                    const bStart = new Date(b.start_time);
                    const bEnd = new Date(b.end_time);
                    return (current < bEnd && slotEnd > bStart);
                });

                if (hasOverlap) continue;

                // If we get here, this User is free!
                isAvailable = true;
                break;
            }

            if (isAvailable) {
                slots.push(new Date(current));
            }

            current.setMinutes(current.getMinutes() + STEP);
        }

        return slots;
    }

    timeToMins(timeStr: string): number {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    selectSlot(slot: Date) {
        this.selectedSlot = slot;
        this.step.set(3);
    }

    async confirmBooking() {
        if (!this.selectedSlot || !this.selectedService) return;

        // Form Validation
        if (this.selectedService.form_schema?.length) {
            for (const q of this.selectedService.form_schema) {
                if (q.required) {
                    const ans = this.formAnswers[q.id];
                    if (!ans || (typeof ans === 'string' && !ans.trim())) {
                        alert(`Por favor responde a la pregunta obligatoria: "${q.label}"`);
                        return;
                    }
                }
            }
        }

        this.submitting = true;

        const start = this.selectedSlot;
        const end = new Date(start.getTime() + this.selectedService.duration_minutes * 60000);

        // Simple Reschedule Case (No Payment Logic Updated yet)
        if (this.bookingToReschedule) {
            const res = await this.portal.rescheduleBooking(
                this.bookingToReschedule.id,
                start.toISOString(),
                end.toISOString()
            );
            if (res.success) {
                this.bookingCreated.emit();
                this.close.emit();
            } else {
                alert('Error: ' + res.error);
            }
            this.submitting = false;
            return;
        }

        // New Booking Case
        const res = await this.portal.createSelfBooking({
            service_id: this.selectedService.id,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            form_responses: this.selectedService.form_schema?.length ? this.formAnswers : null
        });

        if (!res.success) {
            alert('Error: ' + res.error);
            this.submitting = false;
            return;
        }

        // Check for Deposit
        // Assuming selectedService has deposit_amount. 
        // Note: portal.listPublicServices returns service fields. Need to verify deposit_amount is there.
        // If it is, and > 0, we require payment.

        // Use a safe check for deposit amount
        const depositAmount = this.selectedService.deposit_amount || 0;

        if (depositAmount > 0 && res.data?.quote_id) {
            try {
                // 1. Convert Quote to Invoice
                const invRes = await this.portal.convertQuoteToInvoice(res.data.quote_id);
                if (!invRes.success || !invRes.invoiceId) {
                    // Fallback: Just confirm booking without payment flow if invoice fails? 
                    // Or alert user "Booking confirmed, please pay invoice #"
                    console.error('Invoice generation failed', invRes.error);
                    alert('Reserva creada, pero hubo un error generando la factura. Por favor contacta con soporte.');
                    this.bookingCreated.emit();
                    this.close.emit();
                    return;
                }

                this.pendingInvoiceId = invRes.invoiceId;

                // 2. Open Payment Selector
                // We'll hide the wizard or keep it open with a spinner?
                // Let's keep wizard open but covered by payment modal.
                this.paymentSelector.open(
                    depositAmount,
                    '', // Invoice number unknown or fetch it
                    ['stripe', 'paypal'], // Should filter by company config
                    false
                );

                // We stop here. onPaymentMethodSelected will continue.
                this.submitting = false;
                return;

            } catch (e) {
                console.error('Payment setup error', e);
            }
        }

        // No deposit or quote linking failed
        this.bookingCreated.emit();
        this.close.emit();
        this.submitting = false;
    }

    pendingInvoiceId: string | null = null;

    async onPaymentMethodSelected(selection: PaymentSelection) {
        if (!this.pendingInvoiceId) return;

        if (selection.provider === 'cash') {
            alert('El pago en efectivo no está disponible para depósitos online. Por favor selecciona otro método.');
            return;
        }

        try {
            this.submitting = true;
            // Generate Link
            const linkData = await this.paymentIntegrations.generatePaymentLink(
                this.pendingInvoiceId,
                selection.provider as 'stripe' | 'paypal'
            );

            // Redirect
            if (linkData.payment_url) {
                window.location.href = linkData.payment_url;
            } else {
                alert('Error generando enlace de pago.');
                this.submitting = false;
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
            this.submitting = false;
        }
    }

    onPaymentSelectionCancelled() {
        // User closed payment modal. 
        // Booking is already created (Default status 'confirmed' in RPC).
        // Maybe warn them?
        if (confirm('La reserva se ha creado pero el pago está pendiente. ¿Deseas finalizar?')) {
            this.bookingCreated.emit();
            this.close.emit();
        } else {
            // Re-open selector?
        }
    }
}
