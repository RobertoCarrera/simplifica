import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
  ViewChildren,
  QueryList,
  ElementRef,
  AfterViewChecked,
  OnDestroy, OnInit, OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Project, ProjectStage, ProjectTask, ProjectPermissions } from '../../../../models/project';
import { ProjectsService } from '../../../../core/services/projects.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { AppModalComponent } from '../../../../shared/ui/app-modal/app-modal.component';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { Customer } from '../../../../models/customer';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ProjectDialogHeaderComponent } from './components/project-dialog-header.component';
import { ProjectDialogTabsNavComponent } from './components/project-dialog-tabs-nav.component';
import { ProjectDialogTasksComponent } from './components/project-dialog-tasks.component';
import { ProjectDialogPropertiesComponent } from './components/project-dialog-properties.component';
import { ProjectDialogActivityComponent } from './components/project-dialog-activity.component';
import { ProjectDialogCommentsComponent } from './components/project-dialog-comments.component';
import { ProjectDialogFolderModalComponent } from './components/project-dialog-folder-modal.component';
import { ProjectDialogRenameModalComponent } from './components/project-dialog-rename-modal.component';
import { ProjectDialogMoveModalComponent } from './components/project-dialog-move-modal.component';

@Component({
  selector: 'app-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent, DragDropModule,
    ProjectDialogHeaderComponent, ProjectDialogTabsNavComponent, ProjectDialogTasksComponent,
    ProjectDialogPropertiesComponent, ProjectDialogActivityComponent, ProjectDialogCommentsComponent,
    ProjectDialogFolderModalComponent, ProjectDialogRenameModalComponent, ProjectDialogMoveModalComponent,
  ],
  styles: [
    `
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      .no-scrollbar {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
      }
    `,
  ],
  template: `
    <app-modal [visible]="visible" (close)="onClose()" [maxWidth]="'95vw'">
      <div
        class="w-full max-w-[95vw] mx-auto flex flex-col h-[90vh] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-2xl"
      >
        <!-- Header -->
        <app-project-dialog-header
          [project]="project"
          (close)="onClose()"
        ></app-project-dialog-header>

        <!-- Tabs -->
        <app-project-dialog-tabs-nav
          [activeTab]="activeTab"
          [canViewComments]="canViewComments()"
          [isOwnerOrAdmin]="isOwnerOrAdmin()"
          [commentsCount]="comments.length"
          [filesCount]="projectFiles.length"
          (tabChange)="setActiveTab($event)"
        ></app-project-dialog-tabs-nav>

        <!-- Body (Details) -->
        @if (activeTab === 'details') {
          <div class="flex-1 overflow-y-auto p-0 flex flex-col md:flex-row">
            <!-- LEFT COLUMN: Main Content -->
            <div class="flex-1 p-6 md:p-8 space-y-8 border-r border-gray-100 dark:border-gray-700">
              <!-- Turn Title into a large input -->
              <div>
                <input
                  type="text"
                  [(ngModel)]="formData.name"
                  placeholder="Nombre del Proyecto"
                  [disabled]="!canEditProject()"
                  class="w-full text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-none focus:ring-0 placeholder-gray-300 dark:placeholder-gray-600 p-0 mb-2 disabled:opacity-50"
                />
              </div>
              <!-- Description -->
              <div>
                <label
                  class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2"
                  >Descripción</label
                >
                <textarea
                  [(ngModel)]="formData.description"
                  rows="4"
                  placeholder="Describe el alcance del proyecto..."
                  [disabled]="!canEditProject()"
                  class="w-full text-base text-gray-700 dark:text-gray-300 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-400 resize-none leading-relaxed disabled:opacity-50"
                ></textarea>
              </div>
              <!-- Tasks Section -->
              <app-project-dialog-tasks
                [pendingTasks]="pendingTasks"
                [completedTasks]="completedTasks"
                [completedTasksCount]="getCompletedTasks()"
                [professionals]="professionals"
                [clientName]="project?.client?.business_name || project?.client?.name || null"
                [clientAuthUserId]="project?.client?.auth_user_id || null"
                [canCreate]="canCreateTask()"
                [canComplete]="canCompleteTask(null)"
                [canEdit]="canEditTask(null)"
                [canDelete]="canDeleteTask(null)"
                [canAssign]="canAssignTask()"
                [shouldFocusLast]="shouldFocusLastTask"
                (dropped)="drop($event)"
                (taskAdded)="addTask()"
                (taskRemoved)="removeTask($event)"
                (taskEnter)="onTaskEnter($event)"
              ></app-project-dialog-tasks>
            </div>
            <!-- RIGHT COLUMN: Sidebar Properties -->
            <app-project-dialog-properties
              [formData]="formData"
              [stages]="stages"
              [clients]="clients"
              [canEdit]="canEditProject()"
            >
              @if (isEditing()) {
                <app-project-dialog-activity
                  [activities]="activityHistory"
                  [isLoading]="isLoadingActivity"
                ></app-project-dialog-activity>
              }
            </app-project-dialog-properties>
          </div>
        }

        <!-- Body (Comments) -->
        @if (activeTab === 'comments') {
          <app-project-dialog-comments
            [comments]="comments"
            [isLoading]="isLoadingComments"
            (commentAdd)="onCommentAdd($event)"
          ></app-project-dialog-comments>
        }

        <!-- Body (Permissions) -->
        @if (activeTab === 'permissions') {
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-2xl mx-auto space-y-6">
              <div
                class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
              >
                <h4 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Permisos del Cliente
                </h4>
                <p class="text-sm text-blue-700 dark:text-blue-300">
                  Configura qué acciones puede realizar el cliente en este proyecto. Los miembros
                  del equipo siempre tienen todos los permisos.
                </p>
              </div>
              <!-- Permissions Grid -->
              <div class="space-y-4">
                <!-- Task Permissions -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">
                    Gestión de Tareas
                  </h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Crear subtareas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede añadir nuevas tareas al proyecto
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_create_tasks"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Editar tareas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede modificar títulos y fechas de las tareas
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_edit_tasks"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Eliminar tareas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede borrar tareas existentes
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_delete_tasks"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Asignar tareas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede asignar tareas a miembros del equipo
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_assign_tasks"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Completar tareas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede marcar tareas como completadas
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_complete_tasks"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <!-- Comment Permissions -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">
                    Comentarios
                  </h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Añadir comentarios
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede comentar en el proyecto
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_comment"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Ver todos los comentarios
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede ver comentarios internos del equipo
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_view_all_comments"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <!-- Project Permissions -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Proyecto</h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Editar detalles del proyecto
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede modificar nombre, descripción y fechas del proyecto
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_edit_project"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group mt-3">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Mover proyecto entre etapas
                      </div>
                      <div class="text-xs text-gray-500">
                        El cliente puede arrastrar el proyecto a diferentes etapas del kanban
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="permissions.client_can_move_stage"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>
              <!-- Save Button for Permissions (MOVED TO FOOTER) -->
              <!-- <div class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <button (click)="savePermissions()" [disabled]="isSaving"
                class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50">
                <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block"></span>
                Guardar Permisos
              </button>
            </div> -->
            </div>
          </div>
        }

        <!-- Footer for Actions -->
        <div
          class="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end space-x-3 items-center"
        >
          <!-- Standard Actions (Save/Cancel) for Details Tab -->
          @if (activeTab === 'details') {
            @if (isOwnerOrAdmin() && !project?.is_archived) {
              <button
                (click)="archive()"
                class="mr-auto text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1"
              >
                Archivar Proyecto
              </button>
            }
            <button
              (click)="onClose()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
            @if (canEditProject()) {
              <button
                (click)="saveProject()"
                [disabled]="isSaving"
                class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center"
              >
                @if (isSaving) {
                  <span
                    class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                  ></span>
                }
                Guardar
              </button>
            }
          }

          <!-- Permissions Actions -->
          @if (activeTab === 'permissions') {
            <button
              (click)="onClose()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
            <button
              (click)="savePermissions()"
              [disabled]="isSaving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center"
            >
              @if (isSaving) {
                <span
                  class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                ></span>
              }
              Guardar Permisos
            </button>
          }

          <!-- Notification Actions -->
          @if (activeTab === 'notifications') {
            <button
              (click)="onClose()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cerrar
            </button>
            <button
              (click)="saveNotificationPreferences()"
              [disabled]="isSaving"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center"
            >
              @if (isSaving) {
                <span
                  class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                ></span>
              }
              Guardar Preferencias
            </button>
          }

          <!-- Comments Actions (Just Close) -->
          @if (activeTab === 'comments') {
            <button
              (click)="onClose()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Cerrar
            </button>
          }
        </div>

        <!-- Body (Notifications) -->
        @if (activeTab === 'notifications') {
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-2xl mx-auto space-y-6">
              <div
                class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4"
              >
                <h4 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
                  Notificaciones del Proyecto
                </h4>
                <p class="text-sm text-blue-700 dark:text-blue-300">
                  Personaliza qué notificaciones deseas recibir sobre este proyecto.
                </p>
              </div>
              <div class="space-y-4">
                <!-- Task Notifications -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Tareas</h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Nueva tarea creada
                      </div>
                      <div class="text-xs text-gray-500">
                        Recibe notificaciones cuando se añaden nuevas tareas
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_new_task"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Tarea completada
                      </div>
                      <div class="text-xs text-gray-500">
                        Notificación cuando se marca una tarea como completada
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_task_completed"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Tarea asignada a ti
                      </div>
                      <div class="text-xs text-gray-500">
                        Recibe notificación cuando te asignan una tarea
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_task_assigned"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                </div>
                <!-- Communication Notifications -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">
                    Comunicación
                  </h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Nuevos comentarios
                      </div>
                      <div class="text-xs text-gray-500">
                        Notificación cuando alguien comenta en el proyecto
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_new_comment"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                </div>
                <!-- Project Notifications -->
                <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                  <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Proyecto</h5>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Cambios en el proyecto
                      </div>
                      <div class="text-xs text-gray-500">
                        Actualización de fechas, nombre o descripción
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_project_update"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                  <label class="flex items-center justify-between cursor-pointer group">
                    <div class="flex-1">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">
                        Fecha límite próxima
                      </div>
                      <div class="text-xs text-gray-500">
                        Recordatorio cuando se acerca la fecha de finalización
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      [(ngModel)]="notificationPreferences.notify_on_deadline_approaching"
                      class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600"
                    />
                  </label>
                </div>
              </div>
              <!-- Save Button for Notifications -->
              <div class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  (click)="saveNotificationPreferences()"
                  [disabled]="isSaving"
                  class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50"
                >
                  @if (isSaving) {
                    <span
                      class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block"
                    ></span>
                  }
                  Guardar Preferencias
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Body (Documents) -->
        @if (activeTab === 'documents') {
          <div class="flex-1 overflow-y-auto p-6">
            <div class="max-w-4xl mx-auto space-y-6">
              <!-- Header & Actions -->
              <div
                class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
              >
                <div>
                  <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">Documentos</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Gestiona los archivos y carpetas del proyecto.
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <!-- View Toggle -->
                  <div class="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                      (click)="viewMode = 'grid'"
                      [class.bg-white]="viewMode === 'grid'"
                      [class.dark:bg-gray-600]="viewMode === 'grid'"
                      [class.shadow-sm]="viewMode === 'grid'"
                      class="p-1.5 rounded-md transition-all text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                        />
                      </svg>
                    </button>
                    <button
                      (click)="viewMode = 'list'"
                      [class.bg-white]="viewMode === 'list'"
                      [class.dark:bg-gray-600]="viewMode === 'list'"
                      [class.shadow-sm]="viewMode === 'list'"
                      class="p-1.5 rounded-md transition-all text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                          d="M4 6h16M4 12h16M4 18h16"
                        />
                      </svg>
                    </button>
                  </div>
                  <!-- Create Folder -->
                  <button
                    (click)="openCreateFolderModal()"
                    class="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                      />
                    </svg>
                    Nueva Carpeta
                  </button>
                  <!-- Upload -->
                  <input
                    type="file"
                    #fileInput
                    multiple
                    (change)="onFileSelected($event)"
                    class="hidden"
                  />
                  <button
                    (click)="fileInput.click()"
                    [disabled]="isUploading"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all flex items-center disabled:opacity-50"
                  >
                    @if (isUploading) {
                      <span
                        class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                      ></span>
                    }
                    @if (!isUploading) {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4 mr-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                        />
                      </svg>
                    }
                    Subir
                  </button>
                </div>
              </div>
              <!-- Breadcrumbs -->
              <div
                class="flex items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2"
              >
                <button
                  (click)="resetNavigation()"
                  class="hover:text-blue-600 dark:hover:text-blue-400 flex items-center"
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
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                    />
                  </svg>
                </button>
                @for (folder of currentPath; track folder) {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 mx-2 text-gray-400"
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
                  <button
                    (click)="jumpToFolder(folder)"
                    class="hover:text-blue-600 dark:hover:text-blue-400 font-medium"
                  >
                    {{ folder.name }}
                  </button>
                }
                @if (currentPath.length === 0) {
                  <span class="ml-2 text-gray-400">/</span>
                }
              </div>
              <!-- Loading State -->
              @if (isLoadingFiles) {
                <div class="flex justify-center py-12">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              }
              <!-- Empty State -->
              @if (!isLoadingFiles && currentFiles.length === 0) {
                <div
                  class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                    />
                  </svg>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Carpeta vacía</p>
                  <button
                    (click)="openCreateFolderModal()"
                    class="mt-3 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    Crear carpeta nueva
                  </button>
                </div>
              }
              <!-- GRID VIEW -->
              @if (!isLoadingFiles && currentFiles.length > 0 && viewMode === 'grid') {
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  @for (file of currentFiles; track file) {
                    <div
                      (dblclick)="file.is_folder ? navigateTo(file) : viewFile(file)"
                      class="group relative flex flex-col items-center p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                    >
                      <!-- Icon -->
                      <div
                        class="h-16 w-16 mb-3 flex items-center justify-center rounded-2xl"
                        [ngClass]="{
                          'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300':
                            file.is_folder,
                          'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300':
                            !file.is_folder && getFileIconType(file) === 'image',
                          'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300':
                            !file.is_folder && getFileIconType(file) === 'pdf',
                          'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300':
                            !file.is_folder && getFileIconType(file) === 'other',
                        }"
                      >
                        <!-- Folder Icon -->
                        @if (file.is_folder) {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-8 w-8"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              d="M2.165 19.551c.086.681.577 1.232 1.258 1.409h17.154c.681-.177 1.172-.728 1.258-1.409l.666-10.468C22.628 8.214 21.946 7.5 21.077 7.5H20V5.5C20 4.12 18.88 3 17.5 3H6.5C5.12 3 4 4.12 4 5.5V7.5H2.923c-.869 0-1.551.714-1.424 1.583l.666 10.468z"
                              opacity=".4"
                            />
                            <path
                              d="M20 7.5v-2C20 4.12 18.88 3 17.5 3H6.5C5.12 3 4 4.12 4 5.5v2h16z"
                            />
                          </svg>
                        }
                        <!-- File Icons... -->
                        @if (!file.is_folder && getFileIconType(file) === 'image') {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-8 w-8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        }
                        @if (!file.is_folder && getFileIconType(file) === 'pdf') {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-8 w-8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                        }
                        @if (!file.is_folder && getFileIconType(file) === 'other') {
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-8 w-8"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        }
                      </div>
                      <!-- Name -->
                      <p
                        class="text-xs font-medium text-gray-900 dark:text-gray-100 text-center truncate w-full px-2"
                        [title]="file.name"
                      >
                        {{ file.name }}
                      </p>
                      <!-- Meta -->
                      @if (!file.is_folder) {
                        <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                          {{ (file.size / 1024).toFixed(1) }} KB
                        </p>
                      }
                      @if (file.is_folder) {
                        <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Carpeta</p>
                      }
                      <!-- Actions Overlay -->
                      <div
                        class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <button
                          (click)="deleteFile(file); $event.stopPropagation()"
                          class="p-1.5 bg-white dark:bg-gray-700 rounded-full text-gray-400 hover:text-red-500 shadow-sm border border-gray-200 dark:border-gray-600"
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
                      </div>
                    </div>
                  }
                </div>
              }
              <!-- LIST VIEW -->
              @if (!isLoadingFiles && currentFiles.length > 0 && viewMode === 'list') {
                <div
                  class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th
                          scope="col"
                          class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10"
                        ></th>
                        <th
                          scope="col"
                          class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Nombre
                        </th>
                        <th
                          scope="col"
                          class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Tamaño
                        </th>
                        <th
                          scope="col"
                          class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          Fecha
                        </th>
                        <th scope="col" class="relative px-6 py-3">
                          <span class="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody
                      class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700"
                    >
                      @for (file of currentFiles; track file) {
                        <tr
                          (dblclick)="file.is_folder ? navigateTo(file) : viewFile(file)"
                          class="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                        >
                          <td class="px-6 py-4 whitespace-nowrap">
                            <div
                              class="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-lg"
                              [ngClass]="{
                                'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300':
                                  file.is_folder,
                                'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300':
                                  !file.is_folder && getFileIconType(file) === 'image',
                                'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300':
                                  !file.is_folder && getFileIconType(file) === 'pdf',
                                'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300':
                                  !file.is_folder && getFileIconType(file) === 'other',
                              }"
                            >
                              @if (file.is_folder) {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                  />
                                </svg>
                              }
                              @if (!file.is_folder && getFileIconType(file) === 'image') {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              }
                              @if (!file.is_folder && getFileIconType(file) === 'pdf') {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                  />
                                </svg>
                              }
                              @if (!file.is_folder && getFileIconType(file) === 'other') {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                              }
                            </div>
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap">
                            <div class="text-sm font-medium text-gray-900 dark:text-white">
                              {{ file.name }}
                            </div>
                          </td>
                          <td
                            class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
                          >
                            {{ file.is_folder ? '-' : (file.size / 1024).toFixed(1) + ' KB' }}
                          </td>
                          <td
                            class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400"
                          >
                            {{ file.created_at | date: 'short' }}
                          </td>
                          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div class="flex items-center justify-end space-x-2">
                              <!-- Rename -->
                              <button
                                (click)="openRenameModal(file, $event)"
                                class="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                title="Renombrar"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
                                  />
                                </svg>
                              </button>
                              <!-- Move -->
                              <button
                                (click)="openMoveModal(file, $event)"
                                class="text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                                title="Mover"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z"
                                  />
                                  <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
                                </svg>
                              </button>
                              <!-- Delete -->
                              <button
                                (click)="deleteFile(file); $event.stopPropagation()"
                                class="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Eliminar"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-5 w-5"
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
                            </div>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              <!-- Create Folder Modal -->
              <app-project-dialog-folder-modal
                [isOpen]="isCreateFolderModalOpen"
                (close)="closeCreateFolderModal()"
                (confirm)="onFolderNameConfirm($event)"
              ></app-project-dialog-folder-modal>
              <!-- Rename Modal -->
              <app-project-dialog-rename-modal
                [isOpen]="isRenameModalOpen"
                [initialName]="renameItem?.name || ''"
                (close)="closeRenameModal()"
                (confirm)="onRenameConfirm($event)"
              ></app-project-dialog-rename-modal>
              <!-- Move Modal -->
              <app-project-dialog-move-modal
                [isOpen]="isMoveModalOpen"
                [availableFolders]="getAvailableFoldersForMove()"
                (close)="closeMoveModal()"
                (confirm)="onMoveConfirm($event)"
              ></app-project-dialog-move-modal>
            </div>
          </div>
        }
      </div>
    </app-modal>
  `,
})
export class ProjectDialogComponent implements OnDestroy, OnInit, OnChanges, AfterViewChecked {
  @Input() visible = false;
  @Input() project: Project | null = null;
  @Input() stages: ProjectStage[] = [];
  @Output() close = new EventEmitter<boolean>();

