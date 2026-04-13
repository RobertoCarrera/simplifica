import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ViewChildren,
  QueryList,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { ProjectTask } from '../../../../../models/project';

@Component({
  selector: 'app-project-dialog-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <div class="pt-6 border-t border-gray-100 dark:border-gray-700">
      <div class="flex justify-between items-center mb-4">
        <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider"
          >Tareas Pendientes ({{ pendingTasks.length }})</label
        >
        <span class="text-xs text-blue-500 font-medium"
          >{{ completedTasksCount }} completadas</span
        >
      </div>
      <div
        class="space-y-3"
        cdkDropList
        [cdkDropListData]="pendingTasks"
        (cdkDropListDropped)="dropped.emit($event)"
      >
        <!-- Pending Tasks -->
        @for (task of pendingTasks; track trackByTask($index, task)) {
          <div
            cdkDrag
            [cdkDragData]="task"
            class="group flex items-center space-x-3 p-2 bg-white dark:bg-gray-800 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 hover:shadow-sm rounded-lg transition-all cursor-default"
          >
            <!-- Drag Handle -->
            <div
              cdkDragHandle
              class="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 p-1"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 8h16M4 16h16"
                />
              </svg>
            </div>
            <!-- Drag Preview -->
            <div
              *cdkDragPreview
              class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-xl border border-blue-200 dark:border-blue-900 w-full flex items-center space-x-3"
            >
              <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                task.title
              }}</span>
            </div>
            <input
              type="checkbox"
              [(ngModel)]="task.is_completed"
              [disabled]="!canComplete"
              class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50"
            />
            <input
              type="text"
              [(ngModel)]="task.title"
              placeholder="Escribe una tarea..."
              #taskInput
              [disabled]="!canEdit"
              (keydown.enter)="taskEnter.emit($event)"
              class="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-200 disabled:opacity-50"
            />
            <!-- Assignee Selector -->
            <div class="relative group/assignee">
              <button
                class="flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full px-2 py-1 transition-colors"
                [title]="getAssigneeName(task)"
              >
                <div
                  class="h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-800"
                  [ngClass]="{
                    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300':
                      task.assigned_to,
                  }"
                >
                  {{ getAssigneeInitials(task) }}
                </div>
              </button>
              <select
                [(ngModel)]="task.assigned_to"
                [disabled]="!canAssign"
                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                title="Asignar a..."
              >
                <option [ngValue]="null">Sin asignar</option>
                <optgroup label="Equipo">
                  @for (prof of professionals; track prof) {
                    <option [ngValue]="prof.id">{{ prof.displayName }}</option>
                  }
                </optgroup>
                @if (clientName) {
                  <optgroup label="Cliente">
                    <option [ngValue]="clientAuthUserId">
                      {{ clientName }} (Cliente)
                    </option>
                  </optgroup>
                }
              </select>
            </div>
            @if (canDelete) {
              <button
                (click)="taskRemoved.emit(task)"
                class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            }
          </div>
        }
        <!-- Add Task Button -->
        @if (canCreate) {
          <button
            (click)="taskAdded.emit()"
            class="flex items-center space-x-2 text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors py-2 px-2 ml-7"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span>Añadir Tarea</span>
          </button>
        }
        <!-- Completed Tasks -->
        @if (completedTasks.length > 0) {
          <div
            class="mt-6 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700"
          >
            <h4
              class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 ml-2"
            >
              Completadas
            </h4>
            @for (task of completedTasks; track trackByTask($index, task)) {
              <div
                class="group flex items-center space-x-3 p-2 opacity-60 hover:opacity-100 transition-opacity"
              >
                <div class="w-6"></div>
                <input
                  type="checkbox"
                  [(ngModel)]="task.is_completed"
                  [disabled]="!canComplete"
                  class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50"
                />
                <span
                  class="flex-1 text-sm text-gray-500 line-through decoration-gray-400"
                  >{{ task.title }}</span
                >
                @if (canDelete) {
                  <button
                    (click)="taskRemoved.emit(task)"
                    class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class ProjectDialogTasksComponent implements AfterViewChecked {
  @Input() pendingTasks: Partial<ProjectTask>[] = [];
  @Input() completedTasks: Partial<ProjectTask>[] = [];
  @Input() completedTasksCount = 0;
  @Input() professionals: { id: string; displayName: string }[] = [];
  @Input() clientName: string | null = null;
  @Input() clientAuthUserId: string | null = null;
  @Input() canCreate = false;
  @Input() canComplete = false;
  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() canAssign = false;
  @Input() shouldFocusLast = false;

  @Output() dropped = new EventEmitter<CdkDragDrop<any[]>>();
  @Output() taskAdded = new EventEmitter<void>();
  @Output() taskRemoved = new EventEmitter<Partial<ProjectTask>>();
  @Output() taskEnter = new EventEmitter<Event>();

  @ViewChildren('taskInput') taskInputs!: QueryList<ElementRef>;

  ngAfterViewChecked() {
    if (this.shouldFocusLast) {
      const inputs = this.taskInputs.toArray();
      if (inputs.length > 0) {
        inputs[inputs.length - 1].nativeElement.focus();
      }
    }
  }

  trackByTask(index: number, task: Partial<ProjectTask>): string | number {
    return task.id || index;
  }

  getAssigneeName(task: Partial<ProjectTask>): string {
    if (!task.assigned_to) return 'Sin asignar';
    const prof = this.professionals.find((p) => p.id === task.assigned_to);
    if (prof) return prof.displayName;
    if (this.clientAuthUserId === task.assigned_to) return this.clientName || 'Cliente';
    return 'Usuario desconocido';
  }

  getAssigneeInitials(task: Partial<ProjectTask>): string {
    const name = this.getAssigneeName(task);
    if (name === 'Sin asignar') return '?';
    return name.substring(0, 2).toUpperCase();
  }
}
