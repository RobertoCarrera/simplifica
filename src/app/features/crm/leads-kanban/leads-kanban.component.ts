import { Component, OnInit, inject, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Lead, LeadService } from '../../../core/services/lead.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { LeadDetailModalComponent } from '../lead-detail-modal/lead-detail-modal.component';
import { ThemeService } from '../../../services/theme.service';

interface KanbanColumn {
  id: Lead['status'];
  title: string;
  items: Lead[];
  colorClass: string;
}

@Component({
  selector: 'app-leads-kanban',
  standalone: true,
  imports: [CommonModule, DragDropModule, LeadDetailModalComponent],
  template: `
    <div class="kanban-board" [class.dark-mode]="themeService.currentTheme() === 'dark'">
      <div class="kanban-column" *ngFor="let col of columns">
        <div class="column-header" [ngClass]="col.colorClass">
          <h3>{{ col.title }}</h3>
          <span class="count">{{ col.items.length }}</span>
        </div>
        
        <div 
          cdkDropList 
          [id]="col.id"
          [cdkDropListData]="col.items"
          [cdkDropListConnectedTo]="connectedLists"
          class="lead-list" 
          (cdkDropListDropped)="drop($event, col.id)">
          
            <div class="lead-card" *ngFor="let lead of col.items" cdkDrag (dblclick)="openLead(lead)">
            <div class="card-badges">
                <span class="badge source" [attr.data-source]="lead.lead_source?.name || lead.source">{{ lead.lead_source?.name || formatSource(lead.source) }}</span>
                <span class="date">{{ lead.created_at | date:'shortDate' }}</span>
            </div>
            
            <div class="card-title">
                {{ lead.first_name }} {{ lead.last_name }}
                <i class="fas fa-exclamation-triangle warning-icon" 
                   *ngIf="isStagnant(lead)" 
                   title="Sin actividad en > 7 días"></i>
            </div>
            
            <div class="card-details" *ngIf="lead.interest">
                <i class="fas fa-info-circle"></i> {{ lead.interest }}
            </div>
            
            <div class="card-footer">
                <span class="phone" *ngIf="lead.phone"><i class="fas fa-phone"></i></span>
                <span class="email" *ngIf="lead.email"><i class="fas fa-envelope"></i></span>
                
                <button class="btn-action delete" *ngIf="authService.userRole() === 'owner'" title="Eliminar" (click)="deleteLead(lead); $event.stopPropagation()">
                   <i class="fas fa-trash"></i>
                </button>
                <button class="btn-action" title="Ver detalle" (click)="openLead(lead); $event.stopPropagation()"><i class="fas fa-arrow-right"></i></button>
            </div>
          </div>
          
           <div class="empty-state" *ngIf="col.items.length === 0">
             <span class="placeholder">Sin leads</span>
           </div>
        </div>
      </div>
    </div>

    <app-lead-detail-modal 
      *ngIf="selectedLeadId" 
      [leadId]="selectedLeadId" 
      (closeEvent)="selectedLeadId = null"
      (saveEvent)="onLeadSaved()">
    </app-lead-detail-modal>
  `,
  styles: [`
    .kanban-board {
      display: flex;
      gap: 1.5rem;
      height: 100%;
      overflow-x: auto;
      padding-bottom: 1rem;
    }
    
    .kanban-column {
      flex: 1;
      min-width: 300px;
      max-width: 350px;
      background: var(--bg-secondary, #f1f5f9);
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      height: 100%;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      
      .dark-mode & {
         background: #334155; /* Slightly lighter than card */
         .column-header h3 { color: #f8fafc; }
      }
    }
    
    .column-header {
      padding: 1rem;
      border-bottom: 2px solid rgba(0,0,0,0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      
      h3 { margin: 0; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
      .count { background: rgba(0,0,0,0.1); padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }
      
      &.col-new { border-bottom-color: #3b82f6; h3 { color: #3b82f6; } }
      &.col-contacted { border-bottom-color: #f59e0b; h3 { color: #f59e0b; } }
      &.col-meeting { border-bottom-color: #8b5cf6; h3 { color: #8b5cf6; } }
      &.col-won { border-bottom-color: #10b981; h3 { color: #10b981; } }
      &.col-lost { border-bottom-color: #ef4444; h3 { color: #ef4444; } }
    }
    
    .lead-list {
      padding: 1rem;
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 100px; /* Ensure drop target exists */
    }
    
    .lead-card {
      background: var(--bg-card, #fff);
      padding: 1rem;
      border-radius: 0.5rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      cursor: grab;
      border: 1px solid transparent;
      transition: all 0.2s;
      
      &:hover {
        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        transform: translateY(-2px);
      }
      
      :host-context(.dark) & {
         background: #0f172a;
         border-color: #334155;
         
         .card-title { color: #f8fafc; }
         .card-details { color: #cbd5e1; }
         .card-badges .date { color: #94a3b8; }
      }
    }
    
    .cdk-drag-preview {
      box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);
      border-radius: 0.5rem;
      background: var(--bg-card, #fff);
      
      .dark-mode & {
         background: #0f172a;
         border: 1px solid #334155;
      }
    }
    
    .cdk-drag-placeholder {
      opacity: 0.3;
      background: #e2e8f0;
      border: 2px dashed #94a3b8;
      border-radius: 0.5rem;
      
      .dark-mode & {
         background: rgba(255,255,255,0.05);
         border-color: #475569;
      }
    }
    
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    
    .lead-list.cdk-drop-list-dragging .lead-card:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    
    .card-badges {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
        
        .badge {
            padding: 2px 6px;
            border-radius: 4px;
            background: #e2e8f0;
            color: #475569;
            font-weight: 500;
            
            &[data-source="web_form"] { background: #dbeafe; color: #1e40af; }
            &[data-source="doctoralia"] { background: #dcfce7; color: #166534; }
        }
    }
    
    .card-title {
        font-weight: 600;
        font-size: 1rem;
        margin-bottom: 0.25rem;
        color: var(--text-primary);
        display: flex;
        justify-content: space-between;
        align-items: center;

        .warning-icon {
            color: #f59e0b; /* Amber 500 */
            font-size: 0.9rem;
            animation: pulse 2s infinite;
        }
    }
    
    .card-details {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-bottom: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    
    .card-footer {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        border-top: 1px solid var(--border-color, #e2e8f0);
        padding-top: 0.5rem;
        color: var(--text-secondary);
        
        .dark-mode & { 
          border-top-color: #334155; 
          color: #94a3b8;
        }
        
        .btn-action {
             margin-left: auto;
             background: none;
             border: none;
             color: var(--color-primary-500);
             cursor: pointer;
             
             &.delete {
               margin-left: 0;
               margin-right: auto;
               color: var(--color-error, #ef4444);
               opacity: 0.5;
               &:hover { opacity: 1; }
             }
        }
    }
    
    .empty-state {
        text-align: center;
        padding: 2rem 0;
        color: var(--text-secondary);
        font-style: italic;
        font-size: 0.9rem;
        opacity: 0.6;
    }

    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; transform: scale(1.1); }
        100% { opacity: 0.6; }
    }

  `]
})
export class LeadsKanbanComponent implements OnInit, OnChanges {
  @Input() refreshTrigger = 0;

