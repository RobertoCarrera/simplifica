import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeadsKanbanComponent } from '../leads-kanban/leads-kanban.component';

@Component({
  selector: 'app-leads-page',
  standalone: true,
  imports: [CommonModule, LeadsKanbanComponent],
  template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <div class="flex-1 overflow-hidden p-4 md:p-6">
        <app-leads-kanban [refreshTrigger]="refreshTrigger"></app-leads-kanban>
      </div>
    </div>
  `,
  styles: []
})
export class LeadsPageComponent {
  refreshTrigger = 0;
}
