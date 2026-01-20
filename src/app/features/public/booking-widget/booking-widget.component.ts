import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SupabasePublicService } from '../../../services/supabase-public.service';
import { FormsModule } from '@angular/forms'; // Basic forms for MVP

type Step = 'service' | 'datetime' | 'details' | 'confirm' | 'success';

@Component({
    selector: 'app-booking-widget',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './booking-widget.component.html',
    styleUrls: ['./booking-widget.component.scss']
})
export class BookingWidgetComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private publicService = inject(SupabasePublicService);

    companyId: string | null = null;

    // State
    step = signal<Step>('service');
    loading = signal(false);
    error = signal<string | null>(null);

    // Data
    company = signal<any>(null);
    services = signal<any[]>([]);

    // Selection
    selectedService = signal<any>(null);
    selectedDate = signal<Date | null>(null);
    availableSlots = signal<string[]>([]);
    selectedSlot = signal<string | null>(null); // ISO string

    // Form
    formData = {
        name: '',
        email: '',
        phone: '',
        notes: ''
    };

    ngOnInit() {
        this.route.paramMap.subscribe(params => {
            this.companyId = params.get('companyId');
            if (this.companyId) {
                this.loadCompanyData();
            } else {
                this.error.set('No se especificó la empresa.');
            }
        });
    }

    async loadCompanyData() {
        this.loading.set(true);
        try {
            const data = await this.publicService.getCompanyDataPublic(this.companyId!);
            this.company.set(data.company);
            this.services.set(data.services);
        } catch (e: unknown) {
            this.error.set('Error cargando datos de la empresa: ' + ((e as Error).message || String(e)));
        } finally {
            this.loading.set(false);
        }
    }

    selectService(service: any) {
        this.selectedService.set(service);
        this.selectedDate.set(null);
        this.selectedSlot.set(null);
        this.availableSlots.set([]);
        this.step.set('datetime');
        // Default to today or tomorrow?
        this.onDateChange(new Date());
    }

    async onDateChange(date: Date) {
        this.selectedDate.set(date);
        this.selectedSlot.set(null);
        this.loading.set(true);
        try {
            if (!this.selectedService()) return;

            const res = await this.publicService.getAvailability(
                this.companyId!,
                this.selectedService().id,
                date
            );
            this.availableSlots.set(res.slots);
        } catch (e: unknown) {
            console.error(e);
            // Fail silently or show toast?
        } finally {
            this.loading.set(false);
        }
    }

    // Helper for Date Picker (HTML Input Date)
    onDateInput(event: any) {
        const value = event.target.value;
        if (value) {
            this.onDateChange(new Date(value));
        }
    }

    // Helper to format Input Date value
    get dateInputValue(): string {
        const d = this.selectedDate();
        return d ? d.toISOString().split('T')[0] : '';
    }

    selectSlot(slot: string) {
        this.selectedSlot.set(slot);
        this.step.set('details');
    }

    async submitBooking() {
        if (!this.formData.name || !this.formData.email) {
            alert('Nombre y Email son obligatorios');
            return;
        }

        this.loading.set(true);
        try {
            await this.publicService.createBooking({
                companyId: this.companyId,
                serviceId: this.selectedService().id,
                startTime: this.selectedSlot(),
                customerName: this.formData.name,
                customerEmail: this.formData.email,
                customerPhone: this.formData.phone,
                notes: this.formData.notes
            });
            this.step.set('success');
        } catch (e: unknown) {
            alert('Error creando reserva: ' + ((e as any).error || (e as Error).message || String(e)));
        } finally {
            this.loading.set(false);
        }
    }

    back() {
        const current = this.step();
        if (current === 'datetime') this.step.set('service');
        if (current === 'details') this.step.set('datetime');
    }
}