  leadService = inject(LeadService);
  authService = inject(AuthService);
  themeService = inject(ThemeService);
  toastService = inject(ToastService);

  columns: KanbanColumn[] = [
    { id: 'new', title: 'Nuevos', items: [], colorClass: 'col-new' },
    { id: 'contacted', title: 'Contactados', items: [], colorClass: 'col-contacted' },
    { id: 'meeting_scheduled', title: 'Cita Agendada', items: [], colorClass: 'col-meeting' },
    { id: 'won', title: 'Ganados', items: [], colorClass: 'col-won' },
    { id: 'lost', title: 'Perdidos', items: [], colorClass: 'col-lost' }
  ];

  connectedLists: string[] = this.columns.map(c => c.id);

  selectedLeadId: string | null = null;
  supabase = inject(SupabaseClientService);

  async ngOnInit() {
    this.loadLeads();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['refreshTrigger'] && !changes['refreshTrigger'].firstChange) {
      this.loadLeads();
    }
  }

  async loadLeads() {
    const companyId = this.authService.currentCompanyId();
    if (companyId) {
      this.leadService.getLeads(companyId).subscribe(leads => {
        this.distributeLeads(leads);
      });
    }
  }

  distributeLeads(leads: Lead[]) {
    this.columns.forEach(col => col.items = []); // Reset
    leads.forEach(lead => {
      const col = this.columns.find(c => c.id === lead.status);
      if (col) col.items.push(lead);
    });
  }

  async drop(event: CdkDragDrop<Lead[]>, newStatus: Lead['status']) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const lead = event.previousContainer.data[event.previousIndex];

      // Optimistic UI Update
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

      // Backend Update
      try {
        await this.leadService.updateLeadStatus(lead.id, newStatus);
      } catch (err) {
        // Revert on error (optional complexity)
        console.error('Failed to update status', err);
      }
    }
  }

  formatSource(source: string) {
    const map: any = {
      'web_form': 'Web',
      'doctoralia': 'Doctoralia',
      'top_doctors': 'Top Doctors',
      'whatsapp': 'WhatsApp',
      'phone': 'Teléfono'
    };
    return map[source] || source;
  }

  isStagnant(lead: Lead): boolean {
    if (['won', 'lost'].includes(lead.status)) return false;
    if (!lead.updated_at) return false;

    const lastUpdate = new Date(lead.updated_at).getTime();
    const now = new Date().getTime();
    const diffDays = (now - lastUpdate) / (1000 * 3600 * 24);

    return diffDays > 7;
  }

  openLead(lead: Lead) {
    this.selectedLeadId = lead.id;
  }

  onLeadSaved() {
    this.selectedLeadId = null;
    this.loadLeads();
  }

  async deleteLead(lead: Lead) {
    if (this.authService.userRole() !== 'owner') return;

    if (!confirm(`¿Eliminar lead ${lead.first_name} ${lead.last_name}?`)) return;

    try {
      await this.leadService.deleteLead(lead.id);
      this.toastService.success('Eliminado', 'Lead eliminado correctamente');
      this.loadLeads();
    } catch (err: any) {
      console.error('Error deleting lead', err);
      this.toastService.error('Error', 'No se pudo eliminar el lead');
    }
  }
}
