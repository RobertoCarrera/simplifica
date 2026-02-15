import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener, ViewChild, ElementRef, ChangeDetectorRef, TemplateRef, ViewContainerRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AnimationService } from '../../../services/animation.service';
import { Customer, CreateCustomerDev } from '../../../models/customer';
import { AddressesService } from '../../../services/addresses.service';
import { LocalitiesService } from '../../../services/localities.service';
import { Locality } from '../../../models/locality';
import { SupabaseCustomersService, CustomerFilters } from '../../../services/supabase-customers.service';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { HoneypotService } from '../../../services/honeypot.service';

import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { ClientGdprModalComponent } from '../client-gdpr-modal/client-gdpr-modal.component';
import { AiService } from '../../../services/ai.service';

import { SupabaseCustomersService as CustomersSvc } from '../../../services/supabase-customers.service';
import { FormNewCustomerComponent } from '../form-new-customer/form-new-customer.component';

// Optimization: Constants for Regex to avoid reallocation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_CHECK_REGEX = /^[^@\s]+@[^\s@]+\.[^\s@]+$/;
const COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

// ViewModel for performance optimization
interface CustomerViewModel extends Customer {
    displayName: string;
    initials: string;
    avatarGradient: string;
    formattedDate: string;
    searchableText: string;
}

