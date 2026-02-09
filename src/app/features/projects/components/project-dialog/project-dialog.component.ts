import { CdkDragDrop, moveItemInArray, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, Output, inject, signal, ViewChildren, QueryList, ElementRef, AfterViewChecked, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Project, ProjectStage, ProjectTask, ProjectPermissions } from '../../../../models/project';
import { ProjectsService } from '../../../../core/services/projects.service';
import { AppModalComponent } from '../../../../shared/ui/app-modal/app-modal.component';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { Customer } from '../../../../models/customer';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-project-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent, DragDropModule],
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { 
      -ms-overflow-style: none;  /* IE and Edge */
      scrollbar-width: none;  /* Firefox */
    }
  `],
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

        <!-- Tabs -->
        <div class="px-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex space-x-6">
            <button (click)="setActiveTab('details')" 
                class="py-3 text-sm font-medium border-b-2 transition-colors relative"
                [ngClass]="activeTab === 'details' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'">
                Detalles
            </button>
            <button *ngIf="canViewComments()" (click)="setActiveTab('comments')" 
                class="py-3 text-sm font-medium border-b-2 transition-colors relative flex items-center space-x-2"
                [ngClass]="activeTab === 'comments' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'">
                <span>Comentarios</span>
                <span *ngIf="comments.length > 0" class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs py-0.5 px-2 rounded-full">{{ comments.length }}</span>
            </button>
            <button *ngIf="isOwnerOrAdmin()" (click)="setActiveTab('permissions')" 
                class="py-3 text-sm font-medium border-b-2 transition-colors"
                [ngClass]="activeTab === 'permissions' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'">
                Permisos
            </button>
            <button (click)="setActiveTab('notifications')" 
                class="py-3 text-sm font-medium border-b-2 transition-colors"
                [ngClass]="activeTab === 'notifications' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'">
                Notificaciones
            </button>
        </div>

        <!-- Body (Details) -->
        <div *ngIf="activeTab === 'details'" class="flex-1 overflow-y-auto p-0 flex flex-col md:flex-row">
          
          <!-- LEFT COLUMN: Main Content -->
          <div class="flex-1 p-6 md:p-8 space-y-8 border-r border-gray-100 dark:border-gray-700">
            
            <!-- Turn Title into a large input -->
            <div>
              <input type="text" [(ngModel)]="formData.name" placeholder="Nombre del Proyecto"
                [disabled]="!canEditProject()"
                class="w-full text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-none focus:ring-0 placeholder-gray-300 dark:placeholder-gray-600 p-0 mb-2 disabled:opacity-50">
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descripción</label>
              <textarea [(ngModel)]="formData.description" rows="4" placeholder="Describe el alcance del proyecto..."
                [disabled]="!canEditProject()"
                class="w-full text-base text-gray-700 dark:text-gray-300 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-400 resize-none leading-relaxed disabled:opacity-50"></textarea>
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
                            [disabled]="!canCompleteTask(task)"
                            class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50">
                        <input type="text" [(ngModel)]="task.title" placeholder="Escribe una tarea..." 
                            #taskInput
                            [disabled]="!canEditTask(task)"
                            (keydown.enter)="onTaskEnter($event)"
                            class="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-700 dark:text-gray-200 disabled:opacity-50">
                        
                        <!-- Assignee Selector -->
                        <div class="relative group/assignee">
                            <button class="flex items-center space-x-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full px-2 py-1 transition-colors"
                                [title]="getAssigneeName(task)">
                                <div class="h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300 ring-2 ring-white dark:ring-gray-800"
                                     [ngClass]="{'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300': task.assigned_to}">
                                    {{ getAssigneeInitials(task) }}
                                </div>
                            </button>
                            <!-- Dropdown (Simple native for now or custom) -->
                            <select [(ngModel)]="task.assigned_to" 
                                [disabled]="!canAssignTask()"
                                class="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                                title="Asignar a...">
                                <option [ngValue]="null">Sin asignar</option>
                                <optgroup label="Equipo">
                                    <option *ngFor="let prof of professionals" [ngValue]="prof.id">{{ prof.displayName }}</option>
                                </optgroup>
                                <optgroup label="Cliente" *ngIf="project?.client">
                                    <option [ngValue]="project?.client?.auth_user_id">{{ project?.client?.business_name || project?.client?.name }} (Cliente)</option>
                                </optgroup>
                            </select>
                        </div>

                        <button *ngIf="canDeleteTask(task)" (click)="removeTask(task)" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>

                    <!-- Add Task Button -->
                     <button *ngIf="canCreateTask()" (click)="addTask()" class="flex items-center space-x-2 text-sm text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors py-2 px-2 ml-7">
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
                                [disabled]="!canCompleteTask(task)"
                                class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 cursor-pointer disabled:opacity-50">
                            <span class="flex-1 text-sm text-gray-500 line-through decoration-gray-400">{{ task.title }}</span>
                             <button *ngIf="canDeleteTask(task)" (click)="removeTask(task)" class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all">
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
              <select [(ngModel)]="formData.stage_id" [disabled]="!canEditProject()"
                class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50">
                <option *ngFor="let stage of stages" [value]="stage.id">{{ stage.name }}</option>
              </select>
            </div>

            <!-- Priority -->
            <div>
              <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Prioridad</label>
              <div class="relative">
                  <select [(ngModel)]="formData.priority" [disabled]="!canEditProject()"
                    class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer disabled:opacity-50">
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
                    <select [(ngModel)]="formData.client_id" [disabled]="!canEditProject()"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm appearance-none cursor-pointer disabled:opacity-50">
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
                    <input type="date" [(ngModel)]="formData.start_date" [disabled]="!canEditProject()"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50">
                </div>
                <div>
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fin</label>
                    <input type="date" [(ngModel)]="formData.end_date" [disabled]="!canEditProject()"
                        class="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-700 dark:text-gray-200 shadow-sm disabled:opacity-50">
                </div>
            </div>

            <!-- Activity History (Inline) -->
            <div *ngIf="isEditing()" class="pt-4 border-t border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between mb-3">
                    <label class="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Historial</label>
                </div>
                
                <!-- History Container with scroll -->
                <div class="max-h-48 overflow-y-auto space-y-2 pr-1 no-scrollbar scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                    
                    <!-- Loading -->
                    <div *ngIf="isLoadingActivity" class="flex justify-center py-4">
                        <div class="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    </div>
                    
                    <!-- Empty -->
                    <div *ngIf="!isLoadingActivity && activityHistory.length === 0" class="text-center py-4">
                        <p class="text-xs text-gray-400">Sin actividad registrada</p>
                    </div>

                    <!-- Activity Items -->
                    <div *ngFor="let activity of activityHistory" 
                        class="flex items-start space-x-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <span class="text-base flex-shrink-0">{{ getActivityIcon(activity.activity_type) }}</span>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                                {{ getActivityMessage(activity) }}
                            </p>
                            <p class="text-[10px] text-gray-400 mt-0.5">
                                {{ activity.created_at | date:'short' }}
                                <span *ngIf="activity.user"> • {{ activity.user.name || activity.user.email }}</span>
                                <span *ngIf="activity.client"> • {{ activity.client.name || 'Cliente' }}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

          </div>
        </div>

        <!-- Body (Comments) -->
        <div *ngIf="activeTab === 'comments'" class="flex-1 overflow-hidden flex flex-col bg-gray-50/30 dark:bg-gray-900/10">
            <!-- Comments List -->
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <!-- Loading State -->
                <div *ngIf="isLoadingComments" class="flex justify-center py-8">
                    <div class="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                </div>

                <!-- Empty State -->
                <div *ngIf="!isLoadingComments && comments.length === 0" class="flex flex-col items-center justify-center h-full text-center text-gray-400 space-y-3">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <p class="text-sm">No hay comentarios aún. ¡Sé el primero en comentar!</p>
                </div>

                <!-- List -->
                <div *ngFor="let comment of comments" class="flex space-x-3 group w-full">
                    <div class="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs uppercase"
                        [ngClass]="{'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400': comment.user_id, 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400': comment.client_id}">
                        {{ (comment.user?.email?.[0] || comment.client?.email?.[0] || 'U') }}
                    </div>
                    <div class="flex-1 space-y-1 min-w-0">
                        <div class="flex items-center justify-between">
                             <div class="flex items-center space-x-2">
                                <span class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                    <ng-container *ngIf="comment.user">
                                        {{ comment.user.name ? (comment.user.name + ' ' + (comment.user.surname || '')) : (comment.user.email || 'Usuario') }}
                                        <span class="text-xs font-normal text-gray-500 ml-1">(Equipo)</span>
                                    </ng-container>
                                    <ng-container *ngIf="comment.client">
                                        {{ comment.client.name || comment.client.email || 'Cliente' }}
                                        <span class="text-xs font-normal text-gray-500 ml-1">(Cliente)</span>
                                    </ng-container>
                                </span>
                                <span class="text-xs text-gray-400">
                                    {{ comment.created_at | date:'medium' }}
                                </span>
                             </div>
                        </div>
                        <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed bg-white dark:bg-gray-800 p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl shadow-sm border border-gray-100 dark:border-gray-700 break-words">
                            {{ comment.content }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Input Area -->
            <div class="p-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 relative">
                <div class="flex items-end space-x-2">
                     <textarea [(ngModel)]="newComment" rows="2" 
                        class="flex-1 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                        placeholder="Escribe un comentario..."
                        (keydown.control.enter)="addComment()"></textarea>
                     <button (click)="addComment()" [disabled]="!newComment.trim()"
                        class="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                     </button>
                </div>
                <div class="text-xs text-gray-400 mt-2 text-right">
                    Presiona <span class="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">Ctrl + Enter</span> para enviar
                </div>
            </div>
        </div>

        <!-- Body (Permissions) -->
        <div *ngIf="activeTab === 'permissions'" class="flex-1 overflow-y-auto p-6">
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Permisos del Cliente</h4>
                    <p class="text-sm text-blue-700 dark:text-blue-300">
                        Configura qué acciones puede realizar el cliente en este proyecto. Los miembros del equipo siempre tienen todos los permisos.
                    </p>
                </div>

                <!-- Permissions Grid -->
                <div class="space-y-4">
                    <!-- Task Permissions -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Gestión de Tareas</h5>
                        
                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Crear subtareas</div>
                                <div class="text-xs text-gray-500">El cliente puede añadir nuevas tareas al proyecto</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_create_tasks"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Editar tareas</div>
                                <div class="text-xs text-gray-500">El cliente puede modificar títulos y fechas de las tareas</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_edit_tasks"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Eliminar tareas</div>
                                <div class="text-xs text-gray-500">El cliente puede borrar tareas existentes</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_delete_tasks"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Asignar tareas</div>
                                <div class="text-xs text-gray-500">El cliente puede asignar tareas a miembros del equipo</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_assign_tasks"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Completar tareas</div>
                                <div class="text-xs text-gray-500">El cliente puede marcar tareas como completadas</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_complete_tasks"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>
                    </div>

                    <!-- Comment Permissions -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Comentarios</h5>
                        
                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Añadir comentarios</div>
                                <div class="text-xs text-gray-500">El cliente puede comentar en el proyecto</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_comment"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Ver todos los comentarios</div>
                                <div class="text-xs text-gray-500">El cliente puede ver comentarios internos del equipo</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_view_all_comments"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>
                    </div>

                    <!-- Project Permissions -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Proyecto</h5>
                        
                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Editar detalles del proyecto</div>
                                <div class="text-xs text-gray-500">El cliente puede modificar nombre, descripción y fechas del proyecto</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_edit_project"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        </label>
                        
                        <label class="flex items-center justify-between cursor-pointer group mt-3">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Mover proyecto entre etapas</div>
                                <div class="text-xs text-gray-500">El cliente puede arrastrar el proyecto a diferentes etapas del kanban</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="permissions.client_can_move_stage"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
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

        <!-- Footer for Actions -->
        <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end space-x-3 items-center">
            
            <!-- Standard Actions (Save/Cancel) for Details Tab -->
            <ng-container *ngIf="activeTab === 'details'">
                <button *ngIf="isOwnerOrAdmin() && !project?.is_archived" (click)="archive()" class="mr-auto text-red-500 hover:text-red-700 text-sm font-medium px-2 py-1">
                    Archivar Proyecto
                </button>
                <button (click)="onClose()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    Cancelar
                </button>
                <button *ngIf="canEditProject()" (click)="saveProject()" [disabled]="isSaving" 
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center">
                    <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Guardar
                </button>
            </ng-container>

            <!-- Permissions Actions -->
            <ng-container *ngIf="activeTab === 'permissions'">
                <button (click)="onClose()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    Cancelar
                </button>
                <button (click)="savePermissions()" [disabled]="isSaving"
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center">
                    <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Guardar Permisos
                </button>
            </ng-container>
            
            <!-- Notification Actions -->
            <ng-container *ngIf="activeTab === 'notifications'">
                 <button (click)="onClose()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    Cerrar
                </button>
                <button (click)="saveNotificationPreferences()" [disabled]="isSaving"
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center">
                    <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                    Guardar Preferencias
                </button>
            </ng-container>

            <!-- Comments Actions (Just Close) -->
            <ng-container *ngIf="activeTab === 'comments'">
                <button (click)="onClose()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                    Cerrar
                </button>
            </ng-container>
        </div>

        <!-- Body (Notifications) -->
        <div *ngIf="activeTab === 'notifications'" class="flex-1 overflow-y-auto p-6">
            <div class="max-w-2xl mx-auto space-y-6">
                <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h4 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Notificaciones del Proyecto</h4>
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
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Nueva tarea creada</div>
                                <div class="text-xs text-gray-500">Recibe notificaciones cuando se añaden nuevas tareas</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_new_task"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                           <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Tarea completada</div>
                                <div class="text-xs text-gray-500">Notificación cuando se marca una tarea como completada</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_task_completed"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Tarea asignada a ti</div>
                                <div class="text-xs text-gray-500">Recibe notificación cuando te asignan una tarea</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_task_assigned"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>
                    </div>

                    <!-- Communication Notifications -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Comunicación</h5>
                        
                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Nuevos comentarios</div>
                                <div class="text-xs text-gray-500">Notificación cuando alguien comenta en el proyecto</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_new_comment"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>
                    </div>

                    <!-- Project Notifications -->
                    <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-3">
                        <h5 class="font-medium text-gray-900 dark:text-white text-sm mb-3">Proyecto</h5>
                        
                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Cambios en el proyecto</div>
                                <div class="text-xs text-gray-500">Actualización de fechas, nombre o descripción</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_project_update"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>

                        <label class="flex items-center justify-between cursor-pointer group">
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-white">Fecha límite próxima</div>
                                <div class="text-xs text-gray-500">Recordatorio cuando se acerca la fecha de finalización</div>
                            </div>
                            <input type="checkbox" [(ngModel)]="notificationPreferences.notify_on_deadline_approaching"
                                class="ml-4 h-5 w-5 rounded border-gray-300 text-blue-600">
                        </label>
                    </div>
                </div>

                <!-- Save Button for Notifications -->
                <div class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button (click)="saveNotificationPreferences()" [disabled]="isSaving"
                        class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-sm transition-all disabled:opacity-50">
                        <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block"></span>
                        Guardar Preferencias
                    </button>
                </div>
            </div>
        </div>
    </div>
  </app-modal>
  `
})
export class ProjectDialogComponent implements OnDestroy {
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

