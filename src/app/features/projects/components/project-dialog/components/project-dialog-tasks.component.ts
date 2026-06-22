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
import { ProjectTask, ProjectSubtask, ProjectTaskDocument } from '../../../../../models/project';
import { ProjectDialogSubtasksComponent } from './project-dialog-subtasks.component';
import { SubtaskOverdueModalComponent } from './subtask-overdue-modal.component';
import { ProjectDialogTaskDocumentsComponent } from './project-dialog-task-documents.component';
import { ProjectsService } from '../../../../../core/services/projects.service';
import { inject } from '@angular/core';
const LS_KEY_PREFIX = 'project-tasks-expanded-';

@Component({
  selector: 'app-project-dialog-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, ProjectDialogSubtasksComponent, SubtaskOverdueModalComponent, ProjectDialogTaskDocumentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .task-detail-panel {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease, opacity 0.3s ease, padding 0.3s ease;
      opacity: 0;
    }
    .task-detail-panel.expanded {
      max-height: 250px;
      opacity: 1;
      padding: 0.75rem 0;
    }
    .task-row-wrapper {
      border-radius: 0.5rem;
      transition: background-color 0.2s ease;
    }
    .task-row-wrapper.expanded-bg {
      background-color: rgb(249 250 251);
    }
    .dark .task-row-wrapper.expanded-bg {
      background-color: rgb(31 41 55);
    }
    /* When wrapper is expanded-bg, neutralize the bg-white on the inner row
       so the wrapper's expanded background is visible. The inner row's
       bg-white was visually overriding the wrapper's expanded background. */
    .task-row-wrapper.expanded-bg > .task-row {
      background-color: transparent !important;
    }
    .chevron-icon {
      transition: transform 0.25s ease;
      flex-shrink: 0;
    }
    .chevron-icon.rotated {
      transform: rotate(90deg);
    }
  `],
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
        class="space-y-2"
        cdkDropList
        [cdkDropListData]="pendingTasks"
        (cdkDropListDropped)="dropped.emit($event)"
      >
        <!-- Pending Tasks -->
        @for (task of pendingTasks; track task.id ?? task.position ?? $index) {
          <div
            cdkDrag
            [cdkDragData]="task"
            class="task-row-wrapper"
            [class.expanded-bg]="expandedIndex === $index"
          >
            <!-- Task Row (clickable) -->
            <div
              class="task-row group flex items-center space-x-2 p-2 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 hover:shadow-sm rounded-lg transition-all cursor-pointer"
              [ngClass]="expandedIndex === $index
                ? 'bg-transparent'
                : 'bg-white dark:bg-gray-800'"
              (click)="toggleTask($index, task)"
            >
              <!-- Drag Handle -->
              <div
                cdkDragHandle
                class="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 py-1 px-0.5"
                (click)="$event.stopPropagation()"
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

              <!-- Expand Indicator -->
              <div class="flex items-center justify-center w-5 h-5 flex-shrink-0">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 chevron-icon text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
                  [class.rotated]="expandedIndex === $index"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
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

              <!-- Checkbox -->
              <input
                type="checkbox"
                [(ngModel)]="task.is_completed"
                [disabled]="!canComplete"
                (click)="$event.stopPropagation()"
                class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50 flex-shrink-0"
              />

              <!-- Title -->
              <input
                type="text"
                [(ngModel)]="task.title"
                placeholder="Escribe una tarea..."
                #taskInput
                [disabled]="!canEdit"
                (click)="$event.stopPropagation()"
                (keydown.enter)="taskEnter.emit($event)"
                class="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-200 disabled:opacity-50 min-w-0"
              />

              <!-- Assignee Selector -->
              <div class="relative group/assignee flex-shrink-0">
                <button
                  class="flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full px-2 py-1 transition-colors"
                  [title]="getAssigneeName(task)"
                  (click)="$event.stopPropagation()"
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
                  (click)="$event.stopPropagation()"
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

              <!-- Delete Button -->
              @if (canDelete) {
                <button
                  (click)="taskRemoved.emit(task); $event.stopPropagation()"
                  class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
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

            <!-- Detail Panel (expandable) -->
            <div
              class="task-detail-panel px-10"
              [class.expanded]="expandedIndex === $index"
            >
              <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <!-- Description -->
                @if (task.description) {
                  <div>
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">Descripción</span>
                    <p class="text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{{ task.description }}</p>
                  </div>
                }

                <!-- Due Date -->
                @if (task.due_date) {
                  <div class="flex items-center space-x-2">
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider w-24 flex-shrink-0">Vencimiento</span>
                    <span
                      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                      [ngClass]="getDueDateClass(task.due_date)"
                    >
                      {{ formatDate(task.due_date) }}
                      @if (isOverdue(task.due_date)) {
                        <span class="ml-1 text-red-500">⚠</span>
                      }
                    </span>
                  </div>
                }

                <!-- Assigned To -->
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider w-24 flex-shrink-0">Asignado a</span>
                  <span class="text-gray-700 dark:text-gray-200">{{ getAssigneeName(task) }}</span>
                </div>

                <!-- Created At -->
                @if (task.created_at) {
                  <div class="flex items-center space-x-2">
                    <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider w-24 flex-shrink-0">Creado</span>
                    <span class="text-gray-500 dark:text-gray-400">{{ formatDate(task.created_at) }}</span>
                  </div>
                }

                <!-- Empty state if no details -->
                @if (!task.description && !task.due_date && !task.created_at) {
                  <p class="text-gray-400 dark:text-gray-500 italic text-xs">Sin detalles adicionales</p>
                }

                <!-- Subtasks Section -->
                <app-project-dialog-subtasks
                  [subtasks]="task.subtasks || []"
                  [professionals]="professionals"
                  [canCreate]="canCreate"
                  [canComplete]="canComplete"
                  [canEdit]="canEdit"
                  [canDelete]="canDelete"
                  [canAssign]="canAssign"
                  (subtaskAdded)="subtaskAdded.emit(task)"
                  (subtaskRemoved)="subtaskRemoved.emit({task: task, subtask: $event})"
                  (subtaskChanged)="subtaskChanged.emit({task: task, subtask: $event})"
                  (justifyOverdue)="openOverdueModal($event)"
                ></app-project-dialog-subtasks>

                <!-- Task Documents Section -->
                @if (task.id) {
                  <app-project-dialog-task-documents
                    [taskId]="task.id"
                    [projectId]="projectId"
                    [canEdit]="canEdit"
                    [documents]="getTaskDocuments(task.id)"
                    (documentAssociated)="onDocumentAssociated(task)"
                    (documentRemoved)="onDocumentRemoved(task)"
                  ></app-project-dialog-task-documents>
                }
              </div>
            </div>

            <!-- Overdue Justification Modal -->
            <app-subtask-overdue-modal
              [visible]="overdueModalVisible"
              [subtaskTitle]="overdueSubtaskTitle"
              [currentDueDate]="overdueSubtaskDueDate"
              [isSaving]="overdueModalSaving"
              (confirm)="onOverdueConfirmed($event)"
              (cancel)="overdueModalVisible = false"
            ></app-subtask-overdue-modal>
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
  @Input() projectId = '';

  @Output() dropped = new EventEmitter<CdkDragDrop<any[]>>();
  @Output() taskAdded = new EventEmitter<void>();
  @Output() taskRemoved = new EventEmitter<Partial<ProjectTask>>();
  @Output() taskEnter = new EventEmitter<Event>();

  // Subtask events
  @Output() subtaskAdded = new EventEmitter<Partial<ProjectTask>>();
  @Output() subtaskRemoved = new EventEmitter<{ task: Partial<ProjectTask>; subtask: Partial<ProjectSubtask> }>();
  @Output() subtaskChanged = new EventEmitter<{ task: Partial<ProjectTask>; subtask: Partial<ProjectSubtask> }>();
  @Output() justifyOverdue = new EventEmitter<Partial<ProjectSubtask>>();
  @Output() overdueConfirmed = new EventEmitter<{ subtask: Partial<ProjectSubtask>; justification: string; newDueDate: string }>();
  @Output() taskExpanded = new EventEmitter<Partial<ProjectTask>>();
  @Output() documentChanged = new EventEmitter<Partial<ProjectTask>>();

  // Task documents state
  taskDocumentsMap: Record<string, ProjectTaskDocument[]> = {};

  private projectsService = inject(ProjectsService);

  // Overdue modal state
  overdueModalVisible = false;
  overdueModalSaving = false;
  overdueSubtask: Partial<ProjectSubtask> | null = null;
  overdueSubtaskTitle = '';
  overdueSubtaskDueDate = '';

  @ViewChildren('taskInput') taskInputs!: QueryList<ElementRef>;

  expandedIndex: number | null = null;

  ngOnInit() {
    // No persisted expansion state — we use the live index in the pendingTasks
    // array, which is unstable across reorders and resets across sessions.
    // Tasks without an id (not yet persisted) can still be expanded by index.
  }

  ngAfterViewChecked() {
    if (this.shouldFocusLast) {
      const inputs = this.taskInputs.toArray();
      if (inputs.length > 0) {
        inputs[inputs.length - 1].nativeElement.focus();
      }
    }
  }

  toggleTask(index: number, task: Partial<ProjectTask>): void {
    const newIndex = this.expandedIndex === index ? null : index;
    this.expandedIndex = newIndex;

    // Emit when expanding so parent can lazy-load subtasks
    if (newIndex !== null) {
      this.taskExpanded.emit(task);
      this.loadDocumentsForTask(task);
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

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  isOverdue(dateStr: string): boolean {
    if (!dateStr) return false;
    try {
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Reset time for comparison
      date.setHours(0, 0, 0, 0);
      return date < today;
    } catch {
      return false;
    }
  }

  getDueDateClass(dateStr: string): string {
    if (!dateStr) return '';
    if (this.isOverdue(dateStr)) {
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    }
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 2) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    }
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }

  openOverdueModal(subtask: Partial<ProjectSubtask>): void {
    this.overdueSubtask = subtask;
    this.overdueSubtaskTitle = subtask.title || '';
    this.overdueSubtaskDueDate = subtask.due_date || '';
    this.overdueModalVisible = true;
    this.overdueModalSaving = false;
  }

  onOverdueConfirmed(event: { justification: string; newDueDate: string }): void {
    this.overdueModalSaving = true;
    this.overdueConfirmed.emit({
      subtask: this.overdueSubtask!,
      justification: event.justification,
      newDueDate: event.newDueDate,
    });
    this.overdueModalVisible = false;
    this.overdueModalSaving = false;
    this.overdueSubtask = null;
  }

  /**
   * Returns cached documents for a task (used by template)
   */
  getTaskDocuments(taskId: string | undefined): ProjectTaskDocument[] {
    if (!taskId) return [];
    return this.taskDocumentsMap[taskId] || [];
  }

  /**
   * Load documents from Supabase for a task and cache them
   */
  async loadDocumentsForTask(task: Partial<ProjectTask>): Promise<void> {
    if (!task.id) return;
    try {
      const docs = await this.projectsService.getTaskDocuments(task.id);
      this.taskDocumentsMap[task.id] = docs;
    } catch (err) {
      console.error('Error loading documents for task:', err);
      this.taskDocumentsMap[task.id] = [];
    }
  }

  onDocumentAssociated(task: Partial<ProjectTask>): void {
    this.loadDocumentsForTask(task);
  }

  onDocumentRemoved(task: Partial<ProjectTask>): void {
    this.loadDocumentsForTask(task);
  }
}
