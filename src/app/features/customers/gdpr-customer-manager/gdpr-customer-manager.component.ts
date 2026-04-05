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
import { ContractsService, ContractTemplate } from '../../../core/services/contracts.service';
import { firstValueFrom } from 'rxjs';

interface BulkTemplate {
  id: string;
  name: string;
  content_html: string;
  isBuiltIn?: boolean;
}

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
  private contractsService = inject(ContractsService);

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

  // Bulk send state
  showBulkModal = signal(false);
  bulkTemplates = signal<BulkTemplate[]>([]);
  bulkSelectedTemplateId = signal<string>('');
  bulkScope = signal<'all' | 'pending'>('pending');
  bulkStatus = signal<'draft' | 'sent'>('sent');
  bulkRunning = signal(false);
  bulkProgress = signal(0);
  bulkTotal = signal(0);
  bulkDone = signal(false);
  bulkErrors = signal<string[]>([]);

  private readonly BUILTIN_RGPD_TEMPLATES: BulkTemplate[] = [
    {
      id: '__builtin_consent_data',
      name: 'Consentimiento Tratamiento de Datos',
      isBuiltIn: true,
      content_html: `<h1>Consentimiento de Tratamiento de Datos Personales</h1>
<p><strong>Responsable del tratamiento:</strong> {{company_name}}</p>
<p><strong>Paciente/Cliente:</strong> {{client_name}}</p>
<p><strong>Fecha:</strong> {{today_date}}</p>
<h2>1. Finalidad del Tratamiento</h2>
<p>Sus datos personales y de salud serán tratados con la finalidad de gestionar la relación asistencial, la programación de citas, el seguimiento clínico y la facturación de los servicios prestados.</p>
<h2>2. Base Jurídica</h2>
<p>El tratamiento se basa en el Art. 6.1.b) RGPD (ejecución de un contrato de prestación de servicios). Para datos especiales de salud: Art. 9.2.h) RGPD (atención sanitaria o tratamiento médico).</p>
<h2>3. Destinatarios</h2>
<p>Los datos no serán cedidos a terceros, salvo obligación legal o cuando sea necesario para la correcta prestación del servicio.</p>
<h2>4. Plazo de Conservación</h2>
<p>Los datos se conservarán durante el tiempo necesario para prestar el servicio y cumplir las obligaciones legales aplicables.</p>
<h2>5. Sus Derechos</h2>
<p>Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición dirigiéndose a {{company_name}}, o presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
<div style="margin-top:60px;display:flex;gap:40px;">
  <div style="flex:1;border-top:1px solid #ccc;padding-top:10px;text-align:center;">Firma del paciente / cliente<br/><strong>{{client_name}}</strong></div>
  <div style="flex:1;border-top:1px solid #ccc;padding-top:10px;text-align:center;">Firma del responsable<br/><strong>{{company_name}}</strong></div>
</div>`,
    },
    {
      id: '__builtin_consent_images',
      name: 'Consentimiento de Imágenes y Vídeo',
      isBuiltIn: true,
      content_html: `<h1>Consentimiento de Captación y Uso de Imágenes</h1>
<p><strong>Responsable del tratamiento:</strong> {{company_name}}</p>
<p><strong>Cliente:</strong> {{client_name}}</p>
<p><strong>Fecha:</strong> {{today_date}}</p>
<h2>Objeto</h2>
<p>El/la abajo firmante autoriza a <strong>{{company_name}}</strong> a capturar fotografías y/o vídeos antes, durante y después del tratamiento con fines de seguimiento clínico, formación interna (anonimizada) y divulgación profesional (sin identificación).</p>
<h2>Revocabilidad</h2>
<p>Este consentimiento puede revocarse en cualquier momento sin efectos retroactivos, comunicándolo por escrito al responsable del tratamiento.</p>
<h2>Derechos</h2>
<p>Puede ejercer sus derechos ARCO+ escribiendo a {{company_name}} o reclamar ante la AEPD (www.aepd.es).</p>
<div style="margin-top:60px;border-top:1px solid #ccc;width:300px;padding-top:10px;text-align:center;">
  Firma del paciente<br/><strong>{{client_name}}</strong>
</div>`,
    },
    {
      id: '__builtin_consent_minor',
      name: 'Consentimiento de Menor de Edad',
      isBuiltIn: true,
      content_html: `<h1>Consentimiento del Representante Legal para Tratamiento de Datos de Menores</h1>
<p><strong>Responsable del tratamiento:</strong> {{company_name}}</p>
<p><strong>Representante legal:</strong> {{client_name}}</p>
<p><strong>Fecha:</strong> {{today_date}}</p>
<h2>Datos del Menor</h2>
<p>Nombre del menor: ________________________ &nbsp;&nbsp; Fecha de nacimiento: ________________________</p>
<h2>Finalidad</h2>
<p>El/la representante legal presta su consentimiento para el tratamiento de los datos personales y de salud del menor, con fines asistenciales y de gestión sanitaria, conforme al Art. 6.1.a) y Art. 9.2.h) del RGPD y al Art. 7 de la LOPDGDD.</p>
<h2>Derechos</h2>
<p>El/la representante legal puede ejercer los derechos ARCO+ en nombre del menor dirigiéndose a {{company_name}}.</p>
<div style="margin-top:60px;display:flex;gap:40px;">
  <div style="flex:1;border-top:1px solid #ccc;padding-top:10px;text-align:center;">Firma del representante legal<br/><strong>{{client_name}}</strong></div>
  <div style="flex:1;border-top:1px solid #ccc;padding-top:10px;text-align:center;">Sello y firma del responsable<br/><strong>{{company_name}}</strong></div>
</div>`,
    },
  ];

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

  bulkTargetCount = computed(() => {
    const all = this.customers();
    if (this.bulkScope() === 'all') return all.length;
    return all.filter(c => c.consent_status !== 'accepted' && !(c as any).privacy_policy_consent).length;
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

  openBulkModal() {
    const companyId = this.auth.companyId();
    if (!companyId) return;
    this.bulkDone.set(false);
    this.bulkProgress.set(0);
    this.bulkErrors.set([]);
    this.bulkSelectedTemplateId.set('');
    // Start with built-in templates immediately, then merge DB templates on load
    this.bulkTemplates.set([...this.BUILTIN_RGPD_TEMPLATES]);
    this.showBulkModal.set(true);
    this.contractsService.getTemplates(companyId).subscribe({
      next: dbTemplates => {
        this.bulkTemplates.set([...this.BUILTIN_RGPD_TEMPLATES, ...dbTemplates]);
      },
      error: () => { /* built-in templates already loaded, DB failure is non-fatal */ }
    });
  }

  closeBulkModal() {
    if (this.bulkRunning()) return;
    this.showBulkModal.set(false);
    if (this.bulkDone()) this.refresh();
  }

  async runBulkSend() {
    const templateId = this.bulkSelectedTemplateId();
    const template = this.bulkTemplates().find(t => t.id === templateId);
    if (!template) return;

    const companyId = this.auth.companyId();
    const all = this.customers();
    const targets = this.bulkScope() === 'all'
      ? all
      : all.filter(c => c.consent_status !== 'accepted' && !(c as any).privacy_policy_consent);

    this.bulkRunning.set(true);
    this.bulkProgress.set(0);
    this.bulkTotal.set(targets.length);
    this.bulkErrors.set([]);

    const errors: string[] = [];
    for (const customer of targets) {
      try {
        await firstValueFrom(this.contractsService.createContract({
          company_id: companyId,
          client_id: customer.id,
          title: `${template.name} - ${customer.name}${customer.surname ? ' ' + customer.surname : ''}`,
          content_html: template.content_html,
          status: this.bulkStatus()
        }));
      } catch (e: any) {
        errors.push(`${customer.name} ${customer.surname || ''}: ${e?.message || 'Error desconocido'}`);
      }
      this.bulkProgress.update(n => n + 1);
    }

    this.bulkErrors.set(errors);
    this.bulkRunning.set(false);
    this.bulkDone.set(true);

    if (errors.length === 0) {
      this.toastService.success('Envío masivo completado', `${targets.length} documentos generados correctamente`);
    } else {
      this.toastService.error('Envío masivo con errores', `${targets.length - errors.length} enviados, ${errors.length} fallaron`);
    }
  }
}
