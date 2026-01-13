import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface AppRole {
    id: string;
    name: string; // 'owner', 'admin', 'member', etc.
    label: string;
    description?: string;
}

export interface RolePermission {
    id: string;
    company_id: string;
    role: string; // Deprecated: legacy text role
    role_id?: string; // New: foreign key to app_roles
    permission: string;
    granted: boolean;
    created_at: string;
    updated_at: string;
    app_roles?: AppRole; // Joined data
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
    { key: 'bookings.view', label: 'Ver calendario', description: 'Puede ver todas las reservas y el calendario', category: 'Reservas' },
    { key: 'bookings.view_own', label: 'Ver propias', description: 'Solo ve sus propias reservas', category: 'Reservas' },
    { key: 'bookings.manage_own', label: 'Gestionar propias', description: 'Puede gestionar sus reservas', category: 'Reservas' },
    { key: 'bookings.manage_all', label: 'Gestionar todas', description: 'Puede gestionar cualquier reserva', category: 'Reservas' },

    // Tickets
    { key: 'tickets.view', label: 'Ver tickets', description: 'Puede ver tickets', category: 'Tickets' },
    { key: 'tickets.create', label: 'Crear tickets', description: 'Puede crear tickets', category: 'Tickets' },
    { key: 'tickets.ai', label: 'Uso de IA (Tickets)', description: 'Puede usar IA para generar/resumir tickets', category: 'Inteligencia Artificial' },

    // Products
    { key: 'products.view', label: 'Ver productos', description: 'Puede ver el catálogo de productos', category: 'Productos' },
    { key: 'products.create', label: 'Crear productos', description: 'Puede crear productos', category: 'Productos' },
    { key: 'products.edit', label: 'Editar productos', description: 'Puede editar productos', category: 'Productos' },
    { key: 'products.delete', label: 'Eliminar productos', description: 'Puede eliminar productos', category: 'Productos' },
    { key: 'products.ai', label: 'Uso de IA (Productos)', description: 'Generar descripciones con IA', category: 'Inteligencia Artificial' },

    // Quotes
    { key: 'quotes.view', label: 'Ver presupuestos', description: 'Puede ver presupuestos', category: 'Presupuestos' },
    { key: 'quotes.create', label: 'Crear presupuestos', description: 'Puede crear presupuestos', category: 'Presupuestos' },
    { key: 'quotes.edit', label: 'Editar presupuestos', description: 'Puede editar presupuestos', category: 'Presupuestos' },
    { key: 'quotes.approve', label: 'Aprobar/Rechazar', description: 'Puede cambiar estado manualmente', category: 'Presupuestos' },

    // Chat
    { key: 'chat.access', label: 'Acceso Chat', description: 'Puede usar el chat interno', category: 'Chat' },
    { key: 'chat.ai', label: 'Asistente IA (Chat)', description: 'Puede consultar al asistente IA', category: 'Inteligencia Artificial' },

    // Services
    { key: 'services.view', label: 'Ver servicios', description: 'Puede ver catálogo de servicios', category: 'Servicios' },
    { key: 'services.create', label: 'Crear servicios', description: 'Puede crear servicios', category: 'Servicios' },
    { key: 'services.edit', label: 'Editar servicios', description: 'Puede editar servicios', category: 'Servicios' },

    // Analytics
    { key: 'analytics.view', label: 'Ver analíticas', description: 'Puede ver el dashboard', category: 'Analíticas' },
    { key: 'analytics.export', label: 'Exportar datos', description: 'Puede exportar reportes', category: 'Analíticas' },
    { key: 'analytics.ai', label: 'Insights IA (Analíticas)', description: 'Ver recomendaciones de IA', category: 'Inteligencia Artificial' },

    // Settings
    { key: 'settings.manage', label: 'Gestión configuración', description: 'Acceso a ajustes avanzados del sistema', category: 'Sistema' },
    { key: 'settings.billing', label: 'Gestión facturación', description: 'Acceso a configuración de facturación', category: 'Facturación' },
];

export const AVAILABLE_ROLES = ['super_admin', 'owner', 'admin', 'member', 'professional', 'agent'] as const;
export type Role = typeof AVAILABLE_ROLES[number];

