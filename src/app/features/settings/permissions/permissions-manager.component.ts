import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    SupabasePermissionsService,
    AVAILABLE_PERMISSIONS,
    AVAILABLE_ROLES,
    DEFAULT_PERMISSIONS,
    PermissionDefinition,
    Role
} from '../../../services/supabase-permissions.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-permissions-manager',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './permissions-manager.component.html',
    styleUrls: ['./permissions-manager.component.scss']
})
export class PermissionsManagerComponent implements OnInit {
    private permissionsService = inject(SupabasePermissionsService);
    private toast = inject(ToastService);

    loading = signal(true);
    saving = signal<string | null>(null); // Currently saving permission key

    // Permission matrix: role -> permission -> granted
    matrix = signal<Record<string, Record<string, boolean>>>({});

    // Group permissions by category
    permissionsByCategory = computed(() => {
        const grouped: Record<string, PermissionDefinition[]> = {};
        for (const perm of AVAILABLE_PERMISSIONS) {
            if (!grouped[perm.category]) grouped[perm.category] = [];
            grouped[perm.category].push(perm);
        }
        return grouped;
    });

    categories = computed(() => Object.keys(this.permissionsByCategory()));
    roles = AVAILABLE_ROLES.filter((r: string) => r !== 'owner' && r !== 'admin'); // Owner always has all permissions

    roleLabels: Record<string, string> = {
        admin: 'Admin',
        member: 'Miembro',
        professional: 'Profesional',
        agent: 'Agente'
    };

    async ngOnInit() {
        await this.loadPermissions();
    }

    async loadPermissions() {
        this.loading.set(true);
        try {
            const matrix = await this.permissionsService.getPermissionMatrix();
            this.matrix.set(matrix);
        } catch (e: unknown) {
            console.error('Error loading permissions:', e);
            this.toast.error('Error', 'No se pudieron cargar los permisos');;
        } finally {
            this.loading.set(false);
        }
    }

    isGranted(role: string, permission: string): boolean {
        return this.matrix()[role]?.[permission] ?? DEFAULT_PERMISSIONS[role as Role]?.[permission] ?? false;
    }

    async togglePermission(role: string, permission: string) {
        const currentValue = this.isGranted(role, permission);
        const newValue = !currentValue;

        // Optimistic update
        const newMatrix = { ...this.matrix() };
        if (!newMatrix[role]) newMatrix[role] = {};
        newMatrix[role][permission] = newValue;
        this.matrix.set(newMatrix);

        this.saving.set(`${role}-${permission}`);
        try {
            await this.permissionsService.setPermission(role, permission, newValue);
        } catch (e: unknown) {
            // Revert on error
            newMatrix[role][permission] = currentValue;
            this.matrix.set(newMatrix);
            this.toast.error('Error', 'No se pudo actualizar el permiso');
        } finally {
            this.saving.set(null);
        }
    }

    async resetRole(role: string) {
        if (!confirm(`¿Restaurar permisos por defecto para ${this.roleLabels[role]}?`)) return;

        try {
            await this.permissionsService.resetRoleToDefaults(role);
            await this.loadPermissions();
            this.toast.success('Restaurado', 'Permisos restaurados a valores por defecto');
        } catch (e: unknown) {
            this.toast.error('Error', 'No se pudieron restaurar los permisos');
        }
    }

    isSaving(role: string, permission: string): boolean {
        return this.saving() === `${role}-${permission}`;
    }
}
