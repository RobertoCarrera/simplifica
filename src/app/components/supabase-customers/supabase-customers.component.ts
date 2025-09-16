import { Component, OnInit, inject, signal, computed, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { AnimationService } from '../../services/animation.service';
import { DevUserSelectorComponent } from '../dev-user-selector/dev-user-selector.component';
import { CsvHeaderMapperComponent, CsvMappingResult } from '../csv-header-mapper/csv-header-mapper.component';
import { Customer, CreateCustomerDev } from '../../models/customer';
import { AddressesService } from '../../services/addresses.service';
import { LocalitiesService } from '../../services/localities.service';
import { Locality } from '../../models/locality';
import { SupabaseCustomersService, CustomerFilters, CustomerStats } from '../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../services/gdpr-compliance.service';
import { ToastService } from '../../services/toast.service';
import { DevRoleService } from '../../services/dev-role.service';
import { AppModalComponent } from '../app-modal/app-modal.component';
import { Router } from '@angular/router';

@Component({
  selector: 'app-supabase-customers',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    SkeletonComponent, 
    LoadingComponent,
    DevUserSelectorComponent,
  CsvHeaderMapperComponent,
  AppModalComponent,
  ],
  templateUrl: './supabase-customers.component.html',
  styleUrls: ['./supabase-customers.component.scss']
})
export class SupabaseCustomersComponent implements OnInit {
  
  // Services
  private customersService = inject(SupabaseCustomersService);
  private gdprService = inject(GdprComplianceService);
  private animationService = inject(AnimationService);
  private toastService = inject(ToastService);
  private addressesService = inject(AddressesService);
  private localitiesService = inject(LocalitiesService);
  private router = inject(Router);
  devRoleService = inject(DevRoleService);

  // State signals
  customers = signal<Customer[]>([]);
  isLoading = signal(false);
  stats = signal<CustomerStats | null>(null);
  showForm = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  
  // GDPR signals
  gdprPanelVisible = signal(false);
  complianceStats = signal<any>(null);

  // Filter signals
  searchTerm = signal('');
  sortBy = signal<'name' | 'apellidos' | 'created_at'>('created_at');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // CSV Mapper signals
  showCsvMapper = signal(false);
  csvHeaders = signal<string[]>([]);
  csvData = signal<string[][]>([]);
  pendingCsvFile: File | null = null;
  // UI filter toggle for incomplete imports
  onlyIncomplete: boolean = false;

  // Customers CSV mapper config
  customerFieldOptions = [
    { value: 'name', label: 'Nombre *', required: true },
    { value: 'surname', label: 'Apellidos *', required: true },
    { value: 'email', label: 'Email *', required: true },
    { value: 'phone', label: 'Teléfono' },
    { value: 'dni', label: 'DNI/NIF' },
    { value: 'address', label: 'Dirección' },
    { value: 'company', label: 'Empresa' },
    { value: 'notes', label: 'Notas' },
    { value: 'metadata', label: 'Metadata (otros datos)' }
  ];
  customerRequiredFields = ['name', 'surname', 'email'];
  customerAliasMap: Record<string, string[]> = {
    name: ['name', 'nombre', 'first_name', 'firstname', 'first name', 'bill_to:first_name', 'bill to first name', 'billto:first_name', 'ship_to:first_name', 'ship to first name', 'shipto:first_name'],
    surname: ['surname', 'last_name', 'lastname', 'last name', 'apellidos', 'bill_to:last_name', 'bill to last name', 'billto:last_name', 'ship_to:last_name', 'ship to last name', 'shipto:last_name'],
    email: ['email', 'correo', 'e-mail', 'mail', 'bill_to:email', 'bill to email', 'billto:email', 'ship_to:email', 'ship to email', 'shipto:email'],
    phone: ['phone', 'telefono', 'teléfono', 'tel', 'mobile', 'movil', 'móvil', 'bill_to:phone', 'bill to phone', 'billto:phone', 'ship_to:phone', 'ship to phone', 'shipto:phone'],
    dni: ['dni', 'nif', 'documento', 'id', 'legal', 'bill_to:legal', 'bill to legal', 'billto:legal', 'ship_to:legal', 'ship to legal', 'shipto:legal'],
    address: ['address', 'direccion', 'dirección', 'domicilio', 'bill_to:address', 'bill to address', 'billto:address', 'ship_to:address', 'ship to address', 'shipto:address'],
    company: ['company', 'empresa', 'bill_to:company', 'bill to company', 'billto:company', 'ship_to:company', 'ship to company', 'shipto:company'],
    notes: ['notes', 'notas', 'observaciones'],
    metadata: ['metadata', 'metadatos']
  };

