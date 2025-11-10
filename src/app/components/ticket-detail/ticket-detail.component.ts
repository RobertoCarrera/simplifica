import { Component, OnInit, inject, ElementRef, ViewChild, OnDestroy, AfterViewInit, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { SupabaseTicketsService, Ticket } from '../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage as ConfigStage } from '../../services/supabase-ticket-stages.service';
import { DevicesService, Device } from '../../services/devices.service';
import { TicketModalService } from '../../services/ticket-modal.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { SupabaseQuotesService } from '../../services/supabase-quotes.service';
import { SupabaseServicesService } from '../../services/supabase-services.service';
import { SupabaseCustomersService } from '../../services/supabase-customers.service';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../services/toast.service';

// TipTap imports
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./ticket-detail.component.scss'],
  template: `
    <div class="min-h-0 bg-gray-50 dark:bg-gray-900">
      <div class="mx-auto">
        
        <!-- Header con navegación -->
        <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 mb-6 flex justify-between items-center">
          <button (click)="goBack()" 
                  class="btn btn-secondary">
            <i class="fas fa-arrow-left"></i>
            Volver a Tickets
          </button>
          
          <!-- Quick Actions -->
          <div *ngIf="!loading && !error && ticket" class="flex gap-3">
            <button (click)="convertToQuoteFromTicket()"
                    [disabled]="!ticket || ticketServices.length === 0 || !(ticket && ticket.client && ticket.client.id)"
                    class="btn btn-primary">
              <i class="fas fa-file-invoice"></i>
              {{ activeQuoteId ? 'Ir a Presupuesto' : 'Convertir en Presupuesto' }}
            </button>
            <button (click)="printTicket()" 
                    class="btn btn-secondary">
              <i class="fas fa-print"></i>
              Imprimir
            </button>
            <button (click)="deleteTicket()" 
                    class="btn btn-danger">
              <i class="fas fa-trash"></i>
              Eliminar
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">Cargando ticket...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error" class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <i class="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800 dark:text-red-300">Error</h3>
              <p class="mt-1 text-sm text-red-700 dark:text-red-400">{{ error }}</p>
            </div>
          </div>
        </div>

  <!-- Ticket Detail -->
  <div *ngIf="!loading && !error && ticket" class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <!-- Main Content (Left Side) -->
          <div class="space-y-6 lg:col-span-3">
            
            <!-- Ticket Header -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div class="flex justify-between items-start mb-4">
                <div>
                  <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3 mb-2">
                    <i class="fas fa-ticket-alt text-orange-500"></i>
                    #{{ ticket.ticket_number }} - {{ ticket.title }}
                  </h1>
                  <div class="prose prose-sm text-gray-700 dark:text-gray-300 mt-2" [innerHTML]="formatDescription(ticket.description)"></div>
                </div>
                <div class="flex flex-col items-end space-y-2">
                  <span [class]="getPriorityClasses(ticket.priority)"
                        class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium">
                    <i class="fas {{ getPriorityIcon(ticket.priority) }} w-3"></i>
                    {{ getPriorityLabel(ticket.priority) }}
                  </span>
                </div>
              </div>
              
              <!-- Tags: moved to sidebar -->
              
              <div class="grid grid-cols-1 md:grid-cols-1 gap-4">
              <div class="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Progreso</span>
                <span>{{ getProgressPercentage() | number:'1.0-0' }}%</span>
              </div>
              <div class="relative">
                  <!-- Progress Bar Background -->
                  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 relative">
                    <div 
                      class="bg-blue-500 dark:bg-blue-600 h-3 rounded-full transition-all duration-300"
                      [style.width.%]="getProgressPercentage()"
                    ></div>
                    
                    <!-- Stage Markers -->
                    <div *ngFor="let stage of allStages; let i = index" 
                         class="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                         [style.left.%]="getStagePosition(i)">
                      <div 
                        [class]="getStageMarkerClass(stage)"
                        class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center"
                        [title]="stage.name"
                      >
                        <div *ngIf="isStageCompleted(stage)" class="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Stage Labels -->
                  <div class="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div *ngFor="let stage of getVisibleStages(); let i = index" 
                         class="text-center flex-1"
                         [class.font-medium]="stage.id === ticket.stage_id"
                         [class.text-blue-600]="stage.id === ticket.stage_id"
                         [class.dark:text-blue-400]="stage.id === ticket.stage_id">
                      {{ stage.name }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Services -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Servicios Asignados</h3>
                <button (click)="openServicesModal()"
                        class="btn btn-primary">
                  <i class="fas fa-wrench"></i>
                  Modificar Servicios
                </button>
              </div>
              <div *ngIf="ticketServices.length === 0" class="text-center py-6 text-gray-500 dark:text-gray-400">
                <i class="fas fa-box-open text-4xl mb-3 opacity-50"></i>
                <p>No hay servicios asignados a este ticket</p>
              </div>
              <div *ngIf="ticketServices.length > 0" class="space-y-4">
                <div *ngFor="let serviceItem of ticketServices" 
                     class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div class="flex justify-between items-start">
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900 dark:text-gray-100">{{ serviceItem.service?.name || 'Servicio no especificado' }}</h4>
                      <p *ngIf="serviceItem.service?.description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {{ serviceItem.service.description }}
                      </p>
                      <div class="mt-2 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                        <div class="flex items-center space-x-2">
                          <div class="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                            <button class="px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="decreaseAssignedQty(serviceItem)">-</button>
                            <input type="number" class="w-16 text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-x border-gray-300 dark:border-gray-600" [(ngModel)]="serviceItem.quantity" (ngModelChange)="onAssignedQuantityChange(serviceItem, $event)" />
                            <button class="px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="increaseAssignedQty(serviceItem)">+</button>
                          </div>
                          <span *ngIf="savingAssignedServiceIds.has(serviceItem.service?.id)" class="text-xs text-gray-500 dark:text-gray-400">Guardando...</span>
                        </div>
                        <span><i class="fas fa-clock w-4"></i> {{ getLineEstimatedHours(serviceItem) }}h</span>
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          <i class="fas fa-tag w-3"></i>
                          {{ serviceItem.service?.category_name || serviceItem.service?.category || 'Sin categoría' }}
                        </span>
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="font-medium text-gray-900 dark:text-gray-100">{{ formatPrice(getUnitPrice(serviceItem)) }}</p>
                      <p class="text-sm text-gray-600 dark:text-gray-400">Total: {{ formatPrice(getLineTotal(serviceItem)) }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Devices: show devices that belong to the ticket's company -->
            <div *ngIf="companyDevices.length > 0" class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Dispositivos de la Empresa</h3>
              <div class="space-y-4">
                <div *ngFor="let device of companyDevices" 
                     class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-start hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <h4 class="font-medium text-gray-900 dark:text-gray-100">{{ device.brand }} {{ device.model }}</h4>
                      <span *ngIf="isDeviceLinked(device.id)" class="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded">Vinculado</span>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">{{ device.device_type }}</p>
                    <p *ngIf="device.imei" class="text-sm text-gray-600 dark:text-gray-400">IMEI: {{ device.imei }}</p>
                    <p *ngIf="device.color" class="text-sm text-gray-600 dark:text-gray-400">Color: {{ device.color }}</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      <span class="font-medium">Problema reportado:</span> {{ device.reported_issue }}
                    </p>
                  </div>
                  <div class="text-right">
                    <span [class]="getDeviceStatusClass(device.status)"
                          class="inline-block px-2 py-1 text-xs font-medium rounded">
                      {{ getDeviceStatusLabel(device.status) }}
                    </span>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ formatDate(device.received_at) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comments Section -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Comentarios</h3>
              
              <!-- Add Comment Form -->
              <div class="mb-6">

                <!-- TipTap Editor -->
                <div class="relative">
                  <div 
                    #editorElement
                    id="editorElement"
                    class="tiptap-editor w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
                    (dragover)="onNativeDragOver($event)"
                    (drop)="onNativeDrop($event)"
                  >
                  </div>
                </div>
                
                <div class="mt-2 flex justify-between items-center">
                  <label class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                    <input type="checkbox" [(ngModel)]="isInternalComment" class="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                    Comentario interno (no visible para el cliente)
                  </label>
                  <div class="flex items-center gap-3">
                    <span *ngIf="isUploadingImage" class="text-xs text-gray-500 dark:text-gray-400">Subiendo imagen...</span>
                    <button (click)="addComment()" 
                            [disabled]="isUploadingImage || !hasEditorContent()"
                            class="btn btn-primary">
                      <i class="fas fa-comment"></i>
                      Añadir Comentario
                    </button>
                  </div>
                </div>
              </div>              <!-- Comments List -->
              <div *ngIf="comments.length === 0" class="text-center py-6 text-gray-500 dark:text-gray-400">
                <i class="fas fa-comments text-4xl mb-3 opacity-50"></i>
                <p>No hay comentarios aún</p>
              </div>
              <div *ngIf="comments.length > 0" class="space-y-4">
                <div *ngFor="let comment of comments" 
                     [class]="comment.is_internal ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700' : 'bg-gray-50 dark:bg-gray-700'"
                     class="rounded-lg p-4 border">
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-gray-900 dark:text-gray-100">{{ comment.user?.name || 'Usuario' }}</span>
                      <span *ngIf="comment.is_internal" 
                            class="px-2 py-1 text-xs bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 rounded inline-flex items-center gap-1">
                        <i class="fas fa-lock w-3"></i>
                        Interno
                      </span>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(comment.created_at) }}</span>
                  </div>
                  <div class="prose prose-sm max-w-none text-gray-800 dark:text-gray-300" [innerHTML]="renderComment(comment.comment)"></div>
                </div>
              </div>
            </div>
          </div>
          

          <!-- Sidebar (Right Side) -->
          <div class="space-y-6 lg:col-span-1">

            <!-- Client Contact -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Cliente</h3>
              <div *ngIf="ticket.client as client; else noClientInfo">
                <div class="text-sm text-gray-900 dark:text-gray-100 font-medium">{{ client.name}}</div>
                <div class="mt-3 space-y-2">
                  <div *ngIf="client.email">
                    <a [href]="'mailto:' + client.email" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">{{ client.email }}</a>
                  </div>
                  <div *ngIf="client.phone" class="flex items-center space-x-2">
                    <a [href]="'tel:' + client.phone" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">{{ client.phone }}</a>
                  </div>
                </div>
              </div>
              <ng-template #noClientInfo>
                <div class="text-sm text-gray-500 dark:text-gray-400">No hay información del cliente</div>
              </ng-template>
            </div>
            
            <!-- Quick Stats -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Resumen</h3>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Total Servicios:</span>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ formatPrice(calculateServicesTotal()) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Total Ticket:</span>
                  <span class="text-lg font-bold text-green-600 dark:text-green-400">{{ formatPrice(ticket.total_amount || calculateServicesTotal()) }}</span>
                </div>
                <hr class="border-gray-200 dark:border-gray-700">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Horas Estimadas:</span>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ getEstimatedHours() }}h</span>
                </div>
                <!-- <div class="flex justify-between">
                  <span class="text-sm text-gray-600 dark:text-gray-400">Horas Reales:</span>
                  <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ getActualHours() }}h</span>
                </div> -->
              </div>
            </div>

            <!-- Timeline -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Timeline</h3>
              </div>
              <div class="space-y-4">
                <div class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Ticket creado</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(ticket.created_at) }}</p>
                  </div>
                </div>
                
                <div *ngIf="ticket.updated_at !== ticket.created_at" class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Última actualización</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(ticket.updated_at) }}</p>
                  </div>
                </div>
                
                <div *ngFor="let activity of recentActivity" class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ activity.action }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(activity.created_at) }}</p>
                  </div>
                </div>
                <button (click)="changeStage()" 
                        class="btn btn-secondary">
                  <i class="fas fa-exchange-alt"></i>
                  Cambiar Estado
                </button>
              </div>
            </div>
            <!-- Tags Section (moved from header) -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6 mt-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Tags</h3>
              <div *ngIf="!ticketTags || ticketTags.length === 0" class="text-sm text-gray-500 dark:text-gray-400">No hay tags asignadas</div>
              <div *ngIf="ticketTags && ticketTags.length > 0" class="flex flex-wrap gap-2">
                <span *ngFor="let tag of ticketTags" [style.background-color]="getTagColor(tag)" class="px-2 py-1 rounded text-xs font-medium text-white">{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Change Stage Modal -->
      @if (showChangeStageModal) {
        <div class="modal-overlay" (click)="closeChangeStageModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">
                <i class="fas fa-exchange-alt"></i>
                Cambiar Estado del Ticket
              </h2>
              <button (click)="closeChangeStageModal()" class="modal-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="stageSelect" class="form-label">Nuevo Estado</label>
                <select
                  id="stageSelect"
                  [(ngModel)]="selectedStageId"
                  class="form-input"
                >
                  <option value="">Seleccionar estado...</option>
                  <option 
                    *ngFor="let stage of allStages" 
                    [value]="stage.id"
                    [selected]="stage.id === ticket?.stage_id"
                  >
                    {{ stage.name }}
                  </option>
                </select>
              </div>
              <div class="modal-actions">
                <button 
                  type="button" 
                  (click)="closeChangeStageModal()" 
                  class="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  (click)="saveStageChange()" 
                  class="btn btn-primary"
                  [disabled]="!selectedStageId"
                >
                  <i class="fas fa-save"></i>
                  Guardar Cambio
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Update Hours Modal -->
      @if (showUpdateHoursModal) {
        <div class="modal-overlay" (click)="closeUpdateHoursModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">
                <i class="fas fa-clock"></i>
                Actualizar Horas Trabajadas
              </h2>
              <button (click)="closeUpdateHoursModal()" class="modal-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="hoursInput" class="form-label">Horas Reales Trabajadas</label>
                <input
                  type="number"
                  id="hoursInput"
                  [(ngModel)]="newHoursValue"
                  min="0"
                  step="0.25"
                  class="form-input"
                  placeholder="0.00"
                />
                <small class="form-help">
                  Horas estimadas: {{ getEstimatedHours() }}h
                </small>
              </div>
              <div class="modal-actions">
                <button 
                  type="button" 
                  (click)="closeUpdateHoursModal()" 
                  class="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  (click)="saveHoursUpdate()" 
                  class="btn btn-primary"
                  [disabled]="newHoursValue < 0"
                >
                  <i class="fas fa-save"></i>
                  Actualizar Horas
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Attachment Modal -->
      @if (showAttachmentModal) {
        <div class="modal-overlay" (click)="closeAttachmentModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">
                <i class="fas fa-paperclip"></i>
                Adjuntar Archivo
              </h2>
              <button (click)="closeAttachmentModal()" class="modal-close">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label for="fileInput" class="form-label">Seleccionar Archivo</label>
                <input
                  type="file"
                  id="fileInput"
                  (change)="onFileSelected($event)"
                  class="form-input"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                />
                <small class="form-help">
                  Formatos permitidos: imágenes, PDF, documentos de Word, texto
                </small>
              </div>
              <div *ngIf="selectedFile" class="file-preview">
                <div class="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                  <i class="fas fa-file text-blue-500"></i>
                  <span class="text-sm font-medium">{{ selectedFile.name }}</span>
                  <span class="text-xs text-gray-500">({{ (selectedFile.size / 1024 / 1024).toFixed(2) }} MB)</span>
                </div>
              </div>
              <div class="modal-actions">
                <button 
                  type="button" 
                  (click)="closeAttachmentModal()" 
                  class="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  (click)="uploadAttachment()" 
                  class="btn btn-primary"
                  [disabled]="!selectedFile"
                >
                  <i class="fas fa-upload"></i>
                  Subir Archivo
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>

      <!-- Services Selection Modal -->
      @if (showServicesModal) {
        <div class="modal-overlay">
          <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">🧰 Seleccionar Servicios</h2>
              <button (click)="closeServicesModal()" class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body space-y-3">
              <div>
                <input type="text" class="form-input" placeholder="Buscar servicios..." [(ngModel)]="serviceSearchText" (input)="filterServices()" />
              </div>
              <div class="max-h-80 overflow-auto divide-y">
                <div *ngFor="let svc of filteredServices" class="py-3 px-2 hover:bg-gray-50 cursor-pointer" (click)="toggleServiceSelection(svc)">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4">
                      <div class="font-medium">{{ svc.name }}</div>
                      <div class="text-xs text-gray-500 line-clamp-2">{{ svc.description }}</div>
                      <div class="text-xs text-gray-500 mt-1">
                        <ng-container *ngIf="svc.tags?.length; else showCategory">
                          <i class="fas fa-tag"></i>
                          <span *ngFor="let t of svc.tags; let i = index">{{ t }}<span *ngIf="i < (svc.tags.length - 1)">, </span></span>
                        </ng-container>
                        <ng-template #showCategory>🏷️ {{ svc.category || 'Sin categoría' }}</ng-template>
                      </div>
                    </div>
                    <div class="flex items-center space-x-4">
                      <div class="text-right text-sm text-gray-700">
                        <div class="font-medium">{{ formatPrice(getServiceUnitPrice(svc)) }}</div>
                        <div class="text-xs text-gray-500">Unidad</div>
                      </div>
                      <div class="pl-3">
                        <input type="checkbox" [checked]="isServiceIdSelected(svc.id)" (click)="$event.stopPropagation(); toggleServiceSelection(svc)" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer flex justify-end space-x-2 p-2">
              <button class="btn btn-secondary" (click)="closeServicesModal()">Cancelar</button>
              <button class="btn btn-primary" [disabled]="selectedServiceIds.size === 0" (click)="saveServicesSelection()">Guardar</button>
            </div>
          </div>
        </div>
      }
  `
})
export class TicketDetailComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  loading = true;
  error: string | null = null;
  ticket: Ticket | null = null;
  ticketServices: any[] = [];
  ticketDevices: Device[] = [];
  // All devices for the ticket's company (authoritative)
  companyDevices: Device[] = [];
  // Set of linked device ids (from ticket_devices)
  linkedDeviceIds: Set<string> = new Set();
  ticketTags: string[] = [];
  availableTags: any[] = [];
  allStages: ConfigStage[] = [];
  private stagesSvc = inject(SupabaseTicketStagesService);
  comments: any[] = [];
  recentActivity: any[] = [];
  ticketId: string | null = null;
  
  // Comment form
  newComment: string = '';
  isInternalComment: boolean = false;
  // Rich editor state
  commentEditorHtml: string = '';
  isUploadingImage: boolean = false;
  
  // Modal controls
  showChangeStageModal = false;
  showUpdateHoursModal = false;
  showAttachmentModal = false;

  // Modal form data
  selectedStageId: string = '';
  newHoursValue: number = 0;
  selectedFile: File | null = null;
  // Edit modal form data (handled by central modal)
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SimpleSupabaseService);
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);
  private devicesService = inject(DevicesService);
  private ticketModalService = inject(TicketModalService);
  private sanitizer = inject(DomSanitizer);
  private quotesService = inject(SupabaseQuotesService);
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  
  // Track if there is an existing active quote derived from this ticket
  activeQuoteId: string | null = null;

  // Services Selection Modal state
  showServicesModal = false;
  servicesCatalog: any[] = [];
  filteredServices: any[] = [];
  serviceSearchText = '';
  selectedServiceIds: Set<string> = new Set();
  // Keep quantities for selected services
  selectedServiceQuantities: Map<string, number> = new Map();

  // Minimal in-component toast system
  // Deprecated local toast ids (kept for backward compat, no longer used)
  private nextToastId = 1;

  // Track saving state per assigned service id when persisting inline quantity edits
  savingAssignedServiceIds: Set<string> = new Set();

  // TipTap Editor
  editor: Editor | null = null;
  @ViewChild('editorElement', { static: false }) editorElement!: ElementRef;
  private editorTried = false;
  private cdr = inject(ChangeDetectorRef);

  // Unified Badge Configurations (following app style guide)
  ticketStatusConfig: Record<string, { label: string; classes: string; icon: string }> = {
    pending: {
      label: 'En Espera',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      icon: 'fa-clock'
    },
    inProgress: {
      label: 'En Progreso',
      classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      icon: 'fa-spinner'
    },
    completed: {
      label: 'Completado',
      classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      icon: 'fa-check-circle'
    },
    cancelled: {
      label: 'Cancelado',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      icon: 'fa-times-circle'
    }
  };

  ticketPriorityConfig: Record<string, { label: string; classes: string; icon: string }> = {
    low: {
      label: 'Baja',
      classes: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      icon: 'fa-arrow-down'
    },
    normal: {
      label: 'Normal',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      icon: 'fa-minus'
    },
    high: {
      label: 'Alta',
      classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
      icon: 'fa-arrow-up'
    },
    urgent: {
      label: 'Urgente',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      icon: 'fa-exclamation-circle'
    }
  };

  timelineEventColors: Record<string, string> = {
    created: 'bg-green-500',
    updated: 'bg-blue-500',
    service: 'bg-purple-500',
    status: 'bg-gray-400 dark:bg-gray-500',
    comment: 'bg-orange-500',
    completed: 'bg-green-600'
  };

  // Custom Image extension to carry a temporary id attribute for preview replacement
  private ImageWithTemp = Image.extend({
    addAttributes() {
      return {
        ...(this.parent?.() as any),
        dataTempId: {
          default: null,
          renderHTML: (attrs: any) => attrs?.dataTempId ? { 'data-temp-id': attrs.dataTempId } : {},
          parseHTML: (element: HTMLElement) => element.getAttribute('data-temp-id'),
        },
      } as any;
    },
  });

  ngOnInit() {
    this.debugLog('TicketDetailComponent ngOnInit called');
    this.route.params.subscribe(params => {
      this.ticketId = params['id'];
      this.debugLog('Ticket ID from route:', this.ticketId);
      if (this.ticketId) {
        this.loadTicketDetail();
      } else {
        this.error = 'ID de ticket no válido';
        this.loading = false;
      }
    });
  }

  ngAfterViewInit() {
    this.debugLog('ngAfterViewInit called');
    // Wait for DOM to be fully rendered
    setTimeout(() => {
      this.debugLog('Attempting to initialize editor after DOM render...');
      this.initializeEditor();
    }, 200);
  }

  ngAfterViewChecked() {
    // If the ticket block just became visible, ensure editor is mounted once
    if (!this.editor && !this.editorTried && this.editorElement?.nativeElement) {
      this.editorTried = true;
      setTimeout(() => this.initializeEditor(), 0);
    }
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.destroy();
    }
  }

  // Development-only logger: will be a no-op in production
  private debugLog(...args: any[]) {
    if (!environment.production) {
      try { console.log(...args); } catch {}
    }
  }

  /**
   * Return a sensible full name for a client object.
   * Supports multiple possible field names coming from different imports (name, first_name, last_name, apellidos, etc.).
   */
  getClientFullName(client: any): string {
    if (!client) return '';
    const rawName = (client.name || client.nombre || '').toString().trim();
    const first = (client.first_name || client.firstName || client.nombre || '').toString().trim();
    const last = (client.last_name || client.lastName || client.apellido || client.apellidos || client.surname || '').toString().trim();

    // If there's a raw `name` and no separate last name, prefer it as-is.
    if (rawName && !last) return rawName;

    // If rawName exists and last is present but not already included in rawName, append it.
    if (rawName && last && !rawName.includes(last)) return `${rawName} ${last}`.trim();

    // Otherwise build from first + last
    const parts: string[] = [];
    if (first) parts.push(first);
    if (last) parts.push(last);
    const combined = parts.join(' ').trim();
    if (combined) return combined;

    // Fallback to any available name-like fields
    return rawName || client.email || '';
  }

  initializeEditor() {
    // Debug DOM state
  this.debugLog('DOM debug:');
  this.debugLog('- .tiptap-editor exists:', !!document.querySelector('.tiptap-editor'));
  this.debugLog('- #editorElement exists:', !!document.querySelector('#editorElement'));
  this.debugLog('- ViewChild editorElement:', this.editorElement);
  this.debugLog('- All elements with class tiptap-editor:', document.querySelectorAll('.tiptap-editor'));

    // Prefer ViewChild; fall back to query selectors
    let element = (this.editorElement && this.editorElement.nativeElement) as HTMLElement;
    if (!element) {
      element = document.querySelector('#editorElement') as HTMLElement;
    }
    if (!element) {
      element = document.querySelector('.tiptap-editor') as HTMLElement;
    }

    if (!element) {
      console.warn('Editor element not found with any selector, will retry once on next check...');
      this.editorTried = false; // allow ngAfterViewChecked to try again once
      return;
    }

    if (this.editor) {
      this.editor.destroy();
    }

  this.debugLog('Initializing TipTap editor on element:', element);
    this.editor = new Editor({
      element: element,
      extensions: [
        StarterKit.configure({
          // Disable the built-in link to avoid conflict with our custom Link extension
          link: false,
        }),
        this.ImageWithTemp.configure({
          inline: true,
          HTMLAttributes: {
            class: 'max-w-full rounded-lg',
          },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 underline',
          },
        }),
        Placeholder.configure({
          placeholder: 'Escribe tu comentario aquí...',
        }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'prose prose-sm max-w-none focus:outline-none',
        },
        handleDrop: (view, event, slice, moved) => {
          const hasFiles = !!event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0;
          if (hasFiles) {
            this.handleEditorDrop(event);
            return true; // handled, prevent browser default navigation
          }
          return false;
        },
        handlePaste: (view, event, slice) => {
          // If files are present in paste, handle and stop default
          const items = event.clipboardData?.items || [];
          const hasFiles = Array.from(items).some(i => i.kind === 'file');
          if (hasFiles) {
            this.handleEditorPaste(event);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        this.newComment = editor.getHTML();
      },
      onCreate: ({ editor }) => {
  this.debugLog('TipTap editor created successfully');
        // Trigger change detection to reflect buttons state bound to editor
        try { this.cdr.detectChanges(); } catch {}
      },
    });
  }

  // TipTap Editor Methods
  toggleBold() {
    this.editor?.chain().focus().toggleBold().run();
  }

  toggleItalic() {
    this.editor?.chain().focus().toggleItalic().run();
  }

  toggleBulletList() {
    this.editor?.chain().focus().toggleBulletList().run();
  }

  toggleOrderedList() {
    this.editor?.chain().focus().toggleOrderedList().run();
  }

  private async handleEditorPaste(event: ClipboardEvent) {
    try {
      const items = event.clipboardData?.items || [];
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        event.preventDefault();
        for (const f of files) {
          if (f.type.startsWith('image/')) {
            // 1) Insert a temporary preview image
            const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const objectUrl = URL.createObjectURL(f);
            this.insertTempImage(objectUrl, tmpId, f.name);
            // 2) Upload and replace src once ready
            const url = await this.uploadCommentFile(f);
            if (url && this.editor) {
              // Replace the temp img (by data attribute)
              this.editor.commands.command(({ tr, state }) => {
                const { doc } = state;
                let replaced = false;
                doc.descendants((node, pos) => {
                  if (node.type.name === 'image' && (node.attrs as any)?.dataTempId === tmpId) {
                    const newAttrs = { ...(node.attrs as any), src: url, alt: f.name, dataTempId: null };
                    tr.setNodeMarkup(pos, undefined, newAttrs as any);
                    replaced = true;
                    return false; // stop traversal
                  }
                  return true;
                });
                if (replaced) {
                  tr.setMeta('addToHistory', true);
                  return true;
                }
                return false;
              });
            }
            // 3) Release object URL
            URL.revokeObjectURL(objectUrl);
          } else {
            // Non-image: upload and insert link
            const url = await this.uploadCommentFile(f);
            if (url && this.editor) {
              const safeName = f.name.replace(/[<>]/g, '');
              this.editor.chain().focus()
                .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${safeName}</a>`)
                .run();
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error procesando pegado:', e);
    }
  }

  private async handleEditorDrop(event: DragEvent) {
    try {
      if (!event.dataTransfer?.files?.length) return;
      const files = Array.from(event.dataTransfer.files);
      event.preventDefault();
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const objectUrl = URL.createObjectURL(f);
          this.insertTempImage(objectUrl, tmpId, f.name);
          const url = await this.uploadCommentFile(f);
          if (url && this.editor) {
            this.editor.commands.command(({ tr, state }) => {
              const { doc } = state;
              let replaced = false;
              doc.descendants((node, pos) => {
                if (node.type.name === 'image' && (node.attrs as any)?.dataTempId === tmpId) {
                  const newAttrs = { ...(node.attrs as any), src: url, alt: f.name, dataTempId: null };
                  tr.setNodeMarkup(pos, undefined, newAttrs as any);
                  replaced = true; return false;
                }
                return true;
              });
              if (replaced) { tr.setMeta('addToHistory', true); return true; }
              return false;
            });
          }
          URL.revokeObjectURL(objectUrl);
        } else {
          // Upload non-image and insert a link
          const url = await this.uploadCommentFile(f);
          if (url && this.editor) {
            const safeName = f.name.replace(/[<>]/g, '');
            this.editor.chain().focus()
              .insertContent(`<a href="${url}" target="_blank" rel="noopener noreferrer">${safeName}</a>`)
              .run();
          }
        }
      }
    } catch (e) {
      console.warn('Error procesando drop:', e);
    }
  }

  // selected services handled via selectedServiceIds in modal

  // Load services catalog (for selection modal)
  private async loadServicesCatalog() {
    try {
      // Use SupabaseServicesService to get mapped services (category names, tags, etc.)
      const companyId = String((this.ticket as any)?.company_id || (this.ticket as any)?.company?.id || '');
      try {
        const services = await this.servicesService.getServices(companyId);
        this.servicesCatalog = services || [];
      } catch (e) {
        // Fallback to direct query if the service helper fails
        const { data: services } = await this.supabase.getClient().from('services').select('*').order('name');
        this.servicesCatalog = services || [];
      }
      this.filterServices();
    } catch (err) {
      console.warn('Error loading services catalog', err);
      this.servicesCatalog = [];
      this.filteredServices = [];
    }
  }

  // customer-related helpers removed (not needed in services-only modal)

  filterServices() {
    const q = (this.serviceSearchText || '').toLowerCase();
    if (!q) {
      this.filteredServices = this.servicesCatalog.slice(0, 10);
      return;
    }
    this.filteredServices = this.servicesCatalog.filter(s => {
      const nameMatch = (s.name || '').toLowerCase().includes(q);
      const descMatch = (s.description || '').toLowerCase().includes(q);
      const catMatch = (s.category || '').toLowerCase().includes(q);
      const tagsMatch = Array.isArray((s as any).tags) && (s as any).tags.some((t: string) => (t || '').toLowerCase().includes(q));
      return nameMatch || descMatch || catMatch || tagsMatch;
    }).slice(0, 200);
  }

  isServiceIdSelected(id: string) { return this.selectedServiceIds.has(id); }
  toggleServiceSelection(svc: any) {
    const id = svc?.id;
    if (!id) return;
    if (this.selectedServiceIds.has(id)) {
      // Prevent deselecting the last remaining service
        if (this.selectedServiceIds.size <= 1) {
          this.showToast('Debe mantener al menos un servicio seleccionado.', 'info');
          return;
        }
      this.selectedServiceIds.delete(id);
    } else {
      this.selectedServiceIds.add(id);
      // Ensure a quantity exists for newly selected services
      if (!this.selectedServiceQuantities.has(id)) this.selectedServiceQuantities.set(id, 1);
    }
  }
  
  async loadTicketTags() {
    try {
      const { data: tagRelations, error } = await this.supabase.getClient()
        .from('ticket_tag_relations')
        .select(`
          tag_id,
          tag:ticket_tags(id, name, color)
        `)
        .eq('ticket_id', this.ticketId);

      if (error) {
        console.warn('Error cargando tags del ticket:', error);
        this.ticketTags = [];
        this.availableTags = [];
        return;
      }

      this.ticketTags = (tagRelations || []).map((rel: any) => rel.tag?.name).filter(Boolean);
      this.availableTags = (tagRelations || []).map((rel: any) => rel.tag).filter(Boolean);
    } catch (error) {
      console.error('Error en loadTicketTags:', error);
      this.ticketTags = [];
      this.availableTags = [];
    }
  }

  async loadTicketDevices() {
    try {
      // Load linked devices and build set of linked IDs
      this.linkedDeviceIds = new Set();
      if (this.ticketId) {
        const linked = await this.devicesService.getTicketDevices(this.ticketId);
        if (linked && linked.length > 0) {
          this.ticketDevices = linked;
          linked.forEach(d => this.linkedDeviceIds.add(d.id));
        } else {
          this.ticketDevices = [];
        }
      }

      // Load all devices for the ticket's company (company is authoritative)
      if (this.ticket?.company_id) {
        try {
          const devices = await this.devicesService.getDevices(this.ticket.company_id);
          this.companyDevices = devices || [];
        } catch (err) {
          console.warn('Error cargando dispositivos de la empresa:', err);
          this.companyDevices = [];
        }
      } else {
        this.companyDevices = [];
      }
    } catch (error) {
      console.error('Error cargando dispositivos:', error);
      this.ticketDevices = [];
      this.companyDevices = [];
    }
  }

  isDeviceLinked(deviceId: string): boolean {
    return this.linkedDeviceIds.has(deviceId);
  }

  async loadComments() {
    try {
      const { data: comments, error } = await this.supabase.getClient()
        .from('ticket_comments')
        .select(`
          *,
          user:users(name, email)
        `)
        .eq('ticket_id', this.ticketId)
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('Error cargando comentarios:', error);
        this.comments = [];
        return;
      }

      this.comments = comments || [];
    } catch (error) {
      console.error('Error en loadComments:', error);
      this.comments = [];
    }
  }

  async addComment() {
    // Use TipTap editor HTML content
    const content = this.editor?.getHTML()?.trim() || '';
    if (!content || content === '<p></p>') return;

    try {
      const { data, error } = await this.supabase.getClient()
        .from('ticket_comments')
        .insert({
          ticket_id: this.ticketId,
          comment: content,
          is_internal: this.isInternalComment
        })
        .select(`
          *,
          user:users(name, email)
        `)
        .single();

      if (error) throw error;

      this.comments.push(data);
      this.editor?.commands.clearContent();
      this.newComment = '';
      this.isInternalComment = false;

      // Optionally link pasted images as attachments
      try {
        await this.linkCommentAttachments(data.id, content);
      } catch (e) {
        console.warn('No se pudieron vincular adjuntos del comentario:', e);
      }

    } catch (error: any) {
      console.error('Error añadiendo comentario:', error);
      this.showToast('Error al añadir comentario: ' + (error?.message || ''), 'error');
    }
  }

  // Navigation and actions
  goBack() {
    this.router.navigate(['/tickets']);
  }

  // Crear un presupuesto a partir de los servicios asignados al ticket
  async convertToQuoteFromTicket() {
    try {
      // If there's already an active quote, navigate to it
      if (this.activeQuoteId) {
        try {
          this.router.navigate(['/presupuestos', 'edit', this.activeQuoteId]);
        } catch {
          this.router.navigate(['/presupuestos', this.activeQuoteId]);
        }
        return;
      }
      if (!this.ticket) { this.showToast('Ticket no cargado', 'error'); return; }
      const clientId = (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || null;
      if (!clientId) { this.showToast('El ticket no tiene cliente asociado', 'error'); return; }
      if (!this.ticketServices || this.ticketServices.length === 0) {
        this.showToast('No hay servicios asignados para convertir', 'info');
        return;
      }

      // Validar completitud del cliente antes de crear presupuesto
      try {
        const customer = await firstValueFrom(this.customersService.getCustomer(String(clientId)));
        const comp = this.customersService.computeCompleteness(customer);
        if (!comp.complete) {
          // 'warning' no es tipo permitido en showToast -> usar 'info'
          this.showToast('El cliente está incompleto y no puede generar presupuestos. Faltan: ' + comp.missingFields.join(', '), 'info');
          return;
        }
      } catch (e: any) {
        this.showToast('No se pudo validar el cliente para el presupuesto: ' + (e?.message || ''), 'error');
        return;
      }

      // Construir DTO de creación de presupuesto
      const items = (this.ticketServices || []).map((it: any) => ({
        description: (it?.service?.name || 'Servicio'),
        quantity: Math.max(1, Number(it?.quantity || 1)),
        unit_price: Math.max(0, Number(this.getUnitPrice(it) || 0)),
        tax_rate: 21,
        notes: it?.service?.description || null,
        service_id: it?.service?.id || null,
        product_id: null
      }));

      const dto = {
        client_id: String(clientId),
        title: `Presupuesto Ticket #${(this.ticket as any)?.ticket_number || ''} - ${(this.ticket as any)?.title || ''}`.trim(),
        description: (this.ticket as any)?.description || '',
        items,
        // Link to ticket for uniqueness enforcement server-side
        ticket_id: (this.ticket as any)?.id || null
      } as any;

      this.showToast('Creando presupuesto...', 'info', 2500);
      const quote = await firstValueFrom(this.quotesService.createQuote(dto));
      this.activeQuoteId = quote?.id || null;
  this.showToast(`Se ha creado el presupuesto a partir del ticket #${(this.ticket as any)?.ticket_number || ''}`,'success');
      // Navegar al editor de presupuesto
      try {
        this.router.navigate(['/presupuestos', 'edit', quote.id]);
      } catch {
        // Fallback a detalle si el editor no está disponible
        this.router.navigate(['/presupuestos', quote.id]);
      }
    } catch (err: any) {
      console.error('Error creando presupuesto desde ticket:', err);
      this.showToast('Error creando presupuesto: ' + (err?.message || ''), 'error');
    }
  }


  async deleteTicket() {
    if (!confirm('¿Estás seguro de que deseas eliminar este ticket?')) return;

    try {
      await this.ticketsService.deleteTicket(this.ticketId!);
      this.router.navigate(['/tickets']);
    } catch (error: any) {
      this.showToast('Error al eliminar ticket: ' + (error?.message || ''), 'error');
    }
  }

  changeStage() {
    if (!this.ticket) return;
    this.selectedStageId = this.ticket.stage_id || '';
    this.showChangeStageModal = true;
    document.body.classList.add('modal-open');
  }

  updateHours() {
    if (!this.ticket) return;
    this.newHoursValue = this.getActualHours();
    this.showUpdateHoursModal = true;
    document.body.classList.add('modal-open');
  }

  addAttachment() {
    this.showAttachmentModal = true;
    document.body.classList.add('modal-open');
  }

  // Modal methods
  closeChangeStageModal() {
    this.showChangeStageModal = false;
    document.body.classList.remove('modal-open');
  }

  closeUpdateHoursModal() {
    this.showUpdateHoursModal = false;
    document.body.classList.remove('modal-open');
  }

  closeAttachmentModal() {
    this.showAttachmentModal = false;
    this.selectedFile = null;
    document.body.classList.remove('modal-open');
  }

  // Robust body scroll lock helpers
  private _scrollTopBackup: number | null = null;
  lockBodyScroll() {
    try {
      // Save current scroll position
      this._scrollTopBackup = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      // Add inline style to prevent scrolling and keep visual position
      document.body.style.top = `-${this._scrollTopBackup}px`;
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } catch (e) {
      // Fallback: add modal-open class which sets overflow hidden via scss
      document.body.classList.add('modal-open');
    }
  }

  unlockBodyScroll() {
    try {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      if (this._scrollTopBackup !== null) {
        window.scrollTo(0, this._scrollTopBackup);
      }
      this._scrollTopBackup = null;
    } catch (e) {
      document.body.classList.remove('modal-open');
    }
  }

  async loadTicketDetail() {
    try {
      this.loading = true;
      this.error = null;
      
      // Cargar ticket con relaciones
      const { data: ticketData, error: ticketError } = await this.supabase.getClient()
        .from('tickets')
        .select(`
          *,
          client:clients(id, name, email, phone),
          stage:ticket_stages(id, name, position, color),
          company:companies(id, name)
        `)
        .eq('id', this.ticketId)
        .single();

      if (ticketError) throw new Error('Error cargando ticket: ' + ticketError.message);
      this.ticket = ticketData;

      // UI-level check: does a quote already exist for this ticket?
      try {
        await this.checkActiveQuoteForTicket();
      } catch {}

      // Cargar servicios del ticket desde ticket_services
      // Mark as opened (non-blocking). Ignore result; UI will refresh from list next time.
      try {
        if (this.ticket?.id) {
          this.ticketsService.markTicketOpened(this.ticket.id);
        }
      } catch {}

      await this.loadTicketServices();
      
      // Cargar tags del ticket
      await this.loadTicketTags();
      
      // Cargar dispositivos vinculados
      await this.loadTicketDevices();
      
      // Cargar comentarios
      await this.loadComments();

      // Cargar estados visibles (genéricos no ocultos + específicos de empresa)
      try {
        const { data, error } = await this.stagesSvc.getVisibleStages();
        if (error) {
          console.warn('Error cargando estados visibles:', error);
          this.allStages = [];
        } else {
          this.allStages = (data || []).slice().sort((a: any, b: any) => (Number(a?.position ?? 0) - Number(b?.position ?? 0)));
        }
      } catch (err) {
        console.warn('Excepción cargando estados visibles:', err);
        this.allStages = [];
      }

      // Simular actividad reciente
      this.recentActivity = [
        { action: 'Servicio añadido', created_at: this.ticket?.updated_at || new Date().toISOString() },
        { action: 'Estado actualizado', created_at: this.ticket?.updated_at || new Date().toISOString() }
      ];

    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      // Ensure the editor initializes after the DOM renders the *ngIf block
      setTimeout(() => {
        try {
          this.initializeEditor();
        } catch {}
      }, 0);
    }
  }

  /**
   * Look for an existing quote created from this ticket and set activeQuoteId if found.
   * We match by client and a title pattern "Presupuesto Ticket #<ticket_number>".
   */
  private async checkActiveQuoteForTicket(): Promise<void> {
    try {
      const ticketId = (this.ticket as any)?.id;
      if (!ticketId) { this.activeQuoteId = null; return; }
      const client = this.supabase.getClient();
      const { data, error } = await client
        .from('quotes')
        .select('id, status')
        .eq('ticket_id', ticketId)
        .in('status', ['draft','sent','viewed','accepted'])
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) { this.activeQuoteId = null; return; }
      const found = (data || [])[0];
      this.activeQuoteId = found?.id || null;
    } catch (e) {
      this.activeQuoteId = null;
    }
  }

  // Persist stage change from modal
  async saveStageChange() {
    if (!this.ticket || !this.selectedStageId) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: this.selectedStageId })
        .eq('id', this.ticket.id);
      if (error) throw error;
      await this.loadTicketDetail();
      this.closeChangeStageModal();
    } catch (err: any) {
      this.showToast('Error al cambiar estado: ' + (err?.message || err), 'error');
    }
  }

  // Persist hours update from modal
  async saveHoursUpdate() {
    if (!this.ticket) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ actual_hours: this.newHoursValue })
        .eq('id', this.ticket.id);
      if (error) throw error;
      // Update local
      this.ticket.actual_hours = this.newHoursValue;
      // System comment
      const comment = `Horas reales actualizadas a ${this.newHoursValue}h`;
      await this.addSystemComment(comment);
      this.closeUpdateHoursModal();
    } catch (err: any) {
      this.showToast('Error al actualizar horas: ' + (err?.message || err), 'error');
    }
  }

  onFileSelected(event: any) {
    const file = (event?.target?.files || [])[0];
    this.selectedFile = file || null;
  }

  async uploadAttachment() {
    if (!this.ticket || !this.selectedFile) return;
    try {
      // Placeholder: Implement storage upload if needed
      // After upload, add a system comment with the file name
      await this.addSystemComment(`Archivo adjuntado: ${this.selectedFile.name}`);
      this.selectedFile = null;
      this.closeAttachmentModal();
      this.showToast('Archivo adjuntado (simulado)', 'success');
    } catch (err: any) {
      this.showToast('Error al adjuntar archivo: ' + (err?.message || err), 'error');
    }
  }

  async addSystemComment(content: string) {
    try {
      await this.supabase.getClient().from('ticket_comments').insert({
        ticket_id: this.ticketId,
        comment: content,
        is_internal: true
      });
      await this.loadComments();
    } catch (e) {
      console.warn('No se pudo registrar comentario del sistema');
    }
  }

  printTicket() {
    try { window.print(); } catch {}
  }

  hasEditorContent(): boolean {
    if (!this.editor) return false;
    const html = this.editor.getHTML().trim();
    const text = this.editor.getText().trim();
    return !!text || /<img\b/i.test(html);
  }

  private sanitizeHtml(html: string): string {
    // Basic sanitizer: remove scripts/styles/iframes, javascript: URLs, and event handlers
    const div = document.createElement('div');
    div.innerHTML = html || '';

    const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed', 'link'];
    dangerousTags.forEach(tag => div.querySelectorAll(tag).forEach(el => el.remove()));

    // Remove event handler attributes and javascript: URLs
    const walk = (el: Element) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || '').trim();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src') && /^javascript:/i.test(val)) {
          el.removeAttribute(attr.name);
        }
      }
      for (const child of Array.from(el.children)) walk(child);
    };
    Array.from(div.children).forEach(ch => walk(ch));

    return div.innerHTML;
  }

  private ensureHttpUrl(url: string): string {
    try {
      const u = new URL(url, window.location.origin);
      if (!/^https?:$/i.test(u.protocol)) return 'https://' + u.href.replace(/^.*?:\/\//, '');
      return u.href;
    } catch {
      return 'https://' + String(url || '').replace(/^.*?:\/\//, '');
    }
  }

  renderComment(comment: string): SafeHtml {
    const safe = this.sanitizeHtml(comment || '');
    return this.sanitizer.bypassSecurityTrustHtml(safe);
  }

  private async uploadCommentImage(file: File): Promise<string | null> {
    // Backward-compatible wrapper for images
    return this.uploadCommentFile(file);
  }

  private async uploadCommentFile(file: File): Promise<string | null> {
    if (!this.ticket) return null;
    try {
      this.isUploadingImage = true;
      const bucket = 'attachments';
      const originalExt = (file.name.split('.').pop() || '').toLowerCase();
      const ext = originalExt || 'bin';
      const path = `tickets/${this.ticket.id}/comments/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await this.supabase.getClient().storage
        .from(bucket)
        .upload(path, file);
      if (uploadError) throw uploadError;
      // Always create a signed URL (bucket is private, public URL may 400)
      const { data: signed, error: signErr } = await this.supabase.getClient()
        .storage.from(bucket)
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const url = signed?.signedUrl || '';

      // Optional: register in attachments table (works for any file type)
      try {
        await this.supabase.getClient().from('attachments').insert({
          company_id: (this.ticket as any)?.company_id,
          job_id: null,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type
        });
      } catch {}

      return url || null;
    } catch (e: any) {
      console.error('Error subiendo imagen pegada:', e);
      this.showToast('Error subiendo imagen', 'error');
      return null;
    } finally {
      this.isUploadingImage = false;
    }
  }

  private insertTempImage(objectUrl: string, tempId: string, alt: string) {
    if (!this.editor) return;
    // Insert image node with our custom schema attribute dataTempId
    this.editor.chain().focus().insertContent({ type: 'image', attrs: { src: objectUrl, alt, dataTempId: tempId } as any }).run();
  }

  private async linkCommentAttachments(commentId: string, html: string) {
    try {
      const imgSrcs = this.extractImageSrcs(html || '');
      const linkHrefs = this.extractAnchorHrefs(html || '');
      const srcs = [...imgSrcs, ...linkHrefs];
      if (srcs.length === 0) return;
      const bucket = 'attachments';
      for (const src of srcs) {
        const path = this.extractStoragePathFromUrl(src, bucket);
        if (!path) continue;
        // Find attachment by file_path or insert if missing
        let attachmentId: string | null = null;
        try {
          const { data: existing } = await this.supabase.getClient()
            .from('attachments')
            .select('id')
            .eq('file_path', path)
            .limit(1)
            .single();
          attachmentId = existing?.id || null;
        } catch {}
        if (!attachmentId) {
          // create minimal row
          const { data: created } = await this.supabase.getClient()
            .from('attachments')
            .insert({
              company_id: (this.ticket as any)?.company_id,
              file_name: path.split('/').pop() || 'image',
              file_path: path
            })
            .select('id')
            .single();
          attachmentId = created?.id || null;
        }
        if (attachmentId) {
          try {
            // Prefer secure insert via Edge Function (uses service_role under the hood)
            const payload = { p_comment_id: commentId, p_attachment_id: attachmentId };
            const { data: funcData, error: funcError } = await this.supabase.getClient()
              .functions.invoke('upsert-ticket-comment-attachment', { body: payload });
            if (funcError) throw funcError;
          } catch (efErr) {
            // Fallback: direct insert (if RLS allows)
            try {
              await this.supabase.getClient().from('ticket_comment_attachments').insert({
                comment_id: commentId,
                attachment_id: attachmentId
              });
            } catch (dbErr) {
              console.warn('No se pudo crear vínculo de comentario-adjunto:', dbErr);
            }
          }
        }
      }
    } catch (e) {
      console.warn('No se pudieron vincular attachments al comentario:', e);
    }
  }

  private extractImageSrcs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return Array.from(div.querySelectorAll('img'))
      .map(img => img.getAttribute('src') || '')
      .filter(Boolean);
  }

  private extractAnchorHrefs(html: string): string[] {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return Array.from(div.querySelectorAll('a'))
      .map(a => a.getAttribute('href') || '')
      .filter(Boolean);
  }

  private extractStoragePathFromUrl(url: string, bucket: string): string | null {
    try {
      // Public URL pattern: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
      const pubRe = new RegExp(`/storage/v1/object/public/${bucket}/(.+)$`);
      const m = url.match(pubRe);
      if (m && m[1]) return m[1];
      // Signed URL pattern: .../object/sign/<bucket>/<path>?token=...
      const signRe = new RegExp(`/storage/v1/object/sign/${bucket}/([^?]+)`);
      const m2 = url.match(signRe);
      if (m2 && m2[1]) return m2[1];
      return null;
    } catch { return null; }
  }

  // Native event guards to ensure Chrome doesn't navigate away when dropping files
  onNativeDragOver(e: DragEvent) {
    if (e?.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  onNativeDrop(e: DragEvent) {
    if (e?.dataTransfer?.files?.length) {
      e.preventDefault();
      e.stopPropagation();
      this.handleEditorDrop(e);
    }
  }

  // Services selection modal methods (class scope)
  async openServicesModal() {
    if (!this.ticket) return;
    await this.loadServicesCatalog();
    // Preselect from current ticket services
    this.selectedServiceIds = new Set((this.ticketServices || []).map((ts: any) => ts?.service?.id).filter(Boolean));
    // Prefill quantities from current ticket services
    this.selectedServiceQuantities = new Map();
    for (const it of this.ticketServices || []) {
      const sid = it?.service?.id; if (sid) this.selectedServiceQuantities.set(sid, Math.max(1, Number(it.quantity || 1)));
    }
    // Ensure at least one selected for safety
    if (this.selectedServiceIds.size === 0 && this.servicesCatalog.length > 0) {
      this.selectedServiceIds.add(this.servicesCatalog[0].id);
      // default quantity
      this.selectedServiceQuantities.set(this.servicesCatalog[0].id, 1);
    }
    this.showServicesModal = true;
    document.body.classList.add('modal-open');
    this.lockBodyScroll();
  }

  closeServicesModal() {
    this.showServicesModal = false;
    document.body.classList.remove('modal-open');
    this.unlockBodyScroll();
  }

  async saveServicesSelection() {
    if (!this.ticket) return;
    if (this.selectedServiceIds.size === 0) {
      this.showToast('Debe seleccionar al menos un servicio.', 'info');
      return;
    }
    try {
      const existingQty = new Map<string, number>();
      for (const it of this.ticketServices || []) {
        const sid = it?.service?.id; const q = it?.quantity || 1; if (sid) existingQty.set(sid, q);
      }
      // Use quantities from selectedServiceQuantities if available, otherwise keep existing or 1
      const items = Array.from(this.selectedServiceIds).map(id => ({ service_id: id, quantity: this.selectedServiceQuantities.get(id) || existingQty.get(id) || 1 }));
      const companyIdForReplace = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');
      await this.ticketsService.replaceTicketServices(this.ticket.id, companyIdForReplace, items);
      await this.loadTicketServices();
      this.closeServicesModal();
      this.showToast('Servicios actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error guardando servicios:', err);
      this.showToast('Error al guardar servicios: ' + (err?.message || err), 'error');
    }
  }

  // Helpers for modal quantity + pricing display
  getServiceUnitPrice(svc: any): number {
    if (!svc) return 0;
    // Prefer explicit base_price on service record
    return typeof svc.base_price === 'number' ? svc.base_price : 0;
  }

  // Parse numeric tolerant of strings using comma as decimal separator
  private parseNumeric(v: any): number {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const s = String(v).trim().replace(/\s+/g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Return the estimated hours for the given ticket service row multiplied by quantity
  getLineEstimatedHours(serviceItem: any): number {
    try {
      const hrs = this.parseNumeric(serviceItem?.service?.estimated_hours ?? serviceItem?.estimated_hours ?? 0);
      const qty = Math.max(1, Math.floor(this.parseNumeric(serviceItem?.quantity ?? 1)) || 1);
      return Math.round(hrs * qty * 100) / 100;
    } catch (e) {
      return 0;
    }
  }

  getSelectedQuantity(svc: any): number {
    const id = svc?.id; if (!id) return 1;
    return Math.max(1, Number(this.selectedServiceQuantities.get(id) || 1));
  }

  // Inline assigned-services quantity editing handlers
  async onAssignedQuantityChange(serviceItem: any, newVal: any) {
    const sid = serviceItem?.service?.id; if (!sid) return;
    const q = Math.max(1, Math.floor(Number(newVal) || 1));
    serviceItem.quantity = q;
    await this.persistAssignedServiceQuantity(serviceItem);
  }

  increaseAssignedQty(serviceItem: any) { serviceItem.quantity = Math.max(1, (Number(serviceItem.quantity) || 1) + 1); this.onAssignedQuantityChange(serviceItem, serviceItem.quantity); }
  decreaseAssignedQty(serviceItem: any) { serviceItem.quantity = Math.max(1, (Number(serviceItem.quantity) || 1) - 1); this.onAssignedQuantityChange(serviceItem, serviceItem.quantity); }

  private async persistAssignedServiceQuantity(serviceItem: any) {
    const sid = serviceItem?.service?.id; if (!sid || !this.ticket) return;
    try {
      this.savingAssignedServiceIds.add(sid);
      // Build items from current ticketServices, using current quantities
      // Include unit_price when available so DB rows keep price_per_unit/total_price and UI can compute totals
      const items = (this.ticketServices || []).map((it: any) => {
        const unit = this.getUnitPrice(it);
        const obj: any = { service_id: it.service?.id, quantity: Math.max(1, Number(it.quantity || 1)) };
        if (typeof unit === 'number' && unit > 0) obj.unit_price = unit;
        return obj;
      });
      const companyIdForReplace = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');
      await this.ticketsService.replaceTicketServices(this.ticket.id, companyIdForReplace, items);
      // Refresh services to get any persisted price changes
      await this.loadTicketServices();
      this.showToast('Cantidad guardada', 'success');
    } catch (err: any) {
      console.error('Error guardando cantidad asignada:', err);
      this.showToast('Error guardando cantidad: ' + (err?.message || ''), 'error');
    } finally {
      this.savingAssignedServiceIds.delete(sid);
    }
  }

  // Toast helpers (use global ToastService)
  showToast(msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000) {
    const title = type === 'success' ? 'Éxito' : type === 'error' ? 'Error' : 'Info';
    if (type === 'success') this.toastService.success(title, msg, duration);
    else if (type === 'error') this.toastService.error(title, msg, duration);
    else this.toastService.info(title, msg, duration);
  }

  setSelectedQuantity(svc: any, qty: number) {
    const id = svc?.id; if (!id) return;
    const n = Number(qty) || 1;
    const q = Math.max(1, Math.floor(n));
    this.selectedServiceQuantities.set(id, q);
  }

  increaseQty(svc: any) { this.setSelectedQuantity(svc, this.getSelectedQuantity(svc) + 1); }
  decreaseQty(svc: any) { this.setSelectedQuantity(svc, Math.max(1, this.getSelectedQuantity(svc) - 1)); }

  // Load ticket services and map category UUIDs to names
  async loadTicketServices() {
    try {
      const { data: services, error } = await this.supabase.getClient()
        .from('ticket_services')
        .select(`
          *,
          service:services(
            id,
            name,
            description,
            base_price,
            estimated_hours,
            category,
            is_active
          )
        `)
        .eq('ticket_id', this.ticketId);

      if (error) {
        console.warn('Error cargando servicios del ticket:', error);
        this.ticketServices = [];
        return;
      }

      const items = services || [];
      const categoryIds: string[] = Array.from(new Set(
        (items as any[])
          .map((it: any) => it?.service?.category)
          .filter((v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
      ));

      let categoriesById: Record<string, { id: string; name: string }> = {};
      if (categoryIds.length > 0) {
        const { data: cats, error: catErr } = await this.supabase.getClient()
          .from('service_categories')
          .select('id, name')
          .in('id', categoryIds);
        if (!catErr && Array.isArray(cats)) {
          categoriesById = (cats as any[]).reduce((acc, c: any) => { acc[c.id] = { id: c.id, name: c.name }; return acc; }, {} as Record<string, { id: string; name: string }>);
        } else if (catErr) {
          console.warn('Error cargando categorías de servicios:', catErr);
        }
      }

      this.ticketServices = (items as any[]).map((it: any) => {
        const svc = it?.service || {};
        // Ensure estimated_hours is a number (DB might return string)
        if (svc && svc.estimated_hours !== undefined && svc.estimated_hours !== null) {
          const n = Number(svc.estimated_hours);
          svc.estimated_hours = Number.isFinite(n) ? n : 0;
        } else {
          svc.estimated_hours = 0;
        }
        const cat = svc?.category;
        const isUuid = typeof cat === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cat);
        const category_name = isUuid ? (categoriesById[cat]?.name || 'Sin categoría') : (cat || 'Sin categoría');
        return { ...it, service: { ...svc, category_name } };
      });
    } catch (error) {
      console.error('Error en loadTicketServices:', error);
      this.ticketServices = [];
    }
  }

  // UI helpers
  formatDescription(description?: string): string {
    const text = String(description || '');
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }

  getPriorityClasses(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.classes || this.ticketPriorityConfig['normal'].classes;
  }

  getPriorityLabel(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.label || this.ticketPriorityConfig['normal'].label;
  }

  getPriorityIcon(priority?: string): string {
    const key = priority || 'normal';
    return this.ticketPriorityConfig[key]?.icon || this.ticketPriorityConfig['normal'].icon;
  }

  getTagColor(tagName: string): string {
    const found = (this.availableTags || []).find((t: any) => t?.name === tagName);
    return found?.color || '#6366F1';
  }

  getVisibleStages(): ConfigStage[] {
    return this.allStages || [];
  }

  private currentStageIndex(): number {
    const id = this.ticket?.stage_id;
    return Math.max(0, (this.allStages || []).findIndex(s => s.id === id));
  }

  getStagePosition(index: number): number {
    const total = Math.max(1, (this.allStages || []).length - 1);
    return (index / total) * 100;
  }

  getStageMarkerClass(stage: ConfigStage): string {
    const idx = (this.allStages || []).findIndex(s => s.id === stage.id);
    const cur = this.currentStageIndex();
    if (idx < cur) return 'bg-blue-500';
    if (idx === cur) return 'bg-blue-600 ring-2 ring-blue-300';
    return 'bg-gray-300';
  }

  isStageCompleted(stage: ConfigStage): boolean {
    const idx = (this.allStages || []).findIndex(s => s.id === stage.id);
    return idx <= this.currentStageIndex();
  }

  getProgressPercentage(): number {
    const total = Math.max(1, (this.allStages || []).length - 1);
    return (this.currentStageIndex() / total) * 100;
  }

  formatPrice(amount: number): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  }

  getDeviceStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      'received': 'bg-blue-100 text-blue-800',
      'in_diagnosis': 'bg-yellow-100 text-yellow-800',
      'in_repair': 'bg-orange-100 text-orange-800',
      'waiting_parts': 'bg-purple-100 text-purple-800',
      'waiting_client': 'bg-indigo-100 text-indigo-800',
      'ready': 'bg-green-100 text-green-800',
      'delivered': 'bg-gray-100 text-gray-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return statusClasses[status] || 'bg-gray-100 text-gray-800';
  }

  getDeviceStatusLabel(status: string): string {
    const statusLabels: Record<string, string> = {
      'received': 'Recibido',
      'in_diagnosis': 'En Diagnóstico',
      'in_repair': 'En Reparación',
      'waiting_parts': 'Esperando Repuestos',
      'waiting_client': 'Esperando Cliente',
      'ready': 'Listo',
      'delivered': 'Entregado',
      'cancelled': 'Cancelado'
    };
    return statusLabels[status] || status;
  }

  calculateServicesTotal(): number {
    try {
      const items = this.ticketServices || [];
      return items.reduce((sum: number, serviceItem: any) => sum + this.getLineTotal(serviceItem), 0);
    } catch (e) {
      return 0;
    }
  }

  calculateEstimatedHours(): number {
    try {
      const items = this.ticketServices || [];
      const total = items.reduce((sum: number, serviceItem: any) => {
        const hours = this.parseNumeric(serviceItem?.service?.estimated_hours ?? serviceItem?.estimated_hours ?? 0);
        const qty = Math.max(1, Math.floor(this.parseNumeric(serviceItem?.quantity ?? 1)) || 1);
        return sum + hours * qty;
      }, 0);
      return Math.round(total * 100) / 100;
    } catch (e) {
      return 0;
    }
  }

  getEstimatedHours(): number {
    // Prefer an explicit ticket-level override if present and numeric
  const t: any = this.ticket as any;
  const ticketEst = t && (t.estimated_hours ?? t.estimatedHours ?? t.estimatedHoursRaw);
    const tNum = Number(ticketEst);
    if (Number.isFinite(tNum) && tNum > 0) return Math.round(tNum * 100) / 100;
    return this.calculateEstimatedHours();
  }

  getActualHours(): number {
    if (!this.ticket) return 0;
    // Support multiple possible column names for backward compatibility
  const t2: any = this.ticket as any;
  const raw = t2.actual_hours ?? t2.hours_real ?? t2.actualHours ?? t2.hoursReal ?? t2.hours_real_backup;
  const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getCompanyName(): string {
    return (this.ticket as any)?.company?.name || '';
  }

  // Copy text to clipboard with a friendly toast
  copyToClipboard(text?: string) {
    if (!text) {
      this.showToast('Nada para copiar', 'info');
      return;
    }
    try {
      navigator.clipboard.writeText(text);
      this.showToast('Copiado al portapapeles', 'success');
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); this.showToast('Copiado al portapapeles', 'success'); } catch { this.showToast('No se pudo copiar', 'error'); }
      ta.remove();
    }
  }

  // Pricing helpers: prefer persisted values from ticket_services with fallback to service.base_price
  getUnitPrice(item: any): number {
    const fromRelation = typeof item?.price_per_unit === 'number' ? item.price_per_unit : null;
    const fromService = typeof item?.service?.base_price === 'number' ? item.service.base_price : 0;
    return (fromRelation ?? fromService) || 0;
  }

  getLineTotal(item: any): number {
    if (typeof item?.total_price === 'number') return item.total_price;
    const qty = Math.max(1, Number(item?.quantity || 1));
    return this.getUnitPrice(item) * qty;
  }
}
