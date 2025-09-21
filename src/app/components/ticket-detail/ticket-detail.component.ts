import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';
import { SupabaseTicketsService, Ticket, TicketStage } from '../../services/supabase-tickets.service';
import { DevicesService, Device } from '../../services/devices.service';
import { TicketModalService } from '../../services/ticket-modal.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./ticket-detail.component.scss'],
  template: `
    <div class="min-h-screen bg-gray-50 py-8">
      <!-- Toasts -->
      <div class="fixed right-4 bottom-4 space-y-2 z-50">
        <div *ngFor="let t of toasts" class="px-4 py-2 rounded shadow flex items-center justify-between space-x-4"
             [ngClass]="{ 'bg-green-600 text-white': t.type === 'success', 'bg-red-600 text-white': t.type === 'error', 'bg-gray-800 text-white': t.type === 'info' }">
          <div class="text-sm">{{ t.msg }}</div>
          <button class="text-sm opacity-80 hover:opacity-100 ml-2" (click)="closeToast(t.id)">✕</button>
        </div>
      </div>
      <div class="max-w-6xl mx-auto px-4">
        
        <!-- Header con navegación -->
        <div class="mb-6 flex justify-between items-center">
          <button (click)="goBack()" 
                  class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            ← Volver a Tickets
          </button>
          
          <!-- Quick Actions -->
          <div *ngIf="!loading && !error && ticket" class="flex space-x-2">
            <button (click)="updateHours()" 
                    class="w-full px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100">
              ⏱️ Actualizar Horas
            </button>
            <button (click)="printTicket()" 
                    class="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100">
              🖨️ Imprimir
            </button>
            <button (click)="deleteTicket()" 
                    class="w-full inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700">
              🗑️ Eliminar
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">Cargando ticket...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-red-600 text-xl">❌</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800">Error</h3>
              <p class="mt-1 text-sm text-red-700">{{ error }}</p>
            </div>
          </div>
        </div>

  <!-- Ticket Detail -->
  <div *ngIf="!loading && !error && ticket" class="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <!-- Main Content (Left Side) -->
          <div class="space-y-6 lg:col-span-3">
            
            <!-- Ticket Header -->
            <div class="bg-white shadow rounded-lg p-6">
              <div class="flex justify-between items-start mb-4">
                <div>
                  <h1 class="text-2xl font-bold text-gray-900">
                    🎫 #{{ ticket.ticket_number }} - {{ ticket.title }}
                  </h1>
                  <div class="prose prose-sm text-gray-700 mt-2" [innerHTML]="formatDescription(ticket.description)"></div>
                </div>
                <div class="flex flex-col items-end space-y-2">
                  <span [class]="getPriorityClasses(ticket.priority)"
                        class="px-2 py-1 rounded text-xs font-medium">
                    {{ getPriorityLabel(ticket.priority) }}
                  </span>
                </div>
              </div>
              
              <!-- Tags: moved to sidebar -->
              
              <div class="grid grid-cols-1 md:grid-cols-1 gap-4">
              <div class="flex justify-between text-sm text-gray-600">
                <span>Progreso</span>
                <span>{{ getProgressPercentage() | number:'1.0-0' }}%</span>
              </div>
              <div class="relative">
                  <!-- Progress Bar Background -->
                  <div class="w-full bg-gray-200 rounded-full h-3 relative">
                    <div 
                      class="bg-blue-500 h-3 rounded-full transition-all duration-300"
                      [style.width.%]="getProgressPercentage()"
                    ></div>
                    
                    <!-- Stage Markers -->
                    <div *ngFor="let stage of allStages; let i = index" 
                         class="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2"
                         [style.left.%]="getStagePosition(i)">
                      <div 
                        [class]="getStageMarkerClass(stage)"
                        class="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
                        [title]="stage.name"
                      >
                        <div *ngIf="isStageCompleted(stage)" class="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Stage Labels -->
                  <div class="flex justify-between mt-2 text-xs text-gray-500">
                    <div *ngFor="let stage of getVisibleStages(); let i = index" 
                         class="text-center flex-1"
                         [class.font-medium]="stage.id === ticket.stage_id"
                         [class.text-blue-600]="stage.id === ticket.stage_id">
                      {{ stage.name }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Services -->
            <div class="bg-white shadow rounded-lg p-6">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium text-gray-900">Servicios Asignados</h3>
                <button (click)="openServicesModal()"
                        class="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">
                  ✏️ Modificar Servicios
                </button>
              </div>
              <div *ngIf="ticketServices.length === 0" class="text-center py-6 text-gray-500">
                📭 No hay servicios asignados a este ticket
              </div>
              <div *ngIf="ticketServices.length > 0" class="space-y-4">
                <div *ngFor="let serviceItem of ticketServices" 
                     class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div class="flex justify-between items-start">
                    <div class="flex-1">
                      <h4 class="font-medium text-gray-900">{{ serviceItem.service?.name || 'Servicio no especificado' }}</h4>
                      <p *ngIf="serviceItem.service?.description" class="text-sm text-gray-600 mt-1">
                        {{ serviceItem.service.description }}
                      </p>
                      <div class="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                        <div class="flex items-center space-x-2">
                          <div class="flex items-center border rounded-lg overflow-hidden">
                            <button class="px-2 bg-gray-100" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="decreaseAssignedQty(serviceItem)">-</button>
                            <input type="number" class="w-16 text-center" [(ngModel)]="serviceItem.quantity" (ngModelChange)="onAssignedQuantityChange(serviceItem, $event)" />
                            <button class="px-2 bg-gray-100" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="increaseAssignedQty(serviceItem)">+</button>
                          </div>
                          <span *ngIf="savingAssignedServiceIds.has(serviceItem.service?.id)" class="text-xs text-gray-500">Guardando...</span>
                        </div>
                        <span>⏱️ {{ serviceItem.service?.estimated_hours || 0 }}h</span>
                        <span>🏷️ {{ serviceItem.service?.category_name || serviceItem.service?.category || 'Sin categoría' }}</span>
                      </div>
                    </div>
                    <div class="text-right">
                      <p class="font-medium text-gray-900">{{ formatPrice(getUnitPrice(serviceItem)) }}</p>
                      <p class="text-sm text-gray-600">Total: {{ formatPrice(getLineTotal(serviceItem)) }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Devices: show devices that belong to the ticket's company -->
            <div *ngIf="companyDevices.length > 0" class="bg-white shadow rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Dispositivos de la Empresa</h3>
              <div class="space-y-4">
                <div *ngFor="let device of companyDevices" 
                     class="border border-gray-200 rounded-lg p-4 flex justify-between items-start">
                  <div class="flex-1">
                    <div class="flex items-center space-x-2">
                      <h4 class="font-medium text-gray-900">{{ device.brand }} {{ device.model }}</h4>
                      <span *ngIf="isDeviceLinked(device.id)" class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">Vinculado</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">{{ device.device_type }}</p>
                    <p *ngIf="device.imei" class="text-sm text-gray-600">IMEI: {{ device.imei }}</p>
                    <p *ngIf="device.color" class="text-sm text-gray-600">Color: {{ device.color }}</p>
                    <p class="text-sm text-gray-600 mt-2">
                      <span class="font-medium">Problema reportado:</span> {{ device.reported_issue }}
                    </p>
                  </div>
                  <div class="text-right">
                    <span [class]="getDeviceStatusClass(device.status)"
                          class="inline-block px-2 py-1 text-xs font-medium rounded">
                      {{ getDeviceStatusLabel(device.status) }}
                    </span>
                    <p class="text-xs text-gray-500 mt-1">{{ formatDate(device.received_at) }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comments Section -->
            <div class="bg-white shadow rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Comentarios</h3>
              
              <!-- Add Comment Form -->
              <div class="mb-6">
                <textarea [(ngModel)]="newComment" 
                          placeholder="Añadir un comentario..."
                          class="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows="3"></textarea>
                <div class="mt-2 flex justify-between items-center">
                  <label class="flex items-center text-sm text-gray-600">
                    <input type="checkbox" [(ngModel)]="isInternalComment" class="mr-2">
                    Comentario interno (no visible para el cliente)
                  </label>
                  <div>
                    <button (click)="addAttachment()" 
                            class="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100">
                      📎 Adjuntar Archivo
                    </button>
                    <button (click)="addComment()" 
                            [disabled]="!newComment.trim()"
                            class="ms-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300">
                      💬 Añadir Comentario
                    </button>
                  </div>
                </div>
              </div>
              
              <!-- Comments List -->
              <div *ngIf="comments.length === 0" class="text-center py-6 text-gray-500">
                💬 No hay comentarios aún
              </div>
              <div *ngIf="comments.length > 0" class="space-y-4">
                <div *ngFor="let comment of comments" 
                     [class]="comment.is_internal ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'"
                     class="rounded-lg p-4 border">
                  <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center space-x-2">
                      <span class="font-medium text-gray-900">{{ comment.user?.name || 'Usuario' }}</span>
                      <span *ngIf="comment.is_internal" 
                            class="px-2 py-1 text-xs bg-yellow-200 text-yellow-800 rounded">
                        🔒 Interno
                      </span>
                    </div>
                    <span class="text-xs text-gray-500">{{ formatDate(comment.created_at) }}</span>
                  </div>
                  <p class="text-gray-700">{{ comment.comment }}</p>
                </div>
              </div>
            </div>
          </div>
          

          <!-- Sidebar (Right Side) -->
          <div class="space-y-6 lg:col-span-1">
            
            <!-- Quick Stats -->
            <div class="bg-white shadow rounded-lg p-6">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Resumen</h3>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Total Servicios:</span>
                  <span class="text-sm font-medium">{{ formatPrice(calculateServicesTotal()) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Total Ticket:</span>
                  <span class="text-lg font-bold text-green-600">{{ formatPrice(ticket.total_amount || calculateServicesTotal()) }}</span>
                </div>
                <hr>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Horas Estimadas:</span>
                  <span class="text-sm font-medium">{{ getEstimatedHours() }}h</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Horas Reales:</span>
                  <span class="text-sm font-medium">{{ getActualHours() }}h</span>
                </div>
              </div>
            </div>

            <!-- Timeline -->
            <div class="bg-white shadow rounded-lg p-6">
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-medium text-gray-900 mb-4">Timeline</h3>
              </div>
              <div class="space-y-4">
                <div class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">Ticket creado</p>
                    <p class="text-xs text-gray-500">{{ formatDate(ticket.created_at) }}</p>
                  </div>
                </div>
                
                <div *ngIf="ticket.updated_at !== ticket.created_at" class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">Última actualización</p>
                    <p class="text-xs text-gray-500">{{ formatDate(ticket.updated_at) }}</p>
                  </div>
                </div>
                
                <div *ngFor="let activity of recentActivity" class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-gray-400 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900">{{ activity.action }}</p>
                    <p class="text-xs text-gray-500">{{ formatDate(activity.created_at) }}</p>
                  </div>
                </div>
                <button (click)="changeStage()" 
                        class="px-1 py-1 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100">
                  🔄 Cambiar Estado
                </button>
              </div>
            </div>
            <!-- Tags Section (moved from header) -->
            <div class="bg-white shadow rounded-lg p-6 mt-4">
              <h3 class="text-lg font-medium text-gray-900 mb-4">Tags</h3>
              <div *ngIf="!ticketTags || ticketTags.length === 0" class="text-sm text-gray-500">No hay tags asignadas</div>
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
        <div class="modal-overlay" (click)="closeServicesModal()">
          <div class="modal-content max-w-4xl w-full" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">🧰 Seleccionar Servicios</h2>
              <button (click)="closeServicesModal()" class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body space-y-3">
              <div>
                <input type="text" class="form-input" placeholder="Buscar servicios..." [(ngModel)]="serviceSearchText" (input)="filterServices()" />
              </div>
              <div class="max-h-80 overflow-auto divide-y">
                <div *ngFor="let svc of filteredServices" class="py-3 px-2 hover:bg-gray-50 cursor-pointer">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4" (click)="toggleServiceSelection(svc)">
                      <div class="font-medium truncate">{{ svc.name }}</div>
                      <div class="text-xs text-gray-500 truncate">{{ svc.description }}</div>
                      <div class="text-xs text-gray-500 mt-1">🏷️ {{ svc.category || 'Sin categoría' }}</div>
                    </div>
                    <div class="flex items-center space-x-4">
                      <div class="text-right text-sm text-gray-700">
                        <div class="font-medium">{{ formatPrice(getServiceUnitPrice(svc)) }}</div>
                        <div class="text-xs text-gray-500">Unidad</div>
                      </div>
                      <div class="flex items-center border rounded-lg overflow-hidden">
                        <button class="px-2 bg-gray-100" (click)="$event.stopPropagation(); decreaseQty(svc)">-</button>
                        <input type="number" class="w-16 text-center" [value]="getSelectedQuantity(svc)" (input)="$event.stopPropagation(); setSelectedQuantity(svc, $any($event.target).value)" />
                        <button class="px-2 bg-gray-100" (click)="$event.stopPropagation(); increaseQty(svc)">+</button>
                      </div>
                      <div class="text-right text-sm text-gray-700">
                        <div class="font-medium">{{ formatPrice(getServiceUnitPrice(svc) * getSelectedQuantity(svc)) }}</div>
                        <div class="text-xs text-gray-500">Total</div>
                      </div>
                      <div class="pl-3">
                        <input type="checkbox" [checked]="isServiceIdSelected(svc.id)" (click)="$event.stopPropagation(); toggleServiceSelection(svc)" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer flex justify-end space-x-2">
              <button class="btn btn-secondary" (click)="closeServicesModal()">Cancelar</button>
              <button class="btn btn-primary" [disabled]="selectedServiceIds.size === 0" (click)="saveServicesSelection()">Guardar</button>
            </div>
          </div>
        </div>
      }
  `
})
export class TicketDetailComponent implements OnInit {
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
  allStages: TicketStage[] = [];
  comments: any[] = [];
  recentActivity: any[] = [];
  ticketId: string | null = null;
  
