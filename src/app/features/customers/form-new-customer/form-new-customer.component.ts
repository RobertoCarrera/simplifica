import { Component, EventEmitter, Input, OnInit, Output, inject, signal, ViewChild, ElementRef, ChangeDetectorRef, SimpleChanges, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Customer, CreateCustomerDev } from '../../../models/customer';
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



  // Services
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  private localitiesService = inject(LocalitiesService);
  private addressesService = inject(AddressesService);
  private honeypotService = inject(HoneypotService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private tagsService = inject(GlobalTagsService);

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

  constructor() { }

  ngOnInit(): void {
    // Initialize honeypot protection
    this.honeypotFieldName = this.honeypotService.getHoneypotFieldName();
    this.formLoadTime = this.honeypotService.getFormLoadTime();

    this.loadLocalities();

    // If editing a customer, populate form
    if (this.customer) {
      this.populateForm(this.customer);
    }
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
    if (this.customer?.direccion?.localidad_id) {
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
      honeypot: ''
    };

    this.checkAddressLocality();
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
      honeypot: ''
    };
    this.addressLocalityName = '';
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
    const name = (this.newLocalityName || this.addressLocalityName || '').trim();
    const cpRaw = (this.newLocalityCP || '').trim();
    const cp = cpRaw.replace(/\D+/g, '').trim();

    if (!name || !this.newLocalityProvince.trim() || !this.newLocalityCountry.trim() || !cp) {
      this.toastService.error('Campos requeridos', 'Nombre, Provincia, País y Código Postal son obligatorios.');
      return;
    }

    this.localitiesService.findByPostalCode(cp).subscribe({
      next: (existing) => {
        if (existing) {
          this.existingLocalityByCP = existing;
          this.cpExists = true;
          this.toastService.info('Código postal existente', `Ya existe una localidad con CP ${cp}: ${existing.nombre} `);
          return;
        }

        const payload: any = {
          name: name,
          province: this.newLocalityProvince.trim(),
          country: this.newLocalityCountry.trim() || 'España',
          postal_code: cp
        } as any;

        this.localitiesService.createLocality(payload as any).subscribe({
          next: (created: any) => {
            this.loadLocalities(); // Reload to get new one
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

    const customerData: CreateCustomerDev = {
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
      // Metadata fields can be passed if needed
    };

    this.handleAddressAndSave(customerData);
  }

  private handleAddressAndSave(customerData: CreateCustomerDev) {
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

  private performCustomerSave(customerData: CreateCustomerDev, addressId: string | null) {
    if (this.customer && this.customer.id) {
      const updateData: any = { ...customerData, id: this.customer.id };
      if (addressId) updateData.direccion_id = addressId;
      else if (this.customer.direccion_id) updateData.direccion_id = this.customer.direccion_id;

      this.customersService.updateCustomer(this.customer.id, updateData).subscribe({
        next: (res) => {
          this.toastService.success('Cliente actualizado correctamente', 'Éxito');
          this.saved.emit();
          this.close.emit();
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Error updating customer', err);
          this.toastService.error(`Error: ${err.message || 'No se pudo actualizar'}`, 'Error');
          this.isLoading.set(false);
        }
      });
    } else {
      // Creating
      if (addressId) (customerData as any).direccion_id = addressId;

      // inject company_id if available and not present? Service usually handles it but we have it as input
      if (this.companyId) {
        (customerData as any).company_id = this.companyId;
      }

      this.customersService.createCustomer(customerData).subscribe({
        next: (res: any) => {
          // If we have pending tags, save them now
          if (this.pendingTags.length > 0 && res && (res.id || res.ID || res.Id)) {
            const newId = res.id || res.ID || res.Id;
            this.tagsService.assignMultipleTags('clients', newId, this.pendingTags.map(t => t.id)).subscribe({
              next: () => {
                this.toastService.success('Cliente creado correctamente', 'Éxito');
                this.saved.emit();
                this.close.emit();
                this.isLoading.set(false);
              },
              error: (err) => {
                console.error('Error saving tags', err);
                this.toastService.warning('Cliente creado', 'Pero hubo un error al guardar las etiquetas');
                this.saved.emit();
                this.close.emit();
                this.isLoading.set(false);
              }
            });
          } else {
            this.toastService.success('Cliente creado correctamente', 'Éxito');
            this.saved.emit();
            this.close.emit();
            this.isLoading.set(false);
          }
        },
        error: (err) => {
          console.error('Error creating customer', err);
          this.toastService.error(`Error: ${err.message || 'No se pudo crear'}`, 'Error');
          this.isLoading.set(false);
        }
      });
    }
  }

  closeForm() {
    this.close.emit();
  }
}