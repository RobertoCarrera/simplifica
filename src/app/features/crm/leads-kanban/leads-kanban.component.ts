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
  templateUrl: './leads-kanban.component.html',
  styleUrls: ['./leads-kanban.component.scss']
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
