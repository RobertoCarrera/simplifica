import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Customer } from '../../models/customer';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../services/gdpr-compliance.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-gdpr-customer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="gdpr-customer-manager">
      <!-- GDPR Compliance Dashboard -->
      <div class="gdpr-dashboard mb-6">
        <div class="dashboard-header">
          <h2 class="text-2xl font-bold text-gray-900 flex items-center">
            <i class="fas fa-shield-alt mr-2 text-blue-600"></i>
            Panel de Cumplimiento RGPD
          </h2>
          <p class="text-gray-600 mt-1">Gestión de datos conforme al Reglamento General de Protección de Datos</p>
        </div>

        <!-- Compliance Stats -->
        @if (complianceStats()) {
          <div class="stats-grid grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div class="stat-card bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-file-alt text-blue-600 text-2xl mr-3"></i>
                <div>
                  <div class="text-2xl font-bold text-blue-900">{{ complianceStats()?.accessRequestsCount || 0 }}</div>
                  <div class="text-sm text-blue-600">Solicitudes RGPD</div>
                </div>
              </div>
            </div>
            
            <div class="stat-card bg-green-50 border border-green-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-check-circle text-green-600 text-2xl mr-3"></i>
                <div>
                  <div class="text-2xl font-bold text-green-900">{{ complianceStats()?.activeConsentsCount || 0 }}</div>
                  <div class="text-sm text-green-600">Consentimientos Activos</div>
                </div>
              </div>
            </div>
            
            <div class="stat-card bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-clock text-yellow-600 text-2xl mr-3"></i>
                <div>
                  <div class="text-2xl font-bold text-yellow-900">{{ complianceStats()?.pendingAccessRequests || 0 }}</div>
                  <div class="text-sm text-yellow-600">Solicitudes Pendientes</div>
                </div>
              </div>
            </div>
            
            <div class="stat-card bg-red-50 border border-red-200 rounded-lg p-4">
              <div class="flex items-center">
                <i class="fas fa-exclamation-triangle text-red-600 text-2xl mr-3"></i>
                <div>
                  <div class="text-2xl font-bold text-red-900">{{ complianceStats()?.overdueAccessRequests || 0 }}</div>
                  <div class="text-sm text-red-600">Solicitudes Vencidas</div>
                </div>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- GDPR Actions Toolbar -->
      <div class="gdpr-actions bg-white border rounded-lg p-4 mb-6">
        <div class="flex flex-wrap gap-3">
          <button
            (click)="showAccessRequestForm = true"
            class="btn btn-primary"
          >
            <i class="fas fa-file-plus mr-2"></i>
            Nueva Solicitud RGPD
          </button>
          
          <button
            (click)="showConsentForm = true"
            class="btn btn-secondary"
          >
            <i class="fas fa-handshake mr-2"></i>
            Gestionar Consentimientos
          </button>
          
          <button
            (click)="exportComplianceReport()"
            class="btn btn-outline"
            [disabled]="isLoading()"
          >
            <i class="fas fa-download mr-2"></i>
            Exportar Informe Cumplimiento
          </button>
          
          <button
            (click)="showAuditLog = !showAuditLog"
            class="btn btn-outline"
            [class.active]="showAuditLog"
          >
            <i class="fas fa-history mr-2"></i>
            {{ showAuditLog ? 'Ocultar' : 'Ver' }} Registro de Auditoría
          </button>
        </div>
      </div>

      <!-- Customer Search with GDPR Context -->
      <div class="customer-search bg-white border rounded-lg p-4 mb-6">
        <div class="search-header flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900">Búsqueda de Clientes</h3>
          <div class="gdpr-indicators flex items-center space-x-2">
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              <i class="fas fa-shield-alt mr-1"></i>
              Protegido RGPD
            </span>
          </div>
        </div>
        
        <div class="search-input-group flex gap-3">
          <div class="flex-1">
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Buscar por nombre, email o DNI (datos protegidos)..."
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
          </div>
          <button
            (click)="clearSearch()"
            class="btn btn-outline"
            [disabled]="!searchTerm"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="mt-2 text-xs text-gray-500">
          <i class="fas fa-info-circle mr-1"></i>
          Todas las búsquedas quedan registradas en el log de auditoría conforme al RGPD
        </div>
      </div>

      <!-- Customer List with GDPR Information -->
      @if (customers() && customers().length > 0) {
        <div class="customers-list">
          @for (customer of customers(); track customer.id) {
            <div class="customer-card bg-white border rounded-lg p-4 mb-4 hover:shadow-md transition-shadow">
              <div class="customer-header flex items-start justify-between">
                <div class="customer-info flex-1">
                  <div class="flex items-center mb-2">
                    <h3 class="text-lg font-semibold text-gray-900 mr-3">
                      {{ customer.name }} {{ customer.apellidos }}
                    </h3>
                    @if (getCustomerGdprStatus(customer)) {
                      <div class="gdpr-badges flex space-x-1">
                        @if (getCustomerGdprStatus(customer)?.hasValidConsent) {
                          <span class="badge badge-success">
                            <i class="fas fa-check mr-1"></i>Consentimiento
                          </span>
                        }
                        @if (getCustomerGdprStatus(customer)?.hasActiveRequests) {
                          <span class="badge badge-warning">
                            <i class="fas fa-clock mr-1"></i>Solicitud Activa
                          </span>
                        }
                        @if (customer.is_minor) {
                          <span class="badge badge-info">
                            <i class="fas fa-child mr-1"></i>Menor
                          </span>
                        }
                      </div>
                    }
                  </div>
                  
                  <div class="customer-details text-sm text-gray-600 space-y-1">
                    <div class="flex items-center">
                      <i class="fas fa-envelope w-4 mr-2"></i>
                      <span class="data-protected">{{ customer.email }}</span>
                    </div>
                    @if (customer.phone) {
                      <div class="flex items-center">
                        <i class="fas fa-phone w-4 mr-2"></i>
                        <span class="data-protected">{{ customer.phone }}</span>
                      </div>
                    }
                    @if (customer.dni) {
                      <div class="flex items-center">
                        <i class="fas fa-id-card w-4 mr-2"></i>
                        <span class="data-protected">{{ customer.dni }}</span>
                      </div>
                    }
                    <div class="flex items-center text-xs">
                      <i class="fas fa-calendar w-4 mr-2"></i>
                      <span>Creado: {{ formatDate(customer.created_at) }}</span>
                      @if (customer.last_accessed_at) {
                        <span class="ml-3">
                          <i class="fas fa-eye w-4 mr-1"></i>
                          Último acceso: {{ formatDate(customer.last_accessed_at) }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
                
                <div class="customer-actions flex space-x-2">
                  <button
                    (click)="viewCustomerGdprInfo(customer)"
                    class="btn btn-sm btn-outline"
                    title="Ver información RGPD"
                  >
                    <i class="fas fa-shield-alt"></i>
                  </button>
                  
                  <button
                    (click)="editCustomer(customer)"
                    class="btn btn-sm btn-primary"
                    title="Editar cliente"
                  >
                    <i class="fas fa-edit"></i>
                  </button>
                  
                  <div class="dropdown">
                    <button class="btn btn-sm btn-outline dropdown-toggle" title="Más acciones">
                      <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="dropdown-menu">
                      <button (click)="exportCustomerData(customer)" class="dropdown-item">
                        <i class="fas fa-download mr-2"></i>Exportar Datos
                      </button>
                      <button (click)="manageConsent(customer)" class="dropdown-item">
                        <i class="fas fa-handshake mr-2"></i>Gestionar Consentimiento
                      </button>
                      <button (click)="createAccessRequest(customer)" class="dropdown-item">
                        <i class="fas fa-file-alt mr-2"></i>Solicitud RGPD
                      </button>
                      <div class="dropdown-divider"></div>
                      <button 
                        (click)="confirmAnonymizeCustomer(customer)" 
                        class="dropdown-item text-red-600 hover:bg-red-50"
                      >
                        <i class="fas fa-user-slash mr-2"></i>Anonimizar Datos
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Audit Log Panel -->
      @if (showAuditLog) {
        <div class="audit-log bg-white border rounded-lg p-4 mt-6">
          <div class="audit-header flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold text-gray-900">
              <i class="fas fa-history mr-2"></i>
              Registro de Auditoría RGPD
            </h3>
            <div class="audit-filters flex space-x-2">
              <select [(ngModel)]="auditFilters.actionType" (ngModelChange)="loadAuditLog()" class="form-select">
                <option value="">Todas las acciones</option>
                <option value="create">Crear</option>
                <option value="read">Leer</option>
                <option value="update">Actualizar</option>
                <option value="delete">Eliminar</option>
                <option value="export">Exportar</option>
                <option value="anonymize">Anonimizar</option>
              </select>
              <input
                type="date"
                [(ngModel)]="auditFilters.fromDate"
                (ngModelChange)="loadAuditLog()"
                class="form-input"
              >
            </div>
          </div>
          
          @if (auditEntries() && auditEntries().length > 0) {
            <div class="audit-entries space-y-2">
              @for (entry of auditEntries(); track entry.id) {
                <div class="audit-entry bg-gray-50 border border-gray-200 rounded p-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                      <div class="action-icon">
                        @switch (entry.action_type) {
                          @case ('create') {
                            <i class="fas fa-plus text-green-600"></i>
                          }
                          @case ('read') {
                            <i class="fas fa-eye text-blue-600"></i>
                          }
                          @case ('update') {
                            <i class="fas fa-edit text-yellow-600"></i>
                          }
                          @case ('delete') {
                            <i class="fas fa-trash text-red-600"></i>
                          }
                          @case ('export') {
                            <i class="fas fa-download text-purple-600"></i>
                          }
                          @case ('anonymize') {
                            <i class="fas fa-user-slash text-orange-600"></i>
                          }
                          @default {
                            <i class="fas fa-info text-gray-600"></i>
                          }
                        }
                      </div>
                      <div>
                        <div class="font-medium">{{ entry.action_type.toUpperCase() }} - {{ entry.table_name }}</div>
                        @if (entry.subject_email) {
                          <div class="text-sm text-gray-600">Sujeto: {{ entry.subject_email }}</div>
                        }
                        @if (entry.purpose) {
                          <div class="text-sm text-gray-600">Propósito: {{ entry.purpose }}</div>
                        }
                      </div>
                    </div>
                    <div class="text-sm text-gray-500">
                      {{ formatDate(entry.created_at) }}
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <div class="text-center py-8 text-gray-500">
              <i class="fas fa-history text-4xl mb-2"></i>
              <p>No hay entradas de auditoría disponibles</p>
            </div>
          }
        </div>
      }
    </div>

    <!-- Access Request Modal -->
    @if (showAccessRequestForm) {
      <div class="modal-overlay" (click)="showAccessRequestForm = false">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Nueva Solicitud de Derechos RGPD</h2>
            <button (click)="showAccessRequestForm = false" class="modal-close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          
          <div class="modal-body">
            <form [formGroup]="accessRequestForm" (ngSubmit)="submitAccessRequest()">
              <div class="form-group">
                <label for="requestType" class="form-label required">Tipo de Solicitud</label>
                <select formControlName="requestType" class="form-select">
                  <option value="access">Acceso a datos (Art. 15)</option>
                  <option value="rectification">Rectificación (Art. 16)</option>
                  <option value="erasure">Supresión/Olvido (Art. 17)</option>
                  <option value="portability">Portabilidad (Art. 20)</option>
                  <option value="restriction">Limitación del tratamiento (Art. 18)</option>
                  <option value="objection">Oposición (Art. 21)</option>
                </select>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="subjectEmail" class="form-label required">Email del Interesado</label>
                  <input type="email" formControlName="subjectEmail" class="form-input">
                </div>
                <div class="form-group">
                  <label for="subjectName" class="form-label">Nombre del Interesado</label>
                  <input type="text" formControlName="subjectName" class="form-input">
                </div>
              </div>
              
              <div class="form-group">
                <label for="subjectIdentifier" class="form-label">DNI/Identificador</label>
                <input type="text" formControlName="subjectIdentifier" class="form-input">
              </div>
              
              <div class="form-group">
                <label for="requestDetails" class="form-label">Detalles de la Solicitud</label>
                <textarea formControlName="requestDetails" rows="3" class="form-textarea"></textarea>
              </div>
              
              <div class="modal-actions">
                <button type="button" (click)="showAccessRequestForm = false" class="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" class="btn btn-primary" [disabled]="!accessRequestForm.valid || isLoading()">
                  <i class="fas fa-paper-plane mr-2"></i>
                  Crear Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }
  `,
  styleUrls: ['./gdpr-customer-manager.component.scss']
})
export class GdprCustomerManagerComponent implements OnInit {
  // Services
  private customersService = inject(SupabaseCustomersService);
  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);

  // State signals
  customers = signal<Customer[]>([]);
  complianceStats = signal<any>(null);
  auditEntries = signal<any[]>([]);
  isLoading = signal(false);

  // UI state
  searchTerm = signal('');
  showAuditLog = false;
  showAccessRequestForm = false;
  showConsentForm = false;

  // Forms
  accessRequestForm: FormGroup;

  // Filters
  auditFilters = {
    actionType: '',
    fromDate: '',
    tableName: 'clients'
  };

  constructor() {
    this.accessRequestForm = this.fb.group({
      requestType: ['access', Validators.required],
      subjectEmail: ['', [Validators.required, Validators.email]],
      subjectName: [''],
      subjectIdentifier: [''],
      requestDetails: ['']
    });
  }

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loadCustomers();
    this.loadComplianceStats();
    this.loadAuditLog();
  }

  private loadCustomers() {
    this.customersService.getCustomers().subscribe({
      next: (customers) => {
        this.customers.set(customers);
        // Log access for audit purposes
        this.gdprService['logGdprEvent']('read', 'clients', undefined, undefined, 'customer_list_access');
      },
      error: (error) => {
        console.error('Error loading customers:', error);
        this.toastService.error('Error', 'No se pudieron cargar los clientes');
      }
    });
  }

  private loadComplianceStats() {
    this.gdprService.getComplianceDashboard().subscribe({
      next: (stats) => {
        this.complianceStats.set(stats);
      },
      error: (error) => {
        console.error('Error loading compliance stats:', error);
      }
    });
  }

  loadAuditLog() {
    const filters = {
      ...this.auditFilters,
      limit: 50
    };

    this.gdprService.getAuditLog(filters).subscribe({
      next: (entries) => {
        this.auditEntries.set(entries);
      },
      error: (error) => {
        console.error('Error loading audit log:', error);
      }
    });
  }

  onSearchChange(term: string) {
    this.searchTerm.set(term);
    // Log search for audit
    if (term.length > 2) {
      this.gdprService['logGdprEvent']('read', 'clients', undefined, undefined, `customer_search: ${term}`);
    }
    this.loadCustomers();
  }

  clearSearch() {
    this.searchTerm.set('');
    this.loadCustomers();
  }

  // GDPR Actions
  submitAccessRequest() {
    if (!this.accessRequestForm.valid) return;

    this.isLoading.set(true);
    const formValue = this.accessRequestForm.value;

    this.gdprService.createAccessRequest(formValue).subscribe({
      next: (request) => {
        this.toastService.success('Éxito', 'Solicitud RGPD creada correctamente');
        this.showAccessRequestForm = false;
        this.accessRequestForm.reset();
        this.loadComplianceStats();
      },
      error: (error) => {
        console.error('Error creating access request:', error);
        this.toastService.error('Error', 'No se pudo crear la solicitud');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  exportCustomerData(customer: Customer) {
    this.isLoading.set(true);
    this.gdprService.exportClientData(customer.email).subscribe({
      next: (data) => {
        // Create and download file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cliente-${customer.name}-${customer.apellidos}-datos.json`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        this.toastService.success('Éxito', 'Datos del cliente exportados');
      },
      error: (error) => {
        console.error('Error exporting customer data:', error);
        this.toastService.error('Error', 'No se pudieron exportar los datos');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  confirmAnonymizeCustomer(customer: Customer) {
    const confirmed = confirm(
      `¿Estás seguro de que quieres anonimizar los datos de ${customer.name} ${customer.apellidos}?\n\n` +
      'Esta acción es irreversible y cumple con el derecho al olvido del RGPD.'
    );

    if (confirmed) {
      this.anonymizeCustomer(customer);
    }
  }

  private anonymizeCustomer(customer: Customer) {
    this.isLoading.set(true);
    this.gdprService.anonymizeClientData(customer.id, 'user_requested_anonymization').subscribe({
      next: (result) => {
        if (result.success) {
          this.toastService.success('Éxito', 'Cliente anonimizado correctamente');
          this.loadCustomers();
        } else {
          this.toastService.error('Error', result.error || 'Error en la anonimización');
        }
      },
      error: (error) => {
        console.error('Error anonymizing customer:', error);
        this.toastService.error('Error', 'No se pudo anonimizar el cliente');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  manageConsent(customer: Customer) {
    // Implementation for consent management modal
    this.toastService.info('Funcionalidad', 'Gestión de consentimientos próximamente');
  }

  createAccessRequest(customer: Customer) {
    this.accessRequestForm.patchValue({
      subjectEmail: customer.email,
      subjectName: `${customer.name} ${customer.apellidos}`,
      subjectIdentifier: customer.dni
    });
    this.showAccessRequestForm = true;
  }

  viewCustomerGdprInfo(customer: Customer) {
    // Implementation for GDPR info modal
    this.toastService.info('Funcionalidad', 'Vista detallada de RGPD próximamente');
  }

  editCustomer(customer: Customer) {
    // Implementation for customer editing
    this.toastService.info('Funcionalidad', 'Edición de cliente próximamente');
  }

  exportComplianceReport() {
    this.isLoading.set(true);
    
    // Generate compliance report
    const report = {
      generated_at: new Date().toISOString(),
      company_id: 'current_company', // Get from auth service
      compliance_stats: this.complianceStats(),
      total_customers: this.customers().length,
      customers_with_consent: this.customers().filter(c => this.getCustomerGdprStatus(c)?.hasValidConsent).length,
      recent_audit_entries: this.auditEntries().slice(0, 20)
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-cumplimiento-rgpd-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);

    this.toastService.success('Éxito', 'Informe de cumplimiento exportado');
    this.isLoading.set(false);
  }

  // Utility methods
  getCustomerGdprStatus(customer: Customer): any {
    // This would be enhanced with real GDPR status checking
    return {
      hasValidConsent: customer.marketing_consent || false,
      hasActiveRequests: false, // Check from access requests
      dataRetentionValid: true,
      lastAccessDate: customer.last_accessed_at
    };
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
