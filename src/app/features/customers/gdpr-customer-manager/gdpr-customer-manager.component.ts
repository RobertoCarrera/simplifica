import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Customer, CreateCustomerDev } from '../../../models/customer';
import { SupabaseCustomersService, CustomerFilters, CustomerStats } from '../../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { Router, ActivatedRoute } from '@angular/router';
import { AddressesService } from '../../../services/addresses.service';
import { GdprAuditListComponent } from '../gdpr-audit-list/gdpr-audit-list.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { FormNewCustomerComponent } from '../form-new-customer/form-new-customer.component';
import { AuthService } from '../../../services/auth.service';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';

@Component({
  selector: 'app-gdpr-customer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GdprAuditListComponent, SkeletonLoaderComponent, FormNewCustomerComponent],
  templateUrl: './gdpr-customer-manager.component.html',
  styleUrls: ['./gdpr-customer-manager.component.scss']
})
export class GdprCustomerManagerComponent implements OnInit {
  // Services
  private customersService = inject(SupabaseCustomersService);
  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private fb = inject(FormBuilder);
  private devRoleService = inject(DevRoleService);
  private addressesService = inject(AddressesService);
  public auth = inject(AuthService);

  // Utilities for template
  protected Math = Math;


  // State signals
  customers = signal<Customer[]>([]);
  stats = signal<CustomerStats | null>(null);
  complianceStats = signal<any>(null);
  auditEntries = signal<any[]>([]);
  isLoading = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  searchTerm = signal('');
  showDeleted = signal(false);
  sortOrder = signal<'asc' | 'desc'>('asc'); // Sort order

  selectedRequest = signal<GdprAccessRequest | null>(null);
  showRequestDetailModal = false;

  // Auto-Apply Confirmation Modal State
  showAutoApplyModal = false;
  autoApplyTargetRequest = signal<GdprAccessRequest | null>(null);
  autoApplyChangesList: { field: string, newValue: string }[] = [];

  // Form properties
  showCustomerForm = false;
  selectedCustomerForEdit = signal<Customer | null>(null);

  showAccessRequestForm = false;
  accessRequestForm: FormGroup;

  // Anonymization Modal State
  showAnonymizeModal = false;
  anonymizeTarget = signal<Customer | null>(null);
  anonymizeConfirmationInput = '';
  anonymizeError = '';

  // Bulk Anonymization State
  showBulkAnonymizeModal = false;
  bulkAnonymizeConfirmationInput = '';
  bulkAnonymizeError = '';
  isBulkProcessing = false;
  bulkProgress = { current: 0, total: 0, failed: 0 };

