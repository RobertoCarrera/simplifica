import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { SupabaseBookingsService, Resource } from '../../../../../services/supabase-bookings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-booking-resources',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './booking-resources.component.html',
    styleUrls: ['./booking-resources.component.scss']
})
export class BookingResourcesComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    resources = signal<Resource[]>([]);
    loading = signal<boolean>(false);

    showModal = false;
    editingId: string | null = null;
    form: FormGroup;
    saving = signal<boolean>(false);

    constructor() {
        this.form = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(3)]],
            type: ['room', [Validators.required]],
            capacity: [1, [Validators.required, Validators.min(1)]],
            description: [''],
            is_active: [true]
        });
    }

    ngOnInit() {
        this.loadResources();
    }

    get companyId() {
        return this.authService.userProfile?.company_id;
    }

    async loadResources() {
        if (!this.companyId) return;
        this.loading.set(true);
        this.bookingsService.getResources(this.companyId).subscribe({
            next: (data) => {
                this.resources.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toast.error('Error', 'No se pudieron cargar los recursos');
                this.loading.set(false);
            }
        });
    }

    openModal(resource?: Resource) {
        this.editingId = resource?.id || null;
        if (resource) {
            this.form.patchValue({
                name: resource.name,
                type: resource.type,
                capacity: resource.capacity,
                description: resource.description,
                is_active: resource.is_active
            });
        } else {
            this.form.reset({
                name: '',
                type: 'room',
                capacity: 1,
                description: '',
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
        const payload: Partial<Resource> = {
            ...val,
            company_id: this.companyId
        };

        try {
            if (this.editingId) {
                await this.bookingsService.updateResource(this.editingId, payload);
                this.toast.success('Actualizado', 'Recurso actualizado correctamente');
            } else {
                await this.bookingsService.createResource(payload);
                this.toast.success('Creado', 'Nuevo recurso creado');
            }
            this.closeModal();
            this.loadResources();
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'Error al guardar: ' + (e.message || 'desconocido'));
        } finally {
            this.saving.set(false);
        }
    }

    async deleteResource(resource: Resource) {
        if (!confirm(`¿Eliminar ${resource.name}?`)) return;
        try {
            await this.bookingsService.deleteResource(resource.id);
            this.toast.success('Eliminado', 'Recurso eliminado');
            this.loadResources();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }
}
