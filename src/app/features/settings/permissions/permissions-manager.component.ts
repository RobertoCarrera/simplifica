import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    SupabasePermissionsService,
    AVAILABLE_PERMISSIONS,
    AVAILABLE_ROLES,
    DEFAULT_PERMISSIONS,
    PermissionDefinition,
    Role,
    AppRole
} from '../../../services/supabase-permissions.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseModulesService, EffectiveModule } from '../../../services/supabase-modules.service';

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
    private modulesService = inject(SupabaseModulesService);

    loading = signal(true);
    saving = signal<string | null>(null); // Currently saving permission key

    // Permission matrix: role -> permission -> granted
    matrix = signal<Record<string, Record<string, boolean>>>({});

    // Dynamic roles fetched from DB
    availableRoles = signal<AppRole[]>([]);

    // Map categories to module keys (if applicable)
    private categoryModuleMap: Record<string, string> = {
        'Tickets': 'moduloSAT',
        'Facturación': 'moduloFacturas',
        'Reservas': 'moduloReservas',
        'Productos': 'moduloProductos',
        'Servicios': 'moduloServicios',
        'Presupuestos': 'moduloPresupuestos',
        'Chat': 'moduloChat',
        'Analíticas': 'moduloAnaliticas',
        'Inteligencia Artificial': 'moduloIA',
        // 'Clientes' is core
        // 'Sistema' is core
    };

    // Group permissions by category, respecting active modules
    permissionsByCategory = computed(() => {
        const grouped: Record<string, PermissionDefinition[]> = {};
        const effectiveModules = this.modulesService.modulesSignal(); // Correct signal access

        // If modules not loaded yet, default to empty or allow all (safer to allow core only?)
        // Assuming if null, we wait or show everything? Let's show everything to avoid empty screen flicker
        const activeModuleKeys = effectiveModules
            ? new Set(effectiveModules.filter((m: EffectiveModule) => m.enabled).map((m: EffectiveModule) => m.key))
            : null;

        for (const perm of AVAILABLE_PERMISSIONS) {
            // Check if category is bound to a module
            const moduleKey = this.categoryModuleMap[perm.category];

            // Only filter if we have loaded modules AND the category has a module key
            if (activeModuleKeys && moduleKey && !activeModuleKeys.has(moduleKey)) {
                continue; // Skip if module is disabled
            }

            if (!grouped[perm.category]) grouped[perm.category] = [];
            grouped[perm.category].push(perm);
        }
        return grouped;
    });

    categories = computed(() => Object.keys(this.permissionsByCategory()));

    // Roles to display in the table (all except owner and super_admin which are full access)
    // Actually, 'admin' might also have fixed permissions in some systems, but here we allow editing admin? 
    // The previous code said "roles !== owner && roles !== admin" - wait.
    // Let's filter out 'owner' and 'super_admin' as they are god roles.
    displayRoles = computed(() => {
        return this.availableRoles().filter(r => r.name !== 'owner' && r.name !== 'super_admin' && r.name !== 'client' && r.name !== 'admin');
    });

    async ngOnInit() {
        await this.loadData();
    }

    async loadData() {
        this.loading.set(true);
        try {
            // Parallel load roles and matrix
            const [roles, matrix] = await Promise.all([
                this.permissionsService.getRoles(),
                this.permissionsService.getPermissionMatrix()
            ]);

            this.availableRoles.set(roles);
            this.matrix.set(matrix);
        } catch (e: unknown) {
            console.error('Error loading permissions:', e);
            this.toast.error('Error', 'No se pudieron cargar los permisos');;
        } finally {
            this.loading.set(false);
        }
    }

    isGranted(roleName: string, permission: string): boolean {
        // Fallback to defaults is handled in getPermissionMatrix now, so matrix should have values
        // But if matrix is missing the role entirely, check DEFAULT_PERMISSIONS for safety
        return this.matrix()[roleName]?.[permission] ?? DEFAULT_PERMISSIONS[roleName]?.[permission] ?? false;
    }

    async togglePermission(roleName: string, permission: string) {
        const currentValue = this.isGranted(roleName, permission);
        const newValue = !currentValue;

        // Optimistic update
        const newMatrix = { ...this.matrix() };
        if (!newMatrix[roleName]) newMatrix[roleName] = {};
        newMatrix[roleName][permission] = newValue;
        this.matrix.set(newMatrix);

        this.saving.set(`${roleName}-${permission}`);
        try {
            await this.permissionsService.setPermission(roleName, permission, newValue);
        } catch (e: unknown) {
            // Revert on error
            newMatrix[roleName][permission] = currentValue;
            this.matrix.set(newMatrix);
            this.toast.error('Error', 'No se pudo actualizar el permiso');
        } finally {
            this.saving.set(null);
        }
    }

    async resetRole(role: AppRole) {
        if (!confirm(`¿Restaurar permisos por defecto para ${role.label}?`)) return;

        try {
            await this.permissionsService.resetRoleToDefaults(role.name);
            // Reload matrix to get clean state
            const matrix = await this.permissionsService.getPermissionMatrix();
            this.matrix.set(matrix);
            this.toast.success('Restaurado', 'Permisos restaurados a valores por defecto');
        } catch (e: unknown) {
            this.toast.error('Error', 'No se pudieron restaurar los permisos');
        }
    }

    isSaving(roleName: string, permission: string): boolean {
        return this.saving() === `${roleName}-${permission}`;
    }
}
