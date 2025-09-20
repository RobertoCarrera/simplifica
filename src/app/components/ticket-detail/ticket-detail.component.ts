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
              
              <!-- Tags -->
              <div *ngIf="ticketTags && ticketTags.length > 0" class="mb-4">
                <span class="text-sm font-medium text-gray-500">Tags:</span>
                <div class="mt-1 flex flex-wrap gap-2">
                  <span *ngFor="let tag of ticketTags" 
                        [style.background-color]="getTagColor(tag)"
                        class="px-2 py-1 rounded text-xs font-medium text-white">
                    {{ tag }}
                  </span>
                </div>
              </div>
              
              <div class="grid grid-cols-1 md:grid-cols-1 gap-4">
              <div class="flex justify-between text-sm text-gray-600">
                <span>Progreso</span>
                <span>{{ getProgressPercentage() }}%</span>
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
              <h3 class="text-lg font-medium text-gray-900 mb-4">Servicios Asignados</h3>
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
                        <span>📦 Cantidad: {{ serviceItem.quantity || 1 }}</span>
                        <span>⏱️ {{ serviceItem.service?.estimated_hours || 0 }}h</span>
                        <span>🏷️ {{ serviceItem.service?.category || 'Sin categoría' }}</span>
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

  <!-- Inline Edit Modal will be rendered from component state -->
      @if (showEditModal) {
        <div class="modal-overlay" (click)="closeEditModal()">
          <div class="modal-content max-w-3xl" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">✏️ Editar Ticket</h2>
              <button (click)="closeEditModal()" class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body space-y-4">
              <div class="form-group">
                <label class="form-label">Título</label>
                <input type="text" class="form-input" [(ngModel)]="editingFormData.title" />
              </div>
              <div class="form-group">
                <label class="form-label">Descripción</label>
                <textarea class="form-input" rows="4" [(ngModel)]="editingFormData.description"></textarea>
              </div>

              <div class="form-row grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="form-group">
                  <label class="form-label">Cliente</label>
                  <div class="customer-search-container">
                    <input type="text" class="form-input" [(ngModel)]="customerSearchText" (input)="filterCustomers()" (focus)="onCustomerSearchFocus()" autocomplete="off" placeholder="Buscar cliente..." />
                    <div *ngIf="showCustomerDropdown && filteredCustomers.length > 0" class="customer-dropdown bg-white border mt-1 max-h-40 overflow-auto">
                      <div *ngFor="let c of filteredCustomers" class="p-2 hover:bg-gray-100 cursor-pointer" (click)="selectCustomer(c)">
                        <div class="font-medium">{{ c.name }}</div>
                        <div class="text-xs text-gray-500">{{ c.email }}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Estado</label>
                  <select class="form-input" [(ngModel)]="editingFormData.stage_id">
                    <option value="">Seleccionar estado</option>
                    <option *ngFor="let s of allStages" [value]="s.id">{{ s.name }}</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Prioridad</label>
                  <select class="form-input" [(ngModel)]="editingFormData.priority">
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>

              <div class="services-section">
                <div class="services-header">
                  <h4>Servicios</h4>
                </div>

                <div class="search-container mb-2">
                  <input type="text" class="form-input" placeholder="Buscar servicios..." [(ngModel)]="serviceSearchText" (input)="filterServices()" />
                </div>

                <div class="available-services max-h-40 overflow-auto mb-2">
                  <div *ngFor="let svc of filteredServices" class="p-2 border-b flex items-center justify-between">
                    <div>
                      <div class="font-medium">{{ svc.name }}</div>
                      <div class="text-xs text-gray-500">{{ svc.description }}</div>
                    </div>
                    <div class="flex items-center gap-2">
                      <div class="text-sm text-gray-700">{{ svc.base_price }}€</div>
                      <button class="btn btn-sm btn-outline" (click)="addServiceToEdit(svc)">Añadir</button>
                    </div>
                  </div>
                </div>

                <div *ngIf="selectedServices.length > 0" class="selected-services">
                  <h5 class="mb-2">Servicios Seleccionados</h5>
                  <div *ngFor="let it of selectedServices" class="flex items-center gap-3 mb-2">
                    <div class="flex-1">
                      <div class="font-medium">{{ it.service.name }}</div>
                      <div class="text-xs text-gray-500">{{ it.service.category }} • {{ it.service.estimated_hours }}h</div>
                    </div>
                    <div class="w-28">
                      <input type="number" min="1" class="form-input" [value]="it.quantity" (input)="updateServiceQuantityInEdit(it.service.id, +$any($event.target).value)" />
                    </div>
                    <button class="btn btn-danger" (click)="removeServiceFromEdit(it.service.id)">Eliminar</button>
                  </div>

                  <div class="mt-3 border-t pt-2">
                    <div class="flex justify-between text-sm">
                      <span>Total servicios:</span>
                      <strong>{{ getSelectedServicesTotalForEdit() }}€</strong>
                    </div>
                  </div>
                </div>
                <div *ngIf="selectedServices.length === 0" class="text-sm text-gray-500">No has seleccionado servicios aún</div>
              </div>

              <div class="form-group">
                <label class="form-label">Tags (separados por coma)</label>
                <input class="form-input" type="text" [(ngModel)]="editingTagsString" />
              </div>

            </div>
            <div class="modal-footer flex justify-end space-x-2">
              <button class="btn btn-secondary" (click)="closeEditModal()">Cancelar</button>
              <button class="btn btn-primary" (click)="saveEdit()">Guardar Cambios</button>
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

  // Inline Edit Modal state
  showEditModal = false;
  editingFormData: Partial<Ticket> = {};
  editingSelectedServices: Array<{ service: any; quantity: number }> = [];
  editingSelectedTags: string[] = [];
  editingTagsString: string = '';

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

  // Data for edit modal helper features
  companies: any[] = [];
  customers: any[] = [];
  filteredCustomers: any[] = [];
  showCustomerDropdown = false;
  customerSearchText = '';
  selectedCustomer: any = null;

  servicesCatalog: any[] = [];
  filteredServices: any[] = [];
  serviceSearchText = '';

  selectedServices: Array<{ service: any; quantity: number }> = [];

  // Load catalogs needed for modal
  private async ensureModalCatalogs() {
    try {
      // companies (if multi-tenant)
      const { data: comps } = await this.supabase.getClient().from('companies').select('id,name').limit(100);
      this.companies = comps || [];

      // services catalog
      const { data: services } = await this.supabase.getClient().from('services').select('*').order('name');
      this.servicesCatalog = services || [];
      this.filteredServices = this.servicesCatalog.slice(0, 10);

      // customers for selected company
      if (this.ticket?.company_id) {
        const { data: clients } = await this.supabase.getClient().from('clients').select('*').eq('company_id', this.ticket.company_id).limit(200);
        this.customers = clients || [];
        this.filteredCustomers = this.customers.slice(0, 10);
      }
    } catch (err) {
      console.warn('Error loading modal catalogs', err);
    }
  }

  filterCustomers() {
    const q = (this.customerSearchText || '').toLowerCase();
    if (!q) {
      this.filteredCustomers = this.customers.slice(0, 10);
      return;
    }
    this.filteredCustomers = this.customers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)).slice(0, 50);
  }

  selectCustomer(c: any) {
    this.selectedCustomer = c;
    this.customerSearchText = c.name;
    this.showCustomerDropdown = false;
  }

  onCustomerSearchFocus() { this.showCustomerDropdown = true; }
  onCustomerSearchBlur() { setTimeout(()=> this.showCustomerDropdown = false, 200); }

  filterServices() {
    const q = (this.serviceSearchText || '').toLowerCase();
    if (!q) {
      this.filteredServices = this.servicesCatalog.slice(0, 10);
      return;
    }
    this.filteredServices = this.servicesCatalog.filter(s => (s.name||'').toLowerCase().includes(q) || (s.description||'').toLowerCase().includes(q) || (s.category||'').toLowerCase().includes(q)).slice(0, 200);
  }

  isServiceSelected(id: string) { return this.selectedServices.findIndex(x => x.service.id === id) !== -1; }

  addServiceToEdit(service: any) {
    if (this.isServiceSelected(service.id)) return;
    this.selectedServices.push({ service, quantity: 1 });
  }

  removeServiceFromEdit(serviceId: string) {
    this.selectedServices = this.selectedServices.filter(s => s.service.id !== serviceId);
  }

  updateServiceQuantityInEdit(serviceId: string, qty: number) {
    const it = this.selectedServices.find(s => s.service.id === serviceId);
    if (it) it.quantity = Math.max(1, Math.floor(qty));
  }

  getSelectedServicesTotalForEdit() {
    return this.selectedServices.reduce((sum, it) => sum + ((it.service.base_price || 0) * (it.quantity || 1)), 0);
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
        return;
      }

      this.ticketServices = services || [];
    } catch (error) {
      console.error('Error en loadTicketServices:', error);
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
      alert('Error al añadir comentario: ' + error.message);
    }
  }

  // Navigation and actions
  goBack() {
    this.router.navigate(['/tickets']);
  }

  editTicket() {
    // Request the centralized tickets modal to open for editing this ticket.
    if (!this.ticket) return;

    // Quick debug log so we can see the click fired
    try { console.debug('[TicketDetail] editTicket clicked', this.ticket.id); } catch (e) {}

    // Open inline edit modal in this component
    if (!this.ticket) return;
    // Prefill form data
    this.editingFormData = {
      title: this.ticket.title,
      description: this.ticket.description,
      stage_id: this.ticket.stage_id,
      priority: this.ticket.priority,
      estimated_hours: this.ticket.estimated_hours,
      actual_hours: this.ticket.actual_hours,
      total_amount: this.ticket.total_amount,
      company_id: (this.ticket as any).company_id || (this.ticket as any).company?.id
    };

  // Prefill services and tags
    this.editingSelectedServices = (this.ticketServices || []).map(s => ({ service: s.service, quantity: s.quantity || 1 }));
    this.selectedServices = this.editingSelectedServices.map(s => ({ service: s.service, quantity: s.quantity }));
    this.editingSelectedTags = [...(this.ticketTags || [])];
    this.editingTagsString = this.editingSelectedTags.join(', ');

    // Prefill customer
    this.selectedCustomer = this.ticket?.client || null;
    this.customerSearchText = this.selectedCustomer ? this.selectedCustomer.name : '';

    // Ensure catalogs loaded
    this.ensureModalCatalogs();

    this.showEditModal = true;
    document.body.classList.add('modal-open');
  }
  
  closeEditModal() {
    this.showEditModal = false;
    this.editingFormData = {};
    this.editingSelectedServices = [];
    this.editingSelectedTags = [];
    this.editingTagsString = '';
    document.body.classList.remove('modal-open');
  }

  updateEditingServiceQuantity(serviceId: string, qty: number) {
    const it = this.editingSelectedServices.find(s => s.service?.id === serviceId);
    if (it) it.quantity = Math.max(1, Math.floor(qty));
  }

  removeEditingService(serviceId: string) {
    this.editingSelectedServices = this.editingSelectedServices.filter(s => s.service?.id !== serviceId);
  }

  async saveEdit() {
    if (!this.ticket) return;
    try {
      // Prepare ticket patch
      const patch: any = {
        title: this.editingFormData.title,
        description: this.editingFormData.description,
        stage_id: this.editingFormData.stage_id,
        priority: this.editingFormData.priority,
        estimated_hours: this.editingFormData.estimated_hours,
        actual_hours: this.editingFormData.actual_hours,
        total_amount: this.editingFormData.total_amount
      };

      // Validate: ensure at least one service
      if ((!this.selectedServices || this.selectedServices.length === 0) && (!this.editingSelectedServices || this.editingSelectedServices.length === 0)) {
        alert('Debe asignar al menos un servicio al ticket.');
        return;
      }

      // If user selected a customer in modal, set client_id
      if (this.selectedCustomer && this.selectedCustomer.id) {
        patch.client_id = this.selectedCustomer.id;
      }

      // Update ticket
      const { error: updErr } = await this.supabase.getClient()
        .from('tickets')
        .update(patch)
        .eq('id', this.ticket.id);

      if (updErr) throw updErr;

      // Prepare services items for replaceTicketServices
  // prefer selectedServices (the richer UI), fall back to editingSelectedServices
  const items = (this.selectedServices && this.selectedServices.length > 0 ? this.selectedServices : this.editingSelectedServices || []).map(s => ({ service_id: s.service.id, quantity: s.quantity }));

      // Call service to replace ticket services (uses fallbacks internally)
  const companyIdForReplace = String(patch.company_id || this.ticket.company_id || (this.ticket as any).company?.id || '');
      await this.ticketsService.replaceTicketServices(this.ticket.id, companyIdForReplace, items);

      // Optionally update tags: delete existing relations and re-insert
      // Parse tags string into array
      this.editingSelectedTags = (this.editingTagsString || '').split(',').map((t:any) => String(t || '').trim()).filter(Boolean);
      try {
        await this.supabase.getClient().from('ticket_tag_relations').delete().eq('ticket_id', this.ticket.id);
        for (const tagName of this.editingSelectedTags || []) {
          const { data: found } = await this.supabase.getClient().from('ticket_tags').select('id').ilike('name', tagName).limit(1).single();
          let tagId = found?.id;
          if (!tagId) {
            const { data: created } = await this.supabase.getClient().from('ticket_tags').insert({ name: tagName, company_id: this.ticket.company_id }).select('id').single();
            tagId = created?.id;
          }
          if (tagId) {
            await this.supabase.getClient().from('ticket_tag_relations').insert({ ticket_id: this.ticket.id, tag_id: tagId });
          }
        }
      } catch (tagErr) {
        console.warn('Warning: tags update failed (ignored)', tagErr);
      }

      // Reload ticket detail
      await this.loadTicketDetail();
      this.closeEditModal();
      alert('Ticket actualizado correctamente');
    } catch (error: any) {
      console.error('Error guardando edición:', error);
      alert('Error al guardar los cambios: ' + (error.message || error));
    }
  }


  async deleteTicket() {
    if (!confirm('¿Estás seguro de que deseas eliminar este ticket?')) return;

    try {
      await this.ticketsService.deleteTicket(this.ticketId!);
      this.router.navigate(['/tickets']);
    } catch (error: any) {
      alert('Error al eliminar ticket: ' + error.message);
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

  async saveStageChange() {
    if (!this.ticket || !this.selectedStageId) return;

    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: this.selectedStageId })
        .eq('id', this.ticketId);

      if (error) throw error;

      // Update local ticket data
      this.ticket.stage_id = this.selectedStageId;
      const newStage = this.allStages.find(s => s.id === this.selectedStageId);
      if (newStage) {
        this.ticket.stage = newStage;
      }

      // Add comment about stage change
      const comment = `Estado cambiado a "${newStage?.name || 'Desconocido'}"`;
      await this.addSystemComment(comment);

      this.closeChangeStageModal();
      alert('Estado actualizado correctamente');
    } catch (error: any) {
      console.error('Error actualizando estado:', error);
      alert('Error al actualizar estado: ' + error.message);
    }
  }

  async saveHoursUpdate() {
    if (!this.ticket || this.newHoursValue < 0) return;

    try {
      // Intentar actualizar la columna actual_hours
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ actual_hours: this.newHoursValue })
        .eq('id', this.ticketId);

      if (error) {
        // Si la columna no existe, mostrar mensaje informativo
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          alert('La tabla tickets no tiene la columna actual_hours. Por favor ejecuta el script SQL para agregar las columnas de horas.');
          return;
        }
        throw error;
      }

      // Update local ticket data
      this.ticket.actual_hours = this.newHoursValue;

      // Add comment about hours update
      const comment = `Horas reales actualizadas a ${this.newHoursValue}h`;
      await this.addSystemComment(comment);

      this.closeUpdateHoursModal();
      alert('Horas actualizadas correctamente');
    } catch (error: any) {
      console.error('Error actualizando horas:', error);
      alert('Error al actualizar horas: ' + error.message);
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  async uploadAttachment() {
    if (!this.selectedFile || !this.ticket) return;

    try {
      // TODO: Implementar subida de archivos a Supabase Storage
      console.log('Subiendo archivo:', this.selectedFile.name);
      
      // Simular subida exitosa
      const comment = `Archivo adjunto: ${this.selectedFile.name}`;
      await this.addSystemComment(comment);

      this.closeAttachmentModal();
      alert('Archivo adjunto agregado correctamente');
    } catch (error: any) {
      console.error('Error subiendo archivo:', error);
      alert('Error al subir archivo: ' + error.message);
    }
  }

  async addSystemComment(content: string) {
    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .insert({
          ticket_id: this.ticketId,
          comment: content,
          is_internal: true,
          created_at: new Date().toISOString()
        });

      if (!error) {
        // Reload comments
        await this.loadComments();
      }
    } catch (error) {
      console.warn('Error agregando comentario del sistema:', error);
    }
  }

  printTicket() {
    window.print();
  }

  // Utility methods
  getPriorityLabel(priority?: string): string {
    const labels: Record<string, string> = {
      'low': 'Baja',
      'normal': 'Normal',
      'high': 'Alta',
      'critical': 'Crítica'
    };
    return labels[priority || 'normal'] || 'Normal';
  }

  getPriorityClasses(priority?: string): string {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'normal': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getProgressPercentage(): number {
    if (!this.ticket?.stage || !this.allStages.length) return 0;
    
    const currentStageIndex = this.allStages.findIndex(stage => stage.id === this.ticket?.stage_id);
    if (currentStageIndex === -1) return 0;
    
    // Calculate percentage based on stage position
    return Math.round(((currentStageIndex + 1) / this.allStages.length) * 100);
  }

  getStagePosition(index: number): number {
    if (this.allStages.length <= 1) return 50;
    return (index / (this.allStages.length - 1)) * 100;
  }

  getStageMarkerClass(stage: TicketStage): string {
    const currentStageIndex = this.allStages.findIndex(s => s.id === this.ticket?.stage_id);
    const stageIndex = this.allStages.findIndex(s => s.id === stage.id);
    
    if (stageIndex <= currentStageIndex) {
      return 'bg-blue-500'; // Completed or current
    }
    return 'bg-gray-300'; // Pending
  }

  isStageCompleted(stage: TicketStage): boolean {
    const currentStageIndex = this.allStages.findIndex(s => s.id === this.ticket?.stage_id);
    const stageIndex = this.allStages.findIndex(s => s.id === stage.id);
    
    return stageIndex < currentStageIndex;
  }

  getVisibleStages(): TicketStage[] {
    // Show maximum 4 stages for better responsive design
    if (this.allStages.length <= 4) {
      return this.allStages;
    }
    
    const currentIndex = this.allStages.findIndex(s => s.id === this.ticket?.stage_id);
    const firstStage = this.allStages[0];
    const lastStage = this.allStages[this.allStages.length - 1];
    
    if (currentIndex <= 1) {
      // Show first 4 if we're at the beginning
      return this.allStages.slice(0, 4);
    } else if (currentIndex >= this.allStages.length - 2) {
      // Show last 4 if we're at the end
      return this.allStages.slice(-4);
    } else {
      // Show current stage and surrounding ones
      return [
        firstStage,
        this.allStages[currentIndex],
        lastStage
      ];
    }
  }

  getTagColor(tagName: string): string {
    const tag = this.availableTags.find(t => t.name === tagName);
    return tag?.color || '#6b7280';
  }

  isOverdue(): boolean {
    return this.ticket?.due_date ? new Date(this.ticket.due_date) < new Date() : false;
  }

  formatDescription(description: string): string {
    // Simple text to HTML conversion
    return description
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
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
