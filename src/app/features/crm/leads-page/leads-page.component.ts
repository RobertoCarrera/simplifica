import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LeadsKanbanComponent } from '../leads-kanban/leads-kanban.component';

@Component({
    selector: 'app-leads-page',
    standalone: true,
    imports: [CommonModule, LeadsKanbanComponent],
    template: `
    <div class="leads-page-container">
      <header class="page-header">
        <h1>Gestión de Leads</h1>
        <div class="actions">
           <!-- Future: Add Lead Button -->
           <button class="btn btn-primary" (click)="openAddLead()">
             <i class="fas fa-plus"></i> Nuevo Lead
           </button>
        </div>
      </header>
      
      <div class="content-area">
        <app-leads-kanban></app-leads-kanban>
      </div>
    </div>
  `,
    styles: [`
    .leads-page-container {
      padding: 1.5rem;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--bg-main, #f8fafc);
    }
    
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      
      h1 {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
      }
    }
    
    .content-area {
      flex: 1;
      overflow: hidden;
    }
    
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      
      &.btn-primary {
        background: var(--color-primary-600, #2563eb);
        color: white;
        
        &:hover {
          background: var(--color-primary-700, #1d4ed8);
        }
      }
    }
  `]
})
export class LeadsPageComponent {
    openAddLead() {
        // Check if we need a modal or separate page
        alert('Funcionalidad de crear lead manual en desarrollo');
    }
}