  private projectsService = inject(ProjectsService);
  private supabaseClient = inject(SupabaseClientService);
  private customersService = inject(SupabaseCustomersService);

  formData: Partial<Project> = {};
  tasks: Partial<ProjectTask>[] = [];
  deletedTaskIds: string[] = [];
  clients: Customer[] = [];

  isSaving = false;
  isEditing = signal(false);

  // Documents
  projectFiles: any[] = [];
  isLoadingFiles = false;
  isUploading = false;
  viewMode: 'list' | 'grid' = 'list';
  currentPath: any[] = []; // Array of folder objects

  // Folder Creation Modal
  isCreateFolderModalOpen = false;
  newFolderName = '';

  // Rename Modal
  isRenameModalOpen = false;
  renameItem: any = null;
  renameName = '';

  // Move Modal
  isMoveModalOpen = false;
  moveItem: any = null;
  moveTargetFolderId: string | null = null;

  get currentFolderId(): string | null {
    return this.currentPath.length > 0 ? this.currentPath[this.currentPath.length - 1].id : null;
  }

  get currentFiles(): any[] {
    return this.projectFiles.filter((f) => f.parent_id === this.currentFolderId);
  }

  // Comments
  activeTab: 'details' | 'comments' | 'permissions' | 'notifications' | 'history' | 'documents' =
    'details';
  comments: any[] = [];
  newComment = '';
  isLoadingComments = false;

