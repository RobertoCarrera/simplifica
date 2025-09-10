import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../skeleton/skeleton.component';
import { LoadingComponent } from '../loading/loading.component';
import { AnimationService } from '../../services/animation.service';
import { CustomerFormComponent } from '../customer-form/customer-form.component';
import { DevUserSelectorComponent } from '../dev-user-selector/dev-user-selector.component';
import { Customer, CreateCustomerDev } from '../../models/customer';
import { SupabaseCustomersService, CustomerFilters, CustomerStats } from '../../services/supabase-customers.service';
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
      
      <!-- Header -->
      <div class="header-section">
        <div class="header-content">
          <div class="title-section">
            <h1 class="page-title">Gestión de Clientes</h1>
            <p class="page-subtitle">Administra toda la información de tus clientes</p>
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
                    [alt]="customer.nombre + ' ' + customer.apellidos"
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
                  {{ customer.nombre }} {{ customer.apellidos }}
                </h3>
                
                <div class="customer-details">
                  <div class="detail-item">
                    <i class="fas fa-envelope detail-icon"></i>
                    <span class="detail-text">{{ customer.email }}</span>
                  </div>
                  
                  @if (customer.telefono) {
                    <div class="detail-item">
                      <i class="fas fa-phone detail-icon"></i>
                      <span class="detail-text">{{ customer.telefono }}</span>
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
      <div class="modal-overlay" (click)="closeForm()">
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
                    [(ngModel)]="formData.nombre"
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
                    [(ngModel)]="formData.telefono"
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
  private animationService = inject(AnimationService);
  private toastService = inject(ToastService);

  // State signals
  customers = signal<Customer[]>([]);
  isLoading = signal(false);
  stats = signal<CustomerStats | null>(null);
  showForm = signal(false);
  selectedCustomer = signal<Customer | null>(null);

  // Filter signals
  searchTerm = signal('');
  sortBy = signal<'nombre' | 'apellidos' | 'created_at'>('created_at');
  sortOrder = signal<'asc' | 'desc'>('desc');

  // Form data
  formData = {
    nombre: '',
    apellidos: '',
    email: '',
    telefono: '',
    dni: '',
  address: ''
  };

  devRoleService = inject(DevRoleService);

  // Computed
  filteredCustomers = computed(() => {
    let filtered = this.customers();
    
    // Apply search filter
    const search = this.searchTerm().toLowerCase().trim();
    if (search) {
      filtered = filtered.filter(customer =>
        customer.nombre.toLowerCase().includes(search) ||
        customer.apellidos.toLowerCase().includes(search) ||
        customer.email.toLowerCase().includes(search) ||
        customer.dni.toLowerCase().includes(search) ||
        (customer.telefono && customer.telefono.toLowerCase().includes(search))
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
      nombre: customer.nombre + ' (Copia)',
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
      nombre: this.formData.nombre,
      apellidos: this.formData.apellidos,
      email: this.formData.email,
      telefono: this.formData.telefono,
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
      nombre: this.formData.nombre,
      apellidos: this.formData.apellidos,
      email: this.formData.email,
      telefono: this.formData.telefono,
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
      nombre: '',
      apellidos: '',
      email: '',
      telefono: '',
      dni: '',
  address: ''
    };
  }

  private populateForm(customer: Partial<Customer>) {
    this.formData = {
      nombre: customer.nombre || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      telefono: customer.telefono || '',
      dni: customer.dni || '',
  address: customer.address || ''
    };
  }

  onCustomerSaved(customer: Customer) {
    // The service will automatically update the customers list
    this.closeForm();
  }

  testCreateCustomer() {
    
    const testCustomer = {
      nombre: 'Cliente',
      apellidos: 'Test',
      email: `test.${Date.now()}@ejemplo.com`,
      telefono: '666123456',
      dni: '12345678Z',
  address: 'Calle Test 1'
      // El usuario_id se asignará automáticamente según el usuario seleccionado
    };

    this.customersService.createCustomer(testCustomer).subscribe({
      next: (customer) => {
        this.closeForm();
      },
      error: (err) => {
        console.error('❌ Error al crear cliente:', err);
      }
    });
  }

  async deleteCustomer(customer: Customer) {
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${customer.nombre} ${customer.apellidos}?`)) {
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
    return `${customer.nombre.charAt(0)}${customer.apellidos.charAt(0)}`.toUpperCase();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
