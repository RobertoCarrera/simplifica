import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeadsKanbanComponent } from '../leads-kanban/leads-kanban.component';
import { LeadDetailModalComponent } from '../lead-detail-modal/lead-detail-modal.component';

@Component({
  selector: 'app-leads-page',
  standalone: true,
  imports: [CommonModule, LeadsKanbanComponent, LeadDetailModalComponent],
  template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <header class="flex justify-between items-center px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">Gestión de Leads</h1>
        <div class="flex items-center gap-3">
           <button (click)="showModal = true"
                   class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
             <i class="fas fa-plus"></i> <span class="hidden sm:inline">Nuevo Lead</span>
           </button>
        </div>
      </header>
      
      <div class="flex-1 overflow-hidden p-4 md:p-6">
        <app-leads-kanban [refreshTrigger]="refreshTrigger"></app-leads-kanban>
      </div>

      <app-lead-detail-modal 
        *ngIf="showModal" 
        [leadId]="null" 
        (closeEvent)="showModal = false"
        (saveEvent)="onLeadSaved()">
      </app-lead-detail-modal>
    </div>
  `,
  styles: []
})
export class LeadsPageComponent {
  showModal = false;
  refreshTrigger = 0;

  onLeadSaved() {
    this.refreshTrigger++;
    this.showModal = false;
  }
}
