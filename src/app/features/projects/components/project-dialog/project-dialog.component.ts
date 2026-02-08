import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, inject, signal, ViewChildren, QueryList, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, ProjectStage, ProjectTask } from '../../../../models/project';
import { ProjectsService } from '../../../../core/services/projects.service';
import { AppModalComponent } from '../../../../shared/ui/app-modal/app-modal.component';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { Customer } from '../../../../models/customer';

@Component({
  selector: 'app-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent, DragDropModule],
  template: `
    <app-modal [visible]="visible" (close)="onClose()" [maxWidth]="'95vw'">
      <div class="w-full max-w-[95vw] mx-auto flex flex-col h-[90vh] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-2xl">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800">
          <div class="flex items-center space-x-2">
            <span class="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-md text-blue-600 dark:text-blue-400">
               <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
               </svg>
            </span>
            <span class="text-sm font-medium text-gray-500 dark:text-gray-400">
                {{ project?.name || 'Nuevo Proyecto' }}
            </span>
          </div>
          <button (click)="onClose()" class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Body (Grid Layout) -->
        <div class="flex-1 overflow-y-auto p-0 flex flex-col md:flex-row">
          
          <!-- LEFT COLUMN: Main Content -->
          <div class="flex-1 p-6 md:p-8 space-y-8 border-r border-gray-100 dark:border-gray-700">
            
            <!-- Turn Title into a large input -->
            <div>
              <input type="text" [(ngModel)]="formData.name" placeholder="Nombre del Proyecto"
                class="w-full text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-none focus:ring-0 placeholder-gray-300 dark:placeholder-gray-600 p-0 mb-2">
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descripción</label>
              <textarea [(ngModel)]="formData.description" rows="4" placeholder="Describe el alcance del proyecto..."
                class="w-full text-base text-gray-700 dark:text-gray-300 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-400 resize-none leading-relaxed"></textarea>
            </div>

            <!-- Tasks Section -->
            <div class="pt-6 border-t border-gray-100 dark:border-gray-700">
                <div class="flex justify-between items-center mb-4">
                    <label class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tareas Pendientes ({{ pendingTasks.length }})</label>
                    <span class="text-xs text-blue-500 font-medium">{{ getCompletedTasks() }} completadas</span>
                </div>
                
                <div class="space-y-3" cdkDropList [cdkDropListData]="pendingTasks" (cdkDropListDropped)="drop($event)">
                    <!-- Pending Tasks -->
                    <div *ngFor="let task of pendingTasks; trackBy: trackByTask" cdkDrag [cdkDragData]="task" class="group flex items-center space-x-3 p-2 bg-white dark:bg-gray-800 border border-transparent hover:border-gray-100 dark:hover:border-gray-700 hover:shadow-sm rounded-lg transition-all cursor-default">
                        <!-- Drag Handle -->
                        <div cdkDragHandle class="cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
                            </svg>
                        </div>
                        
                        <!-- Drag Preview -->
                        <div *cdkDragPreview class="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-xl border border-blue-200 dark:border-blue-900 w-full flex items-center space-x-3">
                             <span class="text-sm font-medium text-gray-900 dark:text-white">{{ task.title }}</span>
                        </div>

                        <input type="checkbox" [(ngModel)]="task.is_completed" 
                            class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer">
                        <input type="text" [(ngModel)]="task.title" placeholder="Escribe una tarea..." 
                            #taskInput
                            (keydown.enter)="onTaskEnter($event)"
                            class="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-200">
                        <button (click)="removeTask(task)" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    <!-- Add Task Button -->
                     <button (click)="addTask()" class="flex items-center space-x-2 text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors py-2 px-2 ml-7">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Añadir Tarea</span>
                    </button>

                    <!-- Completed Tasks (Collapsible or just separated?) -->
                    <div *ngIf="completedTasks.length > 0" class="mt-6 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                        <h4 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 ml-2">Completadas</h4>
                         <div *ngFor="let task of completedTasks; trackBy: trackByTask" class="group flex items-center space-x-3 p-2 opacity-60 hover:opacity-100 transition-opacity">
                            <div class="w-6"></div> <!-- Spacer for handle alignment -->
                            <input type="checkbox" [(ngModel)]="task.is_completed" 
                                class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer">
                            <span class="flex-1 text-sm text-gray-500 line-through decoration-gray-400">{{ task.title }}</span>
                            <button (click)="removeTask(task)" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: Sidebar Properties -->
          <div class="w-full md:w-80 bg-gray-50/50 dark:bg-gray-900/20 p-6 md:p-8 space-y-6">
            
            <!-- Stage -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Estado</label>
              <select [(ngModel)]="formData.stage_id"
                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm">
                <option *ngFor="let stage of stages" [value]="stage.id">{{ stage.name }}</option>
              </select>
            </div>

            <!-- Priority -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prioridad</label>
              <div class="relative">
                  <select [(ngModel)]="formData.priority"
                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer">
                    <option value="low">🟡 Baja</option>
                    <option value="medium">🔵 Media</option>
                    <option value="high">🟠 Alta</option>
                    <option value="critical">🔴 Crítica</option>
                  </select>
                  <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
              </div>
            </div>

            <!-- Client -->
            <div>
                <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cliente</label>
                <div class="relative">
                    <select [(ngModel)]="formData.client_id"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer">
                        <option [value]="null">Seleccionar Cliente</option>
                        <option *ngFor="let client of clients" [value]="client.id">
                            {{ client.business_name || client.name + ' ' + (client.apellidos || '') }}
                        </option>
                    </select>
                    <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            </div>

            <!-- Dates -->
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Inicio</label>
                    <input type="date" [(ngModel)]="formData.start_date"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fin</label>
                    <input type="date" [(ngModel)]="formData.end_date"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm">
                </div>
            </div>

            <!-- Meta info (Created at) -->
            <div *ngIf="isEditing()" class="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p class="text-xs text-gray-400">
                    Creado el {{ project?.created_at | date:'mediumDate' }}
                </p>
            </div>

          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-6 py-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
            
            <!-- Left Actions (Archive/Restore) -->
            <div>
                <button *ngIf="isEditing() && !project?.is_archived" (click)="archive()" [disabled]="isSaving"
                    class="px-3 py-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors text-sm font-medium flex items-center space-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Archivar</span>
                </button>

                 <button *ngIf="isEditing() && project?.is_archived" (click)="restore()" [disabled]="isSaving"
                    class="px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-md transition-colors text-sm font-medium flex items-center space-x-1">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Restaurar</span>
                </button>
            </div>

            <!-- Right Actions -->
            <div class="flex space-x-3">
                <button (click)="onClose()"
                    class="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
                    Cancelar
                </button>
            <button (click)="save()" [disabled]="!isValid() || isSaving"
                class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
                <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                {{ isEditing() ? 'Guardar Cambios' : 'Crear Proyecto' }}
            </button>
        </div>
      </div>
    </div>
  </app-modal>
  `
})
export class ProjectDialogComponent {
  @Input() visible = false;
  @Input() project: Project | null = null;
  @Input() stages: ProjectStage[] = [];
  @Output() close = new EventEmitter<boolean>();

