import { Component, OnInit, inject, signal, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  LucideAngularModule,
  FileText,
  Clock,
  Shield,
  AlertTriangle,
  ClipboardList,
  Download,
  FileJson,
  Users,
  Activity,
  CheckCircle,
  XCircle,
  Plus,
  Eye,
  FileCheck,
  Copy,
  ExternalLink,
  Mail,
  Edit3,
  Save,
  X,
  Send,
  FileSignature,
  Loader2,
  Globe,
  Info,
} from 'lucide-angular';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ContractsService } from '../../../core/services/contracts.service';
import { ContractSignDialogComponent } from '../../client-portal/components/contract-sign-dialog/contract-sign-dialog.component';
import { SignaturePadComponent } from '../../../shared/components/signature-pad/signature-pad.component';

interface GdprDashboardStats {
  pendingRequests: number;
  overdueRequests: number;
  activeConsents: number;
  recentAuditEntries: number;
  openBreaches: number;
  processingActivities: number;
}

type DpaStatus = 'pending' | 'sent' | 'signed' | 'not_required';

@Component({
  selector: 'app-gdpr-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslocoModule,
    LucideAngularModule,
    ContractSignDialogComponent,
    SignaturePadComponent,
  ],
  templateUrl: './gdpr-dashboard.component.html',
  styleUrls: ['./gdpr-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GdprDashboardComponent implements OnInit {
  @ViewChild('dpaSignDialog') dpaSignDialog!: ContractSignDialogComponent;

  private gdprService = inject(GdprComplianceService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private sbClient = inject(SupabaseClientService);
  private contractsService = inject(ContractsService);

  // Icons
  FileText = FileText;
  Clock = Clock;
  Shield = Shield;
  AlertTriangle = AlertTriangle;
  ClipboardList = ClipboardList;
  Download = Download;
  FileJson = FileJson;
  Users = Users;
  Activity = Activity;
  CheckCircle = CheckCircle;
  XCircle = XCircle;
  Plus = Plus;
  Eye = Eye;
  FileCheck = FileCheck;
  Copy = Copy;
  ExternalLink = ExternalLink;
  Mail = Mail;
  Edit3 = Edit3;
  Save = Save;
  X = X;
  Send = Send;
  FileSignature = FileSignature;
  Loader2 = Loader2;
  Globe = Globe;
  Info = Info;

  // State signals
  isLoading = signal(true);
  isExporting = signal(false);
  stats = signal<GdprDashboardStats>({
    pendingRequests: 0,
    overdueRequests: 0,
    activeConsents: 0,
    recentAuditEntries: 0,
    openBreaches: 0,
    processingActivities: 0,
  });

  // Company info
  companyName = signal('');
  companyId = signal<string | null>(null);

  // DPA status
  dpaStatus = signal<DpaStatus>('pending');
  dpaSentAt = signal<string | null>(null);
  dpaSignedAt = signal<string | null>(null);
  dpaNotes = signal<string>('');
  dpaContractId = signal<string | null>(null);
  isUpdatingDpa = signal(false);
  isEditingNotes = signal(false);
  isDownloadingDpa = signal(false);
  tempNotesValue = signal<string>('');
  
  // Admin signature for DPA auto-sign
  adminSignature = signal<string | null>(null);
  tempAdminSignature = signal<string | null>(null);
  isEditingSignature = signal(false);
  showSignatureUpload = signal(false);

  // Privacy policy state
  privacyPolicyPublished = signal(false);
  isGeneratingPrivacyPolicy = signal(false);
  isPublishingPrivacyPolicy = signal(false);
  privacyPolicyPreviewUrl = signal<string | null>(null);

  // Consent counts by type
  consentCounts = signal<Record<string, number>>({});

  // Compliance checklist
  checklist = signal<{ item: string; checked: boolean; critical: boolean }[]>([
    { item: 'DPA aceptada con Simplifica', checked: false, critical: true },
    { item: 'Política de Privacidad publicada', checked: false, critical: true },
    { item: 'Consentimiento Informado preparado', checked: false, critical: true },
    { item: 'Personal formado en RGPD', checked: false, critical: false },
    { item: 'Sin solicitudes pendientes vencidas', checked: false, critical: true },
    { item: 'Registro de actividades (Art. 30)', checked: false, critical: false },
  ]);

  // Document templates
  consentTemplate =
    `CONSENTIMIENTO INFORMADO - ART. 9 RGPD (DATOS ESPECIALES DE SALUD)
================================================================

Responsable del tratamiento: {{COMPANY_NAME}}
Paciente/Cliente: {{CLIENT_NAME}}
Fecha: {{DATE}}

1. FINALIDAD DEL TRATAMIENTO
Sus datos personales y de salud serán tratados con la finalidad de gestionar la 
relación asistencial, la programación de citas, el seguimiento clínico y la 
facturación de los servicios prestados por {{COMPANY_NAME}}.

2. BASE JURÍDICA DEL TRATAMIENTO
El tratamiento de datos de salud se basa en el Art. 9.2.h) RGPD (atención sanitaria 
o tratamiento médico) y el Art. 6.1.b) RGPD (ejecución de un contrato de 
prestación de servicios).

3. CATEGORÍAS ESPECIALES DE DATOS
Se tratarán las siguientes categorías de datos:
- Datos de salud (historial clínico, diagnósticos, tratamientos)
- Datos de imagen (fotografías, vídeos de seguimiento)
- Información proporcionada directamente por el paciente

4. DESTINATARIOS
Los datos no serán cedidos a terceros, salvo obligación legal o cuando sea necesario 
para la correcta prestación del servicio (laboratorios, aseguradoras, etc.).

5. PLAZO DE CONSERVACIÓN
Los datos se conservarán durante el tiempo necesario para prestar el servicio y 
cumplir las obligaciones legales aplicables (mínimo 5 años según normativa 
sanitaria).

6. SUS DERECHOS
Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, 
portabilidad y oposición dirigiéndose a {{COMPANY_NAME}}.
También puede presentar una reclamación ante la AEPD (www.aepd.es).

_________________________________
Firma del paciente/cliente
Nombre: _________________________`;

  article13Template = `CLÁUSULA INFORMATIVA ART. 13-14 RGPD
===============================

RESPONSABLE DEL TRATAMIENTO
Identidad: {{COMPANY_NAME}}
NIF: {{COMPANY_NIF}}
Domicilio: {{COMPANY_ADDRESS}}
Teléfono: {{COMPANY_PHONE}}
Email: {{COMPANY_EMAIL}}
DPO: {{DPO_NAME}}

DELEGADO DE PROTECCIÓN DE DATOS (DPO)
Email: {{DPO_EMAIL}}

FINALIDAD Y BASE JURÍDICA
Sus datos personales serán tratados para la gestión de la relación contractual/
asistencial, facturación, citas y comunicación sobre servicios.
Base jurídica: Ejecución de contrato (Art. 6.1.b RGPD) y/o consentimiento 
(Art. 6.1.a RGPD).

Para datos de salud: Consentimiento explícito (Art. 9.2.a RGPD).

CATEGORÍAS DE DATOS TRATADOS
- Identificativos (nombre, DNI, contacto)
- Económicos (datos bancarios, facturación)
- De salud (historial, diagnósticos) - con consentimiento específicas
- De imagen (fotografías/vídeos) - con consentimiento específico

DESTINATARIOS
No se cederán datos a terceros, salvo obligación legal (AEAT, Seguridad Social, 
administración sanitaria) o para prestación del servicio.

PLAZO DE CONSERVACIÓN
Según obligaciones legales aplicables (mínimo 5 años para documentación 
contable/fiscal; permanente para documentación clínica).

EJERCICIO DE DERECHOS
Puede ejercer sus derechos ARCO+ (Acceso, Rectificación, Supresión, Oposición, 
Portabilidad, Limitación) enviando solicitud a {{COMPANY_EMAIL}}.
Plazo de respuesta: 1 mes (ampliable a 2 meses si hay muchas solicitudes).

Puede presentar reclamación ante la Agencia Española de Protección de Datos 
(AEPD): www.aepd.es`;

  constructor() {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  async loadDashboard() {
    this.isLoading.set(true);

    try {
      const companyId = this.authService.companyId();
      this.companyId.set(companyId);

      // Get company name from auth service
      const memberships = this.authService.companyMemberships();
      const currentCompany = memberships.find(m => m.company_id === companyId);
      const companyData = currentCompany?.company;
      this.companyName.set(companyData?.name || 'Empresa');

      // Fetch fresh company data with DPA fields directly from companies table
      // The company object from auth service doesn't include DPA-specific fields
      const { data: freshCompanyData } = await this.sbClient.instance
        .from('companies')
        .select('dpa_status, dpa_sent_at, dpa_signed_at, dpa_notes, dpa_contract_id, admin_signature, settings, name, nif')
        .eq('id', companyId)
        .single();

      // Load DPA status with fresh data that includes DPA fields
      await this.loadDpaStatus(freshCompanyData);

      // Store fresh company data with settings for checklist
      const companyDataWithSettings = freshCompanyData;

      // Fetch all data in parallel using Observables
      const [accessRequests, consents, auditLog, breaches] = await Promise.all([
        firstValueFrom(this.gdprService.getAccessRequests()),
        firstValueFrom(this.gdprService.getConsentRecords()),
        firstValueFrom(this.gdprService.getAuditLog({ limit: 50 })),
        firstValueFrom(this.gdprService.getBreachIncidents()),
      ]);

      // Calculate pending requests
      const pendingRequests = (accessRequests || []).filter(
        (r: any) => r.processing_status !== 'completed'
      ).length;

      // Calculate overdue requests (past deadline)
      const now = new Date();
      const overdueRequests = (accessRequests || []).filter(
        (r: any) =>
          r.processing_status !== 'completed' &&
          r.deadline_date &&
          new Date(r.deadline_date) < now
      ).length;

      // Calculate active consents
      const activeConsents = (consents || []).filter(
        (c: any) => c.consent_given && !c.withdrawn_at
      ).length;

      // Count consents by type
      const consentByType: Record<string, number> = {};
      (consents || []).forEach((c: any) => {
        if (c.consent_given && !c.withdrawn_at) {
          consentByType[c.consent_type] = (consentByType[c.consent_type] || 0) + 1;
        }
      });
      this.consentCounts.set(consentByType);

      // Open breaches
      const openBreaches = (breaches || []).filter(
        (b: any) => b.resolution_status !== 'resolved'
      ).length;

      // Recent audit entries (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentAudit = (auditLog || []).filter(
        (a: any) => new Date(a.created_at) >= sevenDaysAgo
      );

      // Fetch processing activities count
      const processingActivities = await this.fetchProcessingActivitiesCount();

      this.stats.set({
        pendingRequests,
        overdueRequests,
        activeConsents,
        recentAuditEntries: recentAudit.length,
        openBreaches,
        processingActivities,
      });

      // Update checklist
      this.updateChecklist(companyDataWithSettings ?? undefined, pendingRequests, overdueRequests, processingActivities);

      // Load processing activities for Art. 30 management
      await this.loadActivities();
    } catch (error) {
      console.error('Error loading GDPR dashboard:', error);
      this.toastService.error('Error cargando dashboard GDPR', 'Por favor, recarga la página');
    } finally {
      this.isLoading.set(false);
    }
  }

  private async fetchProcessingActivitiesCount(): Promise<number> {
    const companyId = this.authService.companyId();
    if (!companyId) return 0;

    try {
      const { count } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active');

      return count || 0;
    } catch {
      return 0;
    }
  }

  private updateChecklist(
    company: { name: string; settings?: any } | undefined,
    pendingReqs: number,
    overdueReqs: number,
    processingActivitiesCount: number
  ) {
    const dpaSigned = this.dpaStatus() === 'signed';
    // Check for either URL or the published flag in settings
    const privacyPolicyPublished = 
      !!company?.settings?.privacy_policy_url || 
      !!company?.settings?.privacy_policy_published_at;
    
    // Update signal for use in other methods
    this.privacyPolicyPublished.set(privacyPolicyPublished);
    
    const checks = [
      {
        item: 'DPA firmado con Simplifica',
        checked: dpaSigned,
        critical: true,
      },
      {
        item: 'Política de Privacidad publicada',
        checked: privacyPolicyPublished,
        critical: true,
      },
      { item: 'Consentimiento Informado preparado', checked: true, critical: true },
      { item: 'Personal formado en RGPD', checked: false, critical: false },
      {
        item: 'Sin solicitudes pendientes vencidas',
        checked: overdueReqs === 0,
        critical: true,
      },
      { item: 'Registro de actividades (Art. 30)', checked: processingActivitiesCount > 0, critical: false },
    ];

    this.checklist.set(checks);
  }

  copyTemplate(type: 'consent' | 'article13') {
    const template =
      type === 'consent' ? this.consentTemplate : this.article13Template;
    const text = template
      .replace(/\{\{COMPANY_NAME\}\}/g, this.companyName())
      .replace(/\{\{DATE\}\}/g, new Date().toLocaleDateString('es-ES'))
      .replace(/\{\{COMPANY_NIF\}\}/g, 'B12345678')
      .replace(/\{\{COMPANY_ADDRESS\}\}/g, 'Calle ejemplo, 123')
      .replace(/\{\{COMPANY_PHONE\}\}/g, '900 123 456')
      .replace(/\{\{COMPANY_EMAIL\}\}/g, 'info@empresa.es')
      .replace(/\{\{DPO_NAME\}\}/g, 'DPO Empresa')
      .replace(/\{\{DPO_EMAIL\}\}/g, 'dpo@empresa.es');

    navigator.clipboard.writeText(text).then(() => {
      this.toastService.success('Plantilla copiada al portapapeles', '');
    });
  }

  // DPA Status Management
  async loadDpaStatus(companyData: any) {
    if (!companyData) return;
     
    this.dpaStatus.set(companyData.dpa_status || 'pending');
    this.dpaSentAt.set(companyData.dpa_sent_at || null);
    this.dpaSignedAt.set(companyData.dpa_signed_at || null);
    this.dpaNotes.set(companyData.dpa_notes || '');
    this.dpaContractId.set(companyData.dpa_contract_id || null);
    this.adminSignature.set(companyData.admin_signature || null);
  }

  async updateDpaStatus(status: DpaStatus) {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isUpdatingDpa.set(true);
    
    try {
      const updates: any = { dpa_status: status };
      
      if (status === 'sent') {
        updates.dpa_sent_at = new Date().toISOString();
      } else if (status === 'signed') {
        updates.dpa_signed_at = new Date().toISOString();
      }
      
      const { error } = await this.sbClient.instance
        .from('companies')
        .update(updates)
        .eq('id', companyId);

      if (error) throw error;

      this.dpaStatus.set(status);
      if (status === 'sent') {
        this.dpaSentAt.set(new Date().toISOString());
      } else if (status === 'signed') {
        this.dpaSignedAt.set(new Date().toISOString());
      }

      this.toastService.success('Estado DPA actualizado', '');
    } catch (error) {
      console.error('Error updating DPA status:', error);
      this.toastService.error('Error al actualizar estado DPA', '');
    } finally {
      this.isUpdatingDpa.set(false);
    }
  }

  async sendDpaForSignature() {
    const companyId = this.authService.companyId();
    const companyName = this.companyName();
    if (!companyId) return;

    this.isUpdatingDpa.set(true);

    try {
      // Get Simplifica's owner signature for the "Encargado del Tratamiento" section
      // Uses a secure RPC function with SECURITY DEFINER to bypass RLS
      let processorSignature: string | null = null;
      try {
        const { data, error } = await this.sbClient.instance
          .rpc('get_processor_signature');
        
        if (error) {
          console.warn('Error fetching processor signature via RPC:', error);
        } else if (data) {
          processorSignature = data;
        }
      } catch (e) {
        console.warn('Could not load Simplifica signature:', e);
      }

      // Get the DPA content from the template (include owner and processor signatures)
      const dpaContent = this.generateDpaHtml(companyName, this.adminSignature(), processorSignature);

      // Create a DPA contract - company signs as controller
      const { data: contract, error } = await this.sbClient.instance
        .from('contracts')
        .insert({
          company_id: companyId,
          title: `Acuerdo de Tratamiento de Datos (DPA) - ${companyName}`,
          content_html: dpaContent,
          status: 'sent',
          contract_type: 'dpa',
        })
        .select()
        .single();

      if (error) throw error;

      // The database trigger will automatically update dpa_status to 'sent'
      // Refresh the DPA status from the database
      const { data: updatedCompany } = await this.sbClient.instance
        .from('companies')
        .select('dpa_status, dpa_sent_at, dpa_signed_at, dpa_notes')
        .eq('id', companyId)
        .single();

      if (updatedCompany) {
        this.dpaStatus.set(updatedCompany.dpa_status);
        this.dpaSentAt.set(updatedCompany.dpa_sent_at);
        this.dpaSignedAt.set(updatedCompany.dpa_signed_at);
      }

      this.toastService.success('DPA enviado para firma', 'El cliente puede firmarlo desde el portal');
    } catch (error) {
      console.error('Error sending DPA for signature:', error);
      this.toastService.error('Error al enviar DPA', 'Inténtalo de nuevo');
    } finally {
      this.isUpdatingDpa.set(false);
    }
  }

  async signDpaDigitally() {
    const companyId = this.authService.companyId();
    const companyName = this.companyName();
    if (!companyId) return;

    this.isUpdatingDpa.set(true);

    try {
      // Check if a DPA contract already exists for this company
      const { data: existingContracts } = await this.sbClient.instance
        .from('contracts')
        .select('*')
        .eq('company_id', companyId)
        .eq('contract_type', 'dpa')
        .order('created_at', { ascending: false })
        .limit(1);

      let contract = existingContracts && existingContracts.length > 0 ? existingContracts[0] : null;

      // Get Simplifica's owner signature for the "Encargado del Tratamiento" section
      let processorSignature: string | null = null;
      try {
        const { data, error } = await this.sbClient.instance
          .rpc('get_processor_signature');
        
        if (!error && data) {
          processorSignature = data;
        }
      } catch (e) {
        console.warn('Could not load Simplifica signature:', e);
      }

      // Always generate fresh content (include owner and processor signatures)
      const dpaContent = this.generateDpaHtml(companyName, this.adminSignature(), processorSignature);
      
      // If no contract exists, create one
      if (!contract) {
        const { data: newContract, error } = await this.sbClient.instance
          .from('contracts')
          .insert({
            company_id: companyId,
            title: `Acuerdo de Tratamiento de Datos (DPA) - ${companyName}`,
            content_html: dpaContent,
            status: 'draft',
            contract_type: 'dpa',
          })
          .select()
          .single();

        if (error) throw error;
        contract = newContract;

        // Update company's dpa_contract_id
        await this.sbClient.instance
          .from('companies')
          .update({ dpa_contract_id: contract.id })
          .eq('id', companyId);
      } else {
        // If contract is already signed, don't overwrite the signed content
        if (contract.status === 'signed') {
          // Update signals to reflect actual state (widget wasn't showing signed status)
          this.dpaStatus.set('signed');
          this.dpaSignedAt.set(contract.signed_at);
          this.toastService.info('Este DPA ya ha sido firmado', '');
          return;
        }

        // Update existing contract with fresh content
        const { data: updatedContract, error } = await this.sbClient.instance
          .from('contracts')
          .update({ content_html: dpaContent })
          .eq('id', contract.id)
          .select()
          .single();
        
        if (error) throw error;
        contract = updatedContract;
      }

      // Open the signing dialog - pass admin signature if available
      const adminSig = this.adminSignature();
      this.dpaSignDialog.open(contract, undefined, adminSig ?? undefined);
    } catch (error) {
      console.error('Error preparing DPA for signing:', error);
      this.toastService.error('Error al preparar DPA', 'Inténtalo de nuevo');
    } finally {
      this.isUpdatingDpa.set(false);
    }
  }

  async onDpaSigned(contract: any) {
    // Refresh DPA status from database
    const companyId = this.authService.companyId();
    if (!companyId) return;

    try {
      const { data: updatedCompany } = await this.sbClient.instance
        .from('companies')
        .select('dpa_status, dpa_sent_at, dpa_signed_at, dpa_notes, dpa_contract_id')
        .eq('id', companyId)
        .single();

      if (updatedCompany) {
        this.dpaStatus.set(updatedCompany.dpa_status);
        this.dpaSentAt.set(updatedCompany.dpa_sent_at);
        this.dpaSignedAt.set(updatedCompany.dpa_signed_at);
        this.dpaNotes.set(updatedCompany.dpa_notes || '');
        this.dpaContractId.set(updatedCompany.dpa_contract_id);
      }

      this.toastService.success('DPA firmado correctamente', 'El acuerdo ha sido formalizado');
    } catch (error) {
      console.error('Error refreshing DPA status:', error);
    }
  }

  async downloadSignedDpa() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isDownloadingDpa.set(true);

    try {
      // Find the DPA contract for this company
      const { data: contracts, error } = await this.sbClient.instance
        .from('contracts')
        .select('id, signed_pdf_url, title')
        .eq('company_id', companyId)
        .eq('contract_type', 'dpa')
        .eq('status', 'signed')
        .order('signed_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!contracts || contracts.length === 0) {
        this.toastService.error('No se encontró el DPA firmado', '');
        return;
      }

      const contract = contracts[0];
      
      if (!contract.signed_pdf_url) {
        this.toastService.error('El PDF firmado no está disponible', '');
        return;
      }

      // Get a signed URL for the PDF
      const signedUrl = await this.contractsService.getContractPdfUrl(contract.signed_pdf_url);
      
      if (!signedUrl) {
        this.toastService.error('Error al generar enlace de descarga', '');
        return;
      }

      // Download the PDF
      const response = await fetch(signedUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `DPA_${this.companyName()}_signed.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      this.toastService.success('DPA descargado correctamente', '');
    } catch (error) {
      console.error('Error downloading DPA:', error);
      this.toastService.error('Error al descargar DPA', 'Inténtalo de nuevo');
    } finally {
      this.isDownloadingDpa.set(false);
    }
  }

  // Admin Signature Management
  toggleSignatureEdit() {
    this.showSignatureUpload.set(!this.showSignatureUpload());
  }

  onAdminSignatureChange(signatureData: string | null) {
    this.tempAdminSignature.set(signatureData);
  }

  async saveAdminSignature(signatureDataUrl: string) {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    try {
      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ admin_signature: signatureDataUrl })
        .eq('id', companyId);

      if (error) throw error;

      this.adminSignature.set(signatureDataUrl);
      this.tempAdminSignature.set(null);
      this.showSignatureUpload.set(false);
      this.toastService.success('Firma guardada correctamente', 'Se usará automáticamente al firmar el DPA');
    } catch (error) {
      console.error('Error saving admin signature:', error);
      this.toastService.error('Error al guardar la firma', 'Inténtalo de nuevo');
    }
  }

  async deleteAdminSignature() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    try {
      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ admin_signature: null })
        .eq('id', companyId);

      if (error) throw error;

      this.adminSignature.set(null);
      this.toastService.success('Firma eliminada', '');
    } catch (error) {
      console.error('Error deleting admin signature:', error);
      this.toastService.error('Error al eliminar la firma', '');
    }
  }

  private generateDpaHtml(companyName: string, ownerSignature?: string | null, processorSignature?: string | null): string {
    // Firma del Responsable (empresa actual que va a firmar)
    const firmaResponsable = ownerSignature
      ? `<img src="${ownerSignature}" class="firma-image" alt="Firma del Responsable">`
      : `<div class="firma-line"></div>`;
    
    // Firma del Encargado (Simplifica) - pre-firmada si existe
    const firmaEncargado = processorSignature
      ? `<img src="${processorSignature}" class="firma-image" alt="Firma del Encargado">`
      : `<div class="firma-line"></div>`;

    // Generate DPA content HTML - styles are in contract-sign-dialog.component.ts
    return `
      <h1>ACUERDO DE TRATAMIENTO DE DATOS (DPA)</h1>
      <p class="subtitle">Conforme al Artículo 28 del Reglamento General de Protección de Datos (RGPD)</p>
      
      <div class="partes-grid">
        <div class="parte-box">
          <div class="parte-label">Responsable del Tratamiento</div>
          <p>${companyName}</p>
        </div>
        <div class="parte-box">
          <div class="parte-label">Encargado del Tratamiento</div>
          <p>Simplifica CRM<br>Roberto Carrera Santa María<br>NIF: 45127276B</p>
        </div>
      </div>
      
      <h2>1. Objeto del Acuerdo</h2>
      <p>El presente Acuerdo regula el tratamiento de datos personales que el Responsable realiza a través de la plataforma Simplifica CRM, siendo el Encargado quien proporciona la infraestructura tecnológica necesaria para la gestión de datos de salud y información relacionada con sus pacientes y clientes.</p>
      
      <h2>2. Obligaciones del Encargado</h2>
      <p>El Encargado se compromete a:</p>
      <ul>
        <li>Tratar los datos personales <strong>únicamente siguiendo las instrucciones documentadas</strong> del Responsable.</li>
        <li><strong>Garantizar la confidencialidad</strong> de los datos tratados, asegurando que las personas autorizadas se hayan comprometido a respetar la confidencialidad.</li>
        <li>Implementar <strong>medidas técnicas y organizativas apropiadas</strong> de seguridad para garantizar un nivel de seguridad adecuado al riesgo.</li>
        <li>Respetar las condiciones para <strong>recurrir a otro encargado</strong> del tratamiento, informando previamente al Responsable.</li>
        <li><strong>Asistir al Responsable</strong> en la atención de los derechos de los interesados (acceso, rectificación, supresión, portabilidad, limitación y oposición).</li>
        <li>Asistir al Responsable en el cumplimiento de sus <strong>obligaciones en materia de seguridad</strong> (notificación de brechas, evaluación de impacto, etc.).</li>
        <li><strong>Eliminar o devolver</strong> todos los datos personales una vez finalizada la prestación de los servicios.</li>
        <li>Poner a disposición del Responsable <strong>toda la información necesaria</strong> para demostrar el cumplimiento de sus obligaciones.</li>
      </ul>
      
      <h2>3. Subencargados</h2>
      <p>El Encargado no podrá recurrir a otro encargado sin la autorización previa por escrito del Responsable. Cuando el Encargado recurra a otro encargado para llevar a cabo determinadas actividades de tratamiento, se impondrán a este las mismas obligaciones de protección de datos que las estipuladas en el presente Acuerdo.</p>
      
      <h2>4. Duración del Acuerdo</h2>
      <p>El presente Acuerdo entra en vigor desde su firma y permanecerá vigente mientras dure la relación comercial entre las partes, incluyendo el período de conservación de datos legalmente establecido.</p>
      
      <h2>5. Ley Aplicable y Jurisdicción</h2>
      <p>El presente Acuerdo se rige por la legislación española y europea en materia de protección de datos (RGPD y LOPDGDD). Para cualquier controversia derivada de la interpretación o ejecución del presente Acuerdo, las partes se someten a los Juzgados y Tribunales de Madrid.</p>
      
            <div class="firma-section">
        <h3>Firmas de las Partes</h3>
        <div class="firma-row">
          <div class="firma-box">
            ${firmaResponsable}
            <label>Responsable del Tratamiento<br>${companyName}</label>
          </div>
          <div class="firma-box">
            ${firmaEncargado}
            <label>Encargado del Tratamiento<br>Simplifica CRM</label>
          </div>
        </div>
        <div class="firma-date">
          <label>Fecha de firma: {{SIGNING_DATE}}</label>
        </div>
      </div>
    `;
  }

  async updateDpaNotes(notes: string) {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isUpdatingDpa.set(true);
    
    try {
      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ dpa_notes: notes })
        .eq('id', companyId);

      if (error) throw error;

      this.dpaNotes.set(notes);
      this.isEditingNotes.set(false);
      this.toastService.success('Notas DPA actualizadas', '');
    } catch (error) {
      console.error('Error updating DPA notes:', error);
      this.toastService.error('Error al actualizar notas DPA', '');
    } finally {
      this.isUpdatingDpa.set(false);
    }
  }

  onNotesInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.tempNotesValue.set(input.value);
  }

  saveNotes() {
    this.updateDpaNotes(this.tempNotesValue());
  }

  isSimplifica(): boolean {
    return this.companyName().toLowerCase().includes('simplifica');
  }

  getDpaStatusLabel(status: DpaStatus): string {
    const labels: Record<DpaStatus, string> = {
      pending: 'Pendiente',
      sent: 'Enviado',
      signed: 'Firmado',
      not_required: 'No requerido',
    };
    return labels[status];
  }

  getDpaStatusColor(status: DpaStatus): string {
    const colors: Record<DpaStatus, string> = {
      pending: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
      sent: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
      signed: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
      not_required: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700',
    };
    return colors[status];
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  toggleNotesEdit() {
    if (!this.isEditingNotes()) {
      // Entering edit mode - prepopulate temp value
      this.tempNotesValue.set(this.dpaNotes());
    }
    this.isEditingNotes.set(!this.isEditingNotes());
  }

  async exportAudit() {
    this.isExporting.set(true);

    try {
      const companyId = this.authService.companyId();
      const companyName = this.companyName();
      const exportDate = new Date().toISOString();

      // Fetch all GDPR data
      const [processingActivities, consents, auditLog, accessRequests] = await Promise.all([
        this.fetchAllProcessingActivities(),
        firstValueFrom(this.gdprService.getConsentRecords()),
        firstValueFrom(this.gdprService.getAuditLog({ limit: 1000 })),
        firstValueFrom(this.gdprService.getAccessRequests()),
      ]);

      // Build export object
      const exportData = {
        metadata: {
          companyName,
          companyId,
          exportDate,
          GDPRStatement:
            'Esta documentación se genera conforme al RGPD (Reglamento (UE) 2016/679) y la LOPDGDD (Ley Orgánica 3/2018).',
        },
        processingActivities: processingActivities || [],
        consentRecords: consents || [],
        auditLog: auditLog || [],
        accessRequests: accessRequests || [],
      };

      // Convert to JSON
      const jsonStr = JSON.stringify(exportData, null, 2);

      // Create blob and download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gdpr-audit-export-${companyName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);

      // Log the export
      await this.gdprService.logGdprEvent(
        'audit_export',
        'gdpr_audit_log',
        undefined,
        undefined,
        'Auditoría GDPR exportada'
      );

      this.toastService.success('Auditoría GDPR exportada correctamente', '');
    } catch (error) {
      console.error('Error exporting audit:', error);
      this.toastService.error('Error al exportar auditoría', 'Inténtalo de nuevo');
    } finally {
      this.isExporting.set(false);
    }
  }

  private async fetchAllProcessingActivities() {
    const companyId = this.authService.companyId();
    if (!companyId) return [];

    try {
      const { data } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      return data || [];
    } catch {
      return [];
    }
  }

  navigateTo(path: string) {
    this.router.navigate([path]);
  }

  openNewRequestModal() {
    // Navigate to GDPR customer manager with new request modal
    this.router.navigate(['/clientes-gdpr'], {
      queryParams: { action: 'new-request' },
    });
  }

  // Helper methods for template
  consentTypeList() {
    return [
      { key: 'health_data', label: 'Datos Salud' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'analytics', label: 'Analítica' },
      { key: 'data_processing', label: 'Tratamiento' },
      { key: 'third_party_sharing', label: 'Terceros' },
    ];
  }

  getConsentCount(type: string): number {
    return this.consentCounts()[type] || 0;
  }

  getTotalConsentTypes(): number {
    const counts = this.consentCounts();
    return Object.keys(counts).filter(k => counts[k] > 0).length;
  }

  // ─── Privacy Policy Generation ─────────────────────────────────────────────────

  async generateAndPreviewPrivacyPolicy() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isGeneratingPrivacyPolicy.set(true);

    try {
      // Call the edge function to generate the privacy policy HTML
      const supabaseUrl = environment.edgeFunctionsBaseUrl;
      const response = await fetch(
        `${supabaseUrl}/generate-privacy-policy?companyId=${companyId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar la política de privacidad');
      }

      // Get the HTML content
      const htmlContent = await response.text();

      // Open in a new tab for preview
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const previewUrl = URL.createObjectURL(blob);
      this.privacyPolicyPreviewUrl.set(previewUrl);

      // Open in new tab
      window.open(previewUrl, '_blank');

      this.toastService.success('Política de privacidad generada', 'Revisa la previsualización en la nueva pestaña');
    } catch (error) {
      console.error('Error generating privacy policy:', error);
      this.toastService.error('Error al generar la política de privacidad', 'Inténtalo de nuevo');
    } finally {
      this.isGeneratingPrivacyPolicy.set(false);
    }
  }

  async publishPrivacyPolicy() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isPublishingPrivacyPolicy.set(true);

    try {
      // First generate the HTML
      const supabaseUrl = environment.edgeFunctionsBaseUrl;
      const response = await fetch(
        `${supabaseUrl}/generate-privacy-policy?companyId=${companyId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al generar la política de privacidad');
      }

      const htmlContent = await response.text();

      // Save the published flag and content to company settings
      const currentSettings = await this.getCompanySettings();
      const updates = {
        ...currentSettings,
        privacy_policy_published_at: new Date().toISOString(),
        privacy_policy_content: htmlContent,
        // Also set a URL pattern for reference
        privacy_policy_url: `/privacy/${companyId}`,
      };

      const { error } = await this.sbClient.instance
        .from('companies')
        .update({ settings: updates })
        .eq('id', companyId);

      if (error) throw error;

      this.privacyPolicyPublished.set(true);
      this.toastService.success('Política de privacidad publicada', 'Ahora es accesible para tus clientes');
    } catch (error) {
      console.error('Error publishing privacy policy:', error);
      this.toastService.error('Error al publicar la política de privacidad', 'Inténtalo de nuevo');
    } finally {
      this.isPublishingPrivacyPolicy.set(false);
    }
  }

  private async getCompanySettings(): Promise<Record<string, any>> {
    const companyId = this.authService.companyId();
    if (!companyId) return {};

    const { data, error } = await this.sbClient.instance
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    if (error || !data) return {};
    return data.settings || {};
  }

  // Check if privacy policy is already published
  isPrivacyPolicyPublished(): boolean {
    return this.privacyPolicyPublished();
  }

  // ─── Art. 30 Processing Activities Management ─────────────────────────────────

  // State for activities
  registeredActivities = signal<any[]>([]);
  templateActivities = signal<any[]>([]);
  isLoadingActivities = signal(false);
  showAddActivityModal = signal(false);
  isAddingActivity = signal(false);

  // Expanded states for activity details
  expandedActivities = signal<Set<string>>(new Set());

  // Form for custom activity
  newActivityForm = signal({
    activity_name: '',
    purpose: '',
    legal_basis: '',
    data_subjects: [] as string[],
    data_categories: [] as string[],
    special_categories: [] as string[],
    retention_period: '',
  });

  async loadActivities() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isLoadingActivities.set(true);
    try {
      const [registered, templates] = await Promise.all([
        this.fetchRegisteredActivities(),
        this.fetchTemplateActivities(),
      ]);
      this.registeredActivities.set(registered);
      this.templateActivities.set(templates);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      this.isLoadingActivities.set(false);
    }
  }

  async fetchRegisteredActivities() {
    const companyId = this.authService.companyId();
    if (!companyId) return [];

    try {
      const { data } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('activity_name', { ascending: true });

      return data || [];
    } catch (error) {
      console.error('Error fetching registered activities:', error);
      return [];
    }
  }

  async fetchTemplateActivities() {
    try {
      const { data } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .select('*')
        .is('company_id', null)
        .eq('status', 'active')
        .order('activity_name', { ascending: true });

      return data || [];
    } catch (error) {
      console.error('Error fetching template activities:', error);
      return [];
    }
  }

  toggleActivityExpand(activityId: string) {
    const current = new Set(this.expandedActivities());
    if (current.has(activityId)) {
      current.delete(activityId);
    } else {
      current.add(activityId);
    }
    this.expandedActivities.set(current);
  }

  isActivityExpanded(activityId: string): boolean {
    return this.expandedActivities().has(activityId);
  }

  async addActivityFromTemplate(templateId: string) {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    this.isAddingActivity.set(true);
    try {
      // Get template data
      const { data: template, error: fetchError } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .select('*')
        .eq('id', templateId)
        .single();

      if (fetchError || !template) {
        this.toastService.error('Error al cargar plantilla', '');
        return;
      }

      // Insert as new activity for this company
      const { error: insertError } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .insert({
          company_id: companyId,
          controller_name: this.companyName(),
          controller_contact: '',
          dpo_contact: template.dpo_contact,
          activity_name: template.activity_name,
          purpose: template.purpose,
          data_subjects: template.data_subjects,
          data_categories: template.data_categories,
          special_categories: template.special_categories,
          recipients: template.recipients,
          third_country_transfers: template.third_country_transfers,
          retention_period: template.retention_period,
          retention_basis: template.retention_basis,
          legal_basis: template.legal_basis,
          security_measures: template.security_measures,
          is_processor_activity: template.is_processor_activity,
          status: 'active',
        });

      if (insertError) throw insertError;

      this.toastService.success('Actividad añadida', `Se ha añadido "${template.activity_name}" a tu registro`);
      
      // Refresh activities and stats
      await this.loadActivities();
      const count = await this.fetchProcessingActivitiesCount();
      this.stats.update(s => ({ ...s, processingActivities: count }));
    } catch (error) {
      console.error('Error adding activity from template:', error);
      this.toastService.error('Error al añadir actividad', 'Inténtalo de nuevo');
    } finally {
      this.isAddingActivity.set(false);
    }
  }

  openAddCustomActivityModal() {
    this.newActivityForm.set({
      activity_name: '',
      purpose: '',
      legal_basis: '',
      data_subjects: [],
      data_categories: [],
      special_categories: [],
      retention_period: '',
    });
    this.showAddActivityModal.set(true);
  }

  closeAddActivityModal() {
    this.showAddActivityModal.set(false);
  }

  updateNewActivityField(field: string, value: any) {
    this.newActivityForm.update(form => ({ ...form, [field]: value }));
  }

  async addCustomActivity() {
    const companyId = this.authService.companyId();
    if (!companyId) return;

    const form = this.newActivityForm();
    if (!form.activity_name.trim() || !form.purpose.trim()) {
      this.toastService.error('Completa los campos obligatorios', 'Nombre y finalidad son obligatorios');
      return;
    }

    this.isAddingActivity.set(true);
    try {
      const { error } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .insert({
          company_id: companyId,
          controller_name: this.companyName(),
          controller_contact: '',
          activity_name: form.activity_name,
          purpose: form.purpose,
          legal_basis: form.legal_basis || 'Interés legítimo (Art. 6.1.f)',
          data_subjects: form.data_subjects.length > 0 ? form.data_subjects : ['Clientes', 'Contactos'],
          data_categories: form.data_categories.length > 0 ? form.data_categories : ['Nombre', 'Email', 'Teléfono'],
          special_categories: form.special_categories.length > 0 ? form.special_categories : [],
          retention_period: form.retention_period || '',
          status: 'active',
        });

      if (error) throw error;

      this.toastService.success('Actividad creada', `Se ha creado "${form.activity_name}"`);
      this.closeAddActivityModal();
      
      // Refresh activities and stats
      await this.loadActivities();
      const count = await this.fetchProcessingActivitiesCount();
      this.stats.update(s => ({ ...s, processingActivities: count }));
    } catch (error) {
      console.error('Error adding custom activity:', error);
      this.toastService.error('Error al crear actividad', 'Inténtalo de nuevo');
    } finally {
      this.isAddingActivity.set(false);
    }
  }

  async deleteActivity(activityId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta actividad?')) {
      return;
    }

    try {
      const { error } = await this.sbClient.instance
        .from('gdpr_processing_activities')
        .update({ status: 'retired' })
        .eq('id', activityId);

      if (error) throw error;

      this.toastService.success('Actividad eliminada', '');
      
      // Refresh activities and stats
      await this.loadActivities();
      const count = await this.fetchProcessingActivitiesCount();
      this.stats.update(s => ({ ...s, processingActivities: count }));
    } catch (error) {
      console.error('Error deleting activity:', error);
      this.toastService.error('Error al eliminar actividad', '');
    }
  }

  // Helper to format array for display
  formatArrayField(arr: string[]): string {
    if (!arr || arr.length === 0) return '-';
    return arr.join(', ');
  }

  // Common options for forms
  dataSubjectOptions = [
    'Clientes', 'Pacientes', 'Contactos', 'Proveedores', 'Empleados', 
    'Suscriptores', 'Usuarios del portal', 'Colaboradores'
  ];

  dataCategoryOptions = [
    'Nombre y apellidos', 'Email', 'Teléfono', 'Dirección', 'NIF/CIF',
    'Datos bancarios', 'Datos de facturación', 'Historial clínico',
    'Historial de tratamientos', 'Fotografías/Vídeos', 'IP/Navegador'
  ];

  specialCategoryOptions = [
    'Datos de salud (Art. 9.1)', 'Origen étnico (Art. 9.1)',
    'Opiniones políticas (Art. 9.1)', 'Creencias religiosas (Art. 9.1)',
    'Afiliación sindical (Art. 9.1)', 'Datos genéticos (Art. 9.1)',
    'Datos biométricos (Art. 9.1)'
  ];

  legalBasisOptions = [
    { value: 'Consentimiento (Art. 6.1.a)', label: 'Consentimiento (Art. 6.1.a)' },
    { value: 'Ejecución de contrato (Art. 6.1.b)', label: 'Ejecución de contrato (Art. 6.1.b)' },
    { value: 'Obligación legal (Art. 6.1.c)', label: 'Obligación legal (Art. 6.1.c)' },
    { value: 'Interés vital (Art. 6.1.d)', label: 'Interés vital (Art. 6.1.d)' },
    { value: 'Interés legítimo (Art. 6.1.f)', label: 'Interés legítimo (Art. 6.1.f)' },
    { value: 'Tarea de interés público (Art. 6.1.e)', label: 'Tarea de interés público (Art. 6.1.e)' },
  ];

  toggleArrayField(field: 'data_subjects' | 'data_categories' | 'special_categories', value: string) {
    this.newActivityForm.update(form => {
      const current = form[field] as string[];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...form, [field]: updated };
    });
  }
}