  // Comment form
  newComment: string = '';
  isInternalComment: boolean = false;
  
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
  private devicesService = inject(DevicesService);
  private ticketModalService = inject(TicketModalService);

  // Services Selection Modal state
  showServicesModal = false;
  servicesCatalog: any[] = [];
  filteredServices: any[] = [];
  serviceSearchText = '';
  selectedServiceIds: Set<string> = new Set();
  // Keep quantities for selected services
  selectedServiceQuantities: Map<string, number> = new Map();

  // Minimal in-component toast system
  toasts: Array<{ id: number; msg: string; type: 'success' | 'error' | 'info' }> = [];
  private nextToastId = 1;

  // Track saving state per assigned service id when persisting inline quantity edits
  savingAssignedServiceIds: Set<string> = new Set();

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.ticketId = params['id'];
      if (this.ticketId) {
        this.loadTicketDetail();
      } else {
        this.error = 'ID de ticket no válido';
        this.loading = false;
      }
    });
  }

  // selected services handled via selectedServiceIds in modal

  // Load services catalog (for selection modal)
  private async loadServicesCatalog() {
    try {
      const { data: services } = await this.supabase.getClient().from('services').select('*').order('name');
      this.servicesCatalog = services || [];
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
    this.filteredServices = this.servicesCatalog.filter(s => (s.name||'').toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q)).slice(0, 200);
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
    if (!this.newComment.trim()) return;

    try {
      const { data, error } = await this.supabase.getClient()
        .from('ticket_comments')
        .insert({
          ticket_id: this.ticketId,
          comment: this.newComment.trim(),
          is_internal: this.isInternalComment
        })
        .select(`
          *,
          user:users(name, email)
        `)
        .single();

      if (error) throw error;

      this.comments.push(data);
      this.newComment = '';
      this.isInternalComment = false;

    } catch (error: any) {
      console.error('Error añadiendo comentario:', error);
      this.showToast('Error al añadir comentario: ' + (error?.message || ''), 'error');
    }
  }

  // Navigation and actions
  goBack() {
    this.router.navigate(['/tickets']);
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

      // Cargar servicios del ticket desde ticket_services
      await this.loadTicketServices();
      
      // Cargar tags del ticket
      await this.loadTicketTags();
      
      // Cargar dispositivos vinculados
      await this.loadTicketDevices();
      
      // Cargar comentarios
      await this.loadComments();

      // Cargar todos los estados para el progreso
      const { data: stagesData, error: stagesError } = await this.supabase.getClient()
        .from('ticket_stages')
        .select('*')
        .order('position');

      if (stagesError) console.warn('Error cargando estados:', stagesError);
      this.allStages = stagesData || [];

      // Simular actividad reciente
      this.recentActivity = [
        { action: 'Servicio añadido', created_at: this.ticket?.updated_at || new Date().toISOString() },
        { action: 'Estado actualizado', created_at: this.ticket?.updated_at || new Date().toISOString() }
      ];

    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
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
  }

  closeServicesModal() {
    this.showServicesModal = false;
    document.body.classList.remove('modal-open');
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
      const items = (this.ticketServices || []).map((it: any) => ({ service_id: it.service?.id, quantity: Math.max(1, Number(it.quantity || 1)) }));
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

  // Toast helpers
  showToast(msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 4000) {
    const id = this.nextToastId++;
    this.toasts.push({ id, msg, type });
    setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, duration);
  }

  closeToast(id: number) {
    this.toasts = this.toasts.filter(t => t.id !== id);
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
    const map: any = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
    return map[priority || 'medium'] || 'bg-gray-100 text-gray-800';
  }

  getPriorityLabel(priority?: string): string {
    const map: any = { low: 'Baja', medium: 'Media', high: 'Alta', urgent: 'Urgente' };
    return map[priority || 'medium'] || (priority || '');
  }

  getTagColor(tagName: string): string {
    const found = (this.availableTags || []).find((t: any) => t?.name === tagName);
    return found?.color || '#6366F1';
  }

  getVisibleStages(): TicketStage[] {
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

  getStageMarkerClass(stage: TicketStage): string {
    const idx = (this.allStages || []).findIndex(s => s.id === stage.id);
    const cur = this.currentStageIndex();
    if (idx < cur) return 'bg-blue-500';
    if (idx === cur) return 'bg-blue-600 ring-2 ring-blue-300';
    return 'bg-gray-300';
  }

  isStageCompleted(stage: TicketStage): boolean {
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
    return this.ticketServices.reduce((sum, serviceItem) => sum + this.getLineTotal(serviceItem), 0);
  }

  calculateEstimatedHours(): number {
    return this.ticketServices.reduce((sum, serviceItem) => {
      const hours = serviceItem.service?.estimated_hours || 0;
      const quantity = serviceItem.quantity || 1;
      return sum + (hours * quantity);
    }, 0);
  }

  getEstimatedHours(): number {
    // Primero intentar usar la columna estimated_hours del ticket si existe
    if (this.ticket?.estimated_hours !== undefined && this.ticket.estimated_hours > 0) {
      return this.ticket.estimated_hours;
    }
    // Si no existe o es 0, calcular desde los servicios
    return this.calculateEstimatedHours();
  }

  getActualHours(): number {
    // Retornar las horas reales del ticket si existe la columna
    return this.ticket?.actual_hours || 0;
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