  // Activity History
  activityHistory: any[] = [];
  isLoadingActivity = false;
  private historySubscription: RealtimeChannel | null = null;

  // Permissions
  permissions: ProjectPermissions = {
    client_can_create_tasks: false,
    client_can_edit_tasks: false,
    client_can_delete_tasks: false,
    client_can_assign_tasks: false,
    client_can_complete_tasks: false,
    client_can_comment: true,
    client_can_view_all_comments: true,
    client_can_edit_project: false,
    client_can_move_stage: false,
  };

  // Notification Preferences
  notificationPreferences: any = {
    project_id: '',
    notify_on_new_task: true,
    notify_on_task_completed: true,
    notify_on_task_assigned: true,
    notify_on_new_comment: true,
    notify_on_project_update: true,
    notify_on_deadline_approaching: true,
  };

  ngOnInit() {
    this.customersService.getCustomers().subscribe((clients) => {
      this.clients = clients;
    });
  }

  ngOnChanges() {
    if (this.visible) {
      if (this.project) {
        this.isEditing.set(true);
        this.formData = { ...this.project };
        this.loadTasks(this.project.id);

        // Load permissions
        if (this.project.permissions) {
          this.permissions = { ...this.project.permissions };
        }

        // Load notification preferences
        this.loadNotificationPreferences();

        // Load activity history
        this.loadActivity(this.project.id);
        this.setupHistoryRealtime(this.project.id);
      } else {
        this.isEditing.set(false);
        this.formData = {
          priority: 'medium',
          stage_id: this.stages.length > 0 ? this.stages[0].id : '',
        };
        this.tasks = [];
        this.deletedTaskIds = [];
      }
    } else {
      this.cleanupHistoryRealtime();
    }
  }

