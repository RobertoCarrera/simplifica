import { Component, OnInit, computed, input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../../../services/supabase-client.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface CompanyMember {
    id: string; // company_member_id
    user_id: string;
    role_id: string;
    status: string;
    description?: string;
    // Joined data
    user?: {
        id: string;
        email: string;
        full_name?: string;
        name?: string;
        surname?: string;
        avatar_url?: string;
    };
    role?: {
        id: string;
        name: string;
        label: string;
    };
    is_assigned?: boolean; // UI helper
}

@Component({
    selector: 'app-client-team-access',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="space-y-6 animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
            <header class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 class="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <i class="fas fa-users-cog text-blue-500"></i>
                        Asignación de Equipo
                    </h2>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Gestiona qué miembros del equipo tienen acceso a este cliente.
                        Los propietarios y administradores siempre tienen acceso completo.
                    </p>
                </div>
                <!-- Search NOT IMPL HERE YET -->
            </header>

            <div *ngIf="isLoading()" class="py-8 text-center text-slate-500">
                <i class="fas fa-circle-notch fa-spin mr-2"></i> Cargando miembros...
            </div>

            <div *ngIf="!isLoading()" class="space-y-4">
                <!-- Admins / Owners (Disabled Checkboxes) -->
                <div *ngIf="admins().length > 0" class="space-y-2">
                    <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">Acceso Administrativo (Siempre Visible)</h3>
                    <div *ngFor="let member of admins()" 
                         class="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 opacity-75">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                {{ getInitials(member) }}
                            </div>
                            <div>
                                <div class="font-medium text-slate-900 dark:text-slate-200">{{ getDisplayName(member) }}</div>
                                <div class="text-xs text-slate-500">{{ member.role?.label || 'Admin' }}</div>
                            </div>
                        </div>
                        <span class="text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            <i class="fas fa-lock mr-1"></i> Global
                        </span>
                    </div>
                </div>

                <!-- Assignable Members -->
                <div class="space-y-2 pt-2">
                    <h3 class="text-xs font-uppercase font-bold text-slate-400 px-2">Profesionales y Miembros</h3>
                    
                    <div *ngIf="assignableMembers().length === 0" class="p-4 text-center text-slate-500 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm">
                        No hay otros miembros disponibles para asignar.
                    </div>

                    <div *ngFor="let member of assignableMembers()" 
                         class="flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer group hover:bg-slate-50 dark:hover:bg-slate-700/30"
                         [ngClass]="{
                            'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800': member.is_assigned,
                            'border-slate-200 dark:border-slate-700': !member.is_assigned
                         }"
                         (click)="toggleAssignment(member)">
                        
                        <div class="flex items-center gap-3">
                            <!-- Checkbox -->
                            <div class="w-5 h-5 rounded border flex items-center justify-center transition-colors"
                                 [ngClass]="{
                                    'bg-blue-500 border-blue-500': member.is_assigned,
                                    'border-slate-300 dark:border-slate-600': !member.is_assigned
                                 }">
                                <i *ngIf="member.is_assigned" class="fas fa-check text-white text-xs"></i>
                            </div>

                            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                {{ getInitials(member) }}
                            </div>
                            <div>
                                <div class="font-medium text-slate-900 dark:text-slate-200">{{ getDisplayName(member) }}</div>
                                <div class="text-xs text-slate-500">{{ member.role?.label || 'Miembro' }}</div>
                            </div>
                        </div>

                        <span *ngIf="member.is_assigned" class="text-xs font-medium text-blue-600 dark:text-blue-400 animate-fade-in">Asignado</span>
                    </div>
                </div>
            </div>
            
            <div class="mt-6 flex justify-end border-t border-slate-100 dark:border-slate-700 pt-4" *ngIf="hasChanges()">
                <button (click)="saveChanges()" 
                        [disabled]="isSaving()"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    <i class="fas" [class.fa-spinner]="isSaving()" [class.fa-spin]="isSaving()" [class.fa-save]="!isSaving()"></i>
                    {{ isSaving() ? 'Guardando...' : 'Guardar Cambios' }}
                </button>
            </div>
        </div>
    </div>
    `
})
export class ClientTeamAccessComponent implements OnInit {
    clientId = input.required<string>();
    
    private supabase = inject(SupabaseClientService).instance; // Using property directly if getter not available, wait, instance is property? Yes.
    private auth = inject(AuthService);
    private toast = inject(ToastService);

    members = signal<CompanyMember[]>([]);
    isLoading = signal(true);
    isSaving = signal(false);
    
    // Track original state to detect changes
    private originalAssignments = new Set<string>();

    admins = computed(() => this.members().filter(m => 
        ['owner', 'admin', 'super_admin'].includes(m.role?.name || '')
    ));

    // Sólo miembros de equipo (no clientes) pueden ser asignados
    assignableMembers = computed(() => this.members().filter(m => {
        // Excluir admins y dueños
        if (['owner', 'admin', 'super_admin'].includes(m.role?.name || '')) return false;
        // Excluir clientes (rol 'client')
        if ((m.role?.name || '').toLowerCase() === 'client') return false;
        // Sólo miembros de equipo
        return true;
    }));

    hasChanges = computed(() => {
        const current = new Set(
            this.assignableMembers()
                .filter(m => m.is_assigned)
                .map(m => m.id)
        );
        
        if (current.size !== this.originalAssignments.size) return true;
        for (const id of current) {
            if (!this.originalAssignments.has(id)) return true;
        }
        return false;
    });

    ngOnInit() {
        this.loadData();
    }

    async loadData() {
        this.isLoading.set(true);
        try {
            const companyId = this.auth.currentCompanyId();
            if (!companyId) throw new Error('No company context');

            // 1. Fetch Members with Roles
            const { data: membersData, error: membersError } = await this.supabase
                .from('company_members')
                .select(`
                    id, user_id, role_id, status,
                    user:user_id(id, email, name, surname), 
                    role:role_id(name, label)
                `)
                .eq('company_id', companyId)
                .eq('status', 'active');

            if (membersError) throw membersError;

            // 2. Fetch Existing Assignments
            const { data: assignmentsData, error: assignError } = await this.supabase
                .from('client_assignments')
                .select('company_member_id')
                .eq('client_id', this.clientId());

            if (assignError) throw assignError;

            const assignedIds = new Set(assignmentsData?.map(a => a.company_member_id) || []);
            this.originalAssignments = new Set(assignedIds);

            // Map data
            const mappedMembers: CompanyMember[] = (membersData || []).map((m: any) => ({
                id: m.id,
                user_id: m.user_id,
                role_id: m.role_id,
                status: m.status,
                user: m.user ? {
                    id: m.user.id,
                    email: m.user.email,
                    full_name: `${m.user.name || ''} ${m.user.surname || ''}`.trim(),
                    name: m.user.name,
                    surname: m.user.surname,
                    avatar_url: undefined // public.users doesn't have avatar_url apparently, or I should check
                } : undefined,
                role: m.role,
                is_assigned: assignedIds.has(m.id)
            }));

            this.members.set(mappedMembers);

        } catch (error) {
            console.error('Error loading team access:', error);
            this.toast.error('Error', 'Error al cargar el equipo');
        } finally {
            this.isLoading.set(false);
        }
    }

    toggleAssignment(member: CompanyMember) {
        // Toggle locally
        this.members.update(current => 
            current.map(m => 
                m.id === member.id ? { ...m, is_assigned: !m.is_assigned } : m
            )
        );
    }

    async saveChanges() {
        if (this.isSaving()) return;
        this.isSaving.set(true);

        try {
            const currentAssigned = this.assignableMembers()
                .filter(m => m.is_assigned)
                .map(m => m.id);

            const toAdd = currentAssigned.filter(id => !this.originalAssignments.has(id));
            const toRemove = Array.from(this.originalAssignments).filter(id => !currentAssigned.includes(id));

            const promises = [];

            if (toAdd.length > 0) {
                const insertData = toAdd.map(mid => ({
                    client_id: this.clientId(),
                    company_member_id: mid,
                    assigned_by: this.auth.userProfileSignal()?.id
                }));
                promises.push(this.supabase.from('client_assignments').insert(insertData));
            }

            if (toRemove.length > 0) {
                promises.push(
                    this.supabase
                        .from('client_assignments')
                        .delete()
                        .eq('client_id', this.clientId())
                        .in('company_member_id', toRemove)
                );
            }

            await Promise.all(promises);

            this.toast.success('Éxito', 'Asignaciones actualizadas');
            this.originalAssignments = new Set(currentAssigned); // Update baseline

        } catch (error) {
            console.error('Error saving assignments:', error);
            this.toast.error('Error', 'Error al guardar cambios');
        } finally {
            this.isSaving.set(false);
        }
    }

    // Helpers
    getDisplayName(m: CompanyMember): string {
        if (m.user?.full_name) return m.user.full_name;
        if (m.user?.name) return `${m.user.name} ${m.user.surname || ''}`.trim();
        return m.user?.email || 'Usuario desconocido';
    }

    getInitials(m: CompanyMember): string {
        const name = this.getDisplayName(m).replace(/[^a-zA-Z ]/g, '');
        return name.substring(0, 2).toUpperCase();
    }
}
