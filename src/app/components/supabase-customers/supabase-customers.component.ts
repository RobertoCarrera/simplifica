import { Component, OnInit, inject, signal, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { AnimationService } from '../../services/animation.service';
import { CustomerFormComponent } from '../customer-form/customer-form.component';
import { DevUserSelectorComponent } from '../dev-user-selector/dev-user-selector.component';
import { Customer, CreateCustomerDev } from '../../models/customer';
import { SupabaseCustomersService, CustomerFilters, CustomerStats } from '../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../services/gdpr-compliance.service';
import { ToastService } from '../../services/toast.service';
import { DevRoleService } from '../../services/dev-role.service';

@Component({
  selector: 'app-supabase-customers',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    SkeletonComponent, 
    LoadingComponent,
    DevUserSelectorComponent
  ],
  template: `
    <div class="customers-container">
      
    @if (devRoleService.canSeeDevTools()) {
      <app-dev-user-selector></app-dev-user-selector>
    }
      
      <!-- GDPR Compliance Dashboard (Admin Only) -->
      @if (devRoleService.canSeeDevTools() && complianceStats()) {
        <div class="gdpr-dashboard mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center">
              <i class="fas fa-shield-alt text-blue-600 text-xl mr-2"></i>
              <h3 class="text-lg font-semibold text-blue-900">Panel de Cumplimiento RGPD</h3>
            </div>
            <button
              (click)="toggleGdprDashboard()"
              class="btn btn-sm"
              [class.btn-primary]="!gdprDashboardVisible()"
              [class.btn-secondary]="gdprDashboardVisible()"
            >
              <i class="fas" [class.fa-chevron-down]="!gdprDashboardVisible()" [class.fa-chevron-up]="gdprDashboardVisible()"></i>
              {{ gdprDashboardVisible() ? 'Ocultar' : 'Ver' }} Detalles
            </button>
          </div>
          
          @if (gdprDashboardVisible()) {
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div class="bg-white rounded-lg p-3 border border-blue-200">
                <div class="flex items-center">
                  <i class="fas fa-file-alt text-blue-600 text-lg mr-2"></i>
                  <div>
                    <div class="text-lg font-bold text-blue-900">{{ complianceStats()?.accessRequestsCount || 0 }}</div>
                    <div class="text-xs text-blue-600">Solicitudes RGPD</div>
                  </div>
                </div>
              </div>
              
              <div class="bg-white rounded-lg p-3 border border-green-200">
                <div class="flex items-center">
                  <i class="fas fa-check-circle text-green-600 text-lg mr-2"></i>
                  <div>
                    <div class="text-lg font-bold text-green-900">{{ complianceStats()?.activeConsentsCount || 0 }}</div>
                    <div class="text-xs text-green-600">Consentimientos Activos</div>
                  </div>
                </div>
              </div>
              
              <div class="bg-white rounded-lg p-3 border border-yellow-200">
                <div class="flex items-center">
                  <i class="fas fa-clock text-yellow-600 text-lg mr-2"></i>
                  <div>
                    <div class="text-lg font-bold text-yellow-900">{{ complianceStats()?.pendingRequestsCount || 0 }}</div>
                    <div class="text-xs text-yellow-600">Solicitudes Pendientes</div>
                  </div>
                </div>
              </div>
              
              <div class="bg-white rounded-lg p-3 border border-red-200">
                <div class="flex items-center">
                  <i class="fas fa-exclamation-triangle text-red-600 text-lg mr-2"></i>
                  <div>
                    <div class="text-lg font-bold text-red-900">{{ complianceStats()?.overdueRequestsCount || 0 }}</div>
                    <div class="text-xs text-red-600">Solicitudes Vencidas</div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- GDPR Quick Actions -->
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                (click)="toggleGdprActions()"
                class="btn btn-sm btn-outline"
              >
                <i class="fas fa-cogs mr-1"></i>
                Acciones RGPD
              </button>
            </div>
          }
        </div>
      }

      <!-- Header -->
      <div class="header-section">
        <div class="header-content">
          <div class="title-section">
            <h1 class="page-title">Gestión de Clientes</h1>
            <p class="page-subtitle">Administra toda la información de tus clientes</p>
            @if (devRoleService.canSeeDevTools()) {
              <div class="mt-2">
                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  <i class="fas fa-shield-alt mr-1"></i>
                  Sistema compatible con RGPD
                </span>
              </div>
            }
          </div>
          
          <!-- Actions -->
          <div class="header-actions">            
            <button
              (click)="exportCustomers()"
              class="btn btn-secondary"
              [disabled]="isLoading()"
            >
              <i class="fas fa-download"></i>
              Exportar
            </button>
            
            <input
              #fileInput
              type="file"
              accept=".csv"
              (change)="importCustomers($event)"
              class="hidden"
            >
            <button
              (click)="fileInput.click()"
              class="btn btn-secondary"
              [disabled]="isLoading()"
              title="Importar clientes desde CSV"
            >
              <i class="fas fa-upload"></i>
              Importar CSV
              <i class="fas fa-info-circle info-icon" (click)="showImportInfo($event)"></i>
            </button>
            <div class="search-input-container">
              <i class="fas fa-search search-icon"></i>
              <input
                type="text"
                [(ngModel)]="searchTerm"
                (ngModelChange)="onSearchChange($event)"
                placeholder="Buscar clientes por nombre, email o DNI..."
                class="search-input-full"
              >
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Cards -->
      @if (stats()) {
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon users">
              <i class="fas fa-users"></i>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats()?.total || 0 }}</div>
              <div class="stat-label">Total Clientes</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon new">
              <i class="fas fa-user-plus"></i>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats()?.newThisWeek || 0 }}</div>
              <div class="stat-label">Nuevos esta Semana</div>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon active">
              <i class="fas fa-calendar-plus"></i>
            </div>
            <div class="stat-content">
              <div class="stat-value">{{ stats()?.newThisMonth || 0 }}</div>
              <div class="stat-label">Nuevos este Mes</div>
            </div>
          </div>
        </div>
      }

      <!-- Loading State -->
      @if (isLoading() && !customers().length) {
        <div class="loading-section">
          <app-skeleton type="list" [count]="6"></app-skeleton>
        </div>
      }

      <!-- Customers Grid -->
      @if (!isLoading() || customers().length) {
        <div class="customers-grid">
          @for (customer of filteredCustomers(); track customer.id; let i = $index) {
            <div class="customer-card" (click)="selectCustomer(customer)">
              
              <!-- Avatar -->
              <div class="customer-avatar">
                @if (customer.avatar_url) {
                  <img 
                    [src]="customer.avatar_url"
                    [alt]="customer.name + ' ' + customer.apellidos"
                    class="avatar-img"
                  >
                } @else {
                  <div class="avatar-placeholder">
                    {{ getCustomerInitials(customer) }}
                  </div>
                }
                
                <!-- Status Badge -->
                <div 
                  class="status-badge"
                  [class.active]="customer.activo"
                  [class.inactive]="!customer.activo"
                  [title]="customer.activo ? 'Cliente activo' : 'Cliente inactivo'"
                ></div>
              </div>

              <!-- Customer Info -->
              <div class="customer-info">
                <h3 class="customer-name">
                  {{ customer.name }} {{ customer.apellidos }}
                </h3>
                
                <!-- GDPR Status Indicator -->
                <div class="gdpr-status mb-2">
                  <span 
                    class="text-xs px-2 py-1 rounded-full {{ getGdprStatusClass(customer) }}"
                    [title]="getGdprStatusText(customer)"
                  >
                    <i class="fas fa-shield-alt mr-1"></i>
                    {{ getGdprStatusText(customer) }}
                  </span>
                </div>
                
                <div class="customer-details">
                  <div class="detail-item">
                    <i class="fas fa-envelope detail-icon"></i>
                    <span class="detail-text">{{ customer.email }}</span>
                  </div>
                  
                  @if (customer.phone) {
                    <div class="detail-item">
                      <i class="fas fa-phone detail-icon"></i>
                      <span class="detail-text">{{ customer.phone }}</span>
                    </div>
                  }
                  
                  @if (customer.dni) {
                    <div class="detail-item">
                      <i class="fas fa-id-card detail-icon"></i>
                      <span class="detail-text">{{ customer.dni }}</span>
                    </div>
                  }
                  
                  <div class="detail-item">
                    <i class="fas fa-calendar detail-icon"></i>
                    <span class="detail-text">{{ formatDate(customer.created_at) }}</span>
                  </div>
                  
                  <!-- GDPR Data Protection Info -->
                  @if (customer.data_retention_until) {
                    <div class="detail-item">
                      <i class="fas fa-hourglass detail-icon"></i>
                      <span class="detail-text text-xs">Retención hasta: {{ formatDate(customer.data_retention_until) }}</span>
                    </div>
                  }
                  
                  @if (customer.is_minor) {
                    <div class="detail-item">
                      <i class="fas fa-child detail-icon text-orange-600"></i>
                      <span class="detail-text text-xs text-orange-600">Menor de edad - Consentimiento parental requerido</span>
                    </div>
                  }
                </div>

                
              </div>

              <!-- Actions -->
              <div class="customer-actions">
                
                <button
                  (click)="editCustomer(customer); $event.stopPropagation()"
                  class="action-btn edit"
                  title="Editar cliente"
                >
                  <i class="fas fa-edit"></i>
                </button>
                
                <!-- GDPR Actions Menu -->
                @if (devRoleService.canSeeDevTools()) {
                  <div class="gdpr-actions-menu relative inline-block">
                    <button
                      class="action-btn gdpr"
                      title="Acciones RGPD"
                      (click)="toggleGdprMenu($event, customer.id)"
                    >
                      <i class="fas fa-shield-alt"></i>
                    </button>
                    
                    <div 
                      [id]="'gdpr-menu-' + customer.id"
                      class="gdpr-dropdown hidden absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10"
                    >
                      <button
                        (click)="sendConsentRequest(customer); $event.stopPropagation()"
                        class="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        <i class="fas fa-envelope-open-text mr-2"></i>
                        Solicitar Consentimiento
                      </button>

                      <button
                        (click)="requestDataAccess(customer); $event.stopPropagation()"
                        class="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        <i class="fas fa-file-alt mr-2"></i>
                        Solicitar Acceso Datos
                      </button>
                      
                      <button
                        (click)="exportCustomerData(customer); $event.stopPropagation()"
                        class="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        <i class="fas fa-download mr-2"></i>
                        Exportar Datos RGPD
                      </button>
                      
                      <hr class="my-1">
                      
                      <button
                        (click)="anonymizeCustomer(customer); $event.stopPropagation()"
                        class="block w-full text-left px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                      >
                        <i class="fas fa-user-slash mr-2"></i>
                        Derecho al Olvido
                      </button>
                    </div>
                  </div>
                }
                
                <button
                  (click)="deleteCustomer(customer); $event.stopPropagation()"
                  class="action-btn delete"
                  title="Eliminar cliente"
                >
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!isLoading() && !customers().length) {
        <div class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-users"></i>
          </div>
          <h3 class="empty-title">No hay clientes todavía</h3>
          <p class="empty-message">Comienza creando tu primer cliente</p>
          <button
            (click)="openForm()"
            class="btn btn-primary"
          >
            <i class="fas fa-plus"></i>
            Crear Primer Cliente
          </button>
        </div>
      }

      <!-- No Results -->
      @if (!isLoading() && customers().length && !filteredCustomers().length) {
        <div class="no-results">
          <div class="no-results-icon">
            <i class="fas fa-search"></i>
          </div>
          <h3 class="no-results-title">No se encontraron clientes</h3>
          <p class="no-results-message">Intenta con otros términos de búsqueda</p>
          <button
            (click)="clearFilters()"
            class="btn btn-secondary"
          >
            <i class="fas fa-times"></i>
            Limpiar Filtros
          </button>
        </div>
      }

      <!-- Loading Overlay -->
      @if (isLoading() && customers().length) {
        <div class="loading-overlay">
          <app-loading
            type="spinner"
            size="lg"
            text="Actualizando clientes..."
            [overlay]="true"
          ></app-loading>
        </div>
      }
    </div>

    <!-- Customer Form Modal -->
    @if (showForm()) {
      <div class="modal-overlay">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">
              <i class="fas" [class.fa-plus]="!selectedCustomer()" [class.fa-edit]="selectedCustomer()"></i>
              {{ selectedCustomer() ? 'Editar Cliente' : 'Nuevo Cliente' }}
            </h2>
            <button (click)="closeForm()" class="modal-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <!-- Customer Form -->
          <div class="modal-body">
            <form (ngSubmit)="saveCustomer()" #customerForm="ngForm" class="customer-form">
              
              <div class="form-row">
                <div class="form-group">
                  <label for="nombre" class="form-label">
                    <i class="fas fa-user"></i>
                    Nombre *
                  </label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    [(ngModel)]="formData.name"
                    required
                    class="form-input"
                    placeholder="Introduce el nombre"
                  >
                </div>
                
                <div class="form-group">
                  <label for="apellidos" class="form-label">
                    <i class="fas fa-user"></i>
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    id="apellidos"
                    name="apellidos"
                    [(ngModel)]="formData.apellidos"
                    required
                    class="form-input"
                    placeholder="Introduce los apellidos"
                  >
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="email" class="form-label">
                    <i class="fas fa-envelope"></i>
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    [(ngModel)]="formData.email"
                    required
                    class="form-input"
                    placeholder="correo@ejemplo.com"
                  >
                </div>
                
                <div class="form-group">
                  <label for="telefono" class="form-label">
                    <i class="fas fa-phone"></i>
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    id="telefono"
                    name="telefono"
                    [(ngModel)]="formData.phone"
                    class="form-input"
                    placeholder="666 123 456"
                  >
                </div>
              </div>

              <div class="form-group">
                <label for="dni" class="form-label">
                  <i class="fas fa-id-card"></i>
                  DNI/NIF
                </label>
                <input
                  type="text"
                  id="dni"
                  name="dni"
                  [(ngModel)]="formData.dni"
                  class="form-input"
                  placeholder="12345678Z"
                >
              </div>

              <div class="form-group">
                <label for="address" class="form-label">
                  <i class="fas fa-map-marker-alt"></i>
                  Dirección
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  [(ngModel)]="formData.address"
                  class="form-input"
                  placeholder="Calle, número, piso..."
                >
              </div>
              
              <div class="modal-actions">
                <button type="button" (click)="closeForm()" class="btn btn-secondary">
                  <i class="fas fa-times"></i>
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  class="btn btn-primary"
                  [disabled]="!customerForm.form.valid || isLoading()"
                >
                  <i class="fas fa-save"></i>
                  {{ selectedCustomer() ? 'Actualizar' : 'Crear' }} Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }

    <!-- Floating Action Button (FAB) -->
    <button
      (click)="openForm()"
      class="fab-button"
      title="Nuevo Cliente"
      [disabled]="isLoading()"
    >
      <i class="fas fa-plus"></i>
    </button>
  `,
  styleUrls: ['./supabase-customers.component.scss']
})
export class SupabaseCustomersComponent implements OnInit {
  // Services
  private customersService = inject(SupabaseCustomersService);
  private gdprService = inject(GdprComplianceService);
  private animationService = inject(AnimationService);
  private toastService = inject(ToastService);
  devRoleService = inject(DevRoleService);