  ngOnDestroy() {
    this.cleanupHistoryRealtime();
  }

  loadTasks(projectId: string) {
    this.projectsService.getTasks(projectId).subscribe((tasks) => {
      this.tasks = tasks;
      this.deletedTaskIds = [];
    });
  }

  get pendingTasks(): Partial<ProjectTask>[] {
    return this.tasks
      .filter((t) => !t.is_completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  get completedTasks(): Partial<ProjectTask>[] {
    return this.tasks
      .filter((t) => t.is_completed)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
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
    if (!this.canDeleteTask(task)) {
      this.toastService.error('Error', 'No tienes permiso para eliminar esta tarea.');
      return;
    }
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
    if (!this.canCreateTask()) {
      this.toastService.error('Error', 'No tienes permiso para crear tareas.');
      return;
    }
    const maxPos = this.tasks.length > 0 ? Math.max(...this.tasks.map((t) => t.position || 0)) : 0;
    this.tasks.push({
      title: '',
      is_completed: false,
      position: maxPos + 1,
    });
    this.shouldFocusLastTask = true;
  }

  getCompletedTasks() {
    return this.tasks.filter((t) => t.is_completed).length;
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

  async saveProject() {
    if (!this.canEditProject()) {
      this.toastService.error('Error', 'No tienes permiso para editar este proyecto.');
      return;
    }
    if (!this.isValid()) return;
    this.isSaving = true;

    // Clean payload
    const payload = { ...this.formData };
    delete (payload as any).client;
    delete (payload as any).tasks;
    delete (payload as any).tasks_count;
    delete (payload as any).completed_tasks_count;

    try {
      const saveOp =
        this.isEditing() && this.project?.id
          ? this.projectsService.updateProject(this.project.id, payload)
          : this.projectsService.createProject(payload);

      const savedProject = await firstValueFrom(saveOp);

      const projectId = savedProject.id;
      const validTasks = this.tasks.filter((t) => t.title?.trim());

      if (validTasks.length > 0 || this.deletedTaskIds.length > 0) {
        await firstValueFrom(
          this.projectsService.manageTasks(projectId, validTasks, this.deletedTaskIds),
        );
      }

      this.toastService.success(
        'Proyecto',
        this.isEditing() ? 'Proyecto actualizado' : 'Proyecto creado',
      );
      this.close.emit(true);
    } catch (err) {
      console.error('Error saving project/tasks', err);
      this.toastService.error('Error', 'Error al guardar el proyecto.');
    } finally {
      this.isSaving = false;
    }
  }

  archive() {
    if (!this.isOwnerOrAdmin()) {
      this.toastService.error('Error', 'No tienes permiso para archivar proyectos.');
      return;
    }
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
      },
    });
  }

