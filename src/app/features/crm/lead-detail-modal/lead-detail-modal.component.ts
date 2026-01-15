import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Lead, LeadService, LeadInteraction, LeadSource } from '../../../core/services/lead.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-lead-detail-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="lead-detail-modal" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="modal-header">
          <h2>{{ isNew ? 'Nuevo Lead' : (leadForm.get('first_name')?.value + ' ' + (leadForm.get('last_name')?.value || '')) }}</h2>
          <button class="btn-close" (click)="close()">×</button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          
          <!-- Tabs -->
          <div class="tabs" *ngIf="!isNew">
            <button class="tab-btn" [class.active]="activeTab === 'info'" (click)="activeTab = 'info'">Información</button>
            <button class="tab-btn" [class.active]="activeTab === 'history'" (click)="activeTab = 'history'">Historial</button>
          </div>

          <!-- Tab: Info (Form) -->
          <div class="tab-content" *ngIf="activeTab === 'info'">
             <form [formGroup]="leadForm" class="form-grid">
                
                <div class="form-group">
                  <label>Nombre *</label>
                  <input formControlName="first_name" placeholder="Ej. Juan" />
                </div>

                <div class="form-group">
                  <label>Apellidos</label>
                  <input formControlName="last_name" placeholder="Ej. Pérez" />
                </div>

                <div class="form-group">
                  <label>Email</label>
                  <input formControlName="email" type="email" placeholder="cliente@email.com" />
                </div>

                <div class="form-group">
                  <label>Teléfono</label>
                  <input formControlName="phone" type="tel" placeholder="+34 600 000 000" />
                </div>

                <div class="form-group">
                  <label>Fuente</label>
                  <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <select formControlName="lead_source_id" style="flex: 1;">
                        <option [ngValue]="null">Seleccionar fuente</option>
                        <option *ngFor="let src of sources" [value]="src.id">{{ src.name }}</option>
                    </select>
                    <button class="btn-icon" (click)="toggleAddSource()" type="button" title="Añadir nueva fuente">
                       <i class="fas fa-plus"></i>
                    </button>
                  </div>
                  
                  <!-- Add Source Inline Form -->
                  <div *ngIf="showAddSource" style="display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center;">
                     <input [formControl]="newSourceControl" placeholder="Nueva fuente..." style="flex: 1; margin: 0;">
                     <button class="btn-icon" (click)="saveNewSource()" type="button" [disabled]="!newSourceControl.value">
                       <i class="fas fa-check" style="color: var(--color-success, #10b981);"></i>
                     </button>
                     <button class="btn-icon" (click)="showAddSource = false" type="button">
                       <i class="fas fa-times"></i>
                     </button>
                  </div>
                  <div class="error-text" *ngIf="leadForm.get('lead_source_id')?.invalid && (leadForm.get('lead_source_id')?.touched || leadForm.get('lead_source_id')?.dirty)">
                      Debes seleccionar una fuente (o crear una y guardarla con el check).
                  </div>

                </div>

                <div class="form-group">
                  <label>Estado</label>
                  <select formControlName="status">
                    <option value="new">Nuevo</option>
                    <option value="contacted">Contactado</option>
                    <option value="no_answer">Sin Respuesta</option>
                    <option value="meeting_scheduled">Cita Agendada</option>
                    <option value="won">Ganado</option>
                    <option value="lost">Perdido</option>
                  </select>
                </div>

                <div class="form-group full-width">
                  <label>Interés / Mensaje Inicial</label>
                  <textarea formControlName="interest" placeholder="Motivo de la consulta..."></textarea>
                </div>

                 <div class="form-group full-width">
                  <label>Notas Internas</label>
                  <textarea formControlName="notes" placeholder="Notas privadas..."></textarea>
                </div>

             </form>
          </div>

          <!-- Tab: History (Interactions) -->
          <div class="tab-content" *ngIf="activeTab === 'history'">
             
             <!-- GDPR Consent -->
             <div class="gdpr-section" style="margin-bottom: 2rem; padding: 1rem; background: var(--bg-secondary, #f8fafc); border-radius: 0.5rem; border: 1px solid var(--border-color, #e2e8f0);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                   <div>
                       <h4 style="margin: 0 0 0.5rem 0;">Consentimiento RGPD</h4>
                       <span class="status-badge" [class.success]="lead?.gdpr_accepted" [class.pending]="!lead?.gdpr_accepted" style="font-size: 0.8rem; padding: 0.2rem 0.6rem; border-radius: 9px; font-weight: 600;">
                         {{ lead?.gdpr_accepted ? 'Aceptado' : 'Pendiente' }}
                       </span>
                       <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;" *ngIf="lead?.gdpr_consent_sent_at">
                           Solicitud enviada: {{ lead?.gdpr_consent_sent_at | date:'medium' }}
                       </div>
                   </div>
                   <button class="btn btn-outline" (click)="sendGdprRequest()" [disabled]="sendingGdpr || lead?.gdpr_accepted">
                       <i class="fas" [ngClass]="sendingGdpr ? 'fa-spinner fa-spin' : 'fa-paper-plane'"></i>
                       {{ lead?.gdpr_consent_sent_at ? 'Reenviar Solicitud' : 'Enviar Solicitud' }}
                   </button>
                </div>
             </div>

             <!-- Add Interaction -->
             <div class="new-interaction">
               <h4>Registrar interacción</h4>
               <div class="interaction-form" [formGroup]="interactionForm">
                 <select formControlName="type">
                   <option value="call">Llamada</option>
                   <option value="email">Email</option>
                   <option value="whatsapp">WhatsApp</option>
                   <option value="meeting">Cita/Reunión</option>
                   <option value="note">Nota</option>
                 </select>
                 <input formControlName="summary" placeholder="Resumen de la interacción..." (keyup.enter)="addInteraction()" />
                 <button class="btn btn-primary" (click)="addInteraction()" [disabled]="interactionForm.invalid || loadingInteraction">
                   <i class="fas fa-paper-plane"></i>
                 </button>
               </div>
             </div>

             <!-- List -->
             <div class="interactions-list">
               <div class="interaction-item" *ngFor="let interaction of interactions">
                  <div class="icon" [ngClass]="interaction.type">
                    <i class="fas" [ngClass]="getIconForType(interaction.type)"></i>
                  </div>
                  <div class="details">
                    <div class="meta">
                      <strong>{{ interaction.user?.full_name || 'Usuario' }}</strong>
                      <span>{{ interaction.created_at | date:'medium' }}</span>
                    </div>
                    <div class="summary">{{ interaction.summary }}</div>
                  </div>
               </div>
               <div *ngIf="interactions.length === 0" class="empty-state">
                  No hay interacciones registradas.
               </div>
             </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer" style="justify-content: space-between;">
           <div *ngIf="!isNew && authService.userRole() === 'owner'">
             <button class="btn btn-danger-outline" (click)="deleteLead()" [disabled]="saving" style="color: var(--color-error, #ef4444); border: 1px solid var(--color-error, #ef4444); background: transparent; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer;">
               <i class="fas fa-trash"></i> Eliminar
             </button>
           </div>
           <div style="display: flex; gap: 0.5rem; margin-left: auto;">
               <button class="btn btn-cancel" (click)="close()">Cancelar</button>
               <button class="btn btn-primary" (click)="save()" [disabled]="leadForm.invalid || saving">
                 {{ saving ? 'Guardando...' : (isNew ? 'Crear Lead' : 'Guardar Cambios') }}
               </button>
           </div>
        </div>

      </div>
    </div>
  `,
  styleUrls: ['./lead-detail-modal.component.scss']
})


// ... (in Component imports)

export class LeadDetailModalComponent implements OnInit {
  @Input() leadId: string | null = null;
  @Input() initialStatus: Lead['status'] = 'new';
  @Output() closeEvent = new EventEmitter<void>();
  @Output() saveEvent = new EventEmitter<void>();

  leadService = inject(LeadService);
  supabase = inject(SupabaseClientService);
  authService = inject(AuthService);
  toastService = inject(ToastService);
  fb = inject(FormBuilder);

  leadForm: FormGroup;
  interactionForm: FormGroup;

  activeTab: 'info' | 'history' = 'info';
  isNew = true;
  saving = false;
  loadingInteraction = false;

  lead: Lead | null = null;
  interactions: LeadInteraction[] = [];
  sources: LeadSource[] = [];

  showAddSource = false;
  newSourceControl = this.fb.control('', Validators.required);

  constructor() {
    this.leadForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: [''],
      email: ['', [Validators.email]],
      phone: [''],
      lead_source_id: [null, Validators.required],
      status: ['new', Validators.required],
      interest: [''],
      notes: ['']
    });

    this.interactionForm = this.fb.group({
      type: ['call', Validators.required],
      summary: ['', Validators.required]
    });
  }

  async ngOnInit() {
    this.loadSources();
    if (this.leadId) {
      this.isNew = false;
      this.loadLead();
      this.loadInteractions();
    } else {
      this.isNew = true;
      this.leadForm.patchValue({ status: this.initialStatus });
    }
  }

  async loadLead() {
    if (!this.leadId) return;
    try {
      this.lead = await this.leadService.getLead(this.leadId);
      if (this.lead) {
        this.leadForm.patchValue(this.lead);
      }
    } catch (error) {
      console.error('Error loading lead', error);
    }
  }

  async loadInteractions() {
    if (!this.leadId) return;
    try {
      this.interactions = await this.leadService.getInteractions(this.leadId);
    } catch (error) {
      console.error('Error loading interactions', error);
    }
  }

  async loadSources() {
    try {
      const companyId = this.authService.currentCompanyId();
      if (companyId) {
        this.sources = await this.leadService.getLeadSources(companyId);
      }
    } catch (err) {
      console.error('Error loading sources', err);
    }
  }

  toggleAddSource() {
    this.showAddSource = !this.showAddSource;
    if (this.showAddSource) {
      this.newSourceControl.reset();
    }
  }

  async saveNewSource() {
    if (this.newSourceControl.invalid) return;
    const name = this.newSourceControl.value;
    if (!name) return;

    try {
      const companyId = this.authService.currentCompanyId();

      if (companyId) {
        const newSrc = await this.leadService.createLeadSource(name, companyId);
        this.sources = [...this.sources, newSrc];
        this.sources.sort((a, b) => a.name.localeCompare(b.name));
        this.leadForm.patchValue({ lead_source_id: newSrc.id });
        this.showAddSource = false;
        this.toastService.success('Éxito', 'Fuente creada exitosamente: ' + newSrc.name);
      } else {
        this.toastService.error('Error', 'No se encontró la empresa asociada a tu usuario (recarga la página).');
      }
    } catch (err: any) {
      console.error('Error creating source', err);
      this.toastService.error('Error', 'Error al crear fuente: ' + (err.message || err));
    }
  }

  async save() {
    if (this.leadForm.invalid) return;

    this.saving = true;
    const formVal = this.leadForm.value;

    try {
      if (this.isNew) {
        // Get company ID from Service
        const companyId = this.authService.currentCompanyId();

        if (!companyId) throw new Error('No company ID found');

        const leadData = {
          ...formVal,
          company_id: companyId
        };

        const newLead = await this.leadService.createLead(leadData);
        // If created successfully, we could switch to edit mode or just close
        // Let's add an initial note if "interest" was present? 
        // For now, just close.
        this.toastService.success('Lead Creado', 'El lead se ha guardado correctamente.');
        this.saveEvent.emit();
        this.close();

      } else {
        if (!this.leadId) return;
        await this.leadService.updateLead(this.leadId, formVal);
        this.toastService.success('Lead Actualizado', 'Los cambios se han guardado correctamente.');
        this.saveEvent.emit();
        this.close();
      }
    } catch (error: any) {
      console.error('Error saving lead', error);
      this.toastService.error('Error', 'Error al guardar lead: ' + (error.message || error));
    } finally {
      this.saving = false;
    }
  }

  async addInteraction() {
    // ... existing code ...
  }

  sendingGdpr = false;
  async sendGdprRequest() {
    if (!this.lead || !this.lead.email) {
      this.toastService.error('Error', 'El lead no tiene email registrado.');
      return;
    }

    this.sendingGdpr = true;
    try {
      await this.leadService.sendGdprRequest(
        this.lead.id,
        this.lead.email,
        this.lead.first_name || 'Cliente'
      );
      this.toastService.success('Enviado', 'Solicitud de consentimiento enviada por email.');
      this.loadLead(); // Refresh dates
    } catch (err: any) {
      console.error('Error sending GDPR', err);
      this.toastService.error('Error', 'No se pudo enviar la solicitud: ' + (err.message || err));
    } finally {
      this.sendingGdpr = false;
    }
  }

  async deleteLead() {
    if (!this.leadId) return;

    // Strict owner check for deletion as per RLS
    const role = this.authService.userRole(); // Signal
    if (role !== 'owner') {
      this.toastService.error('Acceso Denegado', 'Solo el propietario de la cuenta puede eliminar leads.');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas eliminar este lead? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      this.saving = true;
      await this.leadService.deleteLead(this.leadId);
      this.toastService.success('Eliminado', 'El lead ha sido eliminado correctamente.');
      this.saveEvent.emit(); // Refresh list
      this.close();
    } catch (error: any) {
      console.error('Error deleting lead', error);
      this.toastService.error('Error', 'No se pudo eliminar el lead: ' + (error.message || error));
    } finally {
      this.saving = false;
    }
  }

  close() {
    this.closeEvent.emit();
  }

  getIconForType(type: string): string {
    switch (type) {
      case 'call': return 'fa-phone';
      case 'email': return 'fa-envelope';
      case 'whatsapp': return 'fa-comments';
      case 'meeting': return 'fa-calendar';
      case 'note': return 'fa-sticky-note';
      default: return 'fa-circle';
    }
  }
}
/* Styles handled here for inline simplicity */
// .status-badge { background: #e2e8f0; color: #475569; }
// .status-badge.success { background: #dcfce7; color: #166534; }
// .status-badge.pending { background: #fef9c3; color: #854d0e; }
