import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Lead, LeadService } from '../../../core/services/lead.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';

interface KanbanColumn {
  id: Lead['status'];
  title: string;
  items: Lead[];
  colorClass: string;
}

@Component({
  selector: 'app-leads-kanban',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="kanban-board">
      <div class="kanban-column" *ngFor="let col of columns">
        <div class="column-header" [ngClass]="col.colorClass">
          <h3>{{ col.title }}</h3>
          <span class="count">{{ col.items.length }}</span>
        </div>
        
        <div 
          cdkDropList 
          [cdkDropListData]="col.items"
          class="lead-list" 
          (cdkDropListDropped)="drop($event, col.id)">
          
          <div class="lead-card" *ngFor="let lead of col.items" cdkDrag>
            <div class="card-badges">
                <span class="badge source" [attr.data-source]="lead.source">{{ formatSource(lead.source) }}</span>
                <span class="date">{{ lead.created_at | date:'shortDate' }}</span>
            </div>
            
            <div class="card-title">
                {{ lead.first_name }} {{ lead.last_name }}
            </div>
            
            <div class="card-details" *ngIf="lead.interest">
                <i class="fas fa-info-circle"></i> {{ lead.interest }}
            </div>
            
            <div class="card-footer">
                <span class="phone" *ngIf="lead.phone"><i class="fas fa-phone"></i></span>
                <span class="email" *ngIf="lead.email"><i class="fas fa-envelope"></i></span>
                <button class="btn-action" title="Ver detalle"><i class="fas fa-arrow-right"></i></button>
            </div>
          </div>
          
           <div class="empty-state" *ngIf="col.items.length === 0">
             <span class="placeholder">Sin leads</span>
           </div>
        </div>
      </div>
    </div>
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
      
      :host-context(.dark) & {
         background: #1e293b;
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
      }
    }
    
    .cdk-drag-preview {
      box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2),
                  0 8px 10px 1px rgba(0, 0, 0, 0.14),
                  0 3px 14px 2px rgba(0, 0, 0, 0.12);
    }
    
    .cdk-drag-placeholder {
      opacity: 0;
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
        
        :host-context(.dark) & { border-top-color: #334155; }
        
        .btn-action {
             margin-left: auto;
             background: none;
             border: none;
             color: var(--color-primary-500);
             cursor: pointer;
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

  `]
})
export class LeadsKanbanComponent implements OnInit {
  leadService = inject(LeadService);
  supabase = inject(SupabaseClientService);

  columns: KanbanColumn[] = [
    { id: 'new', title: 'Nuevos', items: [], colorClass: 'col-new' },
    { id: 'contacted', title: 'Contactados', items: [], colorClass: 'col-contacted' },
    { id: 'meeting_scheduled', title: 'Cita Agendada', items: [], colorClass: 'col-meeting' },
    { id: 'won', title: 'Ganados', items: [], colorClass: 'col-won' },
    { id: 'lost', title: 'Perdidos', items: [], colorClass: 'col-lost' }
  ];

  async ngOnInit() {
    this.loadLeads();
  }

  async loadLeads() {
    // Assuming user has a company_id in profile or we fetch first
    const { data: user } = await this.supabase.instance.auth.getUser();
    if (!user.user) return;

    const { data: member } = await this.supabase.instance
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.user.id)
      .limit(1)
      .maybeSingle();

    if (member) {
      this.leadService.getLeads(member.company_id).subscribe(leads => {
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
}
