import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CalendarFilterState {
    searchQuery: string;
    selectedServiceIds: string[];
    selectedProfessionalIds: string[];
}

@Component({
    selector: 'app-calendar-filter',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div class="flex flex-col md:flex-row gap-4 items-center">
        
        <!-- Search Input -->
        <div class="relative flex-1 w-full">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
          </div>
          <input 
            type="text" 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="onFilterChange()"
            placeholder="Buscar por cliente..." 
            class="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out">
        </div>

        <!-- Professional Filter (Multi-select toggles) -->
        <div class="flex items-center space-x-2 overflow-x-auto max-w-full pb-1 md:pb-0" *ngIf="professionals.length > 0">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Equipo:</span>
            <div class="flex space-x-1">
                <button 
                    *ngFor="let pro of professionals"
                    (click)="toggleProfessional(pro.id)"
                    class="inline-flex items-center px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors border"
                    [ngClass]="isSelectedPro(pro.id) 
                        ? 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-200 dark:border-indigo-800' 
                        : 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600'">
                    {{ pro.title }}
                </button>
            </div>
        </div>
        
        <!-- Service Filter (Dropdown for now to save space, or chips if few) -->
         <div class="relative" *ngIf="services.length > 0">
             <select 
                [ngModel]="selectedServiceId" 
                (ngModelChange)="onServiceChange($event)"
                class="block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                <option value="">Todos los servicios</option>
                <option *ngFor="let service of services" [value]="service.id">{{ service.name }}</option>
             </select>
         </div>

      </div>
    </div>
  `,
    styles: [`
    :host { display: block; }
  `]
})
export class CalendarFilterComponent {
    @Input() services: any[] = [];
    @Input() professionals: any[] = [];

    @Output() filterChange = new EventEmitter<CalendarFilterState>();

    searchQuery = '';
    selectedServiceIds: string[] = [];
    selectedProfessionalIds: string[] = []; // If empty, all are selected (or none filtered out)

    // Helper for single select dropdown
    get selectedServiceId(): string {
        return this.selectedServiceIds[0] || '';
    }

    toggleProfessional(id: string) {
        if (this.isSelectedPro(id)) {
            this.selectedProfessionalIds = this.selectedProfessionalIds.filter(pid => pid !== id);
        } else {
            this.selectedProfessionalIds = [...this.selectedProfessionalIds, id];
        }
        this.onFilterChange();
    }

    isSelectedPro(id: string): boolean {
        // If list is empty, treat as "All Selected" visual state? 
        // No, let's make it additive. If empty, show all but highlights none? 
        // Or better: If empty, show all (default state). If one selected, filter to that.
        // Visual feedback: If list empty, maybe highlight all "All"? 
        // Let's invert: selected means ACTIVE filter. Empty means NO filter (Show All).
        // So button style: Selected = Colored. Not Selected = Gray.
        return this.selectedProfessionalIds.includes(id);
    }

    onServiceChange(val: string) {
        this.selectedServiceIds = val ? [val] : [];
        this.onFilterChange();
    }

    onFilterChange() {
        this.filterChange.emit({
            searchQuery: this.searchQuery,
            selectedServiceIds: this.selectedServiceIds,
            selectedProfessionalIds: this.selectedProfessionalIds
        });
    }
}