  restore() {
    if (!this.isOwnerOrAdmin()) {
      this.toastService.error('Error', 'No tienes permiso para restaurar proyectos.');
      return;
    }
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
      },
    });
  }

  // --- Comments Logic ---

  setActiveTab(
    tab: string,
  ) {
    const validTab = tab as 'details' | 'comments' | 'permissions' | 'notifications' | 'history' | 'documents';
    this.activeTab = validTab;
    if (tab === 'comments' && this.project?.id) {
      this.loadComments(this.project.id);
      this.projectsService.markProjectAsRead(this.project.id);
    }
    if (tab === 'history' && this.project?.id) {
      this.loadActivity(this.project.id);
    }
    if (tab === 'documents' && this.project?.id) {
      this.loadProjectFiles();
    }
  }

  async loadComments(projectId: string) {
    this.isLoadingComments = true;
    try {
      this.comments = await this.projectsService.getComments(projectId);
    } catch (err) {
      console.error('Error loading comments', err);
    } finally {
      this.isLoadingComments = false;
    }
  }

  async addComment() {
    if (!this.newComment.trim() || !this.project?.id) return;

    this.isLoadingComments = true;
    try {
      const newCommentData = await this.projectsService.addComment(
        this.project.id,
        this.newComment,
      );
      this.comments.push(newCommentData);
      this.newComment = '';
    } catch (err) {
      console.error('Error adding comment', err);
    } finally {
      this.isLoadingComments = false;
    }
  }
  // --- Child Component Event Handlers ---

  onCommentAdd(content: string) {
    this.newComment = content;
    this.addComment();
  }

  onFolderNameConfirm(name: string) {
    this.newFolderName = name;
    this.confirmCreateFolder();
  }

  onRenameConfirm(name: string) {
    this.renameName = name;
    this.confirmRename();
  }

  onMoveConfirm(folderId: string | null) {
    this.moveTargetFolderId = folderId;
    this.confirmMove();
  }

  // Assignee Logic
  private authService = inject(AuthService);
  private toastService = inject(ToastService); // Assuming AuthService exists
  professionals: { id: string; displayName: string }[] = [];
  currentUser: any = null;

  constructor() {
    // Load current user
    this.authService.userProfile$.subscribe((u) => (this.currentUser = u));

    // Load professionals (Mocking for now or fetching from a service?)
    // Ideally ProjectsService or UsersService provides this.
    // For now, let's assume we can get them or use a placeholder
    this.loadProfessionals();
  }

  loadProfessionals() {
    // TODO: Replace with actual service call to get company employees/admins
    // this.usersService.getEmployees().subscribe(...)
    // For now, let's try to get it from where we can, or just mock it if needed for the UI test
    // Actually, let's allow assigning to self at least
    if (this.currentUser) {
      this.professionals = [
        {
          id: this.currentUser.id,
          displayName: this.currentUser.email,
        },
      ];
    }
    // We should probably fetch real users from the company
    this.projectsService
      .getCompanyMembers()
      .then((members) => {
        this.professionals = members.map((m: any) => ({
          id: m.user_id,
          displayName: m.name ? `${m.name} ${m.surname || ''}` : m.email,
        }));
      })
      .catch((err) => console.error('Error loading members', err));
  }

  getAssigneeName(task: Partial<ProjectTask>): string {
    if (!task.assigned_to) return 'Sin asignar';

    // Check professionals
    const prof = this.professionals.find((p) => p.id === task.assigned_to);
    if (prof) return prof.displayName;

    // Check client
    if (this.project?.client?.auth_user_id === task.assigned_to) {
      return this.project.client.business_name || this.project.client.name || 'Cliente';
    }

    return 'Usuario desconocido';
  }

  getAssigneeInitials(task: Partial<ProjectTask>): string {
    const name = this.getAssigneeName(task);
    if (name === 'Sin asignar') return '?';
    return name.substring(0, 2).toUpperCase();
  }

  async loadNotificationPreferences() {
    if (!this.project?.id) return;

    try {
      const prefs = await this.projectsService.getNotificationPreferences(this.project.id);
      if (prefs) {
        this.notificationPreferences = { ...prefs };
      } else {
        // Use defaults, set project_id
        this.notificationPreferences.project_id = this.project.id;
      }
    } catch (err) {
      console.warn(
        '⚠️ Could not load notification preferences (table may not be in PostgREST cache yet). Using defaults:',
        err,
      );
      // This is fine - defaults are already set, the table exists but PostgREST needs restart to see it
    }
  }

  async saveNotificationPreferences() {
    if (!this.project?.id) return;

    this.isSaving = true;
    try {
      await this.projectsService.updateNotificationPreferences(
        this.project.id,
        this.notificationPreferences,
      );
      console.log('✅ Preferencias de notificación guardadas');
    } catch (err) {
      console.error('❌ Error saving notification preferences:', err);
    } finally {
      this.isSaving = false;
    }
  }

  // Permission helper methods (Moved down)
  onArchive() {
    // TODO: Implement archive logic
    console.log('Archiving project...');
    this.toastService.info('Info', 'Funcionalidad de archivar en desarrollo');
  }

  // Permission helper methods
  isOwnerOrAdmin(): boolean {
    const user = this.currentUser;
    if (!user) return false;

    // Super admin bypass
    if (user.is_super_admin) return true;

    // 1. Must have appropriate role
    const hasRole = user.role === 'owner' || user.role === 'admin';
    if (!hasRole) return false;

    // 2. Strict Company Check to prevent "Crosstalk" (Client seeing Owner options)
    // If project exists and has company_id, it MUST match user's company
    if (this.project?.company_id && user.company_id) {
      return this.project.company_id === user.company_id;
    }

    return hasRole;
  }

  private isClient(): boolean {
    // Compare auth_user_id, NOT users.id
    const isClientMatch = this.currentUser?.auth_user_id === this.project?.client?.auth_user_id;
    console.log('🔍 isClient check:', {
      currentUserAuthId: this.currentUser?.auth_user_id,
      clientAuthId: this.project?.client?.auth_user_id,
      isClient: isClientMatch,
    });
    return isClientMatch;
  }

  canCreateTask(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_create_tasks;
    return true; // Team members can
  }

  canCompleteTask(task: Partial<ProjectTask> | null): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;

    const clientCheck = this.isClient();
    console.log('🔒 canCompleteTask:', {
      isOwnerOrAdmin: this.isOwnerOrAdmin(),
      isClient: clientCheck,
      permission: this.permissions.client_can_complete_tasks,
      result: clientCheck ? this.permissions.client_can_complete_tasks : true,
    });

    if (clientCheck) return this.permissions.client_can_complete_tasks;
    return true;
  }

  canEditTask(task: Partial<ProjectTask> | null): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_edit_tasks;
    return true;
  }

  canDeleteTask(task: Partial<ProjectTask> | null): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_delete_tasks;
    return true;
  }

  canAssignTask(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_assign_tasks;
    return true;
  }

  canComment(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_comment;
    return true;
  }

  canViewComments(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_view_all_comments;
    return true;
  }

  canEditProject(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_edit_project;
    return false; // Regular team members cannot edit project details
  }

  async savePermissions() {
    if (!this.project?.id) return;

    this.isSaving = true;
    try {
      console.log('🔄 Saving permissions:', this.permissions);
      await this.projectsService.updateProjectPermissions(this.project.id, this.permissions);
      console.log('✅ Permisos guardados correctamente');

      // Update the project permissions in memory
      if (this.project.permissions) {
        this.project.permissions = { ...this.permissions };
      }

      this.toastService.success('Proyecto', 'Permisos guardados correctamente');
    } catch (err) {
      console.error('❌ Error saving permissions:', err);
      this.toastService.error('Error', 'Error al guardar permisos. Por favor, intenta de nuevo.');
    } finally {
      this.isSaving = false;
    }
  }

  // --- Activity History Logic ---

  async loadActivity(projectId: string) {
    this.isLoadingActivity = true;
    try {
      this.activityHistory = await this.projectsService.getProjectActivity(projectId);
    } catch (err) {
      console.error('Error loading activity history', err);
    } finally {
      this.isLoadingActivity = false;
    }
  }

  private setupHistoryRealtime(projectId: string) {
    this.cleanupHistoryRealtime();
    this.historySubscription = this.projectsService.subscribeToProjectActivity(
      projectId,
      (newActivity) => {
        // Add new activity to the top of the list if it doesn't already exist
        if (!this.activityHistory.find((a) => a.id === newActivity.id)) {
          this.activityHistory = [newActivity, ...this.activityHistory];
        }
      },
    );
  }

  private cleanupHistoryRealtime() {
    if (this.historySubscription) {
      this.supabaseClient.instance.removeChannel(this.historySubscription);
      this.historySubscription = null;
    }
  }

  getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      project_created: '🚀',
      project_updated: '✏️',
      project_archived: '📦',
      project_restored: '↩️',
      project_stage_changed: '🔄',
      project_completed_early: '🎉',
      project_overdue: '⚠️',
      task_created: '➕',
      task_completed: '✅',
      task_reopened: '🔓',
      task_deleted: '🗑️',
      task_assigned: '👤',
      comment_added: '💬',
      permission_changed: '🔐',
    };
    return icons[type] || '📝';
  }

  getActivityMessage(activity: any): string {
    const messages: Record<string, (a: any) => string> = {
      project_created: () => 'Proyecto creado',
      project_updated: () => 'Proyecto actualizado',
      project_archived: () => 'Proyecto archivado',
      project_restored: () => 'Proyecto restaurado',
      project_stage_changed: (a) =>
        `Etapa cambiada de "${a.details?.from_stage_name || 'anterior'}" a "${a.details?.to_stage_name || 'nueva'}"`,
      project_completed_early: (a) =>
        `¡Proyecto completado ${a.details?.days_early || 0} días antes!`,
      project_overdue: (a) => `Proyecto vencido hace ${a.details?.days_overdue || 0} días`,
      task_created: (a) => `Tarea creada: "${a.details?.task_title || 'Sin título'}"`,
      task_completed: (a) => `Tarea completada: "${a.details?.task_title || 'Sin título'}"`,
      task_reopened: (a) => `Tarea reabierta: "${a.details?.task_title || 'Sin título'}"`,
      task_deleted: (a) => `Tarea eliminada: "${a.details?.task_title || 'Sin título'}"`,
      task_assigned: (a) =>
        `Tarea "${a.details?.task_title || 'Sin título'}" asignada a ${a.details?.assigned_name || 'usuario'}`,
      comment_added: () => 'Nuevo comentario añadido',
      permission_changed: () => 'Permisos del proyecto modificados',
    };
    const fn = messages[activity.activity_type];
    return fn ? fn(activity) : 'Evento desconocido';
  }
  // --- Document Management Methods ---

  async loadProjectFiles() {
    if (!this.project?.id) return;
    this.isLoadingFiles = true;
    try {
      this.projectFiles = await this.projectsService.getProjectFiles(this.project.id);
    } catch (error) {
      console.error('Error loading files:', error);
      this.toastService.error('Error', 'Error al cargar los archivos');
    } finally {
      this.isLoadingFiles = false;
    }
  }

  async onFileSelected(event: any) {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;

    this.isUploading = true;
    try {
      // Upload one by one
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        await this.projectsService.uploadProjectFile(this.project!.id, file, this.currentFolderId);
      }
      this.toastService.success('Archivos', 'Archivos subidos correctamente');
      await this.loadProjectFiles();
    } catch (error) {
      console.error('Error uploading file:', error);
      this.toastService.error('Error', 'Error al subir archivos');
    } finally {
      this.isUploading = false;
      // Reset input
      event.target.value = '';
    }
  }

  openCreateFolderModal() {
    this.newFolderName = '';
    this.isCreateFolderModalOpen = true;
  }

  closeCreateFolderModal() {
    this.isCreateFolderModalOpen = false;
    this.newFolderName = '';
  }

  async confirmCreateFolder() {
    if (!this.newFolderName || !this.newFolderName.trim()) return;

    this.isLoadingFiles = true;
    try {
      await this.projectsService.createProjectFolder(
        this.project!.id,
        this.newFolderName,
        this.currentFolderId,
      );
      this.toastService.success('Carpeta', 'Carpeta creada');
      await this.loadProjectFiles();
      this.closeCreateFolderModal();
    } catch (error) {
      console.error('Error creating folder:', error);
      this.toastService.error('Error', 'Error al crear la carpeta');
    } finally {
      this.isLoadingFiles = false;
    }
  }

  // Rename Logic
  openRenameModal(item: any, event: Event) {
    event.stopPropagation();
    this.renameItem = item;
    this.renameName = item.name;
    this.isRenameModalOpen = true;
  }

  closeRenameModal() {
    this.isRenameModalOpen = false;
    this.renameItem = null;
    this.renameName = '';
  }

  async confirmRename() {
    if (!this.renameItem || !this.renameName.trim()) return;

    this.isLoadingFiles = true;
    try {
      await this.projectsService.renameProjectFile(this.renameItem.id, this.renameName);
      this.toastService.success('Renombrado', 'Elemento renombrado correctamente');
      await this.loadProjectFiles();
      this.closeRenameModal();
    } catch (error) {
      console.error('Error renaming:', error);
      this.toastService.error('Error', 'Error al renombrar');
    } finally {
      this.isLoadingFiles = false;
    }
  }

  // Move Logic
  openMoveModal(item: any, event: Event) {
    event.stopPropagation();
    this.moveItem = item;
    this.moveTargetFolderId = null; // Default to root or current? Let's verify valid targets.
    this.isMoveModalOpen = true;
  }

  closeMoveModal() {
    this.isMoveModalOpen = false;
    this.moveItem = null;
    this.moveTargetFolderId = null;
  }

  async confirmMove() {
    if (!this.moveItem) return;

    if (this.moveItem.id === this.moveTargetFolderId) {
      this.toastService.warning('Mover', 'No puedes mover una carpeta dentro de sí misma');
      return;
    }

    this.isLoadingFiles = true;
    try {
      await this.projectsService.moveProjectFile(this.moveItem.id, this.moveTargetFolderId);
      this.toastService.success('Movido', 'Elemento movido correctamente');
      await this.loadProjectFiles();
      this.closeMoveModal();
    } catch (error) {
      console.error('Error moving:', error);
      this.toastService.error('Error', 'Error al mover elemento');
    } finally {
      this.isLoadingFiles = false;
    }
  }

  // Helper to get available folders for moving (excluding self and children if it's a folder)
  getAvailableFoldersForMove(): any[] {
    if (!this.moveItem) return [];

    return this.projectFiles.filter((f) => {
      if (!f.is_folder) return false;
      if (f.id === this.moveItem.id) return false;
      // If moving a folder, exclude its children (simplified check, might need recursive check for deep nesting)
      // For now, just exclude self. Proper cycle detection would be better but expensive for simple app.
      return true;
    });
  }

  navigateTo(folder: any) {
    this.currentPath.push(folder);
  }

  navigateUp() {
    this.currentPath.pop();
  }

  jumpToFolder(folder: any) {
    const index = this.currentPath.findIndex((f) => f.id === folder.id);
    if (index !== -1) {
      this.currentPath = this.currentPath.slice(0, index + 1);
    }
  }

  resetNavigation() {
    this.currentPath = [];
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'list' ? 'grid' : 'list';
  }

  async deleteFile(file: any) {
    if (file.is_folder) {
      // Check if folder is empty
      const hasChildren = this.projectFiles.some((f) => f.parent_id === file.id);
      if (hasChildren) {
        this.toastService.error('Error', 'La carpeta no está vacía. Elimina su contenido primero.');
        return;
      }
      if (!confirm(`¿Estás seguro de que deseas eliminar la carpeta "${file.name}"?`)) return;
    } else {
      if (!confirm(`¿Estás seguro de que deseas eliminar el archivo "${file.name}"?`)) return;
    }

    this.isLoadingFiles = true;
    try {
      await this.projectsService.deleteProjectFile(file.id, file.file_path);
      this.toastService.success('Eliminado', 'Elemento eliminado correctamente');
      await this.loadProjectFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
      this.toastService.error('Error', 'Error al eliminar el elemento');
    } finally {
      this.isLoadingFiles = false;
    }
  }

  async viewFile(file: any) {
    try {
      const url = await this.projectsService.getFileUrl(file.file_path);
      if (url) {
        window.open(url, '_blank');
      } else {
        this.toastService.error('Error', 'No se pudo obtener el enlace del archivo');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      this.toastService.error('Error', 'Error al abrir el archivo');
    }
  }

  getFileIconType(file: any): 'image' | 'pdf' | 'other' {
    if (file.file_type.startsWith('image/')) return 'image';
    if (file.file_type === 'application/pdf') return 'pdf';
    return 'other';
  }
}
