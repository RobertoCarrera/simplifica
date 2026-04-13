import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, ProjectStage } from '../../../../../models/project';
import { Customer } from '../../../../../models/customer';

@Component({
  selector: 'app-project-dialog-properties',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div class="w-full md:w-80 bg-gray-50/50 dark:bg-gray-900/20 p-6 md:p-8 space-y-6">
      <!-- Stage -->
      <div>
        <label
          class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
          >Estado</label
        >
        <select
          [(ngModel)]="formData.stage_id"
          [disabled]="!canEdit"
          (ngModelChange)="fieldChange.emit({ field: 'stage_id', value: $event })"
          class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50"
        >
          @for (stage of stages; track stage) {
            <option [value]="stage.id">{{ stage.name }}</option>
          }
        </select>
      </div>
      <!-- Priority -->
      <div>
        <label
          class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
          >Prioridad</label
        >
        <div class="relative">
          <select
            [(ngModel)]="formData.priority"
            [disabled]="!canEdit"
            (ngModelChange)="fieldChange.emit({ field: 'priority', value: $event })"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer disabled:opacity-50"
          >
            <option value="low">🟡 Baja</option>
            <option value="medium">🔵 Media</option>
            <option value="high">🟠 Alta</option>
            <option value="critical">🔴 Crítica</option>
          </select>
          <div
            class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>
      </div>
      <!-- Client -->
      <div>
        <label
          class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
          >Cliente</label
        >
        <div class="relative">
          <select
            [(ngModel)]="formData.client_id"
            [disabled]="!canEdit"
            (ngModelChange)="fieldChange.emit({ field: 'client_id', value: $event })"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer disabled:opacity-50"
          >
            <option [value]="null">Seleccionar Cliente</option>
            @for (client of clients; track client) {
              <option [value]="client.id">
                {{ client.business_name || client.name + ' ' + (client.surname || '') }}
              </option>
            }
          </select>
          <div
            class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              ></path>
            </svg>
          </div>
        </div>
      </div>
      <!-- Dates -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label
            class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
            >Inicio</label
          >
          <input
            type="date"
            [(ngModel)]="formData.start_date"
            [disabled]="!canEdit"
            (ngModelChange)="fieldChange.emit({ field: 'start_date', value: $event })"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50"
          />
        </div>
        <div>
          <label
            class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
            >Fin</label
          >
          <input
            type="date"
            [(ngModel)]="formData.end_date"
            [disabled]="!canEdit"
            (ngModelChange)="fieldChange.emit({ field: 'end_date', value: $event })"
            class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50"
          />
        </div>
      </div>
      <!-- Activity History slot -->
      <ng-content></ng-content>
    </div>
  `,
})
export class ProjectDialogPropertiesComponent {
  @Input() formData: Partial<Project> = {};
  @Input() stages: ProjectStage[] = [];
  @Input() clients: Customer[] = [];
  @Input() canEdit = false;
  @Output() fieldChange = new EventEmitter<{ field: string; value: any }>();
}