// Default permissions per role (fallback and initial values)
export const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
    super_admin: {
        'clients.view': true, 'clients.view_own': true, 'clients.edit': true, 'clients.delete': true,
        'invoices.view': true, 'invoices.create': true,
        'bookings.view': true, 'bookings.view_own': true, 'bookings.manage_own': true, 'bookings.manage_all': true,
        'tickets.view': true, 'tickets.create': true,
        'settings.manage': true, 'settings.billing': true,
        'products.view': true, 'products.create': true, 'products.edit': true, 'products.delete': true, 'products.ai': true,
        'quotes.view': true, 'quotes.create': true, 'quotes.edit': true, 'quotes.approve': true,
        'chat.access': true, 'chat.ai': true,
        'services.view': true, 'services.create': true, 'services.edit': true,
        'analytics.view': true, 'analytics.export': true, 'analytics.ai': true
    },
    owner: {
        'clients.view': true, 'clients.edit': true, 'clients.delete': true,
        'invoices.view': true, 'invoices.create': true,
        'bookings.view': true, 'bookings.manage_all': true,
        'tickets.view': true, 'tickets.create': true, 'tickets.ai': true,
        'settings.manage': true, 'settings.billing': true,
        'products.view': true, 'products.create': true, 'products.edit': true, 'products.delete': true, 'products.ai': true,
        'quotes.view': true, 'quotes.create': true, 'quotes.edit': true, 'quotes.approve': true,
        'chat.access': true, 'chat.ai': true,
        'services.view': true, 'services.create': true, 'services.edit': true,
        'analytics.view': true, 'analytics.export': true, 'analytics.ai': true
    },
    admin: {
        'clients.view': true, 'clients.edit': true, 'clients.delete': false,
        'invoices.view': true, 'invoices.create': true,
        'bookings.view': true, 'bookings.manage_all': true,
        'tickets.view': true, 'tickets.create': true, 'tickets.ai': true,
        'settings.manage': true, 'settings.billing': false,
        'products.view': true, 'products.create': true, 'products.edit': true, 'products.delete': false, 'products.ai': true,
        'quotes.view': true, 'quotes.create': true, 'quotes.edit': true, 'quotes.approve': false,
        'chat.access': true, 'chat.ai': true,
        'services.view': true, 'services.create': true, 'services.edit': true,
        'analytics.view': true, 'analytics.export': false, 'analytics.ai': true
    },
    member: {
        'clients.view': true, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view': true, 'bookings.view_own': true, 'bookings.manage_own': false,
        'tickets.view': true, 'tickets.create': true, 'tickets.ai': false,
        'settings.manage': false, 'settings.billing': false,
        'products.view': true, 'products.create': false, 'products.edit': false, 'products.delete': false, 'products.ai': false,
        'quotes.view': true, 'quotes.create': false, 'quotes.edit': false, 'quotes.approve': false,
        'chat.access': true, 'chat.ai': false,
        'services.view': true, 'services.create': false, 'services.edit': false
    },
    professional: {
        'clients.view_own': true, 'clients.view': false, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view_own': true, 'bookings.manage_own': true, 'bookings.view': false,
        'tickets.view': true, 'tickets.create': true, 'tickets.ai': true,
        'settings.manage': false, 'settings.billing': false,
        'products.view': true, 'products.create': false, 'products.edit': false, 'products.delete': false, 'products.ai': false,
        'quotes.view': false, 'quotes.create': false, 'quotes.edit': false, 'quotes.approve': false,
        'chat.access': true, 'chat.ai': false,
        'services.view': true, 'services.create': false, 'services.edit': false
    },
    agent: {
        'clients.view': true, 'clients.edit': false, 'clients.delete': false,
        'invoices.view': false, 'invoices.create': false,
        'bookings.view': false, 'bookings.manage_own': false,
        'tickets.view': true, 'tickets.create': true, 'tickets.ai': false,
        'settings.manage': false, 'settings.billing': false,
        'products.view': false, 'products.create': false, 'products.edit': false, 'products.delete': false, 'products.ai': false,
        'quotes.view': false, 'quotes.create': false, 'quotes.edit': false, 'quotes.approve': false,
        'chat.access': true, 'chat.ai': false,
        'services.view': false, 'services.create': false, 'services.edit': false
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
     * Get all defined system roles
     */
    async getRoles(): Promise<AppRole[]> {
        const { data, error } = await this.supabase
            .from('app_roles')
            .select('*')
            .order('name'); // Or order by some 'rank' column if it existed

        if (error) throw error;
        return data || [];
    }

    /**
     * Get all permissions for current company
     * Now fetching app_roles relation to get the role names
     */
    async getCompanyPermissions(): Promise<RolePermission[]> {
        const companyId = this.companyId;
        if (!companyId) return [];

        const { data, error } = await this.supabase
            .from('role_permissions')
            .select('*, app_roles(name, label)')
            .eq('company_id', companyId);

        if (error) throw error;
        return data || [];
    }

    /**
     * Get permission matrix (role.name -> permission -> granted)
     * Now dynamic based on available AppRoles
     */
    async getPermissionMatrix(): Promise<Record<string, Record<string, boolean>>> {
        const [permissions, roles] = await Promise.all([
            this.getCompanyPermissions(),
            this.getRoles()
        ]);

        // Start with defaults matching the roles found in DB
        const matrix: Record<string, Record<string, boolean>> = {};

        for (const role of roles) {
            // Initialize with default values if they exist in our code constant, else false
            matrix[role.name] = { ...(DEFAULT_PERMISSIONS[role.name] || {}) };
        }

        // Override with company custom permissions
        for (const p of permissions) {
            // p.app_roles might be null if the link is broken, but p.role (text) might assume legacy
            // We prefer p.app_roles.name if available, else fallback to p.role
            const roleName = p.app_roles?.name || p.role;

            // Only process if this role is relevant (exists in matrix or we want to show it)
            if (roleName) {
                if (!matrix[roleName]) matrix[roleName] = {};
                matrix[roleName][p.permission] = p.granted;
            }
        }

        return matrix;
    }

    /**
     * Set a permission for a role
     * Uses role_id lookup
     */
    async setPermission(roleName: string, permission: string, granted: boolean): Promise<void> {
        const companyId = this.companyId;
        if (!companyId) throw new Error('No company selected');

        // We need the role_id for this roleName
        // Optimization: We could cache roles, but for now a quick lookup is safer
        const { data: roleData, error: roleError } = await this.supabase
            .from('app_roles')
            .select('id')
            .eq('name', roleName)
            .single();

        if (roleError || !roleData) throw new Error(`Role ${roleName} not found`);

        const { error } = await this.supabase
            .from('role_permissions')
            .upsert({
                company_id: companyId,
                role: roleName, // Keep populating legacy text column for now if needed by other RLS
                role_id: roleData.id,
                permission,
                granted,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'company_id,role,permission' // The unique constraint usually involves these
            });

        if (error) throw error;
    }

    /**
     * Reset a role to default permissions
     */
    async resetRoleToDefaults(roleName: string): Promise<void> {
        const companyId = this.companyId;
        if (!companyId) throw new Error('No company selected');

        // Delete all custom permissions for this role
        // We delete by role string name to be safe with current RLS/constraints, 
        // or we could find the ID. The 'role' column is likely still part of the PK/Unique index in DB.
        const { error } = await this.supabase
            .from('role_permissions')
            .delete()
            .eq('company_id', companyId)
            .eq('role', roleName);

        if (error) throw error;
    }

    // Cached matrix for synchronous checks (e.g. sidebar)
    private _permissionMatrix = signal<Record<string, Record<string, boolean>> | null>(null);

    /**
     * Load and cache permissions matrix
     */
    async loadPermissionsMatrix(): Promise<void> {
        try {
            const matrix = await this.getPermissionMatrix();
            this._permissionMatrix.set(matrix);
        } catch (e) {
            console.error('Failed to load permissions matrix:', e);
            // Fallback to static defaults
            this._permissionMatrix.set(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)));
        }
    }

    /**
     * Check permission synchronously using cached matrix
     */
    hasPermissionSync(permission: string): boolean {
        const matrix = this._permissionMatrix();
        if (!matrix) return false; // Not loaded yet

        const role = this.authService.userRole(); // This returns string name likely
        if (!role) return false;

        // Owner and Super Admin always have access
        if (role === 'owner' || role === 'super_admin') return true;

        return matrix[role]?.[permission] ?? DEFAULT_PERMISSIONS[role]?.[permission] ?? false;
    }

    /**
     * Check if current user has a specific permission
     */
    async hasPermission(permission: string): Promise<boolean> {
        // If we have cached matrix, use it
        if (this._permissionMatrix()) {
            return this.hasPermissionSync(permission);
        }

        const companyId = this.companyId;
        if (!companyId) return false;

        // Get user's role
        const role = this.authService.userRole();
        if (!role) return false;

        // Owner and Super Admin always have all permissions
        if (role === 'owner' || role === 'super_admin') return true;

        // Check custom permission first
        const { data } = await this.supabase
            .from('role_permissions')
            .select('granted')
            .eq('company_id', companyId)
            .eq('role', role)
            .eq('permission', permission)
            .maybeSingle();

        if (data) return data.granted;

        // Fall back to default
        return DEFAULT_PERMISSIONS[role]?.[permission] ?? false;
    }

    isAdminOrOwner(): boolean {
        const role = this.authService.userRole();
        return role === 'owner' || role === 'super_admin' || role === 'admin';
    }

    isClient(): boolean {
        // Assuming client users have role 'client' or null (if public user) but standard auth flow usually sets role.
        // If not set, we might check profile. For now, check role 'client'.
        const role = this.authService.userRole();
        // Also check if they are NOT staff
        return role === 'client' || (!this.isAdminOrOwner() && role !== 'professional' && role !== 'agent' && role !== 'member');
    }
}
