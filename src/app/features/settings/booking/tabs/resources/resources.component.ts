import { Component, OnInit, OnDestroy, inject, signal, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseResourcesService, Resource } from '../../../../../services/supabase-resources.service';
import { SupabaseServicesService, Service } from '../../../../../services/supabase-services.service';
import { ToastService } from '../../../../../services/toast.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SkeletonLoaderComponent } from '../../../../../shared/components/skeleton-loader/skeleton-loader.component';

@Component({
    selector: 'app-resources',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule, SkeletonLoaderComponent],
    templateUrl: './resources.component.html',
    styleUrls: ['./resources.component.scss']
})
export class ResourcesComponent implements OnInit, OnDestroy {
        selectAllServices = signal<boolean>(true);
    @Input() availableCalendars: any[] = []; // Passed from parent
    @Output() goBack = new EventEmitter<void>();

    private realtimeChannel: RealtimeChannel | null = null;
    private resourcesService = inject(SupabaseResourcesService);
    private servicesService = inject(SupabaseServicesService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    resources = signal<Resource[]>([]);
    bookableServices = signal<Service[]>([]);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Modal state
    showModal = false;
    editingId: string | null = null;

    // Form
    form: FormGroup;

    constructor() {
        this.form = this.fb.group({
            name: ['', Validators.required],
            type: ['Sala'], // default type
            capacity: [1, [Validators.min(1)]],
            description: [''],
            google_calendar_id: [''],
            resource_services: [[]]
        });
    }

    ngOnInit() {
        this.loadResources();
        this.loadServices();
        this.setupRealtimeSubscription();
    }

    setupRealtimeSubscription() {
        this.realtimeChannel = this.resourcesService.subscribeToChanges(() => {
            this.loadResources();
        });
    }

    ngOnDestroy() {
        if (this.realtimeChannel) {
            this.realtimeChannel.unsubscribe();
        }
    }

    async loadServices() {
        try {
            const services = await this.servicesService.getServices();
            this.bookableServices.set(services.filter(s => s.is_bookable));
        } catch (err) {
            console.error('Error loading services', err);
        }
    }

    async loadResources() {
        this.loading.set(true);
        this.resourcesService.getResources().subscribe({
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
                type: resource.type || 'Sala',
                capacity: resource.capacity || 1,
                description: resource.description || '',
                google_calendar_id: resource.google_calendar_id || '',
                resource_services: resource.resource_services?.map(s => s.service_id) || []
            });
            this.selectAllServices.set(
                this.bookableServices().length > 0 &&
                resource.resource_services?.length === this.bookableServices().length
            );
        } else {
            // Select all services by default
            const allServiceIds = this.bookableServices().map(s => s.id);
            this.form.reset({
                name: '',
                type: 'Sala',
                capacity: 1,
                description: '',
                google_calendar_id: '',
                resource_services: allServiceIds
            });
            this.selectAllServices.set(true);
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

        try {
            const payload: Partial<Resource> = {
                name: this.form.value.name,
                type: this.form.value.type,
                capacity: this.form.value.capacity,
                description: this.form.value.description,
                google_calendar_id: this.form.value.google_calendar_id || undefined,
                resource_services: (this.form.value.resource_services || []).map((id: string) => ({ service_id: id }))
            };

            if (this.editingId) {
                await this.resourcesService.updateResource(this.editingId, payload);
                this.toast.success('Actualizado', 'Recurso actualizado correctamente');
            } else {
                await this.resourcesService.createResource(payload);
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
            await this.resourcesService.deleteResource(resource.id);
            this.toast.success('Eliminado', 'Recurso eliminado');
            this.loadResources();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }

    toggleService(serviceId: string, event: any) {
        const isChecked = event.target.checked;
        const currentServices = this.form.value.resource_services || [];
        
        if (isChecked) {
            if (!currentServices.includes(serviceId)) {
                const newList = [...currentServices, serviceId];
                this.form.patchValue({
                    resource_services: newList
                });
                
                // If all are checked after this, check selectAllServices
                if (newList.length === this.bookableServices().length) {
                    this.selectAllServices.set(true);
                }
            }
        } else {
            this.form.patchValue({
                resource_services: currentServices.filter((id: string) => id !== serviceId)
            });
            // If any box is unchecked, uncheck selectAllServices
            this.selectAllServices.set(false);
        }
    }

    toggleSelectAll(event: any) {
        const checked = event.target.checked;
        this.selectAllServices.set(checked);
        if (checked) {
            const allServiceIds = this.bookableServices().map(s => s.id);
            this.form.patchValue({ resource_services: allServiceIds });
        } else {
            this.form.patchValue({ resource_services: [] });
        }
    }
}
