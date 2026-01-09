import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseBookingsService, BookingType } from '../../../../../services/supabase-bookings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-booking-types',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './booking-types.component.html',
    styleUrls: ['./booking-types.component.scss']
})
export class BookingTypesComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    bookingTypes = signal<BookingType[]>([]);
    loading = signal<boolean>(false);

    showModal = false;
    editingId: string | null = null;
    form: FormGroup;
    saving = signal<boolean>(false);

    constructor() {
        this.form = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3)]],
            slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            description: [''],
            duration: [30, [Validators.required, Validators.min(5)]],
            price: [0, [Validators.min(0)]],
            currency: ['EUR'],
            is_active: [true]
        });
    }

    ngOnInit() {
        this.loadBookingTypes();
    }

    get companyId() {
        return this.authService.userProfile?.company_id;
    }

    updateSlug() {
        if (!this.editingId && this.form.get('name')?.valid && !this.form.get('slug')?.dirty) {
            const name = this.form.get('name')?.value || '';
            const slug = name.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            this.form.patchValue({ slug });
        }
    }

    async loadBookingTypes() {
        if (!this.companyId) return;
        this.loading.set(true);
        this.bookingsService.getBookingTypes(this.companyId).subscribe({
            next: (data) => {
                this.bookingTypes.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toast.error('Error', 'No se pudieron cargar los tipos de reserva');
                this.loading.set(false);
            }
        });
    }

    openModal(type?: BookingType) {
        this.editingId = type?.id || null;
        if (type) {
            this.form.patchValue({
                name: type.name,
                slug: type.slug,
                description: type.description,
                duration: type.duration,
                price: type.price,
                currency: type.currency,
                is_active: type.is_active
            });
        } else {
            this.form.reset({
                name: '',
                slug: '',
                description: '',
                duration: 30,
                price: 0,
                currency: 'EUR',
                is_active: true
            });
        }
        this.showModal = true;
    }

    closeModal() {
        this.showModal = false;
    }

    async submit() {
        if (this.form.invalid || !this.companyId) return;
        this.saving.set(true);

        const val = this.form.value;
        const payload: Partial<BookingType> = {
            ...val,
            company_id: this.companyId
        };

        try {
            if (this.editingId) {
                await this.bookingsService.updateBookingType(this.editingId, payload);
                this.toast.success('Actualizado', 'Servicio actualizado correctamente');
            } else {
                await this.bookingsService.createBookingType(payload);
                this.toast.success('Creado', 'Nuevo servicio creado');
            }
            this.closeModal();
            this.loadBookingTypes();
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'Error al guardar: ' + (e.message || 'desconocido'));
        } finally {
            this.saving.set(false);
        }
    }

    async deleteType(type: BookingType) {
        if (!confirm(`¿Eliminar ${type.name}?`)) return;
        try {
            await this.bookingsService.deleteBookingType(type.id);
            this.toast.success('Eliminado', 'Servicio eliminado');
            this.loadBookingTypes();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }
}
