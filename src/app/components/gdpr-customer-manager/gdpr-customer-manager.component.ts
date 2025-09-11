import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Customer, CreateCustomerDev } from '../../models/customer';
import { SupabaseCustomersService, CustomerFilters, CustomerStats } from '../../services/supabase-customers.service';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../services/gdpr-compliance.service';
import { ToastService } from '../../services/toast.service';
import { DevRoleService } from '../../services/dev-role.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-gdpr-customer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
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

  // State signals
  customers = signal<Customer[]>([]);
  stats = signal<CustomerStats | null>(null);
  complianceStats = signal<any>(null);
  auditEntries = signal<any[]>([]);
  isLoading = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  searchTerm = signal('');

  // Form properties
  showCustomerForm = false;
  showAccessRequestForm = false;
  accessRequestForm: FormGroup;
  customerForm = {
    name: '',
    apellidos: '',
    email: '',
    phone: '',
    dni: '',
    address: ''
  };

  // Computed properties
  filteredCustomers = computed(() => {
    const customers = this.customers();
    const search = this.searchTerm().toLowerCase();
    
    if (!search) return customers;
    
    return customers.filter(customer => 
      customer.name?.toLowerCase().includes(search) ||
      customer.apellidos?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search) ||
      customer.phone?.includes(search) ||
      customer.dni?.toLowerCase().includes(search)
    );
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

  constructor() {
    this.accessRequestForm = this.fb.group({
      subjectEmail: ['', [Validators.required, Validators.email]],
      subjectName: [''],
      subjectIdentifier: [''],
      requestType: ['', Validators.required],
      description: ['']
    });
  }

  // Router injection for navigation back to customers list
  private router = inject(Router);

  backToCustomers() {
    try {
      this.router.navigate(['/clientes']);
    } catch (e) {
      console.error('Navigation back to customers failed', e);
    }
  }

  ngOnInit() {
    this.loadCustomers();
    this.loadComplianceStats();
    this.loadAuditEntries();
  }

  private loadCustomers() {
    this.isLoading.set(true);
    
    // Subscribe to stats
    this.customersService.getCustomerStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: (error) => console.error('Error loading stats:', error)
    });

    this.customersService.getCustomers().subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.isLoading.set(false);
      },
      error: (error) => {
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

  clearSearch() {
    this.searchTerm.set('');
    this.loadCustomers();
  }

  // Customer CRUD Operations
  addCustomer() {
    this.selectedCustomer.set(null);
    this.resetForm();
    this.showCustomerForm = true;
  }

  editCustomer(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.populateForm(customer);
    this.showCustomerForm = true;
  }

  private resetForm() {
    this.customerForm = {
      name: '',
      apellidos: '',
      email: '',
      phone: '',
      dni: '',
      address: ''
    };
  }

  private populateForm(customer: Customer) {
    this.customerForm = {
      name: customer.name || '',
      apellidos: customer.apellidos || '',
      email: customer.email || '',
      phone: customer.phone || '',
      dni: customer.dni || '',
      address: customer.address || ''
    };
  }

  saveCustomer() {
    if (!this.isFormValid()) {
      this.toastService.error('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    this.isLoading.set(true);

    if (this.selectedCustomer()) {
      // Update existing customer
      this.updateCustomer();
    } else {
      // Create new customer
      this.createCustomer();
    }
  }

  private isFormValid(): boolean {
    return !!(this.customerForm.name && this.customerForm.apellidos && this.customerForm.email);
  }

  private createCustomer() {
    const customerData: CreateCustomerDev = {
      name: this.customerForm.name,
      apellidos: this.customerForm.apellidos,
      email: this.customerForm.email,
      phone: this.customerForm.phone,
      dni: this.customerForm.dni,
      address: this.customerForm.address,
      activo: true,
      usuario_id: ''
    };

    this.customersService.createCustomer(customerData).subscribe({
      next: (customer) => {
        this.toastService.success('Éxito', 'Cliente creado correctamente');
        this.closeForm();
        this.loadCustomers();
      },
      error: (error) => {
        console.error('Error creating customer:', error);
        this.toastService.error('Error', 'No se pudo crear el cliente');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  private updateCustomer() {
    const selectedCustomer = this.selectedCustomer();
    if (!selectedCustomer) return;

    const updates = {
      name: this.customerForm.name,
      apellidos: this.customerForm.apellidos,
      email: this.customerForm.email,
      phone: this.customerForm.phone,
      dni: this.customerForm.dni,
      address: this.customerForm.address
    };

    this.customersService.updateCustomer(selectedCustomer.id, updates).subscribe({
      next: (customer) => {
        this.toastService.success('Éxito', 'Cliente actualizado correctamente');
        this.closeForm();
        this.loadCustomers();
      },
      error: (error) => {
        console.error('Error updating customer:', error);
        this.toastService.error('Error', 'No se pudo actualizar el cliente');
      },
      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  closeForm() {
    this.showCustomerForm = false;
    this.selectedCustomer.set(null);
    this.resetForm();
  }

  deleteCustomer(customer: Customer) {
    if (!confirm(`¿Estás seguro de que quieres eliminar a ${customer.name} ${customer.apellidos}?`)) {
      return;
    }

    this.customersService.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.toastService.success('Éxito', 'Cliente eliminado correctamente');
        this.loadCustomers();
      },
      error: (error) => {
        console.error('Error deleting customer:', error);
        this.toastService.error('Error', 'No se pudo eliminar el cliente');
      }
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
      error: (error) => {
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
      next: (result) => {
        const importedCount = Array.isArray(result) ? result.length : 0;
        this.toastService.success('Éxito', `${importedCount} clientes importados correctamente`);
        this.loadCustomers();
        // Reset file input
        event.target.value = '';
      },
      error: (error) => {
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

  getGdprComplianceStatus(customer: Customer): string {
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
      case 'compliant': return 'Cumple RGPD';
      case 'partial': return 'Parcial';
      case 'pending': return 'Pendiente consentimiento';
      default: return 'Estado desconocido';
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
}
