import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseProfessionalsService, Professional } from '../../../../../services/supabase-professionals.service';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-professionals',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './professionals.component.html',
    styleUrls: ['./professionals.component.scss']
})
export class ProfessionalsComponent implements OnInit {
    private professionalsService = inject(SupabaseProfessionalsService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    professionals = signal<Professional[]>([]);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Modal state
    showModal = false;
    editingId: string | null = null;

    // Form
    form: FormGroup;

    // Available members and services for assignment
    companyMembers = signal<{ id: string; user_id: string; full_name: string; email: string }[]>([]);
    bookableServices = signal<{ id: string; name: string }[]>([]);
    selectedServiceIds: string[] = [];

    constructor() {
        this.form = this.fb.group({
            user_id: ['', Validators.required],
            display_name: ['', Validators.required],
            title: [''],
            bio: [''],
            is_active: [true]
        });
    }

    ngOnInit() {
        this.loadProfessionals();
        this.loadCompanyMembers();
        this.loadBookableServices();
    }

    async loadProfessionals() {
        this.loading.set(true);
        this.professionalsService.getProfessionals().subscribe({
            next: (data) => {
                this.professionals.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toast.error('Error', 'No se pudieron cargar los profesionales');
                this.loading.set(false);
            }
        });
    }

    async loadCompanyMembers() {
        try {
            const members = await this.professionalsService.getCompanyMembers();
            this.companyMembers.set(members);
        } catch (e) {
            console.error('Error loading company members:', e);
        }
    }

    async loadBookableServices() {
        try {
            const services = await this.professionalsService.getBookableServices();
            this.bookableServices.set(services);
        } catch (e) {
            console.error('Error loading bookable services:', e);
        }
    }

    openModal(professional?: Professional) {
        this.editingId = professional?.id || null;
        this.selectedServiceIds = professional?.services?.map(s => s.id) || [];

        if (professional) {
            this.form.patchValue({
                user_id: professional.user_id,
                display_name: professional.display_name,
                title: professional.title || '',
                bio: professional.bio || '',
                is_active: professional.is_active
            });
        } else {
            this.form.reset({
                user_id: '',
                display_name: '',
                title: '',
                bio: '',
                is_active: true
            });
            this.selectedServiceIds = [];
        }
        this.showModal = true;
    }

    closeModal() {
        this.showModal = false;
        this.editingId = null;
    }

    toggleService(serviceId: string) {
        const idx = this.selectedServiceIds.indexOf(serviceId);
        if (idx > -1) {
            this.selectedServiceIds.splice(idx, 1);
        } else {
            this.selectedServiceIds.push(serviceId);
        }
    }

    isServiceSelected(serviceId: string): boolean {
        return this.selectedServiceIds.includes(serviceId);
    }

    // Auto-fill display name when user changes
    onUserChange() {
        const userId = this.form.get('user_id')?.value;
        const member = this.companyMembers().find(m => m.user_id === userId);
        if (member && !this.form.get('display_name')?.value) {
            this.form.patchValue({ display_name: member.full_name });
        }
    }

    async submit() {
        if (this.form.invalid) return;
        this.saving.set(true);

        const val = this.form.value;
        const payload: Partial<Professional> = {
            user_id: val.user_id,
            display_name: val.display_name,
            title: val.title,
            bio: val.bio,
            is_active: val.is_active
        };

        try {
            let professionalId = this.editingId;

            if (this.editingId) {
                await this.professionalsService.updateProfessional(this.editingId, payload);
                this.toast.success('Actualizado', 'Profesional actualizado correctamente');
            } else {
                const created = await this.professionalsService.createProfessional(payload);
                professionalId = created.id;
                this.toast.success('Creado', 'Nuevo profesional creado');
            }

            // Assign services
            if (professionalId) {
                await this.professionalsService.assignServices(professionalId, this.selectedServiceIds);
            }

            this.closeModal();
            this.loadProfessionals();
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'Error al guardar: ' + (e.message || 'desconocido'));
        } finally {
            this.saving.set(false);
        }
    }

    async deleteProfessional(professional: Professional) {
        if (!confirm(`¿Eliminar a ${professional.display_name}?`)) return;
        try {
            await this.professionalsService.deleteProfessional(professional.id);
            this.toast.success('Eliminado', 'Profesional eliminado');
            this.loadProfessionals();
        } catch (e: any) {
            this.toast.error('Error', 'No se pudo eliminar');
        }
    }
}
