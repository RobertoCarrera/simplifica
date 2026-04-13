import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Customer } from '../../../models/customer';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { GdprComplianceService, GdprAccessRequest } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';
import { Router, ActivatedRoute } from '@angular/router';
import { GdprAuditListComponent } from '../gdpr-audit-list/gdpr-audit-list.component';
import { FormNewCustomerComponent } from '../form-new-customer/form-new-customer.component';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-gdpr-customer-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GdprAuditListComponent, FormNewCustomerComponent, TranslocoModule],
  templateUrl: './gdpr-customer-manager.component.html',
  styleUrls: ['./gdpr-customer-manager.component.scss']
})
export class GdprCustomerManagerComponent implements OnInit {
  private customersService = inject(SupabaseCustomersService);
  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  public auth = inject(AuthService);
  private translocoService = inject(TranslocoService);

  // State signals
  customers = signal<Customer[]>([]);
  isLoading = signal(false);
  selectedCustomer = signal<Customer | null>(null);
  searchTerm = signal('');
  showDeleted = signal(false);
  accessRequests = signal<GdprAccessRequest[]>([]);

  // Modals state
  showCustomerForm = false;
  selectedCustomerForEdit = signal<Customer | null>(null);

  // Computed
  filteredCustomers = computed(() => {
    let list = this.customers();
    const search = this.searchTerm().toLowerCase();
    if (search) {
      list = list.filter(c => 
        (c.name?.toLowerCase().includes(search)) || 
        (c.surname?.toLowerCase().includes(search)) || 
        (c.email?.toLowerCase().includes(search))
      );
    }
    return list;
  });

  stats = computed(() => {
    const all = this.customers();
    return {
      consented: all.filter(c => (c as any).gdpr_consent).length,
      pending: all.filter(c => !(c as any).gdpr_consent).length
    };
  });

  recentRequests = computed(() => {
    return [...this.accessRequests()].sort((a,b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    ).slice(0, 5);
  });

  ngOnInit() {
    this.refresh();
    this.loadAccessRequests();
  }

  refresh() {
    this.isLoading.set(true);
    this.customersService.getCustomers({ showDeleted: this.showDeleted() }).subscribe({
      next: (data) => {
        this.customers.set(data);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });
  }

  loadAccessRequests() {
    this.gdprService.getAccessRequests().subscribe(reqs => this.accessRequests.set(reqs));
  }

  goBack() {
    this.router.navigate(['/clientes']);
  }

  openCustomerForm() {
    this.selectedCustomerForEdit.set(null);
    this.showCustomerForm = true;
  }

  closeCustomerForm() {
    this.showCustomerForm = false;
  }

  onCustomerSaved() {
    this.closeCustomerForm();
    this.refresh();
  }

  selectCustomerByEmail(email: string) {
    const c = this.customers().find(cust => cust.email === email);
    if (c) this.selectedCustomer.set(c);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  }

  viewRequest(req: any, event: Event) {
    event.stopPropagation();
    this.toastService.info('Solicitud', `${req.request_type}: ${req.processing_status}`);
  }

  openAccessRequestModal() {
    this.toastService.info('Función', 'Generando exportación de datos...');
  }

  openDeleteRequestModal() {
    this.toastService.info('Función', 'Iniciando proceso de borrado/olvido...');
  }
}
