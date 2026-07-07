import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectSubtask } from '../../../../../models/project';

@Component({
  selector: 'app-project-dialog-subtasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* Hover background is applied via Tailwind classes on the element
       (hover:bg-gray-50 dark:hover:bg-gray-700/40) because the .dark
       class is on a parent in a different Angular encapsulation scope
       (the app-modal). */
    .subtask-row {
      transition: background-color 0.15s ease;
    }
    .overdue-pulse {
      animation: pulse-border 2s infinite;
    }
    @keyframes pulse-border {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
      50% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0); }
    }
  `],
  template: `
    @if (subtasks.length > 0 || canCreate) {
      <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div class="flex justify-between items-center mb-2">
          <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
            >Subtareas ({{ pendingSubtasks.length }})</label
          >
          @if (completedSubtasks.length > 0) {
            <span class="text-[10px] text-green-500 font-medium"
              >{{ completedSubtasks.length }} completadas</span
            >
          }
        </div>

        <!-- Pending Subtasks -->
        <div class="space-y-1.5">
          @for (subtask of pendingSubtasks; track subtask.id || $index) {
            <div class="subtask-row flex items-center space-x-2 p-1.5 rounded-md text-xs bg-white hover:bg-gray-50 dark:bg-gray-800/40 dark:hover:bg-gray-700/40 transition-colors"
              [class.overdue-pulse]="isOverdue(subtask) && !subtask.is_completed"
            >
              <!-- Checkbox -->
              <input
                type="checkbox"
                [ngModel]="subtask.is_completed"
                (ngModelChange)="onToggleComplete(subtask, $event)"
                [disabled]="!canComplete"
                class="h-3.5 w-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50 flex-shrink-0"
              />

              <!-- Title -->
              <input
                type="text"
                [ngModel]="subtask.title"
                (ngModelChange)="onTitleChange(subtask, $event)"
                placeholder="Subtarea..."
                [disabled]="!canEdit"
                (keydown.enter)="$event.preventDefault()"
                class="flex-1 bg-transparent border-none focus:ring-0 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 min-w-0"
              />

              <!-- Start Date -->
              <input
                type="date"
                [ngModel]="subtask.start_date"
                (ngModelChange)="onStartDateChange(subtask, $event)"
                [disabled]="!canEdit"
                class="w-28 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 flex-shrink-0"
                title="Fecha inicio"
              />

              <!-- Due Date -->
              <div class="relative flex-shrink-0">
                <input
                  type="date"
                  [ngModel]="subtask.due_date"
                  (ngModelChange)="onDueDateChange(subtask, $event)"
                  [disabled]="!canEdit"
                  class="w-28 bg-white dark:bg-gray-700 border rounded px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  [ngClass]="getDueDateInputClass(subtask)"
                  title="Fecha vencimiento"
                />
                @if (isOverdue(subtask) && !subtask.is_completed) {
                  <span class="absolute -top-1 -right-1 text-red-500 text-[10px]" title="¡Vencida!">⚠️</span>
                }
              </div>

              <!-- Assignee -->
              <select
                [ngModel]="subtask.assigned_to"
                (ngModelChange)="onAssigneeChange(subtask, $event)"
                [disabled]="!canAssign"
                class="w-28 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 text-[10px] text-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 flex-shrink-0"
              >
                <option [ngValue]="null">Sin asignar</option>
                @for (prof of professionals; track prof.id) {
                  <option [ngValue]="prof.id">{{ prof.displayName }}</option>
                }
              </select>

              <!-- Justify overdue button -->
              @if (isOverdue(subtask) && !subtask.is_completed && !subtask._justified) {
                <button
                  (click)="onJustifyOverdue(subtask)"
                  class="text-red-500 hover:text-red-700 text-[10px] font-medium px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                  title="Justificar vencimiento"
                >
                  Justificar
                </button>
              }

              <!-- Delete -->
              @if (canDelete) {
                <button
                  (click)="onRemove(subtask)"
                  class="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors flex-shrink-0"
                  title="Eliminar subtarea"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          }
        </div>

        <!-- Add Subtask -->
        @if (canCreate) {
          <button
            (click)="onAdd()"
            class="flex items-center space-x-1 text-[10px] text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400 transition-colors py-1 px-1 mt-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Añadir subtarea</span>
          </button>
        }

        <!-- Completed Subtasks -->
        @if (completedSubtasks.length > 0) {
          <div class="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700">
            <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1"
              >Completadas</label
            >
            @for (subtask of completedSubtasks; track subtask.id || $index) {
              <div class="flex items-center space-x-2 p-1 opacity-50 hover:opacity-80 transition-opacity">
                <input
                  type="checkbox"
                  [ngModel]="subtask.is_completed"
                  (ngModelChange)="onToggleComplete(subtask, $event)"
                  [disabled]="!canComplete"
                  class="h-3.5 w-3.5 text-blue-600 rounded border-gray-300 cursor-pointer disabled:opacity-50"
                />
                <span class="flex-1 text-[11px] text-gray-400 line-through">{{ subtask.title }}</span>
                @if (canDelete) {
                  <button
                    (click)="onRemove(subtask)"
                    class="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ProjectDialogSubtasksComponent {
  @Input() subtasks: Partial<ProjectSubtask>[] = [];
  @Input() professionals: { id: string; displayName: string }[] = [];
  @Input() canCreate = false;
  @Input() canComplete = false;
  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() canAssign = false;

  @Output() subtaskAdded = new EventEmitter<void>();
  @Output() subtaskRemoved = new EventEmitter<Partial<ProjectSubtask>>();
  @Output() subtaskChanged = new EventEmitter<Partial<ProjectSubtask>>();
  @Output() justifyOverdue = new EventEmitter<Partial<ProjectSubtask>>();

  get pendingSubtasks(): Partial<ProjectSubtask>[] {
    return this.subtasks
      .filter(s => !s.is_completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  get completedSubtasks(): Partial<ProjectSubtask>[] {
    return this.subtasks
      .filter(s => s.is_completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  isOverdue(subtask: Partial<ProjectSubtask>): boolean {
    if (!subtask.due_date || subtask.is_completed) return false;
    try {
      const dueDate = new Date(subtask.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    } catch {
      return false;
    }
  }

  isApproaching(subtask: Partial<ProjectSubtask>): boolean {
    if (this.isOverdue(subtask)) return false;
    if (!subtask.due_date || subtask.is_completed) return false;
    try {
      const dueDate = new Date(subtask.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diff <= 2;
    } catch {
      return false;
    }
  }

  getDueDateInputClass(subtask: Partial<ProjectSubtask>): string {
    if (this.isOverdue(subtask) && !subtask.is_completed) {
      return 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    }
    if (this.isApproaching(subtask)) {
      return 'border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
    }
    return 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400';
  }

  onAdd(): void {
    this.subtaskAdded.emit();
  }

  onRemove(subtask: Partial<ProjectSubtask>): void {
    this.subtaskRemoved.emit(subtask);
  }

  onToggleComplete(subtask: Partial<ProjectSubtask>, completed: boolean): void {
    subtask.is_completed = completed;
    this.subtaskChanged.emit(subtask);
  }

  onTitleChange(subtask: Partial<ProjectSubtask>, title: string): void {
    subtask.title = title;
    this.subtaskChanged.emit(subtask);
  }

  onStartDateChange(subtask: Partial<ProjectSubtask>, date: string): void {
    subtask.start_date = date || undefined;
    this.subtaskChanged.emit(subtask);
  }

  onDueDateChange(subtask: Partial<ProjectSubtask>, date: string): void {
    subtask.due_date = date || undefined;
    this.subtaskChanged.emit(subtask);
  }

  onAssigneeChange(subtask: Partial<ProjectSubtask>, assignee: string): void {
    subtask.assigned_to = assignee || undefined;
    this.subtaskChanged.emit(subtask);
  }

  onJustifyOverdue(subtask: Partial<ProjectSubtask>): void {
    this.justifyOverdue.emit(subtask);
  }
}