  // Computed properties
  filteredCustomers = computed(() => {
    let customers = this.customers();
    const search = this.searchTerm().toLowerCase();
    // const incompleteOnly = this.showIncompleteOnly(); // Removed

    // 1. Filter by Search
    if (search) {
      customers = customers.filter(customer =>
        customer.name?.toLowerCase().includes(search) ||
        customer.apellidos?.toLowerCase().includes(search) ||
        customer.email?.toLowerCase().includes(search) ||
        customer.phone?.includes(search) ||
        customer.dni?.toLowerCase().includes(search)
      );
    }

    // 2. Sort Logic: Incomplete First > Name Alpha
    const order = this.sortOrder();
    customers.sort((a, b) => {
      // Primary: Incomplete Status (Not compliant) first
      const aIncomplete = this.getGdprComplianceStatus(a) !== 'compliant';
      const bIncomplete = this.getGdprComplianceStatus(b) !== 'compliant';

      if (aIncomplete && !bIncomplete) return -1;
      if (!aIncomplete && bIncomplete) return 1;

      // Secondary: Name Alphabetical
      const nameA = a.name?.toLowerCase() || '';
      const nameB = b.name?.toLowerCase() || '';
      return order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

    return customers;
  });

  customersWithConsent = computed(() =>
    this.customers().filter(customer => customer.marketing_consent)
  );

  customersWithoutConsent = computed(() =>
    this.customers().filter(customer => !customer.marketing_consent)
  );

  compliancePercentage = computed(() => {
    const total = this.customers().length;
    const withConsent = this.customersWithConsent().length;
    return total > 0 ? Math.round((withConsent / total) * 100) : 0;
  });

  inactiveCustomers = computed(() => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    return this.customers().filter(customer => {
      // 1. Must be created at least 6 months ago to be considered (grace period)
      if (!customer.created_at) return false;
      const createdAt = new Date(customer.created_at);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      if (createdAt > sixMonthsAgo) return false;

      // 2. If valid candidate, check access
      // If customer has never accessed
      if (!customer.last_accessed_at) {
        return true;
      }

      const lastAccess = new Date(customer.last_accessed_at);
      return lastAccess < twoYearsAgo;
    });
  });

  constructor() {
    this.accessRequestForm = this.fb.group({
      subjectEmail: ['', [Validators.required, Validators.email]],
      subjectName: [''],
      subjectIdentifier: [''],
      requestType: ['', Validators.required],
      description: ['']
    });
  }

  // Pagination State
  currentPage = signal(1);
  pageSize = signal(5);

  totalPages = computed(() => {
    return Math.ceil(this.filteredCustomers().length / this.pageSize());
  });

  paginatedCustomers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredCustomers().slice(start, end);
  });

  // Services
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificationsService = inject(SupabaseNotificationsService);  // Injected here

  backToCustomers() {
    try {
      this.router.navigate(['/clientes']);
    } catch (e) {
      console.error('Navigation back to customers failed', e);
    }
  }

  // Pagination Methods
  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }


  accessRequests = signal<GdprAccessRequest[]>([]);

  ngOnInit() {
    this.loadCustomers();
    this.loadComplianceStats();
    this.loadAuditEntries();
    this.loadAccessRequests();

    // Listen for query params to open request detail
    this.route.queryParams.subscribe(params => {
      const requestId = params['requestId'];
      if (requestId && this.accessRequests().length > 0) {
        const req = this.accessRequests().find(r => r.id === requestId);
        if (req) this.viewRequestDetail(req);
      }
    });
  }

  toggleShowDeleted() {
    this.showDeleted.set(!this.showDeleted());
    this.loadCustomers();
  }

  private loadCustomers() {
    this.isLoading.set(true);

    // Subscribe to stats
    this.customersService.getCustomerStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => console.error('Error loading stats:', error)
    });

    this.customersService.getCustomers({ showDeleted: this.showDeleted() }).subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.isLoading.set(false);
      },
      error: (error: any) => {
        console.error('Error loading customers:', error);
        this.isLoading.set(false);
        this.toastService.error('Error', 'No se pudieron cargar los clientes');
      }
    });
  }

  private loadComplianceStats() {
    this.gdprService.getComplianceDashboard().subscribe({
      next: (stats: any) => this.complianceStats.set(stats),
      error: (error: any) => console.error('Error loading compliance stats:', error)
    });
  }

  private loadAuditEntries() {
    this.gdprService.getAuditLog({ limit: 10 }).subscribe({
      next: (entries: any[]) => this.auditEntries.set(entries),
      error: (error: any) => console.error('Error loading audit entries:', error)
    });
  }

  private loadAccessRequests() {
    this.gdprService.getAccessRequests().subscribe({
      next: (requests: GdprAccessRequest[]) => {
        this.accessRequests.set(requests);
        // Check for deep link
        const requestId = this.route.snapshot.queryParams['requestId'];
        if (requestId) {
          const req = requests.find(r => r.id === requestId);
          if (req) this.viewRequestDetail(req);
        }
      },
      error: (error: any) => console.error('Error loading access requests:', error)
    });
  }

  clearSearch() {
    this.searchTerm.set('');
    this.loadCustomers();
  }



  deleteCustomer(customer: Customer) {
    const msg = `¿Proceder con la eliminación de ${customer.name} ${customer.apellidos}?\n\n` +
      `• Con facturas: se desactiva y se conserva para cumplimiento fiscal.\n` +
      `• Sin facturas: se elimina definitivamente (lead).`;
    if (!confirm(msg)) return;

    this.customersService.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.toastService.success('Éxito', 'Operación completada (eliminado o desactivado)');
        this.loadCustomers();
      },
      error: (error: any) => {
        console.error('Error remove/deactivate:', error);
        this.toastService.error('Error', 'No se pudo completar la operación');
      }
    });
  }

  markRequestCompleted(request: GdprAccessRequest) {
    // Native confirm removed as per user request (handled by custom modal earlier or implicit action)

    this.gdprService.updateAccessRequestStatus(request.id!, 'completed').subscribe({
      next: (updatedReq) => {
        this.toastService.success('Éxito', 'Solicitud marcada como completada');

        // Notify user if possible
        const customer = this.customers().find(c => c.email === request.subject_email);
        if (customer && customer.usuario_id) {
          this.notificationsService.sendNotification(
            customer.usuario_id,
            'Solicitud RGPD Completada',
            `Su solicitud de ${request.request_type} ha sido procesada y completada.`,
            'success',
            request.id
          );
        }

        this.closeRequestDetailModal();
        this.loadAccessRequests();
        this.loadComplianceStats();
      },
      error: (err) => this.toastService.error('Error', 'No se pudo actualizar la solicitud')
    });
  }

  // Import/Export functionality
  exportCustomers() {
    const filters: CustomerFilters = {
      search: this.searchTerm()
    };

    this.customersService.exportToCSV(filters).subscribe({
      next: (csvData) => {
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clientes-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);

        this.toastService.success('Éxito', 'Clientes exportados correctamente');
      },
      error: (error: any) => {
        console.error('Error exporting customers:', error);
        this.toastService.error('Error', 'No se pudieron exportar los clientes');
      }
    });
  }

  importCustomers(event: any) {
    const file = event.target.files[0];

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.toastService.error('Error', 'Por favor selecciona un archivo CSV válido');
      return;
    }

    this.toastService.info('Procesando...', 'Importando clientes desde CSV');

    this.customersService.importFromCSV(file).subscribe({
      next: (result: any) => {
        const importedCount = Array.isArray(result) ? result.length : 0;
        this.toastService.success('Éxito', `${importedCount} clientes importados correctamente`);
        this.loadCustomers();
        // Reset file input
        event.target.value = '';
      },
      error: (error: any) => {
        console.error('Error importing customers:', error);
        this.toastService.error('Error', 'No se pudieron importar los clientes');
        event.target.value = '';
      }
    });
  }

  showImportInfo(event: Event) {
    event.stopPropagation();
    const infoMessage = `
      El archivo CSV debe tener las siguientes columnas:
      - name (obligatorio)
      - apellidos (obligatorio)  
      - email (obligatorio)
      - phone (opcional)
      - dni (opcional)
      - address (opcional)
    `;
    this.toastService.info('CSV requerido', infoMessage, 6000);
  }

  // GDPR specific methods
  sendConsentRequest(customer: Customer) {
    if (!customer.email) {
      this.toastService.error('Error', 'El cliente debe tener un email para solicitar consentimiento');
      return;
    }

    this.gdprService.createConsentRequest(customer.id, customer.email, ['data_processing', 'marketing', 'analytics'], 'Gestión de consentimiento')
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

  getGdprComplianceStatus(customer: Customer): string {
    // If they have the mandatory consent (data_processing), they are compliant for service provision.
    if (customer.data_processing_consent) {
      return 'compliant';
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
      case 'compliant': return 'Cumple';
      case 'partial': return 'Parcial';
      case 'pending': return 'Pendiente';
      default: return 'Desconocido';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
      error: (error: any) => {
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
      error: (error: any) => {
        console.error('Error exporting customer data:', error);
        this.toastService.error('Error', 'No se pudieron exportar los datos');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  confirmAnonymizeCustomer(customer: Customer) {
    this.anonymizeTarget.set(customer);
    this.anonymizeConfirmationInput = '';
    this.anonymizeError = '';
    this.showAnonymizeModal = true;
  }

  closeAnonymizeModal() {
    this.showAnonymizeModal = false;
    this.anonymizeTarget.set(null);
    this.anonymizeConfirmationInput = '';
    this.anonymizeError = '';
  }

  processAnonymization() {
    if (this.anonymizeConfirmationInput !== 'BORRAR') {
      this.anonymizeError = 'Debes escribir "BORRAR" para confirmar.';
      return;
    }

    const target = this.anonymizeTarget();
    if (target) {
      this.anonymizeCustomer(target);
      this.closeAnonymizeModal();
    }
  }

  private anonymizeCustomer(customer: Customer) {
    this.isLoading.set(true);
    this.gdprService.anonymizeClientData(customer.id, 'user_requested_anonymization').subscribe({
      next: (result: any) => {
        if (result.success) {
          this.toastService.success('Éxito', 'Cliente anonimizado correctamente');
          this.loadCustomers();
        } else {
          this.toastService.error('Error', result.error || 'Error en la anonimización');
        }
      },
      error: (error: any) => {
        console.error('Error anonymizing customer:', error);
        this.toastService.error('Error', 'No se pudo anonimizar el cliente');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  // Bulk Anonymization Logic
  openBulkAnonymizeModal() {
    if (this.inactiveCustomers().length === 0) {
      this.toastService.info('Info', 'No hay clientes inactivos para anonimizar');
      return;
    }
    this.showBulkAnonymizeModal = true;
    this.bulkAnonymizeConfirmationInput = '';
    this.bulkAnonymizeError = '';
  }

  closeBulkAnonymizeModal() {
    if (this.isBulkProcessing) return; // Prevent closing while processing
    this.showBulkAnonymizeModal = false;
    this.bulkAnonymizeConfirmationInput = '';
    this.bulkAnonymizeError = '';
  }

  async processBulkAnonymization() {
    if (this.bulkAnonymizeConfirmationInput !== 'ANONIMIZAR TODO') {
      this.bulkAnonymizeError = 'Debes escribir "ANONIMIZAR TODO" para confirmar.';
      return;
    }

    this.isBulkProcessing = true;
    const targets = this.inactiveCustomers();
    this.bulkProgress = { current: 0, total: targets.length, failed: 0 };

    // Process sequentially to avoid overwhelming the server
    for (const customer of targets) {
      try {
        await this.anonymizeCustomerPromise(customer);
      } catch (err) {
        console.error(`Failed to anonymize ${customer.id}`, err);
        this.bulkProgress.failed++;
      }
      this.bulkProgress.current++;
    }

    this.isBulkProcessing = false;
    this.closeBulkAnonymizeModal();
    this.loadCustomers();

    if (this.bulkProgress.failed > 0) {
      this.toastService.warning('Proceso Completado', `Se anonimizaron ${this.bulkProgress.total - this.bulkProgress.failed} clientes. Fallaron ${this.bulkProgress.failed}.`);
    } else {
      this.toastService.success('Éxito', `Se anonimizaron todos los ${this.bulkProgress.total} clientes inactivos.`);
    }
  }

  // Promise wrapper for GdprService.anonymizeClientData to use in async/await loop
  private anonymizeCustomerPromise(customer: Customer): Promise<any> {
    return new Promise((resolve, reject) => {
      this.gdprService.anonymizeClientData(customer.id, 'bulk_inactivity_cleanup').subscribe({
        next: (res) => {
          if (res.success) resolve(res);
          else reject(res.error);
        },
        error: (err) => reject(err)
      });
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

  viewRequestDetail(request: GdprAccessRequest) {
    this.selectedRequest.set(request);
    this.showRequestDetailModal = true;
  }




  editCustomer(customer: Customer) {
    this.selectedCustomerForEdit.set(customer);
    this.showCustomerForm = true;
  }

  closeCustomerForm() {
    this.showCustomerForm = false;
    this.selectedCustomerForEdit.set(null);
  }

  onCustomerSaved() {
    this.closeCustomerForm();
    this.loadCustomers();
  }

  handleRestriction(request: GdprAccessRequest) {
    const customer = this.customers().find(c => c.email === request.subject_email);
    if (!customer) {
      this.toastService.error('Error', 'No se encontró el cliente.');
      return;
    }

    if (confirm(`¿Estás seguro de RESTRINGIR (Desactivar) el tratamiento para ${customer.name}? Esto bloqueará su acceso y detendrá el procesamiento.`)) {
      this.customersService.deleteCustomer(customer.id).subscribe({
        next: () => {
          this.toastService.success('Éxito', 'Tratamiento restringido (Cliente desactivado).');
          this.closeRequestDetailModal();
          this.loadCustomers();
        },
        error: (err) => this.toastService.error('Error', 'No se pudo restringir el cliente.')
      });
    }
  }

  parseRectificationRequests(description: string): Partial<Customer> {
    const updates: Partial<Customer> = {};
    const lines = description.split('\n');

    lines.forEach(line => {
      // Expected format: "- DNI / NIF: Valor actual "old" => Nuevo valor "new""
      // Regex to capture: Field Name, Old Value (ignored), New Value
      // Adjusted regex to match the exact format produced by GdprRequestModalComponent
      // "- Campo: Valor actual 'X' => Nuevo valor 'Y'"
      const match = line.match(/- (.*?): Valor actual ".*?" => Nuevo valor "(.*?)"/);

      if (match && match[2]) {
        const fieldLabel = match[1].trim();
        const newValue = match[2].trim();

        switch (fieldLabel) {
          case 'Nombre Completo':
            // Try to split name/surname if possible, otherwise put all in name
            const parts = newValue.split(' ');
            if (parts.length > 1) {
              updates.name = parts[0];
              updates.apellidos = parts.slice(1).join(' ');
            } else {
              updates.name = newValue;
            }
            break;
          case 'Email':
            updates.email = newValue;
            break;
          case 'Teléfono':
            updates.phone = newValue;
            break;
          case 'DNI / NIF':
            updates.dni = newValue;
            break;
          case 'Dirección':
            updates.address = newValue;
            break;
        }
      }
    });

    return updates;
  }



  toggleSort() {
    this.sortOrder.update(o => o === 'asc' ? 'desc' : 'asc');
  }

  // toggleIncompleteFilter removed

  // New Auto-Apply Logic with Custom Modal
  openAutoApplyModal(request: GdprAccessRequest) {
    if (!request.request_details?.description) {
      this.toastService.error('Error', 'La solicitud no tiene detalles para procesar.');
      return;
    }

    const updates = this.parseRectificationRequests(request.request_details.description);
    if (Object.keys(updates).length === 0) {
      this.toastService?.warning('Aviso', 'No se detectaron cambios procesables.');
      return;
    }

    const fieldMap: Record<string, string> = {
      'name': 'Nombre',
      'apellidos': 'Apellidos',
      'email': 'Email',
      'phone': 'Teléfono',
      'dni': 'DNI / NIF',
      'address': 'Dirección'
    };

    this.autoApplyChangesList = Object.entries(updates).map(([k, v]) => ({
      field: fieldMap[k] || k,
      newValue: String(v)
    }));

    this.autoApplyTargetRequest.set(request);
    this.showAutoApplyModal = true;
  }

  closeAutoApplyModal() {
    this.showAutoApplyModal = false;
    this.autoApplyTargetRequest.set(null);
    this.autoApplyChangesList = [];
  }

  confirmAutoApply() {
    const request = this.autoApplyTargetRequest();
    if (!request) return;

    const customer = this.customers().find(c => c.email === request.subject_email);
    if (!customer) {
      this.toastService.error('Error', 'No se encontró el cliente asociado.');
      this.closeAutoApplyModal();
      return;
    }

    const updates = this.parseRectificationRequests(request.request_details?.description || '');

    this.isLoading.set(true);
    this.customersService.updateCustomer(customer.id, updates).subscribe({
      next: () => {
        this.toastService.success('Éxito', 'Datos actualizados correctamente.');
        this.markRequestCompleted(request);
        this.closeAutoApplyModal();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error updating customer:', err);
        this.toastService.error('Error', 'Fallo al actualizar los datos.');
        this.isLoading.set(false);
        this.closeAutoApplyModal();
      }
    });
  }

  // Legacy method replaced by openAutoApplyModal, sticking to name to avoid template errors initially, 
  // but better to rename in template to openAutoApplyModal
  applyRectification(request: GdprAccessRequest) {
    this.openAutoApplyModal(request);
  }

  isRectificationCompleted(request: GdprAccessRequest): boolean {
    if (request.request_type !== 'rectification') return true; // Only strict for rectification
    if (!request.request_details?.description) return false;

    const customer = this.customers().find(c => c.email === request.subject_email);
    if (!customer) return false;

    const updates = this.parseRectificationRequests(request.request_details.description);
    if (Object.keys(updates).length === 0) return true; // Nothing to update?

    // Check if ALL updates match the current customer data
    for (const [key, value] of Object.entries(updates)) {
      // Loose comparison for strings/numbers
      const currentVal = (customer as any)[key];
      // Normalize for comparison (trim strings)
      const v1 = String(currentVal || '').trim();
      const v2 = String(value || '').trim();

      if (v1 !== v2) {
        return false;
      }
    }

    return true;
  }

  handleRequestAction(request: GdprAccessRequest) {
    if (request.request_type === 'rectification') {
      // Manual Edit Fallback
      const customer = this.customers().find(c => c.email === request.subject_email);
      if (customer) {
        this.closeRequestDetailModal();
        this.editCustomer(customer);
      } else {
        this.toastService.error('Error', 'No se encontró un cliente con este email.');
      }
    } else if (request.request_type === 'restriction') {
      this.handleRestriction(request);
    }
  }

  closeRequestDetailModal() {
    this.showRequestDetailModal = false;
    this.selectedRequest.set(null);
    // Optional: Clear query param
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { requestId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }
}
