import { Component, EventEmitter, Input, OnInit, Output, inject, signal, ViewChild, ElementRef, ChangeDetectorRef, SimpleChanges, OnChanges, HostListener } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer, ClientContact } from '../../../models/customer';
import { LocalitiesService } from '../../../services/localities.service';
import { Locality } from '../../../models/locality';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { ToastService } from '../../../services/toast.service';
import { HoneypotService } from '../../../services/honeypot.service';
import { AppModalComponent } from '../../../shared/ui/app-modal/app-modal.component';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';
import { AuthService } from '../../../services/auth.service';
import { AddressesService } from '../../../services/addresses.service';
import { GlobalTagsService, GlobalTag } from '../../../core/services/global-tags.service';
import { Observable, Subscription, of } from 'rxjs';
import { finalize, switchMap, map } from 'rxjs/operators';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { AuditLoggerService } from '../../../services/audit-logger.service';

@Component({
  selector: 'app-form-new-customer',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent, TagManagerComponent],
  templateUrl: './form-new-customer.component.html',
  styleUrl: './form-new-customer.component.scss'
})
export class FormNewCustomerComponent implements OnInit, OnChanges {

  @Input() customer: Customer | null = null;
  @Input() companyId: string | undefined = undefined;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  // UI State
  // UI State
  activeTab: 'general' | 'address' | 'billing' | 'crm' | 'contactos' = 'general';

  // Services
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  private localitiesService = inject(LocalitiesService);
  private addressesService = inject(AddressesService);
  private honeypotService = inject(HoneypotService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private tagsService = inject(GlobalTagsService);
  private gdprService = inject(GdprComplianceService);
  private auditLogger = inject(AuditLoggerService);

  // States
  pendingTags: GlobalTag[] = [];

  // Loading state
  isLoading = signal(false);

  // Client type dropdown
  clientTypeDropdownOpen = signal(false);
  clientTypeOptions = [
    { value: 'individual', label: 'Persona física', icon: 'fas fa-user' },
    { value: 'business', label: 'Empresa', icon: 'fas fa-building' }
  ];

  // Options for CRM/Billing dropdowns
  statusOptions = [
    { value: 'customer', label: 'Cliente' },
    { value: 'lead', label: 'Lead' },
    { value: 'prospect', label: 'Prospecto' },
    { value: 'churned', label: 'Baja / Perdido' }
  ];

  languageOptions = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'Inglés' },
    { value: 'fr', label: 'Francés' },
    { value: 'de', label: 'Alemán' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Portugués' }
  ];

  paymentMethodOptions = [
    { value: 'transfer', label: 'Transferencia Bancaria' },
    { value: 'direct_debit', label: 'Domiciliación Bancaria' },
    { value: 'card', label: 'Tarjeta Crédito/Débito' },
    { value: 'cash', label: 'Efectivo' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'stripe', label: 'Stripe' },
    { value: 'bizum', label: 'Bizum' }
  ];

  // Dynamic Autocomplete Lists
  knownSources: string[] = [];
  knownIndustries: string[] = [];
  filteredSources: string[] = [];
  filteredIndustries: string[] = [];
  sourceDropdownOpen = false;
  industryDropdownOpen = false;

  // Billing Security
  showIban = signal(false);

  toggleIban() {
    const newState = !this.showIban();
    this.showIban.set(newState);
    if (newState && this.customer) {
      // Log unmasking by Admin
      this.auditLogger.logAction(
        'VIEW_IBAN_ADMIN',
        'customer',
        this.customer.id,
        { viewed_customer_email: this.customer.email }
      );
    }
  }

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

    // CRM Fields
    status: 'customer', // Default to Customer as requested
    source: '',
    website: '',
    industry: '',
    internal_notes: '',
    language: 'es',

    // Billing Fields
    payment_method: '',
    payment_terms: '',
    iban: '',
    bic: '',
    billing_email: '',
    tax_region: '',
    credit_limit: 0,
    default_discount: 0,

    // Pro CRM
    tier: 'C',
    contacts: [],