  // State signals
  customers = signal<Customer[]>([]);
  isLoading = signal(false);
  stats = signal<CustomerStats | null>(null);
  showForm = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  
  // GDPR signals
  gdprDashboardVisible = signal(false);
  complianceStats = signal<any>(null);
  showGdprActions = signal(false);

  // Filter signals
  searchTerm = signal('');
  sortBy = signal<'name' | 'apellidos' | 'created_at'>('created_at');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // Form data
  formData = {
    name: '',
    apellidos: '',
    email: '',
    phone: '',
    dni: '',
  address: ''
  };

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
    const customerData: CreateCustomerDev = {
      name: this.formData.name,
      apellidos: this.formData.apellidos,
      email: this.formData.email,
      phone: this.formData.phone,
      dni: this.formData.dni,
  // map simple address text to 'address' field (DB may use address/jsonb or direccion_id)
  address: this.formData.address
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
  }

  private updateExistingCustomer() {
    const customerId = this.selectedCustomer()?.id;
    if (!customerId) return;

    const updates = {
      name: this.formData.name,
      apellidos: this.formData.apellidos,
      email: this.formData.email,
      phone: this.formData.phone,
      dni: this.formData.dni,
  address: this.formData.address
    };

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
  }

  private resetForm() {
    this.formData = {
      name: '',
      apellidos: '',
      email: '',
      phone: '',
      dni: '',
  address: ''
    };
  }

  private populateForm(customer: Partial<Customer>) {
    this.formData = {
      name: customer.name || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      phone: customer.phone || '',
      dni: customer.dni || '',
  address: customer.address || ''
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

    this.toastService.info('Procesando...', 'Importando clientes desde CSV');

    this.customersService.importFromCSV(file).subscribe({
      next: (customers) => {
        this.toastService.success('¡Éxito!', `${customers.length} clientes importados correctamente`);
        // Limpiar el input para permitir reimportar el mismo archivo
        event.target.value = '';
      },
      error: (error) => {
        console.error('Error importing customers:', error);
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido al importar';
        this.toastService.error('Error de Importación', errorMessage);
        // Limpiar el input
        event.target.value = '';
      }
    });
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

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  // ========================================
  // GDPR METHODS
  // ========================================

  toggleGdprDashboard() {
    this.gdprDashboardVisible.set(!this.gdprDashboardVisible());
  }

  toggleGdprActions() {
    this.showGdprActions.set(!this.showGdprActions());
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