  private projectsService = inject(ProjectsService);
  private customersService = inject(SupabaseCustomersService);

  formData: Partial<Project> = {};
  tasks: Partial<ProjectTask>[] = [];
  deletedTaskIds: string[] = [];
  clients: Customer[] = [];

  isSaving = false;
  isEditing = signal(false);

  ngOnInit() {
    this.customersService.getCustomers().subscribe(clients => {
      this.clients = clients;
    });
  }

  ngOnChanges() {
    if (this.visible) {
      if (this.project) {
        this.isEditing.set(true);
        this.formData = { ...this.project };
        this.loadTasks(this.project.id);
      } else {
        this.isEditing.set(false);
        this.formData = {
          priority: 'medium',
          stage_id: this.stages.length > 0 ? this.stages[0].id : ''
        };
        this.tasks = [];
        this.deletedTaskIds = [];
      }
    }
  }

  loadTasks(projectId: string) {
    this.projectsService.getTasks(projectId).subscribe(tasks => {
      this.tasks = tasks;
      this.deletedTaskIds = [];
    });
  }

  get pendingTasks(): Partial<ProjectTask>[] {
    return this.tasks.filter(t => !t.is_completed).sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  get completedTasks(): Partial<ProjectTask>[] {
    return this.tasks.filter(t => t.is_completed).sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  drop(event: CdkDragDrop<any[]>) {
    const pending = this.pendingTasks;
    moveItemInArray(pending, event.previousIndex, event.currentIndex);

    // Update positions
    pending.forEach((task, index) => {
      task.position = index;
    });
  }

  removeTask(task: Partial<ProjectTask>) {
    const index = this.tasks.indexOf(task);
    if (index > -1) {
      if (task.id) {
        this.deletedTaskIds.push(task.id);
      }
      this.tasks.splice(index, 1);
    }
  }

  @ViewChildren('taskInput') taskInputs!: QueryList<ElementRef>;
  shouldFocusLastTask = false;

  ngAfterViewChecked() {
    if (this.shouldFocusLastTask) {
      this.focusLastTask();
      this.shouldFocusLastTask = false;
    }
  }

  focusLastTask() {
    const inputs = this.taskInputs.toArray();
    if (inputs.length > 0) {
      inputs[inputs.length - 1].nativeElement.focus();
    }
  }

  onTaskEnter(event: Event) {
    event.preventDefault();
    this.addTask();
  }

  addTask() {
    const maxPos = this.tasks.length > 0 ? Math.max(...this.tasks.map(t => t.position || 0)) : 0;
    this.tasks.push({
      title: '',
      is_completed: false,
      position: maxPos + 1
    });
    this.shouldFocusLastTask = true;
  }

  getCompletedTasks() {
    return this.tasks.filter(t => t.is_completed).length;
  }

  trackByTask(index: number, task: Partial<ProjectTask>): string | number {
    return task.id || index;
  }

  isValid(): boolean {
    return !!this.formData.name?.trim() && !!this.formData.stage_id;
  }

  onClose() {
    this.close.emit(false);
  }

  save() {
    if (!this.isValid()) return;
    this.isSaving = true;

    // Clean payload
    const payload = { ...this.formData };
    delete (payload as any).client;
    delete (payload as any).tasks;
    delete (payload as any).tasks_count;
    delete (payload as any).completed_tasks_count;

    // Save logic
    const saveProject$ = this.isEditing() && this.project?.id
      ? this.projectsService.updateProject(this.project.id, payload)
      : this.projectsService.createProject(payload);

    saveProject$.subscribe({
      next: (savedProject) => {
        // After project save, save tasks
        const projectId = savedProject.id;

        // Check if tasks have content
        const validTasks = this.tasks.filter(t => t.title?.trim());

        if (validTasks.length > 0 || this.deletedTaskIds.length > 0) {
          this.projectsService.manageTasks(projectId, validTasks, this.deletedTaskIds).subscribe({
            next: () => {
              this.isSaving = false;
              this.close.emit(true);
            },
            error: (err) => {
              console.error('Error saving tasks', err);
              this.isSaving = false; // Still close? Maybe warn?
              this.close.emit(true); // Close anyway for now
            }
          });
        } else {
          this.isSaving = false;
          this.close.emit(true);
        }
      },
      error: (err) => {
        console.error('Error saving project', err);
        this.isSaving = false;
      }
    });
  }

  archive() {
    if (!this.project?.id) return;
    if (!confirm('¿Estás seguro de que quieres archivar este proyecto?')) return;

    this.isSaving = true;
    this.projectsService.archiveProject(this.project.id).subscribe({
      next: () => {
        this.isSaving = false;
        this.close.emit(true);
      },
      error: (err) => {
        console.error('Error archiving project', err);
        this.isSaving = false;
      }
    });
  }

  restore() {
    if (!this.project?.id) return;

    this.isSaving = true;
    this.projectsService.restoreProject(this.project.id).subscribe({
      next: () => {
        this.isSaving = false;
        this.close.emit(true);
      },
      error: (err) => {
        console.error('Error restoring project', err);
        this.isSaving = false;
      }
    });
  }
}