@Component({
    selector: 'app-supabase-customers',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        SkeletonComponent,
        FormNewCustomerComponent,
        OverlayModule
    ],
    templateUrl: './supabase-customers.component.html',
    styleUrls: ['./supabase-customers.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SupabaseCustomersComponent implements OnInit, OnDestroy {

    // Services
    private customersService = inject(SupabaseCustomersService);
    private gdprService = inject(GdprComplianceService);
    private animationService = inject(AnimationService);
    private toastService = inject(ToastService);
    private addressesService = inject(AddressesService);
    private localitiesService = inject(LocalitiesService);
    private honeypotService = inject(HoneypotService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private aiService = inject(AiService); // Inject AI Service
    sidebarService = inject(SidebarStateService);
    devRoleService = inject(DevRoleService);
    public auth = inject(AuthService);
    portal = inject(ClientPortalService);
    private completenessSvc = inject(CustomersSvc);
    private tagsService = inject(GlobalTagsService);

    // Overlay dependencies
    private overlay = inject(Overlay);
    private viewContainerRef = inject(ViewContainerRef);
    @ViewChild('modalTemplate') modalTemplate!: TemplateRef<any>;
    private overlayRef?: OverlayRef;



    // Audio State

    // Audio State
    isRecording = signal(false);
    isProcessingAudio = signal(false);
    mediaRecorder: MediaRecorder | null = null;
    audioChunks: Blob[] = [];

    // State signals
    customers = signal<Customer[]>([]);
    isLoading = signal(false);
    showForm = signal(false);
    selectedCustomer = signal<Customer | null>(null);

    // Client type dropdown - Refactored to child component

    // History management for modals
    private popStateListener: any = null;

    // GDPR signals



    // Devices Modal
    showClientDevicesModal = signal(false);
    devicesModalClient = signal<Customer | null>(null);

    // Invite modal state
    showInviteModal = signal(false);
    inviting = signal(false);
    inviteEmail: string = '';
    inviteMessage: string = '';
    inviteTarget = signal<Customer | null>(null);

    // Cache of client portal access to avoid per-item async calls from the template
    private portalAccessKeys = signal<Set<string>>(new Set());

    // Performance: Reusable collator for efficient string sorting (~2x faster than toLowerCase)
    private collator = new Intl.Collator('es', { sensitivity: 'base' });

    // Filter signals
    searchTerm = signal('');
    sortBy = signal<'name' | 'apellidos' | 'created_at'>('name'); // Default to name
    sortOrder = signal<'asc' | 'desc'>('asc'); // Default to asc for alphabetical

    // New Signals
    viewMode = signal<'grid' | 'table'>('grid');
    filterIndustry = signal<string>('');
    filterStatus = signal<string>('');
    filterDateFrom = signal<string>('');
    filterDateTo = signal<string>('');
    showAdvancedFilters = signal(false);
    showRestricted = signal(false); // Toggle to show/hide restricted users

    // Tag Filter
    availableTags = signal<GlobalTag[]>([]);
    selectedTagId = signal<string>('ALL'); // 'ALL' or tag UUID
    tagColors = signal<Map<string, string>>(new Map()); // Map tagName -> color

    // Bulk selection
    selectedCustomers = signal<Set<string>>(new Set());

    // UI filter toggle for incomplete imports (Removed from UI, logic deprecated)
    onlyIncomplete: boolean = false;

    // Form data

    // Form data
    // Form data - Refactored to child component

    // Método manejador de selección de archivo CSV
    // Removed legacy CSV handlers



    hasDevices(customer: Customer): boolean {
        if (!customer?.devices) return false;
        if (!Array.isArray(customer.devices)) return false;
        if (customer.devices.length === 0) return false;

        const firstItem = customer.devices[0];
        // Supabase count object format: [{ count: N }]
        if (firstItem && 'count' in firstItem && typeof firstItem.count === 'number') {
            return firstItem.count > 0;
        }

        // List of devices: Filter out soft-deleted ones
        const activeDevices = customer.devices.filter(d => !d.deleted_at);
        return activeDevices.length > 0;
    }




    // Método que se llama cuando el usuario confirma el mapeo de columnas en el modal
    // Removed legacy CSV mapping handlers


    // Cache completeness status to avoid O(N log N) re-calculations during sort
    completenessCache = computed(() => {
        const cache = new Map<string, boolean>();
        this.customers().forEach(c => {
            cache.set(c.id, this.completenessSvc.computeCompleteness(c).complete);
        });
        return cache;
    });

    // Optimization: Pre-compute expensive UI derivatives
    enrichedCustomers = computed(() => {
        return this.customers().map(customer => {
            // Display Name Logic
            let displayName = '';
            if (customer.client_type === 'business') {
                displayName = customer.business_name || customer.trade_name || customer.name || '';
            } else {
                displayName = [customer.name, customer.apellidos].filter(Boolean).join(' ').trim();
            }

            if (!displayName || !displayName.trim()) {
                displayName = customer.client_type === 'business' ? 'Empresa importada' : 'Cliente importado';
            }

            if (UUID_REGEX.test(displayName.trim())) {
                displayName = customer.client_type === 'business' ? 'Empresa importada' : 'Cliente importado';
            }

            if (EMAIL_CHECK_REGEX.test(displayName)) {
                displayName = customer.client_type === 'business' ? 'Empresa' : 'Cliente';
            }

            // Initials Logic
            const initials = `${customer.name?.charAt(0) || ''}${customer.apellidos?.charAt(0) || ''}`.toUpperCase();

            // Gradient Logic
            const nameForHash = `${customer.name}${customer.apellidos}`;
            let hash = 0;
            for (let i = 0; i < nameForHash.length; i++) {
                hash = nameForHash.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash % 360);
            const avatarGradient = `linear-gradient(135deg, hsl(${hue}, 70%, 80%) 0%, hsl(${hue + 45}, 70%, 80%) 100%)`;

            // Date Logic
            let formattedDate = '';
            if (customer.created_at) {
                const d = typeof customer.created_at === 'string' ? new Date(customer.created_at) : customer.created_at;
                if (!isNaN(d.getTime())) {
                    formattedDate = d.toLocaleDateString('es-ES', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            }

            // Searchable Text (combine fields for faster filtering)
            const searchableText = [
                customer.name,
                customer.apellidos,
                customer.email,
                customer.dni,
                customer.phone
            ].filter(Boolean).join(' ').toLowerCase();

            return {
                ...customer,
                displayName,
                initials,
                avatarGradient,
                formattedDate,
                searchableText
            } as CustomerViewModel;
        });
    });

    // Computed
    filteredCustomers = computed(() => {
        let filtered = this.enrichedCustomers();

        // ✅ Filtrar clientes anonimizados (ocultarlos de la lista)
        filtered = filtered.filter(customer => !this.isCustomerAnonymized(customer));

        // ✅ Filtrar clientes restringidos (Modo Exclusivo: O ver activos O ver restringidos)
        if (this.showRestricted()) {
            // Mostrar SOLO restringidos
            filtered = filtered.filter(customer => customer.access_restrictions?.blocked);
        } else {
            // Mostrar SOLO activos (no restringidos) - Comportamiento por defecto
            filtered = filtered.filter(customer => !customer.access_restrictions?.blocked);
        }

        // Filter by Tag
        const tagId = this.selectedTagId();
        if (tagId && tagId !== 'ALL') {
            filtered = filtered.filter(customer =>
                customer.tags && customer.tags.some((t: any) => t.id === tagId)
            );
        }

        // Apply search filter
        const search = this.searchTerm().toLowerCase().trim();
        if (search) {
            // Use pre-computed searchable text for 10x faster filtering
            filtered = filtered.filter(customer => customer.searchableText.includes(search));
        }

        // Apply sorting
        const sortBy = this.sortBy();
        const sortOrder = this.sortOrder();

        // Use cached completeness for sorting
        const completeness = this.completenessCache();

        filtered.sort((a, b) => {
            let result = 0;

            if (sortBy === 'name' || sortBy === 'apellidos') {
                const aVal = a[sortBy] || '';
                const bVal = b[sortBy] || '';
                result = COLLATOR.compare(aVal, bVal);
            } else if (sortBy === 'created_at') {
                const aVal = (a.created_at || '').toString();
                const bVal = (b.created_at || '').toString();
                if (aVal < bVal) result = -1;
                else if (aVal > bVal) result = 1;
            } else {
                const aVal = a[sortBy];
                const bVal = b[sortBy];
                if (aVal < bVal) result = -1;
                else if (aVal > bVal) result = 1;
            }

            return sortOrder === 'asc' ? result : -result;
        });

        return filtered;
    });

    // Completeness helpers for template
    isCustomerComplete(c: Customer): boolean {
        return this.completenessCache().get(c.id) ?? false;
    }

    getCustomerMissingFields(c: Customer): string[] {
        return this.completenessSvc.computeCompleteness(c).missingFields;
    }

    onOnlyIncompleteChange(_val: any) {
        // Trigger recompute; searchTerm is a signal, resetting to same value is enough for change detection in computed
        this.searchTerm.set(this.searchTerm());
    }

    formatAttentionReasons(c: any): string {
        const md = (c && c.metadata) || {};
        const reasons: string[] = Array.isArray(md.attention_reasons) ? md.attention_reasons : [];

        // Check computed missing fields if no metadata reasons
        if (!reasons.length) {
            const missing = this.completenessSvc.computeCompleteness(c).missingFields;
            if (missing.length > 0) {
                return 'Faltan: ' + missing.join(', ');
            }
            return 'Marcado para revisión';
        }

        const map: Record<string, string> = {
            email_missing_or_invalid: 'Email',
            name_missing: 'Nombre',
            surname_missing: 'Apellidos',
            dni_missing: 'DNI/CIF',
            phone_missing: 'Teléfono',
            address_missing: 'Dirección'
        };
        return 'Faltan: ' + reasons.map(r => map[r] || r).join(', ');
    }

    // ... (ngInit/Destroy omitted for brevity in replacement if needed, but here we replace specific block)

    // Unified RGPD badge configuration - follows style guide semantic palette
    rgpdStatusConfig = {
        compliant: {
            label: 'Consentimiento otorgado',
            classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
            icon: 'fa-shield-alt'
        },
        partial: {
            label: 'Consentimiento parcial',
            classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            icon: 'fa-shield-alt'
        },
        nonCompliant: {
            label: 'Sin consentimiento',
            classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
            icon: 'fa-shield-alt'
        },
        blocked: {
            label: 'Acceso Restringido',
            classes: 'bg-gray-800 text-white dark:bg-gray-600 dark:text-gray-100 ring-2 ring-red-500',
            icon: 'fa-ban'
        }
    };

    // Show GDPR compliance status for a customer
    getGdprComplianceStatus(customer: Customer): 'compliant' | 'partial' | 'nonCompliant' | 'blocked' {
        // High priority: Blocked status
        if (customer.access_restrictions?.blocked) {
            return 'blocked';
        }

        // If they have the mandatory consent (data_processing), they are compliant for service provision.
        if (customer.data_processing_consent) {
            return 'compliant';
        } else {
            return 'nonCompliant';
        }
    }

    getGdprBadgeConfig(customer: Customer) {
        // Check for migration compatibility - if consent_status exists, use it
        if (customer.consent_status === 'rejected' || customer.consent_status === 'revoked') {
            return {
                ...this.rgpdStatusConfig.nonCompliant,
                label: 'Consentimiento ' + (customer.consent_status === 'revoked' ? 'revocado' : 'rechazado')
            };
        }

        const status = this.getGdprComplianceStatus(customer);
        return this.rgpdStatusConfig[status];
    }

    ngOnInit() {
        this.loadData();
        // Start initial load
        this.customersService.loadCustomers();


        // Initialize portal access cache
        this.refreshPortalAccess();
        // Load tags
        this.loadTags();

        // Subscribe to real-time changes
        this.customersService.subscribeToClientChanges();
    }

    ngOnDestroy() {
        // Unsubscribe from real-time changes
        this.customersService.unsubscribeFromClientChanges();

        // Asegurar que el scroll se restaure si el componente se destruye con modal abierto
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';

        // Limpiar listener de popstate
        if (this.popStateListener) {
            window.removeEventListener('popstate', this.popStateListener);
            this.popStateListener = null;
        }
    }

    // Open invite modal prefilled with customer email
    openInviteModal(customer: Customer) {
        if (!customer) return;
        this.inviteTarget.set(customer);
        this.inviteEmail = (customer.email || '').trim();
        this.inviteMessage = 'Hola, te invito a acceder a tu portal de cliente.';
        this.showInviteModal.set(true);
    }

    closeInviteModal() {
        this.showInviteModal.set(false);
        this.inviteTarget.set(null);
        this.inviteEmail = '';
        this.inviteMessage = '';
    }

    // Build a cache of (client_id:email) with active portal access
    private async refreshPortalAccess() {
        try {
            const { data, error } = await this.portal.listMappings();
            if (error) return;
            const active = (data || []).filter((r: any) => r && r.is_active !== false);
            const keys = new Set<string>();
            for (const r of active) {
                const cid = (r.client_id || '').toString();
                const em = (r.email || '').toLowerCase();
                if (cid && em) keys.add(`${cid}:${em} `);
            }
            this.portalAccessKeys.set(keys);
        } catch { }
    }

    // Helper used by template to avoid async pipes per item
    hasPortalAccess(customer: Customer, email?: string | null): boolean {
        if (!customer?.id || !email) return false;
        // Optimization: lowerCase created once during input or storage would be better, but fast enough for now
        return this.portalAccessKeys().has(`${customer.id}:${email.toLowerCase()} `);
    }

    private isValidEmail(email: string): boolean {
        return EMAIL_CHECK_REGEX.test((email || '').trim());
    }

    async sendInvite() {
        const email = (this.inviteEmail || '').trim().toLowerCase();
        if (!this.isValidEmail(email)) {
            this.toastService.error('Introduce un email válido.', 'Email inválido');
            return;
        }

        const companyId = this.auth.companyId();
        if (!companyId) {
            this.toastService.error('No se pudo detectar tu empresa activa.', 'Error');
            return;
        }

        this.inviting.set(true);
        try {
            // Enviar invitación al PORTAL DE CLIENTES mediante Edge Function
            const mail = await this.auth.sendCompanyInvite({
                email,
                role: 'client',
                message: (this.inviteMessage || '').trim() || undefined,
            });

            if (!mail.success) {
                this.toastService.error(mail.error || 'No se pudo enviar la invitación', 'Error');
                return;
            }

            // ÉXITO: Email enviado (ya sea invitación nueva o magic link para usuario existente)
            this.toastService.success('Invitación enviada por email correctamente.', 'Éxito');
            this.closeInviteModal();
        } catch (e: any) {
            this.toastService.error(e?.message || 'Error al enviar la invitación', 'Error');
        } finally {
            this.inviting.set(false);
        }
    }

    // Toggle client portal access from the list (button changes icon/color)
    async togglePortalAccess(customer: Customer, enable: boolean, ev?: Event) {
        ev?.stopPropagation();
        if (!customer?.email) {
            this.toastService.error('El cliente no tiene email.', 'Portal de clientes');
            return;
        }
        const res = await this.portal.toggleClientPortalAccess(customer.id, customer.email, enable);
        if (res.success) {
            if (enable) {
                this.toastService.success('Acceso habilitado al portal', 'Portal de clientes');
                // Enviar invitación automáticamente con rol 'client'
                try {
                    const mail = await this.auth.sendCompanyInvite({ email: customer.email!, role: 'client' });
                    if (!mail.success) {
                        this.toastService.error(mail.error || 'No se pudo enviar la invitación por email', 'Error');
                    } else {
                        this.toastService.success('Invitación enviada por email correctamente.', 'Éxito');
                    }
                } catch (e: any) {
                    this.toastService.error(e?.message || 'Error al enviar la invitación', 'Error');
                }
            } else {
                this.toastService.info('Acceso deshabilitado al portal', 'Portal de clientes');
            }
            // Update local cache immediately for snappy UI
            const next = new Set(this.portalAccessKeys());
            const key = `${customer.id}:${(customer.email || '').toLowerCase()} `;
            if (enable) next.add(key); else next.delete(key);
            this.portalAccessKeys.set(next);
        } else {
            this.toastService.error(res.error || 'No se pudo actualizar el acceso', 'Portal de clientes');
        }
    }

    private loadData() {
        // Subscribe to customers
        this.customersService.customers$.subscribe(customers => {
            this.customers.set(customers);
            // Keep portal access cache in sync with customer list
            this.refreshPortalAccess();
        });

        // Subscribe to loading state
        // Subscribe to loading state
        this.customersService.loading$.subscribe(loading => {
            this.isLoading.set(loading);
        });
    }

    loadTags() {
        this.tagsService.getTags('clients').subscribe(tags => {
            this.availableTags.set(tags);
            // Create color map
            const colorMap = new Map<string, string>();
            tags.forEach(t => colorMap.set(t.name, t.color));
            this.tagColors.set(colorMap);
        });
    }

    getTagColor(tagName: string): string {
        return this.tagColors().get(tagName) || '#e5e7eb'; // Default gray
    }

    // Bulk Actions
    toggleSelection(id: string) {
        const current = new Set(this.selectedCustomers());
        if (current.has(id)) {
            current.delete(id);
        } else {
            current.add(id);
        }
        this.selectedCustomers.set(current);
    }

    toggleAllSelection() {
        const current = this.selectedCustomers();
        const all = this.filteredCustomers();
        if (current.size === all.length) {
            this.selectedCustomers.set(new Set());
        } else {
            const newSet = new Set<string>();
            all.forEach(c => newSet.add(c.id));
            this.selectedCustomers.set(newSet);
        }
    }

    deleteSelected() {
        const count = this.selectedCustomers().size;
        if (count === 0) return;

        if (!confirm(`¿Estás seguro de eliminar ${count} clientes seleccionados?`)) return;

        const ids = Array.from(this.selectedCustomers());
        // For now, sequentially delete (or use a bulk RPC if available)
        // Since we don't have bulk delete RPC exposed in service yet, let's just log or implement loops.
        // Actually, we should probably implement bulk delete in service, but for now loop is fine for MVP.
        let deleted = 0;
        ids.forEach(id => {
            this.customersService.deleteCustomer(id).subscribe({
                next: () => {
                    deleted++;
                    if (deleted === count) {
                        this.toastService.success(`Se han eliminado ${count} clientes.`, 'Éxito');
                        this.selectedCustomers.set(new Set());
                        this.loadCustomers();
                    }
                }
            });
        });
    }

    // Via suggestions handler
    // Locality input handlers removed (moved to child component)




    // Event handlers
    onSearchChange(term: string) {
        this.searchTerm.set(term);
    }

    onFiltersChange() {
        this.loadCustomers(); // Uses the updated loadCustomers method
    }

    // Customer actions
    selectCustomer(customer: Customer) {
        this.selectedCustomer.set(customer);
        // Could open a detail view or perform other actions
    }

    editCustomer(customer: Customer) {
        this.selectedCustomer.set(customer);
        this.setupOverlay();
        this.showForm.set(true);
        history.pushState({ modal: 'customer-form' }, '');
    }



    openForm() {
        this.selectedCustomer.set(null);
        this.setupOverlay();
        this.showForm.set(true);

        // Añadir entrada al historial para que el botón "atrás" cierre el modal
        history.pushState({ modal: 'customer-form' }, '');

        // Configurar listener de popstate si no existe
        if (!this.popStateListener) {
            this.popStateListener = (event: PopStateEvent) => {
                if (this.showForm()) {
                    this.closeForm();
                }
            };
            window.addEventListener('popstate', this.popStateListener);
        }

        // Bloquear scroll de la página principal de forma más agresiva
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        document.documentElement.style.overflow = 'hidden';
    }


    viewCustomer(customer: Customer, tab?: string) {
        const commands = ['/clientes', customer.id];
        const extras = tab ? { queryParams: { tab } } : undefined;
        this.router.navigate(commands, extras);
    }

    duplicateCustomer(customer: Customer) {
        this.selectedCustomer.set({
            ...customer,
            name: customer.name + ' (Copia)',
            email: '',
            dni: '',
            id: '' // Ensure new ID
        } as any);
        this.setupOverlay();
        this.showForm.set(true);
    }

    closeForm() {
        this.disposeOverlay();
        this.showForm.set(false);
        this.selectedCustomer.set(null);

        // Restaurar scroll de la página principal
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.documentElement.style.overflow = '';

        if (window.history.state && window.history.state.modal) {
            window.history.back();
        }
    }

    private setupOverlay() {
        if (this.overlayRef) return;
        const positionStrategy = this.overlay.position().global();
        this.overlayRef = this.overlay.create({
            positionStrategy,
            scrollStrategy: this.overlay.scrollStrategies.block(),
            hasBackdrop: false,
            width: '100%',
            height: '100%',
            panelClass: ['full-screen-modal-pane', 'cdk-global-overlay-wrapper'] // Force wrapper class if needed, but custom class is key
        });
        this.overlayRef.attach(new TemplatePortal(this.modalTemplate, this.viewContainerRef));
    }

    private disposeOverlay() {
        if (this.overlayRef) {
            this.overlayRef.dispose();
            this.overlayRef = undefined;
        }
    }

    onCustomerSaved() {
        this.closeForm();
        // Refresh list if needed (service usually handles it via subscription)
        this.customersService.loadCustomers();
    }

    // Wrapper for template access to refresh service data upon GDPR updates
    loadCustomers() {
        // Pass all current filters to the service
        this.customersService.getCustomers({
            search: this.searchTerm(),
            sortBy: this.sortBy(),
            sortOrder: this.sortOrder(),
            industry: this.filterIndustry() || undefined,
            status: this.filterStatus() || undefined,
            dateFrom: this.filterDateFrom() || undefined,
            dateTo: this.filterDateTo() || undefined,
            showDeleted: false // Or add a toggle for this if needed
        }).subscribe({
            next: (customers) => {
                this.customers.set(customers);
                this.refreshPortalAccess();
            },
            error: (err) => console.error('Error loading customers:', err)
        });
    }

    toggleViewMode() {
        this.viewMode.set(this.viewMode() === 'grid' ? 'table' : 'grid');
    }

    async deleteCustomer(customer: Customer) {
        const message = `¿Eliminar definitivamente a ${customer.name} ${customer.apellidos}?\n\n` +
            `Si tiene facturas se desactivará conservando el historial.Si es sólo un lead(sin facturas) se eliminará totalmente.`;
        if (!confirm(message)) return;

        this.customersService.deleteCustomer(customer.id).subscribe({
            next: () => { /* handled in service */ },
            error: (error) => {
                console.error('Error en eliminación/desactivación:', error);
                alert('No se pudo eliminar/desactivar el cliente: ' + (error?.message || error));
            }
        });
    }





    clearFilters() {
        this.searchTerm.set('');
        this.selectedTagId.set('ALL');
        this.filterIndustry.set('');
        this.filterStatus.set('');
        this.filterDateFrom.set('');
        this.filterDateTo.set('');
        this.loadCustomers();
    }

    // Utility methods
    getCustomerInitials(customer: Customer): string {
        return `${customer.name.charAt(0)}${customer.apellidos.charAt(0)}`.toUpperCase();
    }

    // Nombre amigable para mostrar en la card evitando UUIDs u otros identificadores técnicos
    // @deprecated Use customer.displayName from ViewModel in template
    getDisplayName(customer: Customer): string {
        if (!customer) return '';
        // Preferir razón social si es empresa
        let base = customer.client_type === 'business'
            ? (customer.business_name || customer.trade_name || customer.name)
            : [customer.name, customer.apellidos].filter(Boolean).join(' ').trim();

        if (!base || !base.trim()) {
            base = customer.client_type === 'business' ? 'Empresa importada' : 'Cliente importado';
        }

        // Detectar patrón UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
        if (UUID_REGEX.test(base.trim())) {
            base = customer.client_type === 'business' ? 'Empresa importada' : 'Cliente importado';
        }

        // Evitar mostrar correos como nombre si accidentalmente se mapearon
        if (EMAIL_CHECK_REGEX.test(base)) {
            base = customer.client_type === 'business' ? 'Empresa' : 'Cliente';
        }

        return base;
    }

    formatDate(date: string | Date | null | undefined): string {
        if (!date) return '';

        // Normalize to Date instance
        const d: Date = typeof date === 'string' ? new Date(date) : date;

        if (isNaN(d.getTime())) return '';

        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // ========================================
    // GDPR METHODS
    // ========================================



    // Open GDPR modal for comprehensive management
    openGdprModal(customer: Customer): void {
        // Navigate to the full GDPR Customer Manager, pre-filtering by this customer
        this.router.navigate(['/clientes-gdpr'], {
            queryParams: { search: customer.email }
        });
    }

    // Modal methods removed as we navigate to full view




    // Check if customer is already anonymized
    isCustomerAnonymized(customer: Customer): boolean {
        return customer.anonymized_at != null ||
            customer.name?.startsWith('ANONYMIZED_') ||
            customer.email?.includes('@anonymized.local');
    }



    // Pending Rectification Requests Logic


    // Avatar gradient generator - consistent hash-based color selection
    getAvatarGradient(customer: Customer): string {
        const name = `${customer.name}${customer.apellidos}`;
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash % 360);
        return `linear-gradient(135deg, hsl(${hue}, 70%, 80%) 0%, hsl(${hue + 45}, 70%, 80%) 100%)`;
    }




    toggleGdprMenu(event: Event, customerId: string) {
        event.stopPropagation();

        // Get the button that was clicked
        const button = (event.target as HTMLElement).closest('.action-btn.gdpr') as HTMLElement;
        if (!button) return;

        // Close all other menus first
        const allMenus = document.querySelectorAll('.gdpr-dropdown');
        allMenus.forEach(menu => {
            if (menu.id !== `gdpr-menu-${customerId}`) {
                menu.classList.add('hidden');
            }
        });

        // Toggle current menu
        const menu = document.getElementById(`gdpr-menu-${customerId}`) as HTMLElement;
        if (!menu) return;

        const isCurrentlyHidden = menu.classList.contains('hidden');

        if (isCurrentlyHidden) {
            // Position the menu relative to the card (not the button)
            const card = button.closest('.customer-card') as HTMLElement;
            if (card) {
                const cardRect = card.getBoundingClientRect();

                // Position overlay over the card
                menu.style.position = 'fixed';
                menu.style.top = `${cardRect.top}px`;
                menu.style.left = `${cardRect.left}px`;
                menu.style.width = `${cardRect.width}px`;
                menu.style.height = `${cardRect.height}px`;
                menu.style.zIndex = '9999';
            }
            menu.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
        }
    }

    // Close GDPR menus when clicking outside
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: Event) {
        const target = event.target as HTMLElement;
        if (!target.closest('.gdpr-actions-menu')) {
            const allMenus = document.querySelectorAll('.gdpr-dropdown');
            allMenus.forEach(menu => menu.classList.add('hidden'));
        }
        // Locality selector cleanup removed as it's handled in child component
    }

    // Load GDPR compliance statistics


    // Prevent Escape key from closing the customer modal unintentionally.
    // Some global handlers may close modals on Escape; intercept it while our modal is open.
    @HostListener('document:keydown.escape', ['$event'])
    onEscape(event: any) {
        if (this.showForm()) {
            // Stop propagation so global listeners don't close the modal.
            if (event?.stopPropagation) event.stopPropagation();
            // Intentionally do not call closeForm() so only explicit UI actions close the modal.
        }
    }
    // --- Audio Client Creation Logic ---
    async toggleRecording() {
        if (this.isRecording()) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                await this.processAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop()); // Stop mic
            };

            this.mediaRecorder.start();
            this.isRecording.set(true);
            this.toastService.info('Escuchando...', 'Grabación iniciada');
        } catch (err) {
            console.error('Error recording audio', err);
            this.toastService.error('No se pudo acceder al micrófono. Por favor verifica los permisos.', 'Error');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording()) {
            this.mediaRecorder.stop();
            this.isRecording.set(false);
            this.isProcessingAudio.set(true);
        }
    }

    async processAudio(blob: Blob) {
        try {
            const result = await this.aiService.processAudioClient(blob);
            console.log('AI Client Data:', result);

            // Pre-fill form data
            // Construct a partial customer to prefill the form
            const partialCustomer: Partial<Customer> = {
                name: result.name || '',
                apellidos: result.apellidos || '',
                email: result.email || '',
                phone: result.phone || '',
                dni: result.dni || '',
                business_name: result.business_name || '',
                // map other fields if present in result
                // For address, we can pass it if we have structure
                direccion: {
                    nombre: (result as any).addressNombre || '',
                    tipo_via: (result as any).addressTipoVia || '',
                    numero: (result as any).addressNumero || '',
                    localidad_id: '' // Can't guess ID easily
                } as any,
                marketing_consent: false,
                data_processing_consent: false
            };

            this.selectedCustomer.set(partialCustomer as Customer);
            this.showForm.set(true);
            this.toastService.success('Datos extraídos del audio', 'Cliente pre-rellenado');

        } catch (error) {
            console.error('Error processing audio', error);
            this.toastService.error('No pudimos entender el audio. Por favor intenta de nuevo.', 'Error IA');
        } finally {
            this.isProcessingAudio.set(false);
        }
    }


}
