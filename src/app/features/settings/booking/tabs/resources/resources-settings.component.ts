import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseBookingsService, Resource } from '../../../../../services/supabase-bookings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';
import { SkeletonComponent } from '../../../../../shared/ui/skeleton/skeleton.component';

@Component({
    selector: 'app-resources-settings',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, SkeletonComponent],
    templateUrl: './resources-settings.component.html'
})
export class ResourcesSettingsComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    resources = signal<Resource[]>([]);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Modal state
    showModal = false;
    editingId: string | null = null;
    form: FormGroup;

    resourceTypes = [
        { value: 'room', label: 'Sala / Cabina' },
        { value: 'equipment', label: 'Máquina / Equipo' }
    ];

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            type: ['room', Validators.required],
            capacity: [1, [Validators.required, Validators.min(1)]],
            description: [''],
            is_active: [true]
        });
    }

    ngOnInit() {
        this.loadResources();
    }

    async loadResources() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        this.loading.set(true);
        this.bookingsService.getResources(companyId).subscribe({
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
                capacity: resource.capacity || 1,
                description: resource.description || '',
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
        this.editingId = null;
    }

    async submit() {
        if (this.form.invalid) return;
        this.saving.set(true);

        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        const val = this.form.value;
        const payload: Partial<Resource> = {
            company_id: companyId,
            name: val.name,
            type: val.type,
            capacity: val.capacity,
            description: val.description,
            is_active: val.is_active
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
        if (!confirm(`¿Eliminar recurso "${resource.name}"?`)) return;
        try {
            await this.bookingsService.deleteResource(resource.id);
            this.toast.success('Eliminado', 'Recurso eliminado');
            this.loadResources();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }
}
