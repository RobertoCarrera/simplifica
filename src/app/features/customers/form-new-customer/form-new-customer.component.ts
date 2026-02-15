import { Component, EventEmitter, Input, OnInit, Output, inject, signal, ViewChild, ElementRef, ChangeDetectorRef, SimpleChanges, OnChanges, HostListener } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
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
import { Observable, Subscription, of, firstValueFrom } from 'rxjs';
import { finalize, switchMap, map } from 'rxjs/operators';
import { GdprComplianceService, GdprConsentRecord } from '../../../services/gdpr-compliance.service';
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
  // Wizard State
  currentStep = 1;
  totalSteps = 4;
  maxStepReached = 1;
  completedSteps: number[] = [];

  // Step Titles
  stepTitles = [
    { step: 1, title: 'Datos', icon: 'fas fa-user', description: 'Identificación y contacto' },
    { step: 2, title: 'Dirección', icon: 'fas fa-map-marker-alt', description: 'Ubicación física' },
    { step: 3, title: 'Facturación', icon: 'fas fa-file-invoice-dollar', description: 'Datos fiscales y pago' },
    { step: 4, title: 'CRM', icon: 'fas fa-shield-alt', description: 'Estado y Privacidad' }
  ];

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

  // Validation Signals
  dniError = signal<string>('');
  ibanError = signal<string>('');
  emailError = signal<string>('');

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

    // GDPR Granular Consents
    health_data_consent: false,
    privacy_policy_consent: false,
    marketing_consent: false,

    // Honeypot field (hidden from users, bots will fill it)
    honeypot: ''
  };

  public contactList: ClientContact[] = []; // Local state for contacts
  public contactsToDelete: string[] = []; // Track IDs to delete on save

  // Animation State
  contentHeight: string | number = 'auto'; // Initial auto
  @ViewChild('customerForm') customerForm!: NgForm;
  @ViewChild('tabContentContainer') tabContentContainer!: ElementRef;
  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;


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

      // GDPR Granular Consents
      health_data_consent: customer.health_data_consent || false,
      privacy_policy_consent: customer.privacy_policy_consent || false,
      marketing_consent: customer.marketing_consent || false,

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
      contacts: [], // Reset contacts

      // GDPR Granular Consents
      health_data_consent: false,
      privacy_policy_consent: false,
      marketing_consent: false,

      honeypot: ''
    };
    this.contactList = []; // Also reset local contact list
    this.contactsToDelete = [];
    this.addressLocalityName = '';

    // Reset wizard
    this.currentStep = 1;
    this.maxStepReached = 1;
    this.completedSteps = [];

    // Reset errors
    this.dniError.set('');
    this.ibanError.set('');
    this.emailError.set('');
  }

  // Wizard Navigation

  validateStep(step: number): boolean {
    switch (step) {
      case 1: // Identity
        if (this.formData.client_type === 'individual') {
          if (!this.formData.name || !this.formData.apellidos) {
            this.toastService.error('Faltan datos', 'Nombre y Apellidos son obligatorios');
            return false;
          }
        } else {
          if (!this.formData.business_name || !this.formData.cif_nif) {
            this.toastService.error('Faltan datos', 'Razón Social y CIF/NIF son obligatorios');
            return false;
          }
        }
        // Common
        if (!this.formData.email) {
          this.toastService.error('Faltan datos', 'El email es obligatorio');
          return false;
        }
        // Basic Email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.formData.email)) {
          this.toastService.error('Datos inválidos', 'El formato del email no es correcto');
          return false;
        }
        return true;

      case 2: // Address
        // Address is usually optional, but if partially filled, validate? 
        // For now, let's treat it as optional or enforce at least specific fields if any is filled.
        // Rule: If 'Name' or 'Type' is filled, Locality/CP is recommended? 
        // Let's keep it lenient unless business rules require address.
        return true;

      case 3: // Billing
        // Validate IBAN if provided
        if (this.formData.iban) {
          // Remove spaces
          const iban = this.formData.iban.replace(/\s/g, '').toUpperCase();
          // Basic length check (Spain is 24)
          if (iban.length < 15 || iban.length > 34) {
            this.toastService.error('IBAN Inválido', 'La longitud del IBAN no parece correcta');
            return false;
          }
          // Add proper mod97 check if needed, for now basic format
          if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) {
            this.toastService.error('IBAN Inválido', 'El formato del IBAN no es correcto');
            return false;
          }
        }
        return true;

      case 4: // CRM - No mandatory fields here yet
        return true;

      default:
        return true;
    }
  }

  nextStep() {
    if (this.validateStep(this.currentStep)) {
      if (this.currentStep < this.totalSteps) {
        if (!this.completedSteps.includes(this.currentStep)) {
          this.completedSteps.push(this.currentStep);
        }
        this.currentStep++;
        if (this.currentStep > this.maxStepReached) {
          this.maxStepReached = this.currentStep;
        }
        this.scrollToTop();
      }
    }
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnterKey(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    const target = keyboardEvent.target as HTMLElement;
    const tag = target?.tagName;
    // Only skip for textareas (multiline input) and selects
    if (tag === 'TEXTAREA' || tag === 'SELECT') {
      return;
    }
    event.preventDefault();
    if (this.currentStep < this.totalSteps) {
      this.nextStep();
    } else {
      this.saveCustomer();
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.scrollToTop();
    }
  }

  goToStep(step: number) {
    if (step <= this.maxStepReached) { // Allow navigation only to reached steps
      this.currentStep = step;
      this.scrollToTop();
    }
  }

  private scrollToTop() {
    // Immediate scroll to top of the container
    if (this.modalBody?.nativeElement) {
      this.modalBody.nativeElement.scrollTop = 0;
    }
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

  // Validation Helpers
  validateDni() {
    const dni = this.formData.dni;
    if (!dni) {
      this.dniError.set('');
      return;
    }
    // Basic NIF/NIE Regex (Spain)
    // X1234567L, 12345678Z, Y1234567P
    const valid = /^[XYZ\d]\d{7,8}[A-Z]$/i.test(dni);
    this.dniError.set(valid ? '' : 'Formato de DNI/NIE inválido');
  }

  validateEmail() {
    const email = this.formData.email;
    if (!email) {
      this.emailError.set('');
      return;
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    this.emailError.set(valid ? '' : 'Email inválido');
  }

  validateIban() {
    const iban = this.formData.iban;
    if (!iban) {
      this.ibanError.set('');
      return;
    }
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      this.ibanError.set('Longitud incorrecta');
      return;
    }
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(cleanIban)) {
      this.ibanError.set('Formato inválido');
      return;
    }
    this.ibanError.set('');
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
      status: this.formData.status || 'active',
      source: this.formData.source,
      website: this.formData.website,
      industry: this.formData.industry,
      internal_notes: this.formData.internal_notes,
      language: this.formData.language || 'es',

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
        await this.customersService.saveClientContacts(finalId, this.contactList);
      }

      // SAVE CONSENTS
      if (finalId) {
        await this.saveConsents(finalId);
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

  private async saveConsents(customerId: string) {
    if (!this.formData.email) return;

    const consentsToSave: { type: GdprConsentRecord['consent_type'], purpose: string, value: boolean }[] = [];

    // Always save current state for new customers, or if changed for existing
    // For simplicity, we save all checked consents to ensure record exists
    // Health Data
    if (this.formData.health_data_consent !== (this.customer?.health_data_consent || false)) {
      consentsToSave.push({
        type: 'health_data',
        purpose: 'Prestación de servicios asistenciales y gestión de historia clínica',
        value: this.formData.health_data_consent
      });
    }

    // Privacy Policy
    if (this.formData.privacy_policy_consent !== (this.customer?.privacy_policy_consent || false)) {
      consentsToSave.push({
        type: 'privacy_policy',
        purpose: 'Aceptación de política de privacidad y condiciones',
        value: this.formData.privacy_policy_consent
      });
    }

    // Marketing
    if (this.formData.marketing_consent !== (this.customer?.marketing_consent || false)) {
      consentsToSave.push({
        type: 'marketing',
        purpose: 'Envío de comunicaciones comerciales y novedades',
        value: this.formData.marketing_consent
      });
    }

    if (consentsToSave.length === 0) return;

    console.log('Saving granular consents:', consentsToSave);

    try {
      const promises = consentsToSave.map(c => {
        const record: GdprConsentRecord = {
          subject_email: this.formData.email,
          consent_type: c.type,
          purpose: c.purpose,
          consent_given: c.value,
          consent_method: 'form', // Created via internal CRM form
          subject_id: customerId
        };
        return firstValueFrom(this.gdprService.recordConsent(record, { companyId: this.companyId }));
      });

      await Promise.all(promises);
      console.log('Consents saved successfully');
    } catch (err) {
      console.error('Error saving consents:', err);
      // We don't block the UI flow for consent errors, but we log them
      this.toastService.warning('Aviso', 'El cliente se guardó pero hubo un error al registrar algunos consentimientos.');
    }
  }

  closeForm() {
    this.close.emit();
  }
}