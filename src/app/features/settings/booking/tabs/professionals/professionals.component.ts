import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseProfessionalsService, Professional } from '../../../../../services/supabase-professionals.service';
import { AuthService } from '../../../../../services/auth.service';
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
    private authService = inject(AuthService);
    private toast = inject(ToastService);
    private fb = inject(FormBuilder);

    professionals = signal<Professional[]>([]);
    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // Modal state
    showModal = false;
    editingId: string | null = null;
    creationMode: 'existing' | 'invite' = 'existing';

    // Form
    form: FormGroup;

    // Available members and services for assignment
    companyMembers = signal<{ id: string; user_id: string; full_name: string; email: string; role: string }[]>([]);
    bookableServices = signal<{ id: string; name: string }[]>([]);
    selectedServiceIds: string[] = [];

    // Filtered members for dropdown
    filteredMembers = computed(() => this.companyMembers().filter(m => m.role === 'professional'));

    constructor() {
        this.form = this.fb.group({
            user_id: [''],
            invite_email: ['', [Validators.email]],
            invite_name: [''],
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
                invite_email: '',
                invite_name: '',
                display_name: '',
                title: '',
                bio: '',
                is_active: true
            });
            this.creationMode = 'existing';
            this.selectedServiceIds = [];
        }
        this.showModal = true;
    }

    setCreationMode(mode: 'existing' | 'invite') {
        this.creationMode = mode;
        // Reset/Update validators based on mode
        if (mode === 'invite') {
            this.form.get('user_id')?.clearValidators();
            this.form.get('invite_email')?.setValidators([Validators.required, Validators.email]);
            this.form.get('invite_name')?.setValidators([Validators.required]);
        } else {
            this.form.get('user_id')?.setValidators([Validators.required]);
            this.form.get('invite_email')?.clearValidators();
            this.form.get('invite_name')?.clearValidators();
        }
        this.form.get('user_id')?.updateValueAndValidity();
        this.form.get('invite_email')?.updateValueAndValidity();
        this.form.get('invite_name')?.updateValueAndValidity();
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
        if (this.creationMode === 'existing') {
            const userId = this.form.get('user_id')?.value;
            const member = this.companyMembers().find(m => m.user_id === userId);
            if (member && !this.form.get('display_name')?.value) {
                this.form.patchValue({ display_name: member.full_name });
            }
        }
    }

    onInviteNameChange() {
        if (this.creationMode === 'invite') {
            const inviteName = this.form.get('invite_name')?.value;
            if (inviteName && (!this.form.get('display_name')?.value || this.form.get('display_name')?.value === this.form.get('invite_name')?.value)) {
                this.form.patchValue({ display_name: inviteName });
            }
        }
    }

    async submit() {
        if (this.form.invalid) return;
        this.saving.set(true);

        const val = this.form.value;

        // Prepare payload base
        const payload: Partial<Professional> = {
            display_name: val.display_name,
            title: val.title,
            bio: val.bio,
            is_active: val.is_active
        };

        if (this.editingId) {
            payload.user_id = val.user_id;
        } else {
            // Creating new
            if (this.creationMode === 'existing') {
                payload.user_id = val.user_id;
            } else {
                // Invite mode
                payload.email = val.invite_email;
                // user_id remains undefined/null
            }
        }

        try {
            let professionalId = this.editingId;

            if (this.editingId) {
                await this.professionalsService.updateProfessional(this.editingId, payload);
                this.toast.success('Actualizado', 'Profesional actualizado correctamente');
            } else {
                // If invite mode, send invitation first
                if (this.creationMode === 'invite') {
                    const inviteRes = await this.authService.inviteUserToCompany({
                        companyId: this.authService.currentCompanyId()!,
                        email: val.invite_email,
                        role: 'professional', // Use 'professional' role or 'member'? Using 'member' as per standard, or 'professional' if role exists.
                        message: `Te han asignado como profesional: ${val.display_name}`
                    });

                    if (!inviteRes.success) {
                        throw new Error(inviteRes.error || 'Error al enviar invitación');
                    }
                    this.toast.success('Invitación enviada', `Se ha invitado a ${val.invite_email}`);
                }

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
