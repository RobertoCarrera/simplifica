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
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GdprAuditListComponent, FormNewCustomerComponent],
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
  isLoading = signal(false);

  selectedCustomer = signal<Customer | null>(null);
  searchTerm = signal('');
  showDeleted = signal(false);

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



  // Computed properties
  filteredCustomers = computed(() => {
    let customers = this.customers();
    const search = this.searchTerm().toLowerCase();

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

    return customers;
  });

  targetCustomer = computed<Customer | null>(() => this.filteredCustomers()[0] || null);

  customersWithConsent = computed(() =>
    this.customers().filter(customer => customer.marketing_consent)
  );

  customersWithoutConsent = computed(() =>
    this.customers().filter(customer => !customer.marketing_consent)
  );

  accessRequests = signal<GdprAccessRequest[]>([]);

  customerAccessRequests = computed(() => {
    const customer = this.targetCustomer();
    if (!customer?.email) return [];
    return this.accessRequests().filter(r => r.subject_email === customer.email);
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






  ngOnInit() {
    this.loadCustomers();

    this.loadAccessRequests();

    // Listen for query params
    this.route.queryParams.subscribe(params => {
      const search = params['search'];
      if (search) {
        this.searchTerm.set(search);
        this.loadCustomers(); // Reload with search
      }

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



  duplicateCustomer(customer: Customer) {
    // Navigate to new customer form with copied data or open modal
    // For now, let's use the local form for simplicity if it supports it, 
    // OR just navigate back to main list with a query param to open form.
    // Given the component structure, opening the local form is easiest.
    if (!customer) return;

    this.selectedCustomerForEdit.set({
      ...customer,
      id: undefined, // Clear ID for new creation
      created_at: undefined,
      marketing_consent: false // Reset consent
    } as any);
    this.showCustomerForm = true;
    this.toastService.info('Duplicando', 'Se ha abierto el formulario con los datos duplicados. Revisa y guarda.');
  }

  deleteCustomer(customer: Customer) {
    const msg = `¿Proceder con la eliminación de ${customer.name} ${customer.apellidos}?\n\n` +
      `• Con facturas: se desactiva y se conserva para cumplimiento fiscal.\n` +
      `• Sin facturas: se elimina definitivamente (lead).`;
    if (!confirm(msg)) return;

    this.customersService.deleteCustomer(customer.id).subscribe({
      next: () => {
        this.toastService.success('Éxito', 'Operación completada (eliminado o desactivado)');
        this.backToCustomers(); // Redirect after delete since this view is valid no more
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
      },
      error: (err) => this.toastService.error('Error', 'No se pudo actualizar la solicitud')
    });
  }

  // Import/Export functionality


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

  // Restriction Modal State
  showRestrictModal = false;
  restrictTarget = signal<Customer | null>(null);
  restrictReason = '';

  // Unrestrict Modal State
  unrestrictTarget = signal<Customer | null>(null);
  showUnrestrictModal = false;

  openRestrictModal(customer: Customer) {
    this.restrictTarget.set(customer);
    this.restrictReason = '';
    this.showRestrictModal = true;
  }

  closeRestrictModal() {
    this.showRestrictModal = false;
    this.restrictTarget.set(null);
    this.restrictReason = '';
  }

  processRestriction() {
    const customer = this.restrictTarget();
    if (!customer) return;

    if (!this.restrictReason.trim()) {
      this.toastService.error('Error', 'Debes indicar un motivo para la restricción');
      return;
    }

    this.isLoading.set(true);

    this.gdprService.restrictProcessing(customer.id, this.restrictReason).subscribe({
      next: () => {
        this.toastService.success('Éxito', 'Tratamiento restringido correctamente');
        this.closeRestrictModal();
        this.loadCustomers();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error restricting processing:', err);
        this.toastService.error('Error', 'No se pudo restringir el tratamiento');
        this.isLoading.set(false);
      }
    });
  }

  confirmRestrictProcessing(customer: Customer) {
    this.restrictTarget.set(customer);
    this.openRestrictModal(customer);
  }

  isCustomerBlocked(customer: Customer): boolean {
    return !!customer.access_restrictions?.blocked;
  }

  unrestrictCustomer(customer: Customer) {
    this.unrestrictTarget.set(customer);
    this.showUnrestrictModal = true;
  }

  closeUnrestrictModal() {
    this.showUnrestrictModal = false;
    this.unrestrictTarget.set(null);
  }

  processUnrestriction() {
    const customer = this.unrestrictTarget();
    if (!customer) return;

    this.isLoading.set(true);
    this.gdprService.unrestrictProcessing(customer.id).subscribe({
      next: () => {
        this.toastService.success('Restricción levantada', 'El cliente ha sido desbloqueado');
        this.closeUnrestrictModal();
        this.loadCustomers();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error unrestricting:', err);
        this.toastService.error('Error', 'No se pudo desbloquear al cliente');
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

    lines.forEach((line: string) => {
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