  // Form data
  formData = {
    name: '',
    apellidos: '',
    email: '',
    phone: '',
    dni: '',
    // structured address fields
    addressTipoVia: '',
    addressNombre: '',
    addressNumero: '',
    addressLocalidadId: ''
  };

  // Localities cache for selector
  localities: Locality[] = [];

  // Common via types (can be extended)
  addressVias: string[] = ['Calle', 'Avenida', 'Plaza', 'Paseo', 'Camino', 'Carretera', 'Barrio', 'Ronda'];
  // Filtered suggestions
  filteredLocalities: Locality[] = [];
  filteredVias: string[] = [...this.addressVias];
  // visible typed locality name (search input)
  addressLocalityName: string = '';

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
      this.csvHeaders.set(headers);
      this.csvData.set(data.slice(0, 10)); // preview solo primeros 10 datos
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
    this.loadData();
    this.loadGdprData();
  }

  private loadData() {
    // Subscribe to customers
    this.customersService.customers$.subscribe(customers => {
      this.customers.set(customers);
    });

    // Subscribe to loading state
    this.customersService.loading$.subscribe(loading => {
      this.isLoading.set(loading);
    });

    // Subscribe to stats
    this.customersService.stats$.subscribe(stats => {
      this.stats.set(stats);
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
      return;
    }
    this.filteredVias = this.addressVias.filter(v => v.toLowerCase().includes(s));
  }

  // Locality search handler (by name or postal code CP)
  onLocalityInput(event: Event) {
    const q = (event.target as HTMLInputElement).value || '';
    const s = q.trim().toLowerCase();
    if (!s) {
      this.filteredLocalities = [...this.localities];
      this.formData.addressLocalidadId = '';
      return;
    }
    this.filteredLocalities = this.localities.filter(loc => {
      const nameMatch = loc.nombre && loc.nombre.toLowerCase().includes(s);
      const cpMatch = loc.CP && loc.CP.toString().toLowerCase().includes(s);
      return nameMatch || cpMatch;
    });
  }

  selectLocality(loc: Locality) {
    this.formData.addressLocalidadId = loc._id;
    this.addressLocalityName = loc.nombre;
    this.filteredLocalities = [];
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
    // If there is address text, create an Address record first and then create customer with direccion_id
    const createCustomerWithDireccion = (direccion_id?: string) => {
      const customerData: CreateCustomerDev = {
        name: this.formData.name,
        apellidos: this.formData.apellidos,
        email: this.formData.email,
        phone: this.formData.phone,
        dni: this.formData.dni,
        direccion_id: direccion_id
      };

      this.customersService.createCustomer(customerData).subscribe({
        next: (customer) => {
          this.closeForm();
          this.toastService.success('Éxito', 'Cliente creado correctamente');
        },
        error: (error) => {
          console.error('Error al crear cliente:', error);
          this.toastService.error('Error', 'No se pudo crear el cliente');
        }
      });
    };

    // If any address field is provided, create Address first
    const hasAddressData = (this.formData.addressNombre && this.formData.addressNombre.trim()) ||
      (this.formData.addressNumero && this.formData.addressNumero.trim());

    if (hasAddressData) {
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
          this.toastService.error('Error', 'No se pudo crear la dirección');
        }
      });
    } else {
      createCustomerWithDireccion(undefined);
    }
  }

  private updateExistingCustomer() {
    const customerId = this.selectedCustomer()?.id;
    if (!customerId) return;

    const applyUpdate = (direccion_id?: string) => {
      const updates: any = {
        name: this.formData.name,
        apellidos: this.formData.apellidos,
        email: this.formData.email,
        phone: this.formData.phone,
        dni: this.formData.dni,
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
      addressTipoVia: '',
      addressNombre: '',
      addressNumero: '',
      addressLocalidadId: ''
    };
  }

  private populateForm(customer: Partial<Customer>) {
    this.formData = {
      name: customer.name || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      phone: customer.phone || '',
      dni: customer.dni || '',
  // try to show an address string if the customer has a direccion relation
  // populate structured address fields from the direccion relation if available
  addressTipoVia: customer.direccion?.tipo_via || '',
  addressNombre: (customer.direccion && customer.direccion.nombre) ? customer.direccion.nombre : (customer.address || ''),
  addressNumero: customer.direccion?.numero || '',
  addressLocalidadId: customer.direccion?.localidad_id || ''
    };
  }

  onCustomerSaved(customer: Customer) {
    // The service will automatically update the customers list
    this.closeForm();
  }

  async deleteCustomer(customer: Customer) {
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${customer.name} ${customer.apellidos}?`)) {
      return;
    }

    this.customersService.deleteCustomer(customer.id).subscribe({
      next: () => {
        // Success handled by service
      },
      error: (error) => {
        console.error('Error deleting customer:', error);
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
    this.toastService.info('Procesando...', 'Importando clientes con el mapeo configurado');

    // Construir array de clientes a partir del mapeo
    const mappedCustomers = this.customersService.buildPayloadRowsFromMapping(
      this.csvHeaders(),
      this.csvData().slice(1), // omitir cabecera si está incluida en data
      result.mappings as any
    );

    if (!mappedCustomers.length) {
      this.toastService.error('Error', 'No se encontraron filas válidas en el CSV');
      this.pendingCsvFile = null;
      return;
    }

    const total = mappedCustomers.length;
    console.log('[CSV-MAP] Mapped customers ready to import:', total);
    this.toastService.info('Listo para importar', `Se importarán ${total} filas`, 2000);
    const batchSize = 5;
    let lastToast: any = null;

    this.customersService.importCustomersInBatches(mappedCustomers, batchSize).subscribe({
      next: (p) => {
        const msg = `Importados ${p.importedCount}/${p.totalCount} (lote ${p.batchNumber}, tamaño ${p.batchSize})`;
        console.log('[Import progreso]', p);
        this.toastService.info('Progreso', msg, 2500);
      },
      complete: () => {
        this.toastService.success('¡Éxito!', `Importación completada (${total} clientes)`);
        this.pendingCsvFile = null;
        // refrescar datos visibles
        this.customersService.getCustomers({ sortBy: this.sortBy(), sortOrder: this.sortOrder() }).subscribe();
      },
      error: (err) => {
        console.error('Error importando por lotes:', err);
        this.toastService.error('Error de Importación', String(err?.message || err));
        this.pendingCsvFile = null;
      }
    });
  }

  onCsvMappingCancelled() {
    console.log('CSV mapping cancelled by user');
    this.showCsvMapper.set(false);
    this.pendingCsvFile = null;
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

    const accessRequest = {
      subject_email: customer.email,
      request_type: 'access' as const,
      requested_data: ['personal_data', 'processing_activities', 'data_sources'],
      purpose: 'Customer data access request via CRM',
      legal_basis: 'gdpr_article_15'
    };

    this.gdprService.createAccessRequest(accessRequest).subscribe({
      next: (request: any) => {
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
    const confirmMessage = `¿Estás seguro de que quieres anonimizar los datos de ${customer.name} ${customer.apellidos}?\n\nEsta acción es irreversible y cumple con el derecho al olvido del RGPD.`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    this.gdprService.anonymizeClientData(customer.id, 'gdpr_erasure_request').subscribe({
      next: (result: any) => {
        this.toastService.success('RGPD', 'Datos del cliente anonimizados correctamente');
        this.loadData(); // Refresh customer list
        this.loadGdprData(); // Refresh GDPR stats
      },
      error: (error: any) => {
        console.error('Error anonymizing customer:', error);
        this.toastService.error('Error RGPD', 'No se pudieron anonimizar los datos del cliente');
      }
    });
  }

  // Show GDPR compliance status for a customer
  getGdprComplianceStatus(customer: Customer): string {
    // This would typically check various compliance factors
    if (customer.marketing_consent && customer.data_processing_consent) {
      return 'compliant';
    } else if (customer.data_processing_consent) {
      return 'partial';
    } else {
      return 'pending';
    }
  }

  getGdprStatusClass(customer: Customer): string {
    const status = this.getGdprComplianceStatus(customer);
    switch (status) {
      case 'compliant': return 'text-green-600 bg-green-100';
      case 'partial': return 'text-yellow-600 bg-yellow-100';
      case 'pending': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  }

  getGdprStatusText(customer: Customer): string {
    const status = this.getGdprComplianceStatus(customer);
    switch (status) {
      case 'compliant': return 'Conforme RGPD';
      case 'partial': return 'Parcialmente conforme';
      case 'pending': return 'Pendiente consentimiento';
      default: return 'Estado desconocido';
    }
  }

  toggleGdprMenu(event: Event, customerId: string) {
    event.stopPropagation();
    
    // Close all other menus
    const allMenus = document.querySelectorAll('.gdpr-dropdown');
    allMenus.forEach(menu => menu.classList.add('hidden'));
    
    // Toggle current menu
    const menu = document.getElementById(`gdpr-menu-${customerId}`);
    if (menu) {
      menu.classList.toggle('hidden');
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
  onEscape(event: KeyboardEvent) {
    if (this.showForm()) {
      // Stop propagation so global listeners don't close the modal.
      event.stopPropagation();
      // Intentionally do not call closeForm() so only explicit UI actions close the modal.
    }
  }
}
