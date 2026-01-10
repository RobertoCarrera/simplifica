import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface RolePermission {
    id: string;
    company_id: string;
    role: string;
    permission: string;
    granted: boolean;
    created_at: string;
    updated_at: string;
}

export interface PermissionDefinition {
    key: string;
    label: string;
    description: string;
    category: string;
}

// All available permissions in the system
export const AVAILABLE_PERMISSIONS: PermissionDefinition[] = [
    // Clients
    { key: 'clients.view', label: 'Ver clientes', description: 'Puede ver la lista de clientes', category: 'Clientes' },
    { key: 'clients.view_own', label: 'Ver propios', description: 'Solo ve clientes asignados', category: 'Clientes' },
    { key: 'clients.edit', label: 'Editar clientes', description: 'Puede modificar datos de clientes', category: 'Clientes' },
    { key: 'clients.delete', label: 'Eliminar clientes', description: 'Puede eliminar clientes', category: 'Clientes' },

    // Invoices
    { key: 'invoices.view', label: 'Ver facturas', description: 'Puede ver facturas', category: 'Facturación' },
    { key: 'invoices.create', label: 'Crear facturas', description: 'Puede crear facturas', category: 'Facturación' },

    // Bookings
    { key: 'bookings.view', label: 'Ver reservas', description: 'Puede ver todas las reservas', category: 'Reservas' },
    { key: 'bookings.view_own', label: 'Ver propias', description: 'Solo ve sus propias reservas', category: 'Reservas' },
    { key: 'bookings.manage_own', label: 'Gestionar propias', description: 'Puede gestionar sus reservas', category: 'Reservas' },
    { key: 'bookings.manage_all', label: 'Gestionar todas', description: 'Puede gestionar cualquier reserva', category: 'Reservas' },

    // Tickets
    { key: 'tickets.view', label: 'Ver tickets', description: 'Puede ver tickets', category: 'Tickets' },
    { key: 'tickets.create', label: 'Crear tickets', description: 'Puede crear tickets', category: 'Tickets' },

    // Settings
    { key: 'settings.access', label: 'Acceso configuración', description: 'Puede acceder a configuración', category: 'Sistema' },
    { key: 'settings.billing', label: 'Gestión facturación', description: 'Acceso a configuración de facturación', category: 'Sistema' },
];

// All available roles
export const AVAILABLE_ROLES = ['owner', 'admin', 'member', 'professional', 'agent'] as const;
export type Role = typeof AVAILABLE_ROLES[number];

// Default permissions per role (used when no custom permissions exist)
export const DEFAULT_PERMISSIONS: Record<Role, Record<string, boolean>> = {
    owner: {
        'clients.view': true, 'clients.edit': true, 'clients.delete': true,
        'invoices.view': true, 'invoices.create': true,
        'bookings.view': true, 'bookings.manage_all': true,
        'tickets.view': true, 'tickets.create': true,
        'settings.access': true, 'settings.billing': true,
    },
    admin: {
        'clients.view': true, 'clients.edit': true, 'clients.delete': false,
        'invoices.view': true, 'invoices.create': true,
        'bookings.view': true, 'bookings.manage_all': true,
        'tickets.view': true, 'tickets.create': true,
        'settings.access': true, 'settings.billing': false,
    },
    member: {
        'clients.view': true, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view': true, 'bookings.view_own': true, 'bookings.manage_own': false,
        'tickets.view': true, 'tickets.create': true,
        'settings.access': false, 'settings.billing': false,
    },
    professional: {
        'clients.view_own': true, 'clients.view': false, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view_own': true, 'bookings.manage_own': true, 'bookings.view': false,
        'tickets.view': false, 'tickets.create': false,
        'settings.access': false, 'settings.billing': false,
    },
    agent: {
        'clients.view': true, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view': false, 'bookings.manage_own': false,
        'tickets.view': true, 'tickets.create': true,
        'settings.access': false, 'settings.billing': false,
    }
};

@Injectable({
    providedIn: 'root'
})
export class SupabasePermissionsService {
    private supabase = inject(SupabaseClientService).instance;
    private authService = inject(AuthService);

    get companyId(): string | undefined {
        return this.authService.currentCompanyId() ?? undefined;
    }

    /**
     * Get all permissions for current company
     */
    async getCompanyPermissions(): Promise<RolePermission[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const { data, error } = await this.supabase
            .from('role_permissions')
            .select('*')
            .eq('company_id', companyId)
            .order('role')
            .order('permission');

        if (error) throw error;
        return data || [];
    }

    /**
     * Get permission matrix (role -> permission -> granted)
     */
    async getPermissionMatrix(): Promise<Record<string, Record<string, boolean>>> {
        const permissions = await this.getCompanyPermissions();

        // Start with defaults
        const matrix: Record<string, Record<string, boolean>> = {};
        for (const role of AVAILABLE_ROLES) {
            matrix[role] = { ...DEFAULT_PERMISSIONS[role] };
        }

        // Override with custom permissions
        for (const p of permissions) {
            if (!matrix[p.role]) matrix[p.role] = {};
            matrix[p.role][p.permission] = p.granted;
        }

        return matrix;
    }

    /**
     * Set a permission for a role
     */
    async setPermission(role: string, permission: string, granted: boolean): Promise<void> {
        const companyId = this.companyId;
        if (!companyId) throw new Error('No company selected');

        const { error } = await this.supabase
            .from('role_permissions')
            .upsert({
                company_id: companyId,
                role,
                permission,
                granted,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'company_id,role,permission'
            });

        if (error) throw error;
    }

    /**
     * Reset a role to default permissions
     */
    async resetRoleToDefaults(role: string): Promise<void> {
        const companyId = this.companyId;
        if (!companyId) throw new Error('No company selected');

        // Delete all custom permissions for this role
        const { error } = await this.supabase
            .from('role_permissions')
            .delete()
            .eq('company_id', companyId)
            .eq('role', role);

        if (error) throw error;
    }

    /**
     * Check if current user has a specific permission
     */
    async hasPermission(permission: string): Promise<boolean> {
        const companyId = this.companyId;
        if (!companyId) return false;

        // Get user's role
        const role = this.authService.userRole();
        if (!role) return false;

        // Owner always has all permissions
        if (role === 'owner') return true;

        // Check custom permission first
        const { data } = await this.supabase
            .from('role_permissions')
            .select('granted')
            .eq('company_id', companyId)
            .eq('role', role)
            .eq('permission', permission)
            .single();

        if (data) return data.granted;

        // Fall back to default
        return DEFAULT_PERMISSIONS[role as Role]?.[permission] ?? false;
    }
}
