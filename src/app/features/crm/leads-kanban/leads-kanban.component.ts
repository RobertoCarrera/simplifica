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
    <div class="h-full flex flex-col animate-fade-in" [class.dark]="themeService.currentTheme() === 'dark'">
      
      <!-- Board Container -->
      <div class="flex-1 overflow-x-auto overflow-y-hidden" cdkDropListGroup>
        <div class="flex h-full gap-6 pb-4 min-w-fit px-1">
          
          @for (col of columns; track col.id) {
          <div class="flex-shrink-0 w-80 flex flex-col bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-sm transition-colors duration-300">
            
            <!-- Column Header -->
            <div class="p-4 border-b border-slate-200/50 dark:border-slate-700/50 flex justify-between items-center bg-white/50 dark:bg-slate-800/50 rounded-t-xl backdrop-blur-sm sticky top-0 z-10">
              <div class="flex items-center gap-2">
                <div class="w-2 h-2 rounded-full" [ngClass]="getStatusDotColor(col.id)"></div>
                <h3 class="font-bold text-sm uppercase text-slate-600 dark:text-slate-300 tracking-wide">{{ col.title }}</h3>
              </div>
              <span class="text-xs bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium">
                {{ col.items.length }}
              </span>
            </div>
            
            <!-- Drop List -->
            <div 
              cdkDropList 
              [cdkDropListData]="col.items"
              class="flex-1 p-3 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent"
              (cdkDropListDropped)="drop($event, col.id)">
              
              <!-- Lead Card -->
               @for (lead of col.items; track lead.id) {
              <div 
                   cdkDrag 
                   class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors duration-200 cursor-grab active:cursor-grabbing group relative"

                   (dblclick)="openLead(lead)">
                
                <!-- Card Header: Source & Date -->
                <div class="flex justify-between items-start mb-3">
                  <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                        [ngClass]="getSourceBadgeClass(lead.lead_source?.name || lead.source)">
                    <i [class]="getSourceIcon(lead.lead_source?.name || lead.source)" class="mr-1"></i>
                    {{ lead.lead_source?.name || formatSource(lead.source) }}
                  </span>
                  <span class="text-[10px] text-slate-400 font-medium">
                    {{ lead.created_at | date:'d MMM' }}
                  </span>
                </div>
                
                <!-- Card Title -->
                <div class="mb-2">
                  <h4 class="text-sm font-semibold text-slate-900 dark:text-white leading-tight flex items-center justify-between gap-2">
                    <span class="line-clamp-1">{{ lead.first_name }} {{ lead.last_name }}</span>
                    @if (isStagnant(lead)) {
                    <i class="fas fa-exclamation-triangle text-amber-500 animate-pulse text-xs" 
                       title="Sin actividad en > 7 días"></i>
                    }
                  </h4>
                </div>
                
                <!-- Card Details -->
                @if (lead.interest) {
                <div class="mb-3">
                   <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 bg-slate-50 dark:bg-slate-700/50 p-2 rounded-lg">
                     <i class="fas fa-info-circle mr-1 opacity-70"></i> {{ lead.interest }}
                   </p>
                </div>
                }
                
                <!-- Card Footer: Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700/50 mt-1">
                  <div class="flex gap-3 text-slate-400">
                    @if (lead.phone) { <span title="Tiene teléfono"><i class="fas fa-phone text-xs"></i></span> }
                    @if (lead.email) { <span title="Tiene email"><i class="fas fa-envelope text-xs"></i></span> }
                  </div>
                  
                  <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    @if (authService.userRole() === 'owner') {
                    <button 
                            (click)="deleteLead(lead); $event.stopPropagation()"
                            class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Eliminar">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                    }
                    <button (click)="openLead(lead); $event.stopPropagation()"
                            class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                            title="Ver detalle">
                        <i class="fas fa-arrow-right text-xs"></i>
                    </button>
                  </div>
                </div>

              </div>
              }
              <!-- End Lead Card -->

              @if (col.items.length === 0) {
              <div class="text-center py-8 text-slate-400 italic text-xs">
                Sin leads en esta etapa
              </div>
              }

            </div>
          </div>
          }
          
        </div>
      </div>
    </div>

    <!-- Modals -->
    @if (selectedLeadId) {
    <app-lead-detail-modal 
      [leadId]="selectedLeadId" 
      (closeEvent)="selectedLeadId = null"
      (saveEvent)="onLeadSaved()">
    </app-lead-detail-modal>
    }
  `,
  styles: [`
    /* Custom Scrollbar for columns */
    .scrollbar-thin::-webkit-scrollbar {
      width: 4px;
    }
    .scrollbar-thin::-webkit-scrollbar-track {
      background: transparent;
    }
    .scrollbar-thin::-webkit-scrollbar-thumb {
      background-color: #cbd5e1;
      border-radius: 20px;
    }
    .dark .scrollbar-thin::-webkit-scrollbar-thumb {
      background-color: #475569;
    }

    /* CDK Drag & Drop Styles specific overrides if needed */
    .cdk-drag-preview {
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      border-radius: 0.75rem;
      background-color: white;
      padding: 1rem;
      border: 1px solid #e2e8f0;
      width: 100%;
      max-width: 320px;
    }
    
    .dark .cdk-drag-preview {
      background-color: #1e293b;
      border-color: #334155;
      color: white;
    }
    
    .cdk-drag-placeholder {
      opacity: 0.3;
      background: #e2e8f0;
      border: 2px dashed #94a3b8;
      border-radius: 0.75rem;
    }
    
    .dark .cdk-drag-placeholder {
      background: rgba(255,255,255,0.05);
      border-color: #475569;
    }
    
    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }
    
    .cdk-drop-list-dragging .cdk-drag {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
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
        // Revert or show error
        console.error('Failed to update status', err);
        this.toastService.error('Error', 'No se pudo actualizar el estado');
      }
    }
  }

  formatSource(source: string) {
    const map: any = {
      'web_form': 'Web',
      'doctoralia': 'Doctoralia',
      'top_doctors': 'Top Doctors',
      'whatsapp': 'WhatsApp',
      'phone': 'Teléfono',
      'instagram': 'Instagram',
      'facebook': 'Facebook'
    };
    return map[source] || source;
  }

  getSourceIcon(source: string): string {
    const map: any = {
      'web_form': 'fas fa-globe',
      'doctoralia': 'fas fa-user-md',
      'top_doctors': 'fas fa-stethoscope',
      'whatsapp': 'fab fa-whatsapp',
      'phone': 'fas fa-phone',
      'instagram': 'fab fa-instagram',
      'facebook': 'fab fa-facebook'
    };
    return map[source] || 'fas fa-link';
  }

  getSourceBadgeClass(source: string): string {
    const map: any = {
      'web_form': 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
      'doctoralia': 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
      'top_doctors': 'bg-teal-50 text-teal-600 border-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800',
      'whatsapp': 'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
      'instagram': 'bg-pink-50 text-pink-600 border-pink-100 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-800',
      'facebook': 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800'
    };
    return map[source] || 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600';
  }

  getStatusDotColor(status: string): string {
    const map: any = {
      'new': 'bg-blue-500',
      'contacted': 'bg-amber-500',
      'meeting_scheduled': 'bg-purple-500',
      'won': 'bg-emerald-500',
      'lost': 'bg-red-500'
    };
    return map[status] || 'bg-slate-500';
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

    if (!confirm(`¿Eliminar lead ${lead.first_name} ${lead.last_name}? DE ESTE MODO NO PODRAS RECUPERARLO. TE ACONSEJO MOVERLO A PERDIDO`)) return;

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