    // Honeypot field (hidden from users, bots will fill it)
    honeypot: ''
  };

  public contactList: ClientContact[] = []; // Local state for contacts
  public contactsToDelete: string[] = []; // Track IDs to delete on save

  // Animation State
  contentHeight: string | number = 'auto'; // Initial auto
  @ViewChild('tabContentContainer') tabContentContainer!: ElementRef<HTMLDivElement>;


  // Honeypot tracking
  honeypotFieldName: string = '';
  formLoadTime: number = 0;

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


  @HostListener('document:click', ['$event'])
  closeAllDropdowns(event: MouseEvent) {
    this.viaDropdownOpen = false;
    this.localityDropdownOpen = false;
    this.sourceDropdownOpen = false;
    this.industryDropdownOpen = false;
  }



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

  constructor() { }

  ngOnInit(): void {
    // Initialize honeypot protection
    this.honeypotFieldName = this.honeypotService.getHoneypotFieldName();
    this.formLoadTime = this.honeypotService.getFormLoadTime();

    this.loadLocalities();
    this.loadDistinctValues();

    // If editing a customer, populate form
    if (this.customer) {
      this.populateForm(this.customer);
    }
  }

  loadDistinctValues() {
    this.customersService.getDistinctColumnValues('source').subscribe(values => {
      this.knownSources = values;
      this.filteredSources = values;
    });
    this.customersService.getDistinctColumnValues('industry').subscribe(values => {
      this.knownIndustries = values;
      this.filteredIndustries = values;
    });
  }

  // Filter handlers for new autocompletes
  onSourceInput(event: Event) {
    const v = (event.target as HTMLInputElement).value || '';
    this.formData.source = v;
    if (!v) {
      this.filteredSources = [...this.knownSources];
    } else {
      this.filteredSources = this.knownSources.filter(s => s.toLowerCase().includes(v.toLowerCase()));
    }
    this.sourceDropdownOpen = true;
  }

  selectSource(s: string) {
    this.formData.source = s;
    this.sourceDropdownOpen = false;
  }

  onIndustryInput(event: Event) {
    const v = (event.target as HTMLInputElement).value || '';
    this.formData.industry = v;
    if (!v) {
      this.filteredIndustries = [...this.knownIndustries];
    } else {
      this.filteredIndustries = this.knownIndustries.filter(s => s.toLowerCase().includes(v.toLowerCase()));
    }
    this.industryDropdownOpen = true;
  }

  selectIndustry(s: string) {
    this.formData.industry = s;
    this.industryDropdownOpen = false;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['customer']) {
      if (changes['customer'].currentValue) {
        this.populateForm(changes['customer'].currentValue);
      } else {
        this.resetForm();
      }
    }
  }

  loadLocalities() {
    // Load localities for address selector
    this.localitiesService.getLocalities().subscribe({
      next: (locs: Locality[]) => {
        this.localities = locs || [];
        this.filteredLocalities = [...this.localities];
        this.filteredVias = [...this.addressVias];
        this.checkAddressLocality();
      },
      error: (err: any) => {
        console.error('Error loading localities:', err);
      }
    });
  }

  checkAddressLocality() {
    // If editing a customer, try to set the addressLocalityName for the existing direccion
    if (this.customer?.direccion?.localidad) {
      this.addressLocalityName = this.customer.direccion.localidad.nombre;
      this.formData.addressLocalidadId = this.customer.direccion.localidad._id;
    } else if (this.customer?.direccion?.localidad_id) {
      const match = this.localities.find(l => l._id === this.customer!.direccion!.localidad_id);
      if (match) this.addressLocalityName = match.nombre;
    }
  }

  populateForm(customer: Customer) {
    this.formData = {
      name: customer.name || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      phone: customer.phone || '',
      dni: customer.dni || '',
      client_type: (customer.client_type as string) || 'individual',
      business_name: customer.business_name || '',
      cif_nif: customer.cif_nif || '',
      trade_name: customer.trade_name || '',
      legal_representative_name: customer.legal_representative_name || '',
      legal_representative_dni: customer.legal_representative_dni || '',
      mercantile_registry_data: typeof customer.mercantile_registry_data === 'string' ? customer.mercantile_registry_data : JSON.stringify(customer.mercantile_registry_data || ''),
      addressTipoVia: customer.direccion?.tipo_via || '',
      addressNombre: customer.direccion?.nombre || '',
      addressNumero: customer.direccion?.numero || '',
      addressLocalidadId: customer.direccion?.localidad_id || '',

      // CRM
      status: customer.status || 'lead',
      source: customer.source || '',
      website: customer.website || '',
      industry: customer.industry || '',
      internal_notes: customer.internal_notes || '',
      language: customer.language || 'es',

      // Billing
      payment_method: customer.payment_method || '',
      payment_terms: customer.payment_terms || '',
      iban: customer.iban || '',
      bic: customer.bic || '',
      billing_email: customer.billing_email || '',
      tax_region: customer.tax_region || '',
      credit_limit: customer.credit_limit || 0,
      default_discount: customer.default_discount || 0,

      // Pro
      tier: customer.tier || 'C',
      contacts: [], // Contacts loaded separately via loadContacts

      honeypot: ''
    };

    // Load contacts asynchronously if editing
    if (this.customer && this.customer.id) {
      this.loadContacts(this.customer.id);
    } else {
      this.contactList = [];
      this.contactsToDelete = [];
    }

    this.checkAddressLocality();
  }

  async loadContacts(clientId: string) {
    try {
      const contacts = await this.customersService.getClientContacts(clientId);
      this.contactList = contacts;
    } catch (error) {
      console.error('Error loading contacts', error);
    }
  }

  addContact() {
    this.contactList.push({
      name: '',
      email: '',
      phone: '',
      role: '',
      is_primary: false,
      client_id: this.customer?.id
    } as any);
  }

  removeContact(index: number) {
    this.contactList.splice(index, 1);
  }



  resetForm() {
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
      // CRM
      status: 'lead',
      source: '',
      website: '',
      industry: '',
      internal_notes: '',
      language: 'es',
      // Billing
      payment_method: '',
      payment_terms: '',
      iban: '',
      bic: '',
      billing_email: '',
      tax_region: '',
      credit_limit: 0,
      default_discount: 0,
      tier: 'C',
      contacts: [],

      honeypot: ''
    };
    this.addressLocalityName = '';
    this.activeTab = 'general';
  }

  // Tab Switching
  setTab(tab: 'general' | 'address' | 'billing' | 'crm' | 'contactos') {
    if (this.activeTab === tab) return;

    // 1. Measure current height
    const currentH = this.tabContentContainer?.nativeElement?.offsetHeight;
    if (currentH) {
      this.contentHeight = currentH;
    }

    this.activeTab = tab;

    // 2. Wait for CD and measure new height
    this.cdr.detectChanges(); // Force update to render new tab content

    requestAnimationFrame(() => {
      const newH = this.tabContentContainer?.nativeElement?.scrollHeight;
      if (newH) {
        this.contentHeight = newH; // Trigger transition
      }

      // 3. Reset to auto after transition ends
      setTimeout(() => {
        this.contentHeight = 'auto'; // Allow dynamic growth
      }, 300);
    });
  }

  // Client Type Helpers
  toggleClientTypeDropdown() {
    this.clientTypeDropdownOpen.update(v => !v);
  }

  selectClientType(type: string) {
    this.formData.client_type = type;
    this.clientTypeDropdownOpen.set(false);
  }

  getClientTypeLabel(): string {
    const option = this.clientTypeOptions.find(o => o.value === this.formData.client_type);
    return option ? option.label : 'Seleccionar';
  }

  getClientTypeIcon(): string {
    const option = this.clientTypeOptions.find(o => o.value === this.formData.client_type);
    return option ? option.icon : 'fas fa-question';
  }

  onAddressViaInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredVias = [...this.addressVias];
      this.viaDropdownOpen = false;
      return;
    }
    this.filteredVias = this.addressVias.filter(v => v.toLowerCase().includes(s));
    this.viaDropdownOpen = this.filteredVias.length > 0;
  }

  onLocalityInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredLocalities = [...this.localities];
      this.formData.addressLocalidadId = '';
      this.localityDropdownOpen = false;
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

  selectVia(via: string) {
    this.formData.addressTipoVia = via;
    this.filteredVias = [];
    this.viaDropdownOpen = false;
  }

  openCreateLocality() {
    this.newLocalityName = this.addressLocalityName || '';
    this.newLocalityCP = '';
    this.showCreateLocalityModal = true;
    this.newLocalityCountry = 'España';
    this.newLocalityProvince = '';
    this.filteredNameSuggestions = [];
    this.nameMatchesList = [];
    this.cpExists = false;
    this.existingLocalityByCP = null;

    setTimeout(() => {
      try { this.newLocalityNameInput?.nativeElement?.focus(); } catch (e) { }
    }, 50);
  }

  isCreatingLocality = false;

  closeCreateLocality() {
    this.showCreateLocalityModal = false;
    this.newLocalityName = '';
    this.newLocalityCP = '';
    this.newLocalityProvince = '';
    this.newLocalityCountry = 'España';
    this.filteredNameSuggestions = [];
    this.nameMatchesList = [];
    this.cpExists = false;
    this.existingLocalityByCP = null;
  }

  createLocalityFromInput() {
    if (this.isCreatingLocality) return;

    const name = (this.newLocalityName || this.addressLocalityName || '').trim();
    const cpRaw = (this.newLocalityCP || '').trim();
    const cp = cpRaw.replace(/\D+/g, '').trim();

    if (!name || !this.newLocalityProvince.trim() || !this.newLocalityCountry.trim() || !cp) {
      this.toastService.error('Campos requeridos', 'Nombre, Provincia, País y Código Postal son obligatorios.');
      return;
    }

    console.log('[CreateLocality] Starting creation process...', { name, cp });
    this.isCreatingLocality = true;
    this.cdr.detectChanges(); // Ensure UI updates to locked state immediately

    this.localitiesService.findByPostalCode(cp).pipe(
      switchMap((existing) => {
        console.log('[CreateLocality] Checked existence result:', existing);
        if (existing) {
          return of({ type: 'EXISTING', data: existing });
        }

        const payload: any = {
          name: name,
          province: this.newLocalityProvince.trim(),
          country: this.newLocalityCountry.trim() || 'España',
          postal_code: cp
        };

        console.log('[CreateLocality] Sending create request...', payload);
        return this.localitiesService.createLocality(payload).pipe(
          map(created => {
            console.log('[CreateLocality] Creation successful:', created);
            return { type: 'CREATED', data: created };
          })
        );
      }),
      finalize(() => {
        console.log('[CreateLocality] Finalizing process (resetting flag).');
        this.isCreatingLocality = false;
        this.cdr.detectChanges(); // FORCE UI UPDATE
      })
    ).subscribe({
      next: (result: any) => {
        console.log('[CreateLocality] Next emitted:', result);
        if (result.type === 'EXISTING') {
          const existing = result.data;
          this.existingLocalityByCP = existing;
          this.cpExists = true;
          this.toastService.info('Código postal existente', `Ya existe una localidad con CP ${cp}: ${existing.nombre}`);
        } else if (result.type === 'CREATED') {
          const created = result.data;
          this.loadLocalities(); // Reload cache
          const newId = created.id || created._id || created.ID || null;
          if (newId) {
            this.formData.addressLocalidadId = newId;
          }
          this.addressLocalityName = created.name || created.nombre || name;
          this.toastService.success('Localidad creada', `${this.addressLocalityName} creada correctamente`);
          // Note: closeCreateLocality might NOT be clearing the modal if logic is wrong, but it should.
          this.closeCreateLocality();
        }
      },
      error: (err: any) => {
        console.error('[CreateLocality] Error in process:', err);
        // Check if it's actually an RLS or Supabase error
        const msg = err.message || 'No se pudo crear la localidad';
        this.toastService.error('Error', msg);
      }
    });
  }

  onNewLocalityNameInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredNameSuggestions = [];
      this.nameMatchesList = [];
      return;
    }
    const names = Array.from(new Set(this.localities.map(l => l.nombre || '').filter(n => n)));
    this.filteredNameSuggestions = names.filter(n => n.toLowerCase().includes(s));
  }

  selectNameSuggestion(name: string) {
    this.newLocalityName = name;
    this.filteredNameSuggestions = [];
    this.nameMatchesList = this.localities.filter(l => (l.nombre || '').toLowerCase() === name.toLowerCase());
  }

  selectExistingFromName(loc: Locality) {
    this.formData.addressLocalidadId = loc._id;
    this.addressLocalityName = loc.nombre;
    this.toastService.info('Localidad seleccionada', `Seleccionada: ${loc.nombre} (CP ${loc.CP})`);
    this.closeCreateLocality();
  }

  onNewLocalityCPInput(event: Event) {
    const cpRaw = (event.target as HTMLInputElement).value || '';
    const normalized = cpRaw.replace(/\D+/g, '').trim();
    if (!normalized) {
      this.cpExists = false;
      this.existingLocalityByCP = null;
      return;
    }

    this.localitiesService.findByPostalCode(normalized).subscribe({
      next: (existing) => {
        if (existing) {
          this.cpExists = true;
          this.existingLocalityByCP = existing;
          setTimeout(() => { try { this.newLocalityCPInput?.nativeElement?.focus(); } catch (e) { } }, 10);
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

  saveCustomer() {
    if (this.honeypotService.isProbablyBot(this.formData.honeypot, this.honeypotService.getSubmissionTime(this.formLoadTime))) {
      console.warn('Honeypot detection triggered');
      return;
    }

    // Validate form
    if (this.formData.client_type === 'business') {
      if (!this.formData.business_name || !this.formData.cif_nif || !this.formData.email) {
        this.toastService.error('Faltan datos obligatorios', 'Por favor completa Razón Social, CIF/NIF y Email.');
        return;
      }
    } else {
      if (!this.formData.name || !this.formData.email) {
        this.toastService.error('Faltan datos obligatorios', 'Por favor completa Nombre y Email.');
        return;
      }
    }

    this.isLoading.set(true);

    const customerData: any = {
      name: this.formData.name,
      apellidos: this.formData.apellidos,
      email: this.formData.email,
      phone: this.formData.phone,
      dni: this.formData.dni,
      client_type: this.formData.client_type as 'individual' | 'business',
      business_name: this.formData.business_name,
      cif_nif: this.formData.cif_nif,
      trade_name: this.formData.trade_name,
      legal_representative_name: this.formData.legal_representative_name,
      legal_representative_dni: this.formData.legal_representative_dni,
      mercantile_registry_data: this.formData.mercantile_registry_data,

      // CRM
      status: this.formData.status,
      source: this.formData.source,
      website: this.formData.website,
      industry: this.formData.industry,
      internal_notes: this.formData.internal_notes,
      language: this.formData.language,

      // Billing
      payment_method: this.formData.payment_method,
      payment_terms: this.formData.payment_terms,
      iban: this.formData.iban,
      bic: this.formData.bic,
      billing_email: this.formData.billing_email,
      tax_region: this.formData.tax_region,
      credit_limit: this.formData.credit_limit,
      default_discount: this.formData.default_discount,

      // Pro Fields & Contacts (handled by service)
      tier: this.formData.tier,
      contacts: this.contactList
    };

    this.handleAddressAndSave(customerData);
  }

  private handleAddressAndSave(customerData: any) {
    // Logic to check if we need to create an address
    const needsAddressParams = !!(this.formData.addressNombre || this.formData.addressTipoVia || this.formData.addressNumero || this.formData.addressLocalidadId);

    if (needsAddressParams) {
      const addressPayload = {
        tipo_via: this.formData.addressTipoVia,
        nombre: this.formData.addressNombre,
        numero: this.formData.addressNumero,
        localidad_id: this.formData.addressLocalidadId,
      } as any;
      this.addressesService.createAddress(addressPayload).subscribe({
        next: (addr: any) => {
          this.performCustomerSave(customerData, addr._id || addr.id); // Check id field
        },
        error: (err) => {
          console.error('Error creating address', err);
          this.toastService.error('Error al guardar la dirección', 'No se pudo crear la dirección asociada.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.performCustomerSave(customerData, null);
    }
  }

  private async performCustomerSave(customerData: any, addressId: string | null) {
    try {
      let savedUser: any = null;

      if (this.customer && this.customer.id) {
        // UPDATE
        const updateData: any = { ...customerData, id: this.customer.id };
        if (addressId) updateData.direccion_id = addressId;
        else if (this.customer.direccion_id) updateData.direccion_id = this.customer.direccion_id;

        // Convert Observable to Promise for easier sequencing
        await new Promise<void>((resolve, reject) => {
          this.customersService.updateCustomer(this.customer!.id!, updateData).subscribe({
            next: (res) => {
              savedUser = { ...res, id: this.customer!.id }; // Ensure ID preservation
              resolve();
            },
            error: (err) => reject(err)
          });
        });

        this.toastService.success('Cliente actualizado correctamente', 'Éxito');

      } else {
        // CREATE
        if (addressId) (customerData as any).direccion_id = addressId;
        if (this.companyId) (customerData as any).company_id = this.companyId;

        savedUser = await new Promise<any>((resolve, reject) => {
          this.customersService.createCustomer(customerData).subscribe({
            next: (res) => resolve(res),
            error: (err) => reject(err)
          });
        });

        // Handle Tags
        const newId = savedUser.id || savedUser.ID || savedUser.Id;
        if (this.pendingTags.length > 0 && newId) {
          try {
            // We don't await tags strictly to block success, but good to try catch
            await new Promise<void>((resolve) => {
              this.tagsService.assignMultipleTags('clients', newId, this.pendingTags.map(t => t.id)).subscribe({
                next: () => resolve(),
                error: (e) => { console.error(e); resolve(); }
              })
            });
          } catch (e) { console.error('Tag error', e); }
        }

        this.toastService.success('Cliente creado correctamente', 'Éxito');
      }

      // SAVE CONTACTS (Common for Create and Update)
      // Use the ID from savedUser or existing customer
      const finalId = savedUser?.id || this.customer?.id;
      if (finalId) {
        // Ensure contacts have the correct client_id
        await this.customersService.saveClientContacts(finalId, this.contactList);
      }

      this.saved.emit();
      this.close.emit();

    } catch (err: any) {
      console.error('Error saving customer:', err);
      this.toastService.error(`Error: ${err.message || 'No se pudo guardar'}`, 'Error');
    } finally {
      this.isLoading.set(false);
    }
  }

  closeForm() {
    this.close.emit();
  }
}