  // Comments
  activeTab: 'details' | 'comments' | 'permissions' | 'notifications' | 'history' = 'details';
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
    client_can_move_stage: false
  };

  // Notification Preferences
  notificationPreferences: any = {
    project_id: '',
    notify_on_new_task: true,
    notify_on_task_completed: true,
    notify_on_task_assigned: true,
    notify_on_new_comment: true,
    notify_on_project_update: true,
    notify_on_deadline_approaching: true
  };

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
          stage_id: this.stages.length > 0 ? this.stages[0].id : ''
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
      const saveOp = this.isEditing() && this.project?.id
        ? this.projectsService.updateProject(this.project.id, payload)
        : this.projectsService.createProject(payload);

      const savedProject = await firstValueFrom(saveOp);

      const projectId = savedProject.id;
      const validTasks = this.tasks.filter(t => t.title?.trim());

      if (validTasks.length > 0 || this.deletedTaskIds.length > 0) {
        await firstValueFrom(this.projectsService.manageTasks(projectId, validTasks, this.deletedTaskIds));
      }

      this.toastService.success('Proyecto', this.isEditing() ? 'Proyecto actualizado' : 'Proyecto creado');
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
      }
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
      }
    });
  }

  // --- Comments Logic ---

  setActiveTab(tab: 'details' | 'comments' | 'permissions' | 'notifications' | 'history') {
    this.activeTab = tab;
    if (tab === 'comments' && this.project?.id) {
      this.loadComments(this.project.id);
      this.projectsService.markProjectAsRead(this.project.id);
    }
    if (tab === 'history' && this.project?.id) {
      this.loadActivity(this.project.id);
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
      const newCommentData = await this.projectsService.addComment(this.project.id, this.newComment);
      this.comments.push(newCommentData);
      this.newComment = '';
    } catch (err) {
      console.error('Error adding comment', err);
    } finally {
      this.isLoadingComments = false;
    }
  }
  // Assignee Logic
  private authService = inject(AuthService);
  private toastService = inject(ToastService); // Assuming AuthService exists
  professionals: { id: string, displayName: string }[] = [];
  currentUser: any = null;

  constructor() {
    // Load current user
    this.authService.userProfile$.subscribe(u => this.currentUser = u);

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
      this.professionals = [{
        id: this.currentUser.id,
        displayName: this.currentUser.email
      }];
    }
    // We should probably fetch real users from the company
    this.projectsService.getCompanyMembers().then(members => {
      this.professionals = members.map((m: any) => ({
        id: m.user_id,
        displayName: m.name ? `${m.name} ${m.apellidos || ''}` : m.email
      }));
    }).catch(err => console.error('Error loading members', err));
  }

  getAssigneeName(task: Partial<ProjectTask>): string {
    if (!task.assigned_to) return 'Sin asignar';

    // Check professionals
    const prof = this.professionals.find(p => p.id === task.assigned_to);
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
      console.warn('⚠️ Could not load notification preferences (table may not be in PostgREST cache yet). Using defaults:', err);
      // This is fine - defaults are already set, the table exists but PostgREST needs restart to see it
    }
  }

  async saveNotificationPreferences() {
    if (!this.project?.id) return;

    this.isSaving = true;
    try {
      await this.projectsService.updateNotificationPreferences(
        this.project.id,
        this.notificationPreferences
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
      isClient: isClientMatch
    });
    return isClientMatch;
  }

  canCreateTask(): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_create_tasks;
    return true; // Team members can
  }

  canCompleteTask(task: Partial<ProjectTask>): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;

    const clientCheck = this.isClient();
    console.log('🔒 canCompleteTask:', {
      isOwnerOrAdmin: this.isOwnerOrAdmin(),
      isClient: clientCheck,
      permission: this.permissions.client_can_complete_tasks,
      result: clientCheck ? this.permissions.client_can_complete_tasks : true
    });

    if (clientCheck) return this.permissions.client_can_complete_tasks;
    return true;
  }

  canEditTask(task: Partial<ProjectTask>): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_edit_tasks;
    return true;
  }

  canDeleteTask(task: Partial<ProjectTask>): boolean {
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
    this.historySubscription = this.projectsService.subscribeToProjectActivity(projectId, (newActivity) => {
      // Add new activity to the top of the list if it doesn't already exist
      if (!this.activityHistory.find(a => a.id === newActivity.id)) {
        this.activityHistory = [newActivity, ...this.activityHistory];
      }
    });
  }

  private cleanupHistoryRealtime() {
    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
      this.historySubscription = null;
    }
  }

  getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      'project_created': '🚀',
      'project_updated': '✏️',
      'project_archived': '📦',
      'project_restored': '↩️',
      'project_stage_changed': '🔄',
      'project_completed_early': '🎉',
      'project_overdue': '⚠️',
      'task_created': '➕',
      'task_completed': '✅',
      'task_reopened': '🔓',
      'task_deleted': '🗑️',
      'task_assigned': '👤',
      'comment_added': '💬',
      'permission_changed': '🔐'
    };
    return icons[type] || '📝';
  }

  getActivityMessage(activity: any): string {
    const messages: Record<string, (a: any) => string> = {
      'project_created': () => 'Proyecto creado',
      'project_updated': () => 'Proyecto actualizado',
      'project_archived': () => 'Proyecto archivado',
      'project_restored': () => 'Proyecto restaurado',
      'project_stage_changed': (a) => `Etapa cambiada de "${a.details?.from_stage_name || 'anterior'}" a "${a.details?.to_stage_name || 'nueva'}"`,
      'project_completed_early': (a) => `¡Proyecto completado ${a.details?.days_early || 0} días antes!`,
      'project_overdue': (a) => `Proyecto vencido hace ${a.details?.days_overdue || 0} días`,
      'task_created': (a) => `Tarea creada: "${a.details?.task_title || 'Sin título'}"`,
      'task_completed': (a) => `Tarea completada: "${a.details?.task_title || 'Sin título'}"`,
      'task_reopened': (a) => `Tarea reabierta: "${a.details?.task_title || 'Sin título'}"`,
      'task_deleted': (a) => `Tarea eliminada: "${a.details?.task_title || 'Sin título'}"`,
      'task_assigned': (a) => `Tarea "${a.details?.task_title || 'Sin título'}" asignada a ${a.details?.assigned_name || 'usuario'}`,
      'comment_added': () => 'Nuevo comentario añadido',
      'permission_changed': () => 'Permisos del proyecto modificados'
    };
    const fn = messages[activity.activity_type];
    return fn ? fn(activity) : 'Evento desconocido';
  }
}
