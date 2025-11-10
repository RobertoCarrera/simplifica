import { Component, OnInit, OnDestroy, inject, signal, computed, HostListener, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { AnimationService } from '../../services/animation.service';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../csv-header-mapper/csv-header-mapper.component';
import { Customer, CreateCustomerDev } from '../../models/customer';
import { AddressesService } from '../../services/addresses.service';
import { LocalitiesService } from '../../services/localities.service';
import { Locality } from '../../models/locality';
import { SupabaseCustomersService, CustomerFilters } from '../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../services/gdpr-compliance.service';
import { ToastService } from '../../services/toast.service';
import { DevRoleService } from '../../services/dev-role.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { HoneypotService } from '../../services/honeypot.service';
import { AppModalComponent } from '../app-modal/app-modal.component';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { ClientPortalService } from '../../services/client-portal.service';
import { ClientGdprModalComponent } from '../client-gdpr-modal/client-gdpr-modal.component';
import { SupabaseCustomersService as CustomersSvc } from '../../services/supabase-customers.service';

@Component({
  selector: 'app-supabase-customers',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    SkeletonComponent, 
    LoadingComponent,
    CsvHeaderMapperComponent,
    AppModalComponent,
    ClientGdprModalComponent,
  ],
  templateUrl: './supabase-customers.component.html',
  styleUrls: ['./supabase-customers.component.scss']
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
  sidebarService = inject(SidebarStateService);
  devRoleService = inject(DevRoleService);
  private auth = inject(AuthService);
  portal = inject(ClientPortalService);
  private completenessSvc = inject(CustomersSvc);
  // Toast de importación (único y actualizable)
  private importToastId: string | null = null;

  // State signals
  customers = signal<Customer[]>([]);
  isLoading = signal(false);
  showForm = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  
  // History management for modals
  private popStateListener: any = null;
  
  // GDPR signals
  gdprPanelVisible = signal(false);
  complianceStats = signal<any>(null);
  
  // GDPR Modal signals
  showGdprModal = signal(false);
  gdprModalClient = signal<Customer | null>(null);
  flippedCardId = signal<string | null>(null);

  // Invite modal state
  showInviteModal = signal(false);
  inviting = signal(false);
  inviteEmail: string = '';
  inviteMessage: string = '';
  inviteTarget = signal<Customer | null>(null);

  // Cache of client portal access to avoid per-item async calls from the template
  private portalAccessKeys = signal<Set<string>>(new Set());

  // Filter signals
  searchTerm = signal('');
  sortBy = signal<'name' | 'apellidos' | 'created_at'>('created_at');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // CSV Mapper signals
  showCsvMapper = signal(false);
  csvHeaders = signal<string[]>([]);
  // csvData: sólo para PREVIEW (limitada)
  csvData = signal<string[][]>([]);
  // fullCsvData: dataset completo para importación
  fullCsvData = signal<string[][]>([]);
  pendingCsvFile: File | null = null;
  // UI filter toggle for incomplete imports
  onlyIncomplete: boolean = false;

  // Customers CSV mapper config (unified model: individual + business)
  customerFieldOptions = [
    // Campos comunes (opcionales pero recomendados)
    { value: 'email', label: 'Email', required: false },
    { value: 'phone', label: 'Teléfono', required: false },
    
    // Campos de Persona Física
    { value: 'name', label: 'Nombre (persona física)', required: false },
    { value: 'surname', label: 'Apellidos (persona física)', required: false },
    { value: 'dni', label: 'DNI (persona física)', required: false },
    
    // Campos de Empresa/Persona Jurídica
    { value: 'client_type', label: 'Tipo de Cliente (individual/business)', required: false },
    { value: 'business_name', label: 'Razón Social (empresa)', required: false },
    { value: 'cif_nif', label: 'CIF/NIF (empresa)', required: false },
    { value: 'trade_name', label: 'Nombre Comercial (empresa)', required: false },
    { value: 'legal_representative_name', label: 'Representante Legal - Nombre', required: false },
    { value: 'legal_representative_dni', label: 'Representante Legal - DNI', required: false },
    { value: 'mercantile_registry_data', label: 'Datos Registro Mercantil', required: false },
    
    // Dirección
    { value: 'address', label: 'Dirección Completa', required: false },
    { value: 'addressTipoVia', label: 'Tipo Vía', required: false },
    { value: 'addressNombre', label: 'Nombre Vía', required: false },
    { value: 'addressNumero', label: 'Número', required: false },
    
    // Otros
    { value: 'notes', label: 'Notas', required: false },
    { value: 'metadata', label: 'Metadata (otros datos)', required: false }
  ];
  // Ahora no hay campos estrictamente obligatorios para permitir importación mínima
  customerRequiredFields = [];
  customerAliasMap: Record<string, string[]> = {
    // Campos comunes
    email: ['email', 'correo', 'e-mail', 'mail', 'bill_to:email', 'bill to email', 'billto:email', 'ship_to:email', 'ship to email', 'shipto:email'],
    phone: ['phone', 'telefono', 'teléfono', 'tel', 'mobile', 'movil', 'móvil', 'bill_to:phone', 'bill to phone', 'billto:phone', 'ship_to:phone', 'ship to phone', 'shipto:phone'],
    
    // Persona física
    name: ['name', 'nombre', 'first_name', 'firstname', 'first name', 'bill_to:first_name', 'bill to first name', 'billto:first_name', 'ship_to:first_name', 'ship to first name', 'shipto:first_name'],
    surname: ['surname', 'last_name', 'lastname', 'last name', 'apellidos', 'bill_to:last_name', 'bill to last name', 'billto:last_name', 'ship_to:last_name', 'ship to last name', 'shipto:last_name'],
    dni: ['dni', 'nif', 'documento', 'id', 'legal', 'bill_to:legal', 'bill to legal', 'billto:legal', 'ship_to:legal', 'ship to legal', 'shipto:legal'],
    
    // Empresa
    client_type: ['client_type', 'tipo_cliente', 'tipo cliente', 'type', 'customer_type', 'customer type'],
    business_name: ['business_name', 'razon_social', 'razón social', 'razon social', 'company_name', 'company name', 'empresa', 'bill_to:company', 'bill to company', 'billto:company'],
    cif_nif: ['cif_nif', 'cif', 'nif empresa', 'tax_id', 'taxid', 'vat', 'fiscal_id', 'id_fiscal'],
    trade_name: ['trade_name', 'nombre_comercial', 'nombre comercial', 'trading_name', 'trading name'],
    legal_representative_name: ['legal_representative_name', 'representante_legal', 'representante legal', 'representative', 'rep_name'],
    legal_representative_dni: ['legal_representative_dni', 'representante_dni', 'dni representante', 'dni_rep', 'rep_dni'],
    mercantile_registry_data: ['mercantile_registry_data', 'registro_mercantil', 'registro mercantil', 'registry', 'mercantile_data'],
    
    // Dirección
    address: ['address', 'direccion', 'dirección', 'domicilio', 'bill_to:address', 'bill to address', 'billto:address', 'ship_to:address', 'ship to address', 'shipto:address'],
    addressTipoVia: ['addressTipoVia', 'tipo_via', 'tipo vía', 'tipo via', 'street_type', 'via'],
    addressNombre: ['addressNombre', 'nombre_via', 'nombre vía', 'nombre via', 'street_name', 'calle'],
    addressNumero: ['addressNumero', 'numero', 'número', 'number', 'num'],
    
    // Otros
    notes: ['notes', 'notas', 'observaciones', 'comments', 'comentarios'],
    metadata: ['metadata', 'metadatos', 'otros', 'additional', 'extra']
  };

  // Form data
  formData = {
    name: '',
    apellidos: '',
    email: '',
    phone: '',
    dni: '',
    client_type: 'individual',
    business_name: '',
    cif_nif: '',
    trade_name: '',
    legal_representative_name: '',
    legal_representative_dni: '',
    mercantile_registry_data: '',
    // structured address fields
    addressTipoVia: '',
    addressNombre: '',
    addressNumero: '',
    addressLocalidadId: '',
    // Honeypot field (hidden from users, bots will fill it)
    honeypot: ''
  };

  // Honeypot tracking
  honeypotFieldName: string = '';
  formLoadTime: number = 0;

  /**
   * REMOVED: Normalization now happens server-side in Edge Function for security
   * Client-side normalization removed to prevent bypassing server validation
   */

  // Localities cache for selector
  localities: Locality[] = [];

  // Common via types (can be extended)
  addressVias: string[] = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Barrio', 'Ronda'];
  // Filtered suggestions
  filteredLocalities: Locality[] = [];
  filteredVias: string[] = [...this.addressVias];
  // visible typed locality name (search input)
  addressLocalityName: string = '';
  // dropdown visibility flags
  viaDropdownOpen: boolean = false;
  localityDropdownOpen: boolean = false;

  // Create locality modal state
  showCreateLocalityModal: boolean = false;
  newLocalityName: string = '';
  newLocalityCP: string = '';
  newLocalityProvince: string = '';
  // País por defecto: España (no editable por ahora)
  newLocalityCountry: string = 'España';
  @ViewChild('newLocalityNameInput') newLocalityNameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('newLocalityCPInput') newLocalityCPInput!: ElementRef<HTMLInputElement>;
  // Suggestions and duplicate detection
  filteredNameSuggestions: string[] = [];
  nameMatchesList: Locality[] = [];
  cpExists: boolean = false;
  existingLocalityByCP: Locality | null = null;

  onFileInputChange(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  if (!input?.files || input.files.length === 0) {
    this.toastService.error('Por favor selecciona un archivo CSV válido.', 'Error');
    return;
  }
  const file = input.files[0];

  this.customersService.importFromCSV(file).subscribe({
    next: (importedCustomers) => {
      this.toastService.success(`${importedCustomers.length} clientes importados correctamente.`, 'Éxito');
      // Aquí puedes poner lógica extra para actualizar la UI si es necesario
      // Por ejemplo, recargar la lista de clientes si no se actualiza automáticamente
    },
    error: (error) => {
      this.toastService.error(`Error importando clientes: ${error.message || error}`, 'Error');
    }
  });
}

// Método manejador de selección de archivo CSV
onCsvFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  if (!input?.files || input.files.length === 0) {
    this.toastService.error('Por favor selecciona un archivo CSV válido.', 'Error');
    return;
  }

  const file = input.files[0];
  this.pendingCsvFile = file;

  this.customersService.parseCSVForMapping(file).subscribe({
    next: ({ headers, data }) => {
        // Guardamos cabeceras
        this.csvHeaders.set(headers);
        // Guardamos dataset completo para importación posterior
        this.fullCsvData.set(data);
        // Para preview limitamos (cabecera + primeras 9 filas de datos => total 10)
        const preview = data.slice(0, Math.min(10, data.length));
        this.csvData.set(preview);
        this.showCsvMapper.set(true); // muestra el modal
    },
    error: (err) => {
      this.toastService.error('Error leyendo CSV: ' + (err.message || err), 'Error');
    }
  });
}

// Método que se llama cuando el usuario confirma el mapeo de columnas en el modal
onMappingConfirmed(mappings: any[]): void {
  this.showCsvMapper.set(false);

  if (!this.pendingCsvFile) {
    this.toastService.error('No hay archivo CSV pendiente para importar.', 'Error');
    return;
  }

  // Llamar a función del servicio que importa con mapeos y en lotes
  this.customersService.importFromCSVWithMapping(this.pendingCsvFile, mappings).subscribe({
    next: (importedCustomers) => {
      this.toastService.success(`${importedCustomers.length} clientes importados correctamente.`, 'Éxito');
      this.customersService.customers$.subscribe(customers => {
      this.customers.set(customers);
    });
    },
    error: (error) => {
      this.toastService.error('Error importando CSV: ' + (error.message || error), 'Error');
    }
  });

  // Limpiar archivo pendiente
  this.pendingCsvFile = null;
}


  // Computed
  filteredCustomers = computed(() => {
    let filtered = this.customers();
    
    // ✅ Filtrar clientes anonimizados (ocultarlos de la lista)
    filtered = filtered.filter(customer => !this.isCustomerAnonymized(customer));
    
    // Apply search filter
    const search = this.searchTerm().toLowerCase().trim();
    if (search) {
      filtered = filtered.filter(customer =>
        customer.name.toLowerCase().includes(search) ||
        customer.apellidos.toLowerCase().includes(search) ||
        customer.email.toLowerCase().includes(search) ||
        customer.dni.toLowerCase().includes(search) ||
        (customer.phone && customer.phone.toLowerCase().includes(search))
      );
    }
    
    // Filter only incomplete if toggled
    if (this.onlyIncomplete) {
      filtered = filtered.filter((c: any) => c?.metadata?.needs_attention || c?.metadata?.inactive_on_import);
    }

    // Apply sorting
    const sortBy = this.sortBy();
    const sortOrder = this.sortOrder();
    
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === 'asc' ? result : -result;
    });
    
    return filtered;
  });

  // Completeness helpers for template
  isCustomerComplete(c: Customer): boolean {
    return this.completenessSvc.computeCompleteness(c).complete;
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
    if (!reasons.length) return 'Marcado para revisión';
    const map: Record<string, string> = {
      email_missing_or_invalid: 'Email faltante o inválido',
      name_missing: 'Nombre faltante',
      surname_missing: 'Apellidos faltantes',
    };
    return 'Revisar: ' + reasons.map(r => map[r] || r).join(', ');
  }

  ngOnInit() {
    // Initialize honeypot protection
    this.honeypotFieldName = this.honeypotService.getHoneypotFieldName();
    this.formLoadTime = this.honeypotService.getFormLoadTime();
    
    this.loadData();
    this.loadGdprData();
    // Initialize portal access cache
    this.refreshPortalAccess();
  }

  ngOnDestroy() {
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
    this.inviteMessage = '';
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
        if (cid && em) keys.add(`${cid}:${em}`);
      }
      this.portalAccessKeys.set(keys);
    } catch {}
  }

  // Helper used by template to avoid async pipes per item
  hasPortalAccess(customer: Customer, email?: string | null): boolean {
    if (!customer?.id || !email) return false;
    return this.portalAccessKeys().has(`${customer.id}:${email.toLowerCase()}`);
  }

  private isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test((email || '').trim());
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
      const key = `${customer.id}:${(customer.email || '').toLowerCase()}`;
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
    this.customersService.loading$.subscribe(loading => {
      this.isLoading.set(loading);
    });

    // Load localities for address selector
    this.localitiesService.getLocalities().subscribe({
      next: (locs: Locality[]) => {
        this.localities = locs || [];
        this.filteredLocalities = [...this.localities];
        this.filteredVias = [...this.addressVias];

        // If editing a customer, try to set the addressLocalityName for the existing direccion
        const sel = this.selectedCustomer();
        if (sel?.direccion?.localidad_id) {
          const match = this.localities.find(l => l._id === sel.direccion!.localidad_id);
          if (match) this.addressLocalityName = match.nombre;
        }
      },
      error: (err: any) => {
        console.error('Error loading localities:', err);
      }
    });
  }

  // Via suggestions handler
  onAddressViaInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredVias = [...this.addressVias];
      this.viaDropdownOpen = false; // don't show when empty
      return;
    }
    this.filteredVias = this.addressVias.filter(v => v.toLowerCase().includes(s));
    this.viaDropdownOpen = this.filteredVias.length > 0;
  }

  // Locality search handler (by name or postal code CP)
  onLocalityInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredLocalities = [...this.localities];
      this.formData.addressLocalidadId = '';
      this.localityDropdownOpen = false; // don't show when empty
      return;
    }
    this.filteredLocalities = this.localities.filter(loc => {
      const nameMatch = loc.nombre && loc.nombre.toLowerCase().includes(s);
      const cpMatch = loc.CP && loc.CP.toString().toLowerCase().includes(s);
      return nameMatch || cpMatch;
    });
    this.localityDropdownOpen = this.filteredLocalities.length > 0;
  }

  selectLocality(loc: Locality) {
    this.formData.addressLocalidadId = loc._id;
    this.addressLocalityName = loc.nombre;
    this.filteredLocalities = [];
    this.localityDropdownOpen = false;
  }

  // Open the create-locality modal (can be used even when matches exist)
  openCreateLocality() {
    this.newLocalityName = this.addressLocalityName || '';
    this.newLocalityCP = '';
  this.showCreateLocalityModal = true;
    // focus behavior could be implemented with ViewChild if needed
    // default country to Spain and clear other fields
  // keep País as default (España) and do not allow modifications
  this.newLocalityCountry = 'España';
    this.newLocalityProvince = '';
    this.filteredNameSuggestions = [];
    this.nameMatchesList = [];
    this.cpExists = false;
    this.existingLocalityByCP = null;

    // focus the name input on next tick
    setTimeout(() => {
      try { this.newLocalityNameInput?.nativeElement?.focus(); } catch(e){}
    }, 50);
  }

  closeCreateLocality() {
    this.showCreateLocalityModal = false;
    this.newLocalityName = '';
    this.newLocalityCP = '';
    this.newLocalityProvince = '';
    // preserve default país value
    this.newLocalityCountry = 'España';
    this.filteredNameSuggestions = [];
    this.nameMatchesList = [];
    this.cpExists = false;
    this.existingLocalityByCP = null;
  }

  createLocalityFromInput() {
  console.log('[DEBUG] createLocalityFromInput called', { newLocalityName: this.newLocalityName, addressLocalityName: this.addressLocalityName, newLocalityCP: this.newLocalityCP });
  const name = (this.newLocalityName || this.addressLocalityName || '').trim();
  const cpRaw = (this.newLocalityCP || '').trim();
  // normalize CP (digits only)
  const cp = cpRaw.replace(/\D+/g, '').trim();
    // Validate required fields
    if (!name || !this.newLocalityProvince.trim() || !this.newLocalityCountry.trim() || !cp) {
      this.toastService.error('Campos requeridos', 'Nombre, Provincia, País y Código Postal son obligatorios.');
      return;
    }

    // Normalize CP for comparison
    const normalizedCP = cp.trim();

    // If postal code already exists, do not allow creating a new locality with same CP
    // Server-side check for existing postal code
    console.log('[DEBUG] checking existing locality for CP', cp);
    this.localitiesService.findByPostalCode(cp).subscribe({
      next: (existing) => {
        console.log('[DEBUG] findByPostalCode result', existing);
        if (existing) {
          this.existingLocalityByCP = existing;
          this.cpExists = true;
          this.toastService.info('Código postal existente', `Ya existe una localidad con CP ${cp}: ${existing.nombre}`);
          return;
        }

        const payload: any = {
          name: name,
          province: this.newLocalityProvince.trim(),
          country: this.newLocalityCountry.trim() || 'España',
          postal_code: cp
        } as any;
        console.log('[DEBUG] creating locality with payload', payload);

        this.localitiesService.createLocality(payload as any).subscribe({
          next: (created: any) => {
            console.log('[DEBUG] createLocality succeeded', created);
            // Refresh localities cache
            this.reloadLocalities();
            // Select the newly created locality (support various id keys)
            const newId = created.id || created._id || created.ID || null;
            if (newId) {
              this.formData.addressLocalidadId = newId;
            }
            this.addressLocalityName = created.name || created.nombre || name;
            this.toastService.success('Localidad creada', `${this.addressLocalityName} creada correctamente`);
            this.closeCreateLocality();
          },
          error: (err: any) => {
            console.error('Error creating locality:', err);
            this.toastService.error('Error', 'No se pudo crear la localidad');
          }
        });
      },
      error: (err) => {
        console.error('Error checking postal code:', err);
        this.toastService.error('Error', 'Error al verificar código postal');
      }
    });
    // server-side path handles creation or returns existing
  }

  // Handle live suggestions for the 'Nombre' input
  onNewLocalityNameInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredNameSuggestions = [];
      this.nameMatchesList = [];
      return;
    }
    // unique names
    const names = Array.from(new Set(this.localities.map(l => l.nombre || '').filter(n => n)));
    this.filteredNameSuggestions = names.filter(n => n.toLowerCase().includes(s));
  }

  // When user chooses a suggested name, show existing localities with that name so they can pick by CP
  selectNameSuggestion(name: string) {
    this.newLocalityName = name;
    this.filteredNameSuggestions = [];
    this.nameMatchesList = this.localities.filter(l => (l.nombre || '').toLowerCase() === name.toLowerCase());
  }

  // If the user picks an existing locality from the name matches, select it and close modal
  selectExistingFromName(loc: Locality) {
    this.formData.addressLocalidadId = loc._id;
    this.addressLocalityName = loc.nombre;
    this.toastService.info('Localidad seleccionada', `Seleccionada: ${loc.nombre} (CP ${loc.CP})`);
    this.closeCreateLocality();
  }

  // Watch CP changes inside modal to detect duplicates live
  onNewLocalityCPInput(event: Event) {
    const cpRaw = (event.target as HTMLInputElement).value || '';
    const normalized = cpRaw.replace(/\D+/g, '').trim();
    if (!normalized) {
      this.cpExists = false;
      this.existingLocalityByCP = null;
      return;
    }

    // Use server-side check
    this.localitiesService.findByPostalCode(normalized).subscribe({
      next: (existing) => {
        if (existing) {
          this.cpExists = true;
          this.existingLocalityByCP = existing;
          // focus CP input for quick action
          setTimeout(() => { try { this.newLocalityCPInput?.nativeElement?.focus(); } catch(e){} }, 10);
        } else {
          this.cpExists = false;
          this.existingLocalityByCP = null;
        }
      },
      error: (err) => {
        console.error('Error finding CP on server:', err);
        this.cpExists = false;
        this.existingLocalityByCP = null;
      }
    });
  }

  // Reload localities from the service and refresh filtered lists
  reloadLocalities() {
    this.localitiesService.getLocalities().subscribe({
      next: (locals: Locality[]) => {
        this.localities = locals || [];
        this.filteredLocalities = [...this.localities];
      },
      error: (err: any) => {
        console.error('Error reloading localities:', err);
      }
    });
  }

  private loadGdprData() {
    // Load GDPR compliance stats only for administrators
    if (this.devRoleService.canSeeDevTools()) {
      this.gdprService.getComplianceDashboard().subscribe({
        next: (stats: any) => {
          this.complianceStats.set(stats);
        },
        error: (error: any) => {
          console.error('Error loading GDPR stats:', error);
        }
      });
    }
  }

  // Event handlers
  onSearchChange(term: string) {
    this.searchTerm.set(term);
  }

  onFiltersChange() {
    const filters: CustomerFilters = {
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder()
    };
    this.customersService.getCustomers(filters).subscribe();
  }

  // Customer actions
  selectCustomer(customer: Customer) {
    this.selectedCustomer.set(customer);
    // Could open a detail view or perform other actions
  }

  openForm() {
    this.resetForm();
    this.selectedCustomer.set(null);
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

  editCustomer(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.populateForm(customer);
    this.showForm.set(true);
    // ensure dropdowns are closed on open
    this.viaDropdownOpen = false;
    this.localityDropdownOpen = false;
    
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
    
    // Prefill dirección: try customer's linked direccion_id first; if absent, fallback to latest for current auth user
    try {
      const direccionId = (customer as any).direccion_id;
      const source$ = direccionId
        ? this.addressesService.getAddressById(direccionId)
        : this.addressesService.getLatestAddressForCurrentUser();
      source$.subscribe({
        next: (addr) => {
          if (addr) {
            console.debug('[Customers] Fetched latest address for customer', customer.id, addr);
            // addr.nombre contiene la cadena completa de la dirección DB.direccion
            // Intento simple de separar tipo_via y nombre si empieza con una palabra conocida
            const viaTypes = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Barrio', 'Ronda'];
            let tipo_via = '';
            let nombre = addr.nombre || '';
            for (const v of viaTypes) {
              if (nombre?.startsWith(v + ' ')) {
                tipo_via = v;
                nombre = nombre.substring(v.length).trim();
                break;
              }
            }
            this.formData.addressTipoVia = tipo_via;
            this.formData.addressNombre = nombre;
            this.formData.addressNumero = addr.numero || '';
            this.formData.addressLocalidadId = addr.localidad_id || '';

            // Prefill visible locality name if we have it cached; otherwise fetch once
            if (this.formData.addressLocalidadId) {
              const match = this.localities.find(l => l._id === this.formData.addressLocalidadId);
              if (match) {
                this.addressLocalityName = match.nombre;
              } else {
                this.localitiesService.getLocalities().subscribe({
                  next: (locs) => {
                    this.localities = locs || [];
                    const m2 = this.localities.find(l => l._id === this.formData.addressLocalidadId);
                    if (m2) this.addressLocalityName = m2.nombre;
                  },
                  error: () => {}
                });
              }
            }
            // keep dropdowns closed after prefill
            this.viaDropdownOpen = false;
            this.localityDropdownOpen = false;
          }
        },
        error: (e) => console.warn('No se pudo cargar dirección:', e)
      });
    } catch {}
    
    // Bloquear scroll de la página principal de forma más agresiva
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
  }

  viewCustomer(customer: Customer) {
    // Implementar vista de detalles
    this.selectCustomer(customer);
  }

  duplicateCustomer(customer: Customer) {
    this.resetForm();
    this.populateForm({
      ...customer,
      name: customer.name + ' (Copia)',
      email: '',
      dni: ''
    });
    this.selectedCustomer.set(null);
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
    this.selectedCustomer.set(null);
    this.resetForm();
    
    // Restaurar scroll de la página principal
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.documentElement.style.overflow = '';
    
    // Retroceder en el historial solo si hay entrada de modal
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
  }

  saveCustomer() {
  if (this.selectedCustomer()) {
      // Actualizar cliente existente
      this.updateExistingCustomer();
    } else {
      // Crear nuevo cliente
      this.createNewCustomer();
    }
  }

  private createNewCustomer() {
    // SECURITY: Bot detection - check honeypot field
    const submissionTime = this.honeypotService.getSubmissionTime(this.formLoadTime);
    if (this.honeypotService.isProbablyBot(this.formData.honeypot, submissionTime)) {
      // Silent rejection - don't tell bots they were detected
      this.closeForm();
      this.toastService.error('Error', 'No se pudo procesar la solicitud. Inténtelo de nuevo.');
      return;
    }
    
    // SECURITY: All normalization now happens server-side in Edge Function
    // Send raw values - server will sanitize, validate and normalize
    
    const createCustomerWithDireccion = (direccion_id?: string) => {
      // Validaciones condicionales
      if (this.formData.client_type === 'business') {
        if (!this.formData.business_name?.trim() || !this.formData.cif_nif?.trim()) {
          this.toastService.error('Empresa requiere razón social y CIF/NIF', 'Campos obligatorios');
          return;
        }
      } else {
        if (!this.formData.name?.trim()) {
          this.toastService.error('Nombre requerido', 'Campos obligatorios');
          return;
        }
      }

      const customerData: any = {
        name: this.formData.name,
        apellidos: this.formData.apellidos,
        email: this.formData.email,
        phone: this.formData.phone,
        dni: this.formData.dni || (this.formData.client_type === 'individual' ? '99999999X' : ''),
        client_type: this.formData.client_type,
        business_name: this.formData.business_name || undefined,
        cif_nif: this.formData.cif_nif || (this.formData.client_type === 'business' ? 'B99999999' : undefined),
        trade_name: this.formData.trade_name || undefined,
        legal_representative_name: this.formData.legal_representative_name || undefined,
        legal_representative_dni: this.formData.legal_representative_dni || undefined,
        mercantile_registry_data: this.safeParseRegistryData(this.formData.mercantile_registry_data),
        direccion_id: direccion_id
      } as CreateCustomerDev & { [k:string]: any };

      this.customersService.createCustomer(customerData).subscribe({
        next: (customer) => {
          this.closeForm();
          this.toastService.success('Éxito', 'Cliente creado correctamente');
          
          // Reset form load time for next submission
          this.formLoadTime = this.honeypotService.getFormLoadTime();
        },
        error: (error) => {
          console.error('Error al crear cliente:', error);
          const errorMsg = error?.error || error?.message || 'No se pudo crear el cliente';
          this.toastService.error('Error', errorMsg);
        }
      });
    };

    // If any address field is provided, create Address first (Edge Function handles normalization)
    const hasAddressData = (this.formData.addressNombre && this.formData.addressNombre.trim()) ||
      (this.formData.addressNumero && this.formData.addressNumero.trim());

    if (hasAddressData) {
      // Send raw values - Edge Function will normalize
      const newAddress: any = {
        _id: '',
        created_at: new Date(),
        tipo_via: this.formData.addressTipoVia || '',
        nombre: this.formData.addressNombre || '',
        numero: this.formData.addressNumero || '',
        localidad_id: this.formData.addressLocalidadId || ''
      };

      this.addressesService.createAddress(newAddress).subscribe({
        next: (addr: any) => {
          createCustomerWithDireccion(addr._id || '');
        },
        error: (err: any) => {
          console.error('Error creando dirección:', err);
          const errorMsg = err?.error || err?.message || 'No se pudo crear la dirección';
          this.toastService.error('Error', errorMsg);
        }
      });
    } else {
      createCustomerWithDireccion(undefined);
    }
  }

  private updateExistingCustomer() {
    const customerId = this.selectedCustomer()?.id;
    if (!customerId) return;

      // SECURITY: Send raw values - server handles normalization
      const applyUpdate = (direccion_id?: string) => {
      const updates: any = {
        name: this.formData.name,
        apellidos: this.formData.apellidos,
        email: this.formData.email,
        phone: this.formData.phone,
        dni: this.formData.dni || (this.formData.client_type === 'individual' ? '99999999X' : ''),
        client_type: this.formData.client_type,
        business_name: this.formData.business_name || undefined,
        cif_nif: this.formData.cif_nif || (this.formData.client_type === 'business' ? 'B99999999' : undefined),
        trade_name: this.formData.trade_name || undefined,
        legal_representative_name: this.formData.legal_representative_name || undefined,
        legal_representative_dni: this.formData.legal_representative_dni || undefined,
        mercantile_registry_data: this.safeParseRegistryData(this.formData.mercantile_registry_data)
      };

      // If customer had inactive_on_import or needs_attention, clear them on save
      const sel: any = this.selectedCustomer();
      if (sel && sel.metadata) {
        const md = { ...sel.metadata };
        if (md.inactive_on_import || md.needs_attention) {
          md.inactive_on_import = false;
          md.needs_attention = false;
          updates.metadata = md;
        }
      }

      if (direccion_id !== undefined) updates.direccion_id = direccion_id;

      this.customersService.updateCustomer(customerId, updates).subscribe({
        next: (customer) => {
          this.closeForm();
          this.toastService.success('Éxito', 'Cliente actualizado correctamente');
        },
        error: (error) => {
          console.error('Error al actualizar cliente:', error);
          this.toastService.error('Error', 'No se pudo actualizar el cliente');
        }
      });
    };

    // If the customer already has a direccion_id, update it; otherwise create a new address if provided
    const existingDireccionId = this.selectedCustomer()?.direccion_id || '';
    const hasAddressData = (this.formData.addressNombre && this.formData.addressNombre.trim()) ||
      (this.formData.addressNumero && this.formData.addressNumero.trim());

    if (hasAddressData) {
      if (existingDireccionId) {
        // update existing address
        const updatePayload: any = {
          nombre: this.formData.addressNombre || ''
        };
        if (this.formData.addressTipoVia) updatePayload.tipo_via = this.formData.addressTipoVia;
        if (this.formData.addressNumero) updatePayload.numero = this.formData.addressNumero;
        if (this.formData.addressLocalidadId) updatePayload.localidad_id = this.formData.addressLocalidadId;

        this.addressesService.updateAddress(existingDireccionId, updatePayload).subscribe({
          next: () => applyUpdate(existingDireccionId),
          error: (err) => {
            console.error('Error actualizando dirección:', err);
            this.toastService.error('Error', 'No se pudo actualizar la dirección');
          }
        });
      } else {
        const newAddress: any = {
          _id: '',
          created_at: new Date(),
          tipo_via: this.formData.addressTipoVia || '',
          nombre: this.formData.addressNombre || '',
          numero: this.formData.addressNumero || '',
          localidad_id: this.formData.addressLocalidadId || ''
        };
        this.addressesService.createAddress(newAddress).subscribe({
          next: (addr: any) => applyUpdate(addr._id || ''),
          error: (err: any) => {
            console.error('Error creando dirección:', err);
            this.toastService.error('Error', 'No se pudo crear la dirección');
          }
        });
      }
    } else {
      // No address provided - leave direccion_id unchanged
      applyUpdate(undefined);
    }
  }

  private resetForm() {
    this.formData = {
      name: '',
      apellidos: '',
      email: '',
      phone: '',
      dni: '',
      client_type: 'individual',
      business_name: '',
      cif_nif: '',
      trade_name: '',
      legal_representative_name: '',
      legal_representative_dni: '',
      mercantile_registry_data: '',
      addressTipoVia: '',
      addressNombre: '',
      addressNumero: '',
      addressLocalidadId: '',
      honeypot: '' // Reset honeypot field
    };
    // Reset form timing for bot detection
    this.formLoadTime = this.honeypotService.getFormLoadTime();
  }

  private populateForm(customer: Partial<Customer>) {
    this.formData = {
      name: customer.name || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      phone: customer.phone || '',
      dni: customer.dni || '',
      client_type: (customer as any).client_type || 'individual',
      business_name: (customer as any).business_name || '',
      cif_nif: (customer as any).cif_nif || '',
      trade_name: (customer as any).trade_name || '',
      legal_representative_name: (customer as any).legal_representative_name || '',
      legal_representative_dni: (customer as any).legal_representative_dni || '',
      mercantile_registry_data: this.stringifyRegistryData((customer as any).mercantile_registry_data),
  // try to show an address string if the customer has a direccion relation
  // populate structured address fields from the direccion relation if available
  addressTipoVia: customer.direccion?.tipo_via || '',
  addressNombre: (customer.direccion && customer.direccion.nombre) ? customer.direccion.nombre : (customer.address || ''),
  addressNumero: customer.direccion?.numero || '',
  addressLocalidadId: customer.direccion?.localidad_id || '',
      honeypot: '' // Always empty when populating (not visible to user)
    };
  }

  // Helpers reused from service (duplicated here for form handling)
  private safeParseRegistryData(input: string): any {
    if (!input) return undefined;
    try { return JSON.parse(input); } catch { return { raw: input }; }
  }
  private stringifyRegistryData(data: any): string {
    if (!data) return '';
    try { return typeof data === 'string' ? data : JSON.stringify(data, null, 2); } catch { return ''; }
  }

  onCustomerSaved(customer: Customer) {
    // The service will automatically update the customers list
    this.closeForm();
  }

  async deleteCustomer(customer: Customer) {
    const message = `¿Eliminar definitivamente a ${customer.name} ${customer.apellidos}?\n\n` +
      `Si tiene facturas se desactivará conservando el historial. Si es sólo un lead (sin facturas) se eliminará totalmente.`;
    if (!confirm(message)) return;

    this.customersService.deleteCustomer(customer.id).subscribe({
      next: () => { /* handled in service */ },
      error: (error) => {
        console.error('Error en eliminación/desactivación:', error);
        alert('No se pudo eliminar/desactivar el cliente: ' + (error?.message || error));
      }
    });
  }

  // Export/Import
  exportCustomers() {
    const filters: CustomerFilters = {
      search: this.searchTerm(),
      sortBy: this.sortBy(),
      sortOrder: this.sortOrder()
    };

    this.customersService.exportToCSV(filters).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clientes-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toastService.success('¡Éxito!', 'Clientes exportados correctamente');
      },
      error: (error) => {
        console.error('Error exporting customers:', error);
      }
    });
  }

  importCustomers(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.toastService.error('Error', 'Por favor selecciona un archivo CSV válido');
      return;
    }

  console.log('CSV import selected, starting parse for mapping...');
  this.toastService.info('Procesando...', 'Analizando estructura del CSV');
    this.pendingCsvFile = file;

    // Parse CSV to show mapping interface
    this.customersService.parseCSVForMapping(file).subscribe({
      next: ({ headers, data }) => {
        console.log('CSV parsed for mapping:', { headers, previewRows: data.slice(0, 3) });
        this.csvHeaders.set(headers);
        this.csvData.set(data);
        this.showCsvMapper.set(true);
        // Limpiar el input
        event.target.value = '';
      },
      error: (error) => {
        console.error('Error parsing CSV for mapping:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error al analizar el archivo CSV';
        this.toastService.error('Error al Procesar CSV', errorMessage);
        // Limpiar el input
        event.target.value = '';
      }
    });
  }

  onCsvMappingConfirmed(result: CsvMappingResult) {
    console.log('CSV mapping confirmed by user:', result);
    if (!this.pendingCsvFile) {
      this.toastService.error('Error', 'No hay archivo CSV pendiente');
      return;
    }

    this.showCsvMapper.set(false);
  // Toast persistente de progreso (se cerrará al terminar o error)
  // Crear un único toast persistente que iremos actualizando
  this.importToastId = this.toastService.info('Importación iniciada', 'Importando clientes con el mapeo configurado', 8000, true, 'customers-import');

    // Construir array de clientes a partir del mapeo
    const mappedCustomers = this.customersService.buildPayloadRowsFromMapping(
      this.csvHeaders(),
      // Usar el dataset COMPLETO (fullCsvData) y no sólo el preview.
      // fullCsvData incluye cabecera en posición 0 → slice(1) para omitirla.
      this.fullCsvData().slice(1),
      result.mappings as any
    );

    if (!mappedCustomers.length) {
      this.toastService.error('Error', 'No se encontraron filas válidas en el CSV');
      this.pendingCsvFile = null;
      return;
    }

  const total = mappedCustomers.length;
  console.log('[CSV-MAP] Mapped customers ready to import:', total);
  if (this.importToastId) {
    this.toastService.updateToast(this.importToastId, { title: 'Importación iniciada', message: `Se importarán ${total} filas` });
  }
  const batchSize = 5;
  let importedCount = 0;

    this.customersService.importCustomersInBatches(mappedCustomers, batchSize).subscribe({
      next: (p) => {
        const msg = `Importados ${p.importedCount}/${p.totalCount} (lote ${p.batchNumber}, tamaño ${p.batchSize})`;
        console.log('[Import progreso]', p);
  // Actualiza mostrando progreso (persistente)
  if (this.importToastId) {
    const progress = p.totalCount > 0 ? p.importedCount / p.totalCount : 0;
    this.toastService.updateToast(this.importToastId, { title: 'Progreso importación', message: msg, progress });
  }
        importedCount = p.importedCount;
      },
      complete: () => {
  if (this.importToastId) {
    this.toastService.updateToast(this.importToastId, { type: 'success', title: '¡Éxito!', message: `Importación completada (${importedCount}/${total} clientes)`, duration: 6000 });
    this.importToastId = null;
  } else {
    this.toastService.success('¡Éxito!', `Importación completada (${importedCount}/${total} clientes)`, 6000);
  }
  // refrescar lista para ver los nuevos clientes inmediatamente
  this.customersService.loadCustomers();
        this.pendingCsvFile = null;
        this.fullCsvData.set([]);
        // refrescar datos visibles
        this.customersService.getCustomers({ sortBy: this.sortBy(), sortOrder: this.sortOrder() }).subscribe();
      },
      error: (err) => {
        console.error('Error importando por lotes:', err);
  if (this.importToastId) {
    this.toastService.updateToast(this.importToastId, { type: 'error', title: 'Error de Importación', message: String(err?.message || err), duration: 8000 });
    this.importToastId = null;
  } else {
    this.toastService.error('Error de Importación', String(err?.message || err), 8000);
  }
        this.pendingCsvFile = null;
        this.fullCsvData.set([]);
      }
    });
  }

  onCsvMappingCancelled() {
    console.log('CSV mapping cancelled by user');
    this.showCsvMapper.set(false);
    this.pendingCsvFile = null;
    this.fullCsvData.set([]);
    this.toastService.info('Cancelado', 'Importación CSV cancelada');
  }

  async testImportEndpoints() {
    if (!this.devRoleService.canSeeDevTools()) {
      this.toastService.error('No autorizado', 'Herramientas de desarrollador no disponibles');
      return;
    }

    this.toastService.info('Probando endpoints', 'Llamando a proxy y al function directo...');
    try {
      const res = await this.customersService.testImportEndpoints();
      console.log('Test import endpoints result:', res);

      const messages: string[] = [];
      if (res.proxy) messages.push(`Proxy: ${res.proxy.status} ${res.proxy.text}`);
      if (res.direct) messages.push(`Direct: ${res.direct.status} ${res.direct.text}`);
      if (res.errors && res.errors.length) messages.push(`Errors: ${JSON.stringify(res.errors)}`);

      this.toastService.success('Test completado', messages.slice(0,2).join(' | '));
    } catch (err) {
      console.error('Error testing import endpoints:', err);
      this.toastService.error('Test fallido', String(err));
    }
  }

  showImportInfo(event: Event) {
    event.stopPropagation(); // Evitar que se abra el selector de archivos
    
    const infoMessage = `Formato: Nombre, Apellidos, Email, DNI, Teléfono - Máximo 500 clientes.`;
    
    this.toastService.info('CSV requerido', infoMessage, 6000);
  }

  clearFilters() {
    this.searchTerm.set('');
    this.onSearchChange('');
  }

  // Utility methods
  getCustomerInitials(customer: Customer): string {
    return `${customer.name.charAt(0)}${customer.apellidos.charAt(0)}`.toUpperCase();
  }

  // Nombre amigable para mostrar en la card evitando UUIDs u otros identificadores técnicos
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
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(base.trim())) {
      base = customer.client_type === 'business' ? 'Empresa importada' : 'Cliente importado';
    }

    // Evitar mostrar correos como nombre si accidentalmente se mapearon
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(base)) {
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

  toggleGdprPanel() {
    this.gdprPanelVisible.set(!this.gdprPanelVisible());
    if (this.gdprPanelVisible()) {
      this.loadComplianceStats();
    }
  }

  goToGdpr() {
    // Navigate to the dedicated GDPR manager route (same app) with a query param
    // so users can access the full GDPR interface if they prefer.
    try {
      this.router.navigate(['/clientes-gdpr'], { queryParams: { gdpr: '1' } });
    } catch (e) {
      console.error('Navigation to GDPR manager failed', e);
    }
  }

  // Handle GDPR access request for a customer
  requestDataAccess(customer: Customer) {
    if (!customer.email) {
      this.toastService.error('Error', 'El cliente debe tener un email para solicitar acceso a datos');
      return;
    }

    const accessRequest: GdprAccessRequest = {
      subject_email: customer.email,
      subject_name: `${customer.name} ${customer.apellidos}`,
      request_type: 'access',
      request_details: `Solicitud de acceso a datos personales del cliente desde CRM`,
      verification_method: 'email'
    };

    this.gdprService.createAccessRequest(accessRequest).subscribe({
      next: (response: any) => {
        this.toastService.success('RGPD', 'Solicitud de acceso a datos creada correctamente');
        this.loadGdprData(); // Refresh stats
      },
      error: (error: any) => {
        console.error('Error creating access request:', error);
        this.toastService.error('Error RGPD', 'No se pudo crear la solicitud de acceso');
      }
    });
  }

  // Export customer data for GDPR compliance
  exportCustomerData(customer: Customer) {
    if (!customer.email) {
      this.toastService.error('Error', 'El cliente debe tener un email para exportar datos');
      return;
    }

    this.gdprService.exportClientData(customer.email).subscribe({
      next: (data: any) => {
        // Create and download the export file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gdpr-export-${customer.email}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        this.toastService.success('RGPD', 'Datos exportados correctamente');
      },
      error: (error: any) => {
        console.error('Error exporting customer data:', error);
        this.toastService.error('Error RGPD', 'No se pudieron exportar los datos del cliente');
      }
    });
  }

  // Create a consent request and show a shareable link
  sendConsentRequest(customer: Customer) {
    if (!customer.email) {
      this.toastService.error('Error', 'El cliente debe tener un email para solicitar consentimiento');
      return;
    }
    this.gdprService.createConsentRequest(customer.id, customer.email, ['data_processing','marketing','analytics'], 'Gestión de consentimiento')
      .subscribe({
        next: ({ path }) => {
          const url = `${window.location.origin}${path}`;
          navigator.clipboard?.writeText(url);
          this.toastService.success('Enlace de consentimiento copiado al portapapeles', 'Consentimiento');
        },
        error: (err) => {
          console.error('Error creating consent request', err);
          this.toastService.error('No se pudo crear la solicitud de consentimiento', 'Error');
        }
      });
  }

  // Anonymize customer data (GDPR erasure)
  anonymizeCustomer(customer: Customer) {
    // ✅ Verificar si ya está anonimizado
    if (this.isCustomerAnonymized(customer)) {
      this.toastService.warning('RGPD', 'Este cliente ya ha sido anonimizado');
      return;
    }

    const confirmMessage = `¿Estás seguro de que quieres anonimizar los datos de ${customer.name} ${customer.apellidos}?\n\nEsta acción es irreversible y cumple con el derecho al olvido del RGPD.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    // ✅ Cerrar la tarjeta GDPR inmediatamente
    this.flippedCardId.set(null);

    this.gdprService.anonymizeClientData(customer.id, 'gdpr_erasure_request').subscribe({
      next: (result: any) => {
        if (result.success) {
          // ✅ Actualizar el cliente localmente primero (para feedback inmediato)
          const currentCustomers = this.customers();
          const updatedCustomers = currentCustomers.map(c => {
            if (c.id === customer.id) {
              return {
                ...c,
                name: 'ANONYMIZED_' + Math.random().toString(36).substr(2, 8),
                apellidos: 'ANONYMIZED_' + Math.random().toString(36).substr(2, 8),
                email: 'anonymized.' + Math.random().toString(36).substr(2, 8) + '@anonymized.local',
                phone: '',
                dni: '',
                anonymized_at: new Date().toISOString()
              } as Customer;
            }
            return c;
          });
          this.customers.set(updatedCustomers);
          
          // ✅ Forzar detección de cambios de Angular
          this.cdr.detectChanges();
          
          // ✅ Recargar datos reales de Supabase después de un momento
          setTimeout(() => {
            this.loadData();
            this.loadGdprData();
            this.toastService.success('RGPD', 'Cliente anonimizado y ocultado de la lista');
          }, 500);
        } else {
          this.toastService.error('Error RGPD', result.error || 'No se pudieron anonimizar los datos');
        }
      },
      error: (error: any) => {
        console.error('Error anonymizing customer:', error);
        this.toastService.error('Error RGPD', 'No se pudieron anonimizar los datos del cliente');
      }
    });
  }

  // Open GDPR modal for comprehensive management
  openGdprModal(customer: Customer): void {
    this.gdprModalClient.set(customer);
    this.showGdprModal.set(true);
    // Close the flipped card
    this.flippedCardId.set(null);
  }

  // Close GDPR modal
  closeGdprModal(): void {
    this.showGdprModal.set(false);
    this.gdprModalClient.set(null);
    // Refresh data after modal closes
    this.loadData();
    this.loadGdprData();
  }

  // Flip card to show GDPR menu
  flipCardToGdpr(event: Event, customerId: string) {
    event.stopPropagation();
    this.flippedCardId.set(customerId);
  }
  
  // Close GDPR card and flip back to customer info
  closeGdprCard(event: Event) {
    event.stopPropagation();
    this.flippedCardId.set(null);
  }

  // Check if customer is already anonymized
  isCustomerAnonymized(customer: Customer): boolean {
    return customer.anonymized_at != null || 
           customer.name?.startsWith('ANONYMIZED_') || 
           customer.email?.includes('@anonymized.local');
  }

  // Show GDPR compliance status for a customer
  getGdprComplianceStatus(customer: Customer): 'compliant' | 'partial' | 'nonCompliant' {
    // This would typically check various compliance factors
    if (customer.marketing_consent && customer.data_processing_consent) {
      return 'compliant';
    } else if (customer.data_processing_consent) {
      return 'partial';
    } else {
      return 'nonCompliant';
    }
  }

  // Unified RGPD badge configuration - follows style guide semantic palette
  rgpdStatusConfig = {
    compliant: {
      label: 'Conforme RGPD',
      classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      icon: 'fa-shield-check'
    },
    partial: {
      label: 'Parcial',
      classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      icon: 'fa-shield-alt'
    },
    nonCompliant: {
      label: 'No conforme',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      icon: 'fa-shield-exclamation'
    }
  };

  getGdprBadgeConfig(customer: Customer) {
    const status = this.getGdprComplianceStatus(customer);
    return this.rgpdStatusConfig[status];
  }

  // Avatar gradient generator - consistent hash-based color selection
  getAvatarGradient(customer: Customer): string {
    const name = `${customer.name}${customer.apellidos}`;
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const gradients = [
      'from-blue-500 to-purple-600',
      'from-green-500 to-teal-600',
      'from-orange-500 to-red-600',
      'from-pink-500 to-purple-600'
    ];
    return gradients[hash % gradients.length];
  }

  getGdprStatusClass(customer: Customer): string {
    // Deprecated: kept for backwards compatibility, use getGdprBadgeConfig instead
    const status = this.getGdprComplianceStatus(customer);
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'partial': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-red-600 bg-red-100';
    }
  }

  getGdprStatusText(customer: Customer): string {
    // Deprecated: kept for backwards compatibility, use getGdprBadgeConfig instead
    const config = this.getGdprBadgeConfig(customer);
    return config.label;
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
    // Close locality suggestion lists when clicking outside the locality selector
    if (!target.closest('.locality-selector') && !target.closest('.create-locality-modal')) {
      // clear filtered results
      this.filteredLocalities = [];
      this.filteredNameSuggestions = [];
      this.nameMatchesList = [];
    }
  }

  // Load GDPR compliance statistics
  async loadComplianceStats() {
    try {
      // Simple mock stats for now - can be enhanced later
      this.complianceStats.set({
        accessRequestsCount: 5,
        activeConsentsCount: this.customers().filter(c => c.marketing_consent_date).length,
        pendingRequestsCount: 2,
        overdueRequestsCount: 0
      });
    } catch (error) {
      console.error('Error loading compliance stats:', error);
    }
  }

  // Export compliance report
  async exportComplianceReport() {
    try {
      const stats = this.complianceStats();
      const reportData = {
        generatedAt: new Date().toISOString(),
        totalCustomers: this.customers().length,
        customersWithConsent: this.customers().filter(c => c.marketing_consent_date).length,
        complianceStats: stats
      };

      const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gdpr-compliance-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);

      this.toastService.success('Éxito', 'Informe de cumplimiento GDPR exportado');
    } catch (error) {
      console.error('Error exporting compliance report:', error);
      this.toastService.error('Error', 'No se pudo exportar el informe');
    }
  }

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
}
