import { Component, OnInit, inject, ElementRef, ViewChild, OnDestroy, AfterViewInit, AfterViewChecked, ChangeDetectorRef, computed, Renderer2, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { SupabaseTicketsService, Ticket } from '../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage as ConfigStage } from '../../../services/supabase-ticket-stages.service';
import { DevicesService, Device } from '../../../services/devices.service';
import { ProductsService } from '../../../services/products.service';
import { TicketModalService } from '../../../services/ticket-modal.service';

import { environment } from '../../../../environments/environment';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseServicesService } from '../../../services/supabase-services.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../services/toast.service';
import { TenantService } from '../../../services/tenant.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';

// TipTap imports
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  client_id?: string; // Add client_id
  comment: string;
  created_at: string;
  is_internal: boolean;
  parent_id?: string | null;  // For nesting
  deleted_at?: string | null; // For soft delete
  edited_at?: string | null;  // For edit tracking
  user?: {
    name: string;
    surname?: string;
    email: string;
  };
  client?: {
    name: string;
    email: string;
  };
  children?: TicketComment[]; // UI helper for nesting
  showReplyEditor?: boolean;  // UI helper
  isEditing?: boolean;        // UI helper
  editContent?: string;       // UI helper
}

import { ClientDevicesModalComponent } from '../../../features/devices/client-devices-modal/client-devices-modal.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ClientDevicesModalComponent, SkeletonLoaderComponent, TagManagerComponent],
  styleUrls: ['./ticket-detail.component.scss'],
  template: `
    <div class="min-h-0 bg-gray-50 dark:bg-gray-900">
      <div class="mx-auto">

        <!-- Header con navegación -->
        <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:justify-between gap-3">
            <!-- Botón Atrás -->
            <button (click)="goBack()"
                    class="btn btn-secondary text-sm">
              <i class="fas fa-arrow-left mr-2"></i>
              <span>Atrás</span>
            </button>

            <!-- Right Side Actions Wrapper -->
            <div class="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto mt-3 sm:mt-0">

              <!-- Client Actions -->
              <ng-container *ngIf="isClient()">
                <button *ngIf="!ticketConfig || ticketConfig.ticket_client_can_create_devices !== false" (click)="openCreateDeviceForm()"
                        class="btn btn-primary text-sm px-4 w-full sm:w-auto">
                  <i class="fas fa-plus mr-2"></i>
                  <span>Añadir Dispositivo</span>
                </button>

                <button (click)="scrollToComment()"
                        class="btn btn-secondary text-sm px-4 w-full sm:w-auto">
                  <i class="fas fa-comment mr-2"></i>
                  <span>Añadir Comentario</span>
                </button>

                <button *ngIf="!isTicketSolved() && (!ticketConfig || ticketConfig.ticket_client_can_close !== false)" (click)="markAsSolved()"
                        class="btn btn-success text-sm px-4 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white border-transparent">
                  <i class="fas fa-check mr-2"></i>
                  <span>Marcar como Solucionado</span>
                </button>
              </ng-container>

              <!-- Admin Actions -->
              <div *ngIf="!loading && !error && ticket && !isClient()" class="grid grid-cols-3 sm:flex gap-2 sm:gap-3 w-full sm:w-auto">
                <button (click)="convertToQuoteFromTicket()"
                        [disabled]="!ticket || ticketServices.length === 0 || !(ticket && ticket.client && ticket.client.id)"
                        class="btn btn-primary text-xs sm:text-sm px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <i class="fas fa-file-invoice text-base sm:text-sm"></i>
                  <span class="text-[10px] sm:text-sm">{{ activeQuoteId ? 'Ir a Presup.' : 'Convertir' }}</span>
                </button>
                <button (click)="printTicket()"
                        class="btn btn-secondary text-xs sm:text-sm px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <i class="fas fa-print text-base sm:text-sm"></i>
                  <span class="text-[10px] sm:text-sm">Imprimir</span>
                </button>
                <button (click)="deleteTicket()"
                        class="btn btn-danger text-xs sm:text-sm px-3 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <i class="fas fa-trash text-base sm:text-sm"></i>
                  <span class="text-[10px] sm:text-sm">Eliminar</span>
                </button>
              </div>

            </div>
          </div>
        </div>

        <!-- Loading State -->
        <!-- Loading State Skeletons -->
        <div *ngIf="loading" class="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-pulse">
            <!-- Main Content Skeleton -->
            <div class="space-y-6 lg:col-span-3">
                <!-- Header Skeleton -->
                <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 h-64">
                    <app-skeleton-loader type="text" height="2rem" width="60%" styleClass="mb-4"></app-skeleton-loader>
                    <app-skeleton-loader type="text" height="1rem" width="40%" styleClass="mb-6"></app-skeleton-loader>
                    <app-skeleton-loader type="block" height="6rem" width="100%"></app-skeleton-loader>
                </div>
                <!-- Progress Skeleton -->
                <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 h-32">
                    <app-skeleton-loader type="text" height="1.5rem" width="30%" styleClass="mb-4"></app-skeleton-loader>
                    <app-skeleton-loader type="block" height="2rem" width="100%"></app-skeleton-loader>
                </div>
            </div>

            <!-- Sidebar Skeleton -->
             <div class="space-y-6 lg:col-span-1">
                <div class="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-6 h-48">
                    <app-skeleton-loader type="circle" height="3rem" width="3rem" styleClass="mb-4"></app-skeleton-loader>
                     <app-skeleton-loader type="text" height="1.2rem" width="70%" styleClass="mb-2"></app-skeleton-loader>
                     <app-skeleton-loader type="text" height="1rem" width="50%"></app-skeleton-loader>
                </div>
                <div class="bg-green-50 dark:bg-green-900/10 rounded-xl p-6 h-64">
                    <app-skeleton-loader type="text" height="1.5rem" width="40%" styleClass="mb-4"></app-skeleton-loader>
                     <app-skeleton-loader type="block" count="3" height="2rem" styleClass="mb-2"></app-skeleton-loader>
                </div>
             </div>
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
            <div class="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-lg border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 lg:p-8 hover:shadow-xl transition-shadow duration-300">
              <div class="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-4 sm:mb-6">
                <div class="flex-1">
                  <div class="flex items-start sm:items-center gap-3 mb-3">
                    <div class="bg-gradient-to-br from-orange-400 to-orange-600 text-white p-2 sm:p-3 rounded-lg shadow-md flex-shrink-0">
                      <i class="fas fa-ticket-alt text-xl sm:text-2xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <h1 class="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words">
                        {{ ticket.title }}
                      </h1>
                      <p class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                        <span class="font-mono font-semibold">#{{ ticket.ticket_number }}</span>
                        <span class="mx-2">•</span>
                        <span class="hidden sm:inline">Creado {{ formatDate(ticket.created_at) }}</span>
                      </p>
                    </div>
                  </div>
                  <!-- Initial Attachment Preview REMOVED (Legacy) -->

                  <div class="ticket-description mt-4 ml-0 sm:ml-1 text-gray-800 dark:text-gray-200 text-sm leading-relaxed"
                       [innerHTML]="formatDescription(ticket.description)"
                       (click)="handleDescriptionClick($event)"></div>
                </div>
                <div class="flex flex-row lg:flex-col items-center lg:items-end gap-2 sm:gap-3">
                  <span [class]="getPriorityClasses(ticket.priority)"
                        class="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-sm">
                    <i class="fas {{ getPriorityIcon(ticket.priority) }}"></i>
                    <span class="hidden sm:inline">{{ getPriorityLabel(ticket.priority) }}</span>
                  </span>

                  <!-- Assignment Dropdown (Staff Only) -->
                  <div *ngIf="!isClient()" class="ml-0 lg:ml-4">
                    <select
                        [ngModel]="ticket.assigned_to"
                        (ngModelChange)="assignTicket($event)"
                        class="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2">
                        <option [ngValue]="null">Sin Asignar</option>
                        <option *ngFor="let user of staffUsers" [ngValue]="user.id">{{ user.name }}</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- Progress Section -->
              <div class="mt-6 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div class="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  <span class="flex items-center gap-2">
                    <i class="fas fa-chart-line text-blue-500"></i>
                    Progreso del Ticket
                  </span>
                  <span class="text-lg font-bold" [style.color]="getCurrentStageColor()">{{ getProgressPercentage() | number:'1.0-0' }}%</span>
                </div>
                <div class="relative">
                  <!-- Progress Bar Background -->
                  <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 relative overflow-hidden shadow-inner">
                    <div
                      class="h-4 rounded-full transition-all duration-500 ease-out"
                      [style.width.%]="getProgressPercentage()"
                      [style.background]="getCurrentStageColor()"
                    ></div>

                    <!-- Stage Markers -->
                    <div *ngFor="let stage of allStages; let i = index"
                         class="absolute top-1/2 transform -translate-y-1/2 -translate-x-1/2 z-10"
                         [style.left.%]="getStagePosition(i)">
                      <div
                        [class]="getStageMarkerClass(stage)"
                        class="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center shadow-sm cursor-pointer hover:scale-125 transition-all duration-300"
                        [title]="stage.name"
                        (click)="!isClient() && (showChangeStageModal = true); !isClient() && (selectedStageId = stage.id)"
                      >
                        <div *ngIf="isStageCompleted(stage)" class="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Stage Labels -->
                  <div class="flex justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <div *ngFor="let stage of getVisibleStages(); let i = index"
                         class="text-center flex-1 transition-all duration-200"
                         [class.font-semibold]="stage.id === ticket.stage_id"
                         [class.text-blue-600]="stage.id === ticket.stage_id"
                         [class.dark:text-blue-400]="stage.id === ticket.stage_id"
                         [class.scale-105]="stage.id === ticket.stage_id">
                      {{ stage.name }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-x-auto">
                <!-- Comments Tab - FIRST for clients -->
                <button
                  (click)="activeTab = 'comments'"
                  [class.active-tab]="activeTab === 'comments'"
                  class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap">
                  <i class="fas fa-comments mr-1 sm:mr-2"></i>
                  <span class="hidden xs:inline">Comentarios</span>
                  <span class="xs:hidden">Comt.</span>
                  <span *ngIf="activeCommentsCount > 0" class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                    {{ activeCommentsCount }}
                  </span>
                </button>
                <button
                  (click)="activeTab = 'services'"
                  [class.active-tab]="activeTab === 'services'"
                  class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap">
                  <i class="fas fa-wrench mr-1 sm:mr-2"></i>
                  <span class="hidden xs:inline">Servicios</span>
                  <span class="xs:hidden">Serv.</span>
                  <span *ngIf="ticketServices.length > 0" class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {{ ticketServices.length }}
                  </span>
                </button>
                <button
                  (click)="activeTab = 'products'"
                  [class.active-tab]="activeTab === 'products'"
                  class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap">
                  <i class="fas fa-box mr-1 sm:mr-2"></i>
                  <span class="hidden xs:inline">Productos</span>
                  <span class="xs:hidden">Prod.</span>
                  <span *ngIf="ticketProducts.length > 0" class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    {{ ticketProducts.length }}
                  </span>
                </button>
                <button
                  (click)="activeTab = 'devices'"
                  [class.active-tab]="activeTab === 'devices'"
                  class="tab-button flex-1 px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-medium transition-all duration-200 relative whitespace-nowrap">
                  <i class="fas fa-mobile-alt mr-1 sm:mr-2"></i>
                  <span class="hidden xs:inline">Dispositivos</span>
                  <span class="xs:hidden">Disp.</span>
                  <span *ngIf="linkedDeviceIds.size > 0" class="ml-1 sm:ml-2 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[10px] sm:text-xs font-bold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    {{ linkedDeviceIds.size }}
                  </span>
                </button>
              </div>

              <!-- Tab Content -->
              <div class="p-6">
                <!-- Services Tab -->
                @if (activeTab === 'services') {
                  <div class="tab-content-animate">
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Servicios Asignados</h3>
                      <button *ngIf="!isClient()" (click)="openServicesModal()"
                              class="btn btn-primary">
                        <i class="fas fa-wrench"></i>
                        Modificar Servicios
                      </button>
                    </div>
                    <div *ngIf="ticketServices.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
                      <i class="fas fa-wrench text-5xl mb-4 opacity-50"></i>
                      <p class="text-lg">No hay servicios asignados a este ticket</p>
                      <button *ngIf="!isClient()" (click)="openServicesModal()" class="mt-4 btn btn-secondary">
                        <i class="fas fa-plus mr-2"></i>
                        Añadir Servicios
                      </button>
                    </div>
                    <div *ngIf="ticketServices.length > 0" class="space-y-4">
                      <div *ngFor="let serviceItem of ticketServices"
                           class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200">
                        <div class="flex justify-between items-start">
                          <div class="flex-1">
                            <h4 class="font-medium text-gray-900 dark:text-gray-100">{{ serviceItem.service?.name || 'Servicio no especificado' }}</h4>
                            <p *ngIf="serviceItem.service?.description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {{ serviceItem.service.description }}
                            </p>
                            <div class="mt-2 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                              <!-- Quantity controls - ADMIN ONLY -->
                              <div *ngIf="!isClient()" class="flex items-center space-x-2">
                                <div class="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                                  <button class="px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="decreaseAssignedQty(serviceItem)">-</button>
                                  <input type="number" class="w-16 text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-x border-gray-300 dark:border-gray-600" [(ngModel)]="serviceItem.quantity" (ngModelChange)="onAssignedQuantityChange(serviceItem, $event)" />
                                  <button class="px-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" [disabled]="savingAssignedServiceIds.has(serviceItem.service?.id)" (click)="increaseAssignedQty(serviceItem)">+</button>
                                </div>
                                <span *ngIf="savingAssignedServiceIds.has(serviceItem.service?.id)" class="text-xs text-gray-500 dark:text-gray-400">Guardando...</span>
                              </div>
                              <!-- Read-only quantity for clients -->
                              <span *ngIf="isClientPortal"><i class="fas fa-boxes w-4"></i> Cantidad: {{ serviceItem.quantity }}</span>
                              <span *ngIf="!isClient() || ticketConfig?.ticket_client_view_estimated_hours !== false"><i class="fas fa-clock w-4"></i> {{ getLineEstimatedHours(serviceItem) }}h</span>
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
                }

                <!-- Products Tab -->
                @if (activeTab === 'products') {
                  <div class="tab-content-animate">
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Productos Asignados</h3>
                      <button *ngIf="!isClient()" (click)="openProductsModal()"
                              class="btn btn-primary">
                        <i class="fas fa-box"></i>
                        Modificar Productos
                      </button>
                    </div>
                    <div *ngIf="ticketProducts.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
                      <i class="fas fa-box text-5xl mb-4 opacity-50"></i>
                      <p class="text-lg">No hay productos asignados a este ticket</p>
                      <button *ngIf="!isClient()" (click)="openProductsModal()" class="mt-4 btn btn-secondary">
                        <i class="fas fa-plus mr-2"></i>
                        Añadir Productos
                      </button>
                    </div>
                    <div *ngIf="ticketProducts.length > 0" class="space-y-4">
                      <div *ngFor="let productItem of ticketProducts"
                           class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md dark:hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all duration-200">
                        <div class="flex justify-between items-start">
                          <div class="flex-1">
                            <h4 class="font-medium text-gray-900 dark:text-gray-100">{{ productItem.product?.name || 'Producto no especificado' }}</h4>
                            <p *ngIf="productItem.product?.description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {{ productItem.product.description }}
                            </p>
                            <div class="mt-2 flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                              <span><i class="fas fa-boxes w-4"></i> Cantidad: {{ productItem.quantity }}</span>
                              <span *ngIf="productItem.product?.brand" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                                <i class="fas fa-copyright w-3"></i>
                                {{ productItem.product.brand }}
                              </span>
                              <span *ngIf="productItem.product?.category" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                <i class="fas fa-tag w-3"></i>
                                {{ productItem.product.category }}
                              </span>
                            </div>
                          </div>
                          <div class="text-right">
                            <p class="font-medium text-gray-900 dark:text-gray-100">{{ formatPrice(getProductUnitPrice(productItem)) }}</p>
                            <p class="text-sm text-gray-600 dark:text-gray-400">Total: {{ formatPrice(getProductLineTotal(productItem)) }}</p>
                            <button *ngIf="!isClient()" (click)="removeProductFromTicket(productItem.product?.id)"
                                    class="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                              <i class="fas fa-trash"></i>
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                }

                <!-- Devices Tab -->
                @if (activeTab === 'devices') {
                  <div class="tab-content-animate">
                    <div class="flex justify-between items-center mb-4">
                      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">Dispositivos Vinculados</h3>
                      <div class="flex items-center gap-4">
                        <label *ngIf="!isClient()" class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                          <input type="checkbox" [checked]="showDeletedDevices" (change)="toggleDeletedDevices()" class="form-checkbox rounded text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 dark:bg-gray-700">
                          Ver eliminados
                        </label>
                        <button *ngIf="!isClient()" (click)="openDevicesModal()" class="btn btn-primary">
                          <i class="fas fa-mobile-alt"></i>
                          Modificar Dispositivos
                        </button>

                      </div>
                    </div>
                    <div *ngIf="ticketDevices.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
                      <i class="fas fa-mobile-alt text-5xl mb-4 opacity-50"></i>
                      <p class="text-lg">No hay dispositivos vinculados a este ticket</p>

                    </div>
                    <div *ngIf="ticketDevices.length > 0" class="space-y-4">
                      <div *ngFor="let device of ticketDevices"
                           class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex justify-between items-start hover:shadow-md dark:hover:shadow-lg hover:border-green-300 dark:hover:border-green-700 transition-all duration-200">
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

                          <!-- Device Images -->
                          <div *ngIf="device.media?.length" class="mt-3">
                            <h5 class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Imágenes adjuntas:</h5>
                            <div class="flex flex-wrap gap-2">
                              <div *ngFor="let media of device.media" class="relative group cursor-pointer" (click)="openLightbox(media.file_url)">
                                <div class="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 transition-colors">
                                  <img [src]="media.file_url" [alt]="media.description || 'Imagen del dispositivo'" class="w-full h-full object-cover">
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                          <div class="text-right">
                             <span [class]="getDeviceStatusClass(device.status)"
                                   class="inline-block px-2 py-1 text-xs font-medium rounded">
                               {{ getDeviceStatusLabel(device.status) }}
                             </span>
                             <p *ngIf="device.deleted_at" class="text-xs text-red-500 font-medium mt-1">ELIMINADO</p>
                             <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ formatDate(device.received_at) }}</p>
                          </div>
                          <div *ngIf="!isClient() && !device.deleted_at" class="flex items-center gap-1">
                             <button (click)="editDevice(device); $event.stopPropagation()" class="p-1 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Editar" aria-label="Editar dispositivo">
                               <i class="fas fa-edit" aria-hidden="true"></i>
                             </button>
                             <button (click)="deleteConfirmDevice(device); $event.stopPropagation()" class="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Eliminar" aria-label="Eliminar dispositivo">
                               <i class="fas fa-trash" aria-hidden="true"></i>
                             </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                }

                <!-- Comments Tab -->
                @if (activeTab === 'comments') {
                  <div class="tab-content-animate">
                    <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Comentarios</h3>

                    <!-- Add Comment Form -->
                    <div class="mb-6">
                      <!-- TipTap Editor -->
                      <div class="relative">
                        <div
                          #editorElement
                          id="editorElement"
                          class="tiptap-editor w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-text"
                          (click)="focusEditor()"
                          (dragover)="onNativeDragOver($event)"
                          (drop)="onNativeDrop($event)"
                        >
                        </div>
                      </div>

                      <div class="mt-2 flex justify-between items-center">
                        <!-- Internal comment checkbox - ADMIN ONLY -->
                        <label *ngIf="!isClient()" class="flex items-center text-sm text-gray-600 dark:text-gray-400">
                          <input type="checkbox" [(ngModel)]="isInternalComment" class="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                          Comentario interno (no visible para el cliente)
                        </label>
                        <div *ngIf="isClient()"></div><!-- Spacer for flexbox -->
                        <div class="flex items-center gap-2 sm:gap-3">
                          <span *ngIf="isUploadingImage" class="text-xs text-gray-500 dark:text-gray-400">Subiendo archivo...</span>
                          <!-- File attachment button -->
                          <input #commentFileInput type="file" (change)="onCommentFileSelect($event)" class="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
                          <button (click)="commentFileInput.click()"
                                  [disabled]="isUploadingImage"
                                  class="btn btn-secondary px-3 py-2 text-sm"
                                  title="Adjuntar archivo">
                            <i class="fas fa-paperclip"></i>
                            <span class="hidden sm:inline ml-1">Adjuntar</span>
                          </button>
                          <div class="flex items-center shadow-sm rounded-lg relative">
                            <button (click)="addComment()"
                                    [disabled]="isUploadingImage || !hasEditorContent() || isSubmitting"
                                    [ngClass]="{'rounded-r-none border-r border-white/20': !isClient() && activeCommentsCount > 0, 'rounded-lg': isClient() || activeCommentsCount === 0}"
                                    class="btn btn-primary">
                              <i class="fas fa-comment"></i>
                              <span class="hidden sm:inline ml-2">Enviar</span>
                            </button>
                            <button *ngIf="!isClient() && activeCommentsCount > 0"
                                    class="btn btn-primary rounded-l-none px-2 border-l border-white/10"
                                    [disabled]="isUploadingImage || !hasEditorContent() || isSubmitting"
                                    (click)="toggleSmartSendDropdown()">
                              <i class="fas fa-chevron-down"></i>
                            </button>

                            <!-- Check dropup vs dropdown based on position? Usually fixed is safer or standard absolute -->
                             <div *ngIf="showSmartSendDropdown" class="fixed inset-0 z-40" (click)="showSmartSendDropdown = false"></div>

                            <div *ngIf="showSmartSendDropdown" class="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">

                              <!-- Send & Solve -->
                              <button *ngIf="solvedStage"
                                      (click)="replyAndSetStage(solvedStage.id)"
                                      [disabled]="isSubmitting"
                                      class="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors">
                                  <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center shrink-0">
                                      <i class="fas fa-check text-xs"></i>
                                  </div>
                                  <div>
                                      <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Enviar y Solucionar</div>
                                      <div class="text-[10px] text-gray-500 uppercase tracking-wide">Cambiar a {{solvedStage.name}}</div>
                                  </div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Comments List -->
                    <div *ngIf="activeCommentsCount === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
                      <i class="fas fa-comments text-5xl mb-4 opacity-50"></i>
                      <p class="text-lg">No hay comentarios aún</p>
                    </div>
                    <div *ngIf="activeCommentsCount > 0" class="space-y-4">
                      <!-- Recursive Template for Comments -->
                      <ng-template #commentNode let-comment="comment" let-level="level">
                        <div class="mb-4 relative transition-all duration-300"
                             [style.margin-left.px]="level * 24"
                             [class.pl-6]="level > 0">

                            <!-- Thread connector lines (only for depth > 0) -->
                            <div *ngIf="level > 0"
                                 class="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 -ml-3 rounded-full"></div>

                            <div *ngIf="level > 0"
                                 class="absolute left-0 top-8 w-6 h-[2px] bg-gray-200 dark:bg-gray-700 -ml-3 rounded-r-full"></div>

                            <!-- Comment Body -->
                            <div *ngIf="!comment.deleted_at || (!isClient() && showDeletedComments)"
                                 [ngClass]="{
                                   'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50': comment.is_internal,
                                   'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 shadow-sm': !comment.is_internal && !comment.client_id,
                                   'bg-blue-50/40 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30': !comment.is_internal && comment.client_id
                                 }"
                                 [class.opacity-60]="comment.deleted_at"
                                 class="rounded-2xl p-4 border relative group overflow-hidden transition-shadow">

                                <!-- Accent Bars -->
                                <div *ngIf="comment.is_internal" class="absolute left-0 top-0 bottom-0 w-1 bg-amber-400/80"></div>
                                <div *ngIf="!comment.is_internal && comment.client_id" class="absolute left-0 top-0 bottom-0 w-1 bg-blue-400/80"></div>

                                <!-- Header -->
                                <div class="flex justify-between items-start mb-3 pl-2">
                                  <div class="flex items-center gap-3">
                                    <!-- Avatar -->
                                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm shrink-0 border border-white/20"
                                         [ngClass]="{
                                           'bg-amber-100 text-amber-900 dark:bg-amber-800 dark:text-amber-100': comment.is_internal,
                                           'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300': !comment.is_internal && !comment.client_id,
                                           'bg-blue-100 text-blue-900 dark:bg-blue-800 dark:text-blue-100': !comment.is_internal && comment.client_id
                                         }">
                                         {{ getAuthorInitials(comment) }}
                                    </div>

                                    <div class="flex flex-col">
                                      <div class="flex items-center gap-2">
                                        <span class="font-bold text-sm text-gray-900 dark:text-white">
                                          {{ getCommentAuthorName(comment) }}
                                        </span>
                                        <span *ngIf="comment.is_internal"
                                              class="px-1.5 py-0.5 text-[8px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded border border-amber-200 dark:border-amber-700/50 uppercase font-bold tracking-wider">
                                          Interno
                                        </span>
                                        <!-- Hide "Cliente" tag if viewer is client (isClient() is true) -->
                                        <span *ngIf="comment.client_id && !isClient()"
                                              class="px-1.5 py-0.5 text-[8px] bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-700/50 uppercase font-bold tracking-wider">
                                          Cliente
                                        </span>
                                        <span *ngIf="comment.deleted_at" class="px-1.5 py-0.5 text-[8px] bg-red-100 text-red-700 rounded uppercase font-bold">
                                          Eliminado
                                        </span>
                                      </div>
                                      <div class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                        <span>{{ formatDate(comment.created_at) }}</span>
                                        <span *ngIf="comment.edited_at" class="italic" title="{{ formatDate(comment.edited_at) }}">• Editado</span>
                                      </div>
                                    </div>
                                  </div>

                                  <!-- Actions (Always visible) -->
                                  <div class="flex items-center gap-1">
                                      <button *ngIf="!isClient()" (click)="openVisibilityModal(comment); $event.stopPropagation()" 
                                              class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors" 
                                              [title]="comment.is_internal ? 'Hacer público' : 'Hacer interno'"
                                              [attr.aria-label]="comment.is_internal ? 'Hacer público' : 'Hacer interno'">
                                        <i class="fas" [ngClass]="comment.is_internal ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true"></i>
                                      </button>

                                      <button (click)="toggleReply(comment)" 
                                              class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors" 
                                              title="Responder"
                                              aria-label="Responder">
                                        <i class="fas fa-reply text-xs" aria-hidden="true"></i>
                                      </button>
                                      
                                      <ng-container *ngIf="!comment.deleted_at"> 
                                          <button (click)="toggleEdit(comment)" 
                                                  class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-orange-600 transition-colors" 
                                                  title="Editar"
                                                  aria-label="Editar comentario">
                                            <i class="fas fa-pencil-alt text-xs" aria-hidden="true"></i>
                                          </button>
                                          <button *ngIf="!isClient()" 
                                                  (click)="softDeleteComment(comment)" 
                                                  class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors" 
                                                  title="Eliminar"
                                                  aria-label="Eliminar comentario">
                                            <i class="fas fa-trash text-xs" aria-hidden="true"></i>
                                          </button>
                                      </ng-container>

                                      <button *ngIf="comment.deleted_at && !isClient()" 
                                              (click)="restoreComment(comment)" 
                                              class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-green-100 text-green-600 transition-colors" 
                                              title="Restaurar"
                                              aria-label="Restaurar comentario">
                                        <i class="fas fa-undo text-xs" aria-hidden="true"></i>
                                      </button>
                                  </div>
                                </div>

                                <!-- Content -->
                                <div *ngIf="!comment.isEditing"
                                     class="pl-11 prose prose-sm max-w-none text-gray-900 dark:text-gray-100 [&>*]:text-gray-900 dark:[&>*]:text-gray-100 leading-relaxed text-[13.5px] font-normal"
                                     [innerHTML]="getProcessedContent(comment.comment)"></div>

                                <!-- Edit Mode -->
                                <div *ngIf="comment.isEditing" class="mt-3 pl-11">
                                    <textarea [(ngModel)]="comment.editContent" class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800/80 focus:ring-2 focus:ring-blue-500 min-h-[100px] text-sm shadow-inner" rows="3"></textarea>
                                    <div class="flex justify-end gap-2 mt-3">
                                        <button (click)="toggleEdit(comment)" class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
                                        <button (click)="saveEdit(comment)" class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm">Guardar cambios</button>
                                    </div>
                                </div>

                                <!-- Reply Editor -->
                                <div *ngIf="comment.showReplyEditor" class="mt-4 pt-4 ml-11 border-t border-gray-100 dark:border-gray-700/50">
                                    <div class="flex gap-3">
                                      <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                                        <i class="fas fa-reply text-gray-400 text-xs"></i>
                                      </div>
                                      <div class="flex-1">
                                        <textarea [id]="'reply-input-' + comment.id" #replyInput class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800/50 focus:ring-2 focus:ring-blue-500 min-h-[80px] text-sm shadow-inner" placeholder="Escribe tu respuesta..."></textarea>
                                        <div class="flex justify-end gap-2 mt-2">
                                            <button (click)="toggleReply(comment)" class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
                                            <button (click)="replyTo(comment, replyInput.value)" class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 shadow-sm">
                                              <i class="fas fa-paper-plane text-[10px]"></i> Responder
                                            </button>
                                        </div>
                                      </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Recursively render children -->
                        <div *ngIf="comment.children && comment.children.length > 0">
                            <ng-container *ngFor="let child of comment.children">
                                <ng-container *ngTemplateOutlet="commentNode; context:{comment: child, level: level + 1}"></ng-container>
                            </ng-container>
                        </div>
                      </ng-template>

                      <!-- Main List Loop -->
                      <div class="space-y-4">
                        <div *ngIf="!isClient()" class="flex justify-end mb-2">
                           <label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                               <input type="checkbox" [(ngModel)]="showDeletedComments" class="rounded border-gray-300">
                               Mostrar eliminados
                           </label>
                        </div>

                        <ng-container *ngFor="let comment of comments">
                           <ng-container *ngTemplateOutlet="commentNode; context:{comment: comment, level: 0}"></ng-container>
                        </ng-container>

                        <!-- Load More / Fade Section -->
                        <div *ngIf="!commentsExpanded && totalCommentsCount > visibleCommentsLimit" class="relative mt-2 text-center">
                           <!-- Fade Overlay -->
                           <div class="absolute -top-24 left-0 right-0 h-24 bg-gradient-to-t from-white dark:from-gray-800 to-transparent pointer-events-none"></div>

                           <button (click)="toggleCommentsExpansion()"
                                   class="relative z-10 px-4 py-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-full text-xs font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors shadow-sm cursor-pointer hover:shadow-md">
                             <i class="fas fa-history mr-1"></i> Ver historial completo
                           </button>
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Sidebar (Right Side) -->
          <div class="space-y-4 sm:space-y-6 lg:col-span-1">

            <!-- Tags Card -->
            <div *ngIf="!isClient()" class="bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300">
              <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div class="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 p-2 sm:p-3 rounded-lg shadow-md">
                  <i class="fas fa-tags text-lg sm:text-xl"></i>
                </div>
                <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Etiquetas</h3>
              </div>
              <app-tag-manager [entityId]="ticket.id" entityType="tickets"></app-tag-manager>
            </div>

            <!-- Client Contact - ADMIN ONLY (clients shouldn't see their own info card) -->
            <div *ngIf="!isClient()" class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 shadow-md border border-blue-200 dark:border-blue-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300">
              <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div class="bg-blue-500 text-white p-2 sm:p-3 rounded-lg shadow-md">
                  <i class="fas fa-user text-lg sm:text-xl"></i>
                </div>
                <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Cliente</h3>
              </div>
              <div *ngIf="ticket?.client as client; else noClientInfo">
                <div class="text-sm sm:text-base text-gray-900 dark:text-gray-100 font-semibold mb-2 sm:mb-3">{{ client.name }}</div>
                <div class="space-y-1.5 sm:space-y-2">
                  <div *ngIf="client.email" class="flex items-center gap-2 text-xs sm:text-sm">
                    <i class="fas fa-envelope text-blue-600 dark:text-blue-400 w-3 sm:w-4"></i>
                    <a [href]="'mailto:' + client.email" class="text-blue-600 dark:text-blue-400 hover:underline truncate">{{ client.email }}</a>
                  </div>
                  <div *ngIf="client.phone" class="flex items-center gap-2 text-xs sm:text-sm">
                    <i class="fas fa-phone text-blue-600 dark:text-blue-400 w-3 sm:w-4"></i>
                    <a [href]="'tel:' + client.phone" class="text-blue-600 dark:text-blue-400 hover:underline">{{ client.phone }}</a>
                  </div>
                </div>
              </div>
              <ng-template #noClientInfo>
                <div class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">No hay información del cliente</div>
              </ng-template>

              <!-- View Devices Button -->
              <div *ngIf="ticket?.client?.id" class="mt-4 pt-3 border-t border-blue-200 dark:border-blue-700/50">
                <button (click)="openClientDevicesModal()" class="w-full btn btn-sm bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-blue-300 dark:border-blue-800 transition-colors flex items-center justify-center gap-2">
                  <i class="fas fa-mobile-alt"></i>
                  Ver Dispositivos
                </button>
              </div>
            </div>

            <!-- Quick Stats -->
            <div class="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-800/20 shadow-md border border-green-200 dark:border-green-700 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow duration-300">
              <div class="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div class="bg-green-500 text-white p-2 sm:p-3 rounded-lg shadow-md">
                  <i class="fas fa-chart-pie text-lg sm:text-xl"></i>
                </div>
                <h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Resumen</h3>
              </div>
              <div class="space-y-3 sm:space-y-4">
                <div class="bg-white dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 shadow-sm">
                  <div class="flex justify-between items-center">
                    <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Servicios</span>
                    <span class="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{{ formatPrice(calculateServicesTotal()) }}</span>
                  </div>
                  <div class="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Productos</span>
                    <span class="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">{{ formatPrice(calculateProductsTotal()) }}</span>
                  </div>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-lg p-2.5 sm:p-3 shadow-sm border-2 border-green-500 dark:border-green-600">
                  <div class="flex justify-between items-center">
                    <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">Total Ticket</span>
                    <span class="text-gray-900 dark:text-gray-100 font-medium">{{ formatPrice(ticket.total_amount || calculateServicesTotal()) }}</span>
                </div>

                <!-- Hours Estimated vs Real -->
                <div class="flex justify-between items-center text-sm border-t border-gray-100 dark:border-slate-600 pt-2">
                  <span class="text-gray-500 dark:text-gray-400">Horas Estimadas</span>
                  <span class="font-medium text-gray-900 dark:text-gray-100">{{ ticket.estimated_hours || 0 }}h</span>
                </div>

                <div class="flex justify-between items-center text-sm">
                  <span class="text-gray-500 dark:text-gray-400">Horas Reales</span>
                  <span class="font-medium" [class.text-green-600]="getActualHours() <= (ticket.estimated_hours || 0)"
                                            [class.text-orange-500]="getActualHours() > (ticket.estimated_hours || 0)">
                    {{ getActualHours() }}h
                  </span>
                </div>
              </div>
            </div>
            </div>

            <!-- Timeline -->
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 mb-6">
              <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <div class="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                  <i class="fas fa-history"></i>
                </div>
                Timeline
              </h3>

              <div class="relative border-l-2 border-gray-100 dark:border-gray-700 ml-3 space-y-6">
                <!-- Creation -->
                <div class="ml-6 relative">
                  <div class="absolute -left-[31px] bg-green-500 h-4 w-4 rounded-full border-4 border-white dark:border-gray-800"></div>
                  <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">Ticket creado</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ formatDate(ticket.created_at) }}</p>
                </div>

                <!-- Last Update -->
                <div class="ml-6 relative">
                   <div class="absolute -left-[31px] bg-blue-500 h-4 w-4 rounded-full border-4 border-white dark:border-gray-800"></div>
                  <h4 class="font-bold text-gray-900 dark:text-gray-100 text-sm">Última actualización</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(ticket.updated_at) }}</p>
                  </div>


                <div *ngFor="let activity of recentActivity" class="flex items-start space-x-3">
                  <div class="flex-shrink-0 w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full mt-2"></div>
                  <div>
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ activity.action }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(activity.created_at) }}</p>
                  </div>
                </div>
              </div>
            </div>
            <!-- Tags Section (moved from header) -->
            <div class="bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 rounded-lg p-6 mt-4">
              <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Etiquetas</h3>
              <app-tag-manager *ngIf="ticketId"
                  [entityType]="'tickets'"
                  [entityId]="ticketId">
              </app-tag-manager>
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
              <button (click)="closeChangeStageModal()" class="modal-close" aria-label="Cerrar modal">
                <i class="fas fa-times" aria-hidden="true"></i>
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
              <button (click)="closeUpdateHoursModal()" class="modal-close" aria-label="Cerrar modal">
                <i class="fas fa-times" aria-hidden="true"></i>
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
              <button (click)="closeAttachmentModal()" class="modal-close" aria-label="Cerrar modal">
                <i class="fas fa-times" aria-hidden="true"></i>
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

      <!-- Services Selection Modal -->
      @if (showServicesModal) {
        <div class="modal-overlay">
          <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">Seleccionar Servicios</h2>
              <button (click)="closeServicesModal()" class="modal-close" aria-label="Cerrar modal"><i class="fas fa-times" aria-hidden="true"></i></button>
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
                      <div class="text-right text-sm text-gray-800 dark:text-gray-200">
                        <div class="font-medium">{{ formatPrice(getServiceUnitPrice(svc)) }}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">Unidad</div>
                      </div>
                      <div class="pl-3">
                        <input type="checkbox" [checked]="isServiceIdSelected(svc.id)" (click)="$event.stopPropagation(); toggleServiceSelection(svc)" />
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
        </div>
      }

      <!-- Client Devices Modal -->
      @if (showClientDevicesModal && ticket?.client?.id) {
        <app-client-devices-modal
          [companyId]="ticket?.company_id!"
          [client]="ticket?.client"
          [mode]="clientDevicesModalMode"
          (close)="closeClientDevicesModal()"
          (editDevice)="closeClientDevicesModalAndEdit($event)"
          (selectDevices)="onSelectDevices($event)"
          (createNewDevice)="onCreateNewDeviceFromModal()"
        ></app-client-devices-modal>
      }

      <!-- Products Selection Modal -->
      @if (showProductsModal) {
        <div class="modal-overlay">
          <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">📦 Seleccionar Productos</h2>
              <button (click)="closeProductsModal()" class="modal-close" aria-label="Cerrar modal"><i class="fas fa-times" aria-hidden="true"></i></button>
            </div>
            <div class="modal-body space-y-3">
              <div>
                <input type="text" class="form-input" placeholder="Buscar productos..." [(ngModel)]="productSearchText" (input)="filterProductsList()" />
              </div>
              <div class="max-h-80 overflow-auto divide-y">
                <div *ngFor="let product of filteredProducts" class="py-3 px-2 hover:bg-gray-50">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4 flex-1">
                      <div class="font-medium">{{ product.name }}</div>
                      <div class="text-xs text-gray-500 line-clamp-2">{{ product.description }}</div>
                      <div class="flex gap-2 mt-1">
                        <span *ngIf="product.brand" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {{ product.brand }}
                        </span>
                        <span *ngIf="product.category" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                          {{ product.category }}
                        </span>
                      </div>
                    </div>
                    <div class="flex items-center space-x-4">
                      <div class="text-right text-sm text-gray-800 dark:text-gray-200">
                        <div class="font-medium">{{ formatPrice(getProductUnitPrice(product)) }}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">Unidad</div>
                      </div>
                      @if (selectedProductIds.has(product.id)) {
                        <div class="flex items-center space-x-2 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1">
                          <button type="button" (click)="decreaseProductQty(product.id)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                            <i class="fas fa-minus text-xs"></i>
                          </button>
                          <input type="number" min="1" [value]="getProductQuantity(product.id)" (input)="setProductQuantity(product.id, $any($event.target).value)"
                                 class="w-12 text-center border-0 focus:ring-0 text-sm bg-transparent text-gray-900 dark:text-gray-100" />
                          <button type="button" (click)="increaseProductQty(product.id)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                            <i class="fas fa-plus text-xs"></i>
                          </button>
                        </div>
                      }
                      <div class="pl-3">
                        <input type="checkbox" [checked]="selectedProductIds.has(product.id)" (change)="toggleProductSelection(product)" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer flex justify-end space-x-2 p-2">
              <button class="btn btn-secondary" (click)="closeProductsModal()">Cancelar</button>
              <button class="btn btn-primary" [disabled]="selectedProductIds.size === 0" (click)="saveProductsSelection()">Guardar</button>
            </div>
          </div>
        </div>
      }

      <!-- Devices Selection Modal -->
      @if (showDevicesModal) {
        <div class="modal-overlay">
          <div class="modal-content w-full max-w-[1100px] lg:max-w-[1000px]" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2 class="modal-title">💻 Seleccionar Dispositivos</h2>
              <div class="flex items-center gap-2">
                <button (click)="openCreateDeviceForm()" class="btn btn-sm btn-primary shadow-sm hover:shadow-md transition-all">
                  <i class="fas fa-plus mr-1" aria-hidden="true"></i> Nuevo Dispositivo
                </button>
                <button (click)="closeDevicesModal()" class="modal-close" aria-label="Cerrar modal"><i class="fas fa-times" aria-hidden="true"></i></button>
              </div>
            </div>
            <div class="modal-body space-y-3">
              <div>
                <input type="text" class="form-input" placeholder="Buscar dispositivos..." [(ngModel)]="deviceSearchText" (input)="filterDevicesList()" />
              </div>
              <div class="max-h-80 overflow-auto divide-y">
                <div *ngFor="let device of filteredDevices" class="py-3 px-2 hover:bg-gray-50">
                  <div class="flex items-center justify-between">
                    <div class="min-w-0 pr-4 flex-1">
                      <div class="font-medium">{{ device.brand }} {{ device.model }}</div>
                      <div class="text-xs text-gray-500">
                        <span *ngIf="device.serial_number">SN: {{ device.serial_number }}</span>
                        <span *ngIf="device.imei"> • IMEI: {{ device.imei }}</span>
                      </div>
                      <div class="flex gap-2 mt-1">
                        <span *ngIf="device.status" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              [ngClass]="{
                                'bg-gray-100 text-gray-800': device.status === 'received',
                                'bg-blue-100 text-blue-800': device.status === 'in_progress',
                                'bg-green-100 text-green-800': device.status === 'completed',
                                'bg-purple-100 text-purple-800': device.status === 'delivered',
                                'bg-red-100 text-red-800': device.status === 'cancelled'
                              }">
                          {{ device.status }}
                        </span>
                        <span *ngIf="linkedDeviceIds.has(device.id)" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          <i class="fas fa-link mr-1"></i> Ya vinculado
                        </span>
                      </div>
                    </div>
                    <div class="pl-3">
                      <input type="checkbox" [checked]="selectedDeviceIds.has(device.id)" (change)="toggleDeviceSelection(device)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer flex justify-end space-x-2 p-2">
              <button class="btn btn-secondary" (click)="closeDevicesModal()">Cancelar</button>
              <button class="btn btn-primary" (click)="saveDevicesSelection()">Guardar</button>
            </div>
          </div>
        </div>
      }

  <!-- Modal para crear dispositivo (Full "Perfect" Modal) -->
  <div *ngIf="showCreateDeviceForm" class="fixed inset-0 flex items-center justify-center bg-black/60" style="z-index: 100000;">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto" (click)="$event.stopPropagation()">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600">
        <div>
          <h2 class="text-xl font-bold text-white flex items-center gap-2">
            <i class="fas fa-mobile-alt"></i>
            {{ editingDeviceId ? 'Editar Dispositivo' : (isClient() ? 'Añadir mi dispositivo' : 'Nuevo Dispositivo') }}
          </h2>
          <p class="text-blue-100 text-sm mt-0.5">{{ isClient() ? 'Registre su dispositivo' : 'Registre el dispositivo del cliente' }}</p>
        </div>
        <button (click)="cancelCreateDevice()" class="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition-all">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 overflow-y-auto flex-1 space-y-5">
        <!-- Row 1: Brand + Model -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label for="device_brand" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Marca *</label>
            <input type="text" id="device_brand" [(ngModel)]="deviceFormData.brand" name="device_brand"
              class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="Ej: Apple, Samsung, Xiaomi">
          </div>
          <div class="space-y-1.5">
            <label for="device_model" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo *</label>
            <input type="text" id="device_model" [(ngModel)]="deviceFormData.model" name="device_model"
              class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="Ej: iPhone 14, Galaxy S23">
          </div>
        </div>

        <!-- Row 2: IMEI + Color + Type -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div *ngIf="!isClient()" class="space-y-1.5">
            <label for="device_imei" class="block text-sm font-medium text-gray-700 dark:text-gray-300">IMEI</label>
            <input type="text" id="device_imei" [(ngModel)]="deviceFormData.imei" name="device_imei"
              class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="Número IMEI">
          </div>
          <div class="space-y-1.5">
            <label for="device_color" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
            <input type="text" id="device_color" [(ngModel)]="deviceFormData.color" name="device_color"
              class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              placeholder="Color">
          </div>
          <div class="space-y-1.5">
            <label for="device_type" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo *</label>
            <select id="device_type" [(ngModel)]="deviceFormData.device_type" name="device_type"
              class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all">
              <option value="">Seleccionar tipo</option>
              <option value="smartphone">Smartphone</option>
              <option value="tablet">Tablet</option>
              <option value="laptop">Portátil</option>
              <option value="desktop">Ordenador</option>
              <option value="console">Consola</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>

        <!-- Row 3: Reported Issue -->
        <div class="space-y-1.5">
          <label for="reported_issue" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Problema Reportado *</label>
          <textarea id="reported_issue" [(ngModel)]="deviceFormData.reported_issue" name="reported_issue"
            class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
            rows="2" placeholder="Describe el problema reportado por el cliente"></textarea>
        </div>

        <!-- Row 4: Condition on Arrival -->
        <div *ngIf="!isClient()" class="space-y-1.5">
          <label for="device_notes" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Estado al llegar</label>
          <textarea id="device_notes" [(ngModel)]="deviceFormData.condition_on_arrival" name="device_notes"
            class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none"
            rows="2" placeholder="Estado inicial, accesorios incluidos, etc."></textarea>
        </div>

        <!-- Row 5: Image Upload -->
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Imágenes del dispositivo</label>
          <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer bg-gray-50 dark:bg-gray-700/50">
            <input type="file" id="device_images" (change)="onDeviceImagesSelected($event)" name="device_images"
              accept="image/*" multiple class="hidden">
            <label for="device_images" class="cursor-pointer flex flex-col items-center gap-2">
              <i class="fas fa-cloud-upload-alt text-3xl text-gray-400 dark:text-gray-500"></i>
              <span class="text-sm font-medium text-gray-600 dark:text-gray-400">Agregar imágenes</span>
              <span class="text-xs text-gray-400 dark:text-gray-500">Arrastra archivos aquí o haz click para seleccionar</span>
            </label>
          </div>
          <div *ngIf="selectedDeviceImages.length > 0" class="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
            <div *ngFor="let image of selectedDeviceImages; let i = index" class="relative group rounded-lg overflow-hidden aspect-square bg-gray-100 dark:bg-gray-700">
              <img [src]="image.preview" [alt]="image.file.name" class="w-full h-full object-cover">
              <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button type="button" (click)="removeDeviceImage(i)" class="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors" aria-label="Eliminar imagen">
                  <i class="fas fa-trash text-sm" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <button (click)="cancelCreateDevice()" class="px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-all">
          <i class="fas fa-times mr-2"></i>Cancelar
        </button>
        <button (click)="createAndSelectDevice()"
          [disabled]="!deviceFormData.brand || !deviceFormData.model || !deviceFormData.device_type || !deviceFormData.reported_issue"
          class="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/30">
          <i class="fas fa-check mr-2"></i>{{ editingDeviceId ? 'Guardar Cambios' : 'Crear Dispositivo' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Image Lightbox Modal -->
  <div *ngIf="selectedImage"
       class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
       (click)="closeLightbox()">

    <!-- Close Button -->
    <button (click)="closeLightbox()" 
            class="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors z-50"
            aria-label="Cerrar vista previa">
      <i class="fas fa-times text-2xl" aria-hidden="true"></i>
    </button>

    <!-- Image Container -->
    <div class="relative max-w-full max-h-full flex items-center justify-center" (click)="$event.stopPropagation()">
      <img [src]="selectedImage"
           class="max-w-full max-h-[90vh] object-contain rounded shadow-2xl animate-in zoom-in-95 duration-200"
           alt="Full size view">
    </div>
  </div>

  <!-- Visibility Confirmation Modal -->
  <div *ngIf="showVisibilityModal" class="fixed inset-0 z-[100001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" (click)="showVisibilityModal = false">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700" (click)="$event.stopPropagation()">
          <div class="p-6">
              <div class="flex items-center gap-4 mb-4">
                  <div class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <i class="fas" [ngClass]="commentToToggle?.is_internal ? 'fa-eye' : 'fa-eye-slash'" class="text-blue-600 dark:text-blue-400 text-xl"></i>
                  </div>
                  <div>
                      <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ visibilityModalTitle }}</h3>
                      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Confirmar cambio de visibilidad</p>
                  </div>
              </div>

              <div class="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 mb-6 border border-gray-100 dark:border-gray-700">
                  <p class="text-sm text-gray-600 dark:text-gray-300">{{ visibilityModalMessage }}</p>
                  <div *ngIf="commentToToggle" class="mt-3 text-xs text-gray-500 dark:text-gray-500 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3 line-clamp-2">
                      "{{ commentToToggle.comment | slice:0:100 }}"
                  </div>
              </div>

              <div class="flex items-center justify-end gap-3">
                  <button (click)="showVisibilityModal = false" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                      Cancelar
                  </button>
                  <button (click)="confirmVisibilityChange()" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105">
                      Confirmar
                  </button>
              </div>
          </div>
      </div>
  </div>

  `
})
export class TicketDetailComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() inputTicketId?: string;
  loading = true;
  error: string | null = null;
  ticket: Ticket | null = null;
  ticketServices: any[] = [];
  ticketProducts: any[] = [];
  ticketDevices: Device[] = [];
  // All devices for the ticket's company (authoritative)
  companyDevices: Device[] = [];
  // Set of linked device ids (from ticket_devices)
  linkedDeviceIds: Set<string> = new Set();

  allStages: ConfigStage[] = [];
  private stagesSvc = inject(SupabaseTicketStagesService);
  recentActivity: any[] = [];
  ticketId: string | null = null;

  // State for comments
  comments: TicketComment[] = [];
  showDeletedComments = false;
  isInternalComment = false;
  isUploadingImage = false;
  isSubmitting = false; // Prevent double-submission race conditions

  // Rich editor state
  commentEditorHtml: string = '';

  // Modal controls
  showChangeStageModal = false;
  showUpdateHoursModal = false;
  showAttachmentModal = false;
  showClientDevicesModal = false;
  returnToSelectionModal = false;

  // Modal form data
  selectedStageId: string = '';
  newHoursValue: number = 0;
  selectedFile: File | null = null;
  // Edit modal form data (handled by central modal)
  // Advanced Config & Agents
  staffUsers: { id: string, name: string, email: string }[] = [];
  ticketConfig: any = {};

  // Visibility Modal
  showVisibilityModal = false;
  commentToToggle: TicketComment | null = null;
  visibilityModalTitle = '';
  visibilityModalMessage = '';

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SimpleSupabaseService);
  private ticketsService = inject(SupabaseTicketsService);
  private servicesService = inject(SupabaseServicesService);
  private devicesService = inject(DevicesService);
  private productsService = inject(ProductsService);
  private settingsService = inject(SupabaseSettingsService);
  private ticketModalService = inject(TicketModalService);

  private quotesService = inject(SupabaseQuotesService);
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  private tenantService = inject(TenantService);
  private authService = inject(AuthService);

  // Track if there is an existing active quote derived from this ticket
  activeQuoteId: string | null = null;

  // Client portal mode - using computed signal based on user role (like supabase-tickets)
  isClient = computed(() => this.authService.userRole() === 'client');

  // Legacy property for backward compatibility (will be removed)
  isClientPortal = false;

  // Services Selection Modal state
  showServicesModal = false;
  servicesCatalog: any[] = [];
  filteredServices: any[] = [];
  serviceSearchText = '';
  selectedServiceIds: Set<string> = new Set();

  // Products Selection Modal state
  showProductsModal = false;
  productsCatalog: any[] = [];
  filteredProducts: any[] = [];
  productSearchText = '';
  selectedProductIds: Set<string> = new Set();
  tempProductQuantities: Map<string, number> = new Map();

  // Devices Selection Modal state
  showDevicesModal = false;
  availableDevices: Device[] = [];
  filteredDevices: Device[] = [];
  deviceSearchText = '';
  selectedDeviceIds: Set<string> = new Set();

  // History management for modals
  private popStateListener: any = null;
  // Keep quantities for selected services
  selectedServiceQuantities: Map<string, number> = new Map();

  // Minimal in-component toast system
  // Deprecated local toast ids (kept for backward compat, no longer used)
  private nextToastId = 1;

  // Track saving state per assigned service id when persisting inline quantity edits
  savingAssignedServiceIds: Set<string> = new Set();

  // Create Device Modal state
  showCreateDeviceForm = false;
  showDeletedDevices = false;
  editingDeviceId: string | null = null;
  deviceFormData: any = {};
  selectedDeviceImages: { file: File, preview: string }[] = [];

  // Tab management for content organization (Comments first as it's most used)
  activeTab: 'services' | 'products' | 'devices' | 'comments' = 'comments';

  // TipTap Editor
  editor: Editor | null = null;
  @ViewChild('editorElement', { static: false }) editorElement!: ElementRef;
  private editorTried = false;
  private cdr = inject(ChangeDetectorRef);
  private renderer = inject(Renderer2);
  private sanitizer = inject(DomSanitizer);

  // Client Devices Modal Mode
  clientDevicesModalMode: 'view' | 'select' = 'view';

  openClientDevicesModal() {
    this.clientDevicesModalMode = 'view';
    this.showClientDevicesModal = true;
    this.lockBodyScroll();
  }

  closeClientDevicesModal() {
    this.showClientDevicesModal = false;
    this.unlockBodyScroll();
  }


  async onSelectDevices(devices: Device[]) {
    try {
      if (!this.ticket?.id) return;
      const deviceIds = devices.map(d => d.id);
      await this.devicesService.linkDevicesToTicket(this.ticket.id, deviceIds);
      this.showToast('Dispositivos vinculados correctamente', 'success');
      this.showClientDevicesModal = false;
      this.unlockBodyScroll();
      this.loadTicketDevices();
    } catch (error) {
      console.error('Error linking devices:', error);
      this.showToast('Error al vincular dispositivos', 'error');
    }
  }

  onCreateNewDeviceFromModal() {
    this.showClientDevicesModal = false;
    // Open the standard creation form
    // reset return flag so we know to come back here
    this.returnToSelectionModal = true;

    // We can reuse the existing openCreateDeviceForm logic but manually since that method resets some things
    // Or just call it? calling it might reset returnToSelectionModal inside it if I'm not careful.
    // openCreateDeviceForm sets returnToSelectionModal = this.showDevicesModal (which is false here).

    // So better to manually open it:
    this.deviceFormData = {
      company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || '',
      status: 'received',
      priority: 'normal',
      brand: '',
      model: '',
      device_type: '',
      reported_issue: '',
      imei: '',
      color: '',
      condition_on_arrival: ''
    };
    this.selectedDeviceImages = [];
    this.showCreateDeviceForm = true;

  }

  // Counters
  activeCommentsCount: number = 0;

  // Lazy Loading / Fade Logic
  visibleCommentsLimit: number = 3;
  totalCommentsCount: number = 0;
  commentsExpanded: boolean = false;
  commentsLoading: boolean = false;

  // Unified Badge Configurations (following app style guide)
  ticketStatusConfig: Record<string, { label: string; classes: string; icon: string }> = {
    open: {
      label: 'Abierto',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      icon: 'fa-folder-open'
    },
    in_progress: {
      label: 'En Progreso',
      classes: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
      icon: 'fa-spinner'
    },
    on_hold: {
      label: 'En Espera',
      classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
      icon: 'fa-pause-circle'
    },
    completed: {
      label: 'Completado',
      classes: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      icon: 'fa-check-circle'
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

  // Lightbox State
  selectedImage: string | null = null;



  // Handle delegated clicks for images
  handleImageClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      this.openLightbox(img.src);
    }
  }

  handleDescriptionClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      // If image is inside a link, prevent default navigation
      if (img.parentElement?.tagName === 'A') {
        event.preventDefault();
      }
      this.openLightbox(img.src);
    }
  }

  openLightbox(imageUrl: string) {
    if (!imageUrl) return;
    this.selectedImage = imageUrl;
    this.lockBodyScroll();
    this.loadStaff();
    this.loadConfig();
  }

  async loadStaff() {
    const user = this.authService.userProfile;
    if (user?.role && user.role !== 'client' && user.company_id) {
      this.staffUsers = await this.ticketsService.getCompanyStaff(user.company_id);
    }
  }

  loadConfig() {
    const user = this.authService.userProfile;
    if (user?.company?.settings) {
      this.ticketConfig = user.company.settings;
      // Set default internal comment state
      if (this.ticketConfig.ticket_default_internal_comment) {
        this.isInternalComment = true;
      }
    }
  }

  async assignTicket(userId: string) {
    if (!this.ticket || this.isClient()) return;
    try {
      await this.ticketsService.updateTicket(this.ticket.id, { assigned_to: userId });
      this.ticket.assigned_to = userId;
      this.toastService.success('Agente asignado', 'El agente ha sido asignado correctamente');
    } catch (error) {
      this.toastService.error('Error', 'Error al asignar agente');
    }
  }

  openVisibilityModal(comment: TicketComment) {
    this.commentToToggle = comment;
    const willBeInternal = !comment.is_internal;
    this.visibilityModalTitle = willBeInternal ? '¿Marcar como Interno?' : '¿Hacer Público?';
    this.visibilityModalMessage = willBeInternal
      ? 'El cliente dejará de ver este comentario.'
      : '⚠️ ATENCIÓN: El cliente podrá ver este comentario y recibirá una notificación.';
    this.showVisibilityModal = true;
  }

  async confirmVisibilityChange() {
    if (!this.commentToToggle) return;

    const newStatus = !this.commentToToggle.is_internal;
    const { error } = await this.authService.client
      .from('ticket_comments')
      .update({ is_internal: newStatus })
      .eq('id', this.commentToToggle.id);

    if (error) {
      this.toastService.error('Error', 'Error al cambiar visibilidad');
    } else {
      this.commentToToggle.is_internal = newStatus;
      this.toastService.success('Correcto', 'Visibilidad actualizada');
    }
    this.showVisibilityModal = false;
    this.commentToToggle = null;
  }

  closeLightbox() {
    this.selectedImage = null;
    this.unlockBodyScroll(); // Restore scroll
  }



  ngOnInit() {
    this.debugLog('TicketDetailComponent ngOnInit called');
    // Also set legacy isClientPortal for any remaining uses
    this.isClientPortal = this.tenantService.isClientPortal() || this.authService.userRole() === 'client';

    if (this.inputTicketId) {
      this.ticketId = this.inputTicketId;
      this.debugLog('Ticket ID from Input:', this.ticketId);
      this.loadTicketDetail();
      this.subscribeToComments();
    } else {
      this.route.params.subscribe(params => {
        this.ticketId = params['id'];
        this.debugLog('Ticket ID from route:', this.ticketId);
        if (this.ticketId) {
          this.loadTicketDetail();
          // Subscribe to comments regardless of initial load success to ensure we catch updates
          this.subscribeToComments();
        } else {
          this.error = 'ID de ticket no válido';
          this.loading = false;
        }
      });
    }
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
    if (this.commentsSubscription) {
      this.commentsSubscription.unsubscribe();
    }
    // Asegurar que el scroll se restaure
    document.documentElement.style.overflow = '';
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
  }

  private commentsSubscription: any;
  private subscribeToComments() {
    if (!this.ticketId) return;

    // Log start of subscription attempt
    console.log('Starting Realtime subscription for ticket:', this.ticketId);

    // Use a unique channel name to avoid collisions if multiple tabs are open
    const channelName = `ticket-comments-${this.ticketId}-${Date.now()}`;

    const channel = this.supabase.getClient()
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments', filter: `ticket_id=eq.${this.ticketId}` },
        (payload) => {
          this.debugLog('Realtime update received:', payload);

          // Verify if we should show this update (e.g. internal comment for client)
          if (this.isClient() && payload.new && (payload.new as any).is_internal) {
            return; // Ignore internal updates for clients
          }
          // Trigger reload
          this.loadComments();
        }
      )
      .subscribe((status, err) => {
        console.log('Realtime subscription status:', status, err); // Force log
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to ticket comments updates. Channel:', channelName);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error:', err);
        }
      });

    this.commentsSubscription = channel;
  }

  // Helper to transform HTML content (e.g. make images clickable thumbnails)
  getProcessedContent(htmlContent: string): any {
    if (!htmlContent) return '';

    // Sanitize the HTML to remove scripts/unsafe tags before processing
    // We allow target attribute for links if they exist
    const cleanHtml = DOMPurify.sanitize(htmlContent, {
      ADD_ATTR: ['target']
    });

    // simple string manipulation to add class/onclick logic or wrap in anchor
    // We want: output <a href="src" target="_blank"><img src="src" class="comment-thumbnail" /></a>

    // Create a temporary DOM element to parse content
    const div = document.createElement('div');
    div.innerHTML = cleanHtml;

    const images = div.querySelectorAll('img');
    images.forEach((img: HTMLImageElement) => {
      // Skip if already wrapped in anchor (avoid double wrapping on re-renders if logic changes)
      // Skip if already wrapped (should not happen with this new logic)
      if (img.parentElement?.tagName === 'A') return;

      const src = img.getAttribute('src');
      if (src) {
        // Use a simple span wrapper with cursor-pointer to indicate clickability
        // We rely on the container's click handler to catch the click on the img

        const newImg = img.cloneNode(true) as HTMLImageElement;
        newImg.classList.add('comment-thumbnail');
        newImg.style.maxWidth = '150px';
        newImg.style.maxHeight = '150px';
        newImg.style.objectFit = 'contain';
        newImg.style.cursor = 'zoom-in';
        newImg.style.borderRadius = '0.375rem';
        newImg.style.border = '1px solid #e5e7eb';

        // No <a> wrapper needed, just the img
        img.replaceWith(newImg);
      }


    });

    return this.sanitizer.bypassSecurityTrustHtml(div.innerHTML);
  }

  // Development-only logger: will be a no-op in production
  private debugLog(...args: any[]) {
    if (!environment.production) {
      try { console.log(...args); } catch { }
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
        this.commentEditorHtml = editor.getHTML();
      },
      onCreate: ({ editor }) => {
        this.debugLog('TipTap editor created successfully');
        // Trigger change detection to reflect buttons state bound to editor
        try { this.cdr.detectChanges(); } catch { }
      },
    });
  }

  // TipTap Editor Methods
  focusEditor() {
    this.editor?.commands.focus();
  }

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
                    replaced = true; // stop traversal
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



  async loadTicketDevices() {
    try {
      // Load linked devices and build set of linked IDs
      this.linkedDeviceIds = new Set();
      if (this.ticketId) {
        // Load ticket devices (including deleted if toggled)
        const linked = await this.devicesService.getTicketDevices(this.ticketId, this.showDeletedDevices);
        if (linked && linked.length > 0) {
          this.ticketDevices = linked;
          this.linkedDeviceIds.clear();
          linked.forEach(d => this.linkedDeviceIds.add(d.id));
        } else {
          this.ticketDevices = [];
        }
      }

      // Load all devices for the ticket's company (company is authoritative)
      // Check if we are in client portal or agent view
      // If isClient(), we MUST load devices but scoped to this client.
      // If agent, we load all company devices (to allow searching/reassigning if needed) BUT filter by client in logic later if strict.

      const companyId = (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id;

      if (companyId) {
        try {
          // For clients, we might need a specific RPC or just filter after fetch if RLS allows fetching all (which it shouldn't).
          // Assuming getDevices returns what the user *can* see.
          // However, for agents, we want to see ALL devices to potentially link them.
          // The user requirement: "el usuario sólo liste los dispositivos que pertenencen a ese cliente".

          const devices = await this.devicesService.getDevices(companyId);
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


  toggleCommentsExpansion() {
    this.commentsExpanded = !this.commentsExpanded;
    this.loadComments(); // Reload with new limit/no limit
  }

  async loadComments() {
    if (!this.ticketId) return;

    try {
      this.commentsLoading = true;
      const isClient = this.isClient();
      let query = this.supabase.getClient()
        .from('ticket_comments')
        .select(`
          *,
          user:users(name, surname, email),
          client:clients(name, email)
        `, { count: 'exact' }) // Get count
        .eq('ticket_id', this.ticketId)
        .order('created_at', { ascending: false }); // Newest first

      // Clients should NOT see internal comments
      if (isClient) {
        query = query.eq('is_internal', false);
      }

      // Apply limit if not expanded
      if (!this.commentsExpanded) {
        query = query.range(0, this.visibleCommentsLimit - 1);
      }

      const { data: comments, count, error } = await query;

      if (error) {
        console.warn('Error cargando comentarios:', error);
        this.comments = [];
        this.activeCommentsCount = 0;
        this.totalCommentsCount = 0;
        return;
      }

      this.totalCommentsCount = count || 0;

      // Use DB count for badge
      this.activeCommentsCount = count || 0;

      // Build Tree Structure
      this.comments = this.buildCommentTree(comments || []);
    } catch (error) {
      console.error('Error en loadComments:', error);
      this.comments = [];
    } finally {
      this.commentsLoading = false;
    }
  }

  buildCommentTree(flatComments: any[]): TicketComment[] {
    const map = new Map<string, TicketComment>();
    const roots: TicketComment[] = [];

    // 1. Initialize map and add UI flags
    flatComments.forEach(c => {
      c.children = [];
      c.showReplyEditor = false;
      c.isEditing = false;
      c.editContent = c.comment;
      map.set(c.id, c);
    });

    // 2. Build tree
    flatComments.forEach(c => {
      if (c.parent_id && map.has(c.parent_id)) {
        map.get(c.parent_id)!.children!.push(c);
      } else {
        roots.push(c);
      }
    });

    return roots;
  }

  // --- NEW ACTIONS ---

  toggleReply(comment: TicketComment) {
    comment.showReplyEditor = !comment.showReplyEditor;
    if (comment.showReplyEditor) {
      setTimeout(() => {
        const el = document.getElementById('reply-input-' + comment.id);
        if (el) el.focus();
      }, 50);
    }
  }

  async replyTo(parentComment: TicketComment, content: string) {
    if (!content.trim()) return;

    // Inherit internal status from parent if it is internal
    // If user replies to an internal comment, the reply MUST be internal
    const isInternal = parentComment.is_internal;

    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      await this.postComment(content, parentComment.id, isInternal);
      parentComment.showReplyEditor = false;
    } finally {
      this.isSubmitting = false;
    }
  }

  toggleEdit(comment: TicketComment) {
    comment.isEditing = !comment.isEditing;
    // Strip HTML for plain text editing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = comment.comment;
    comment.editContent = tempDiv.textContent || tempDiv.innerText || '';
  }

  async saveEdit(comment: TicketComment) {
    if (!comment.editContent || comment.editContent === comment.comment) {
      comment.isEditing = false;
      return;
    }

    try {
      // 1. Save specific version history (Frontend triggered for simplicity, could be trigger based)
      const { error: versionError } = await this.supabase.getClient()
        .from('ticket_comment_versions')
        .insert({
          comment_id: comment.id,
          content: comment.comment, // Old content
          changed_by: (await this.supabase.getClient().auth.getUser()).data.user?.id
        });

      if (versionError) console.warn('Error saving version history', versionError);

      // 2. Update comment
      // Wrap in <p> if saving as simple text to maintain consistency with editor, or just save text
      // User requested "Texto plano y limpio" but system uses HTML. 
      // best compromise: basic wrapping or just text (will render as text).
      // Let's replace newlines with <br> for basic formatting if we save as "plain".
      const formattedContent = comment.editContent?.replace(/\\n/g, '<br>') || '';

      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          comment: formattedContent,
          edited_at: new Date().toISOString()
        })
        .eq('id', comment.id);

      if (error) throw error;

      // Reload
      this.loadComments();
      this.showToast('Comentario actualizado', 'success');
    } catch (err) {
      console.error('Error editing comment', err);
      this.showToast('Error al editar comentario', 'error');
    }
  }

  async softDeleteComment(comment: TicketComment) {
    if (!confirm('¿Estás seguro de eliminar este comentario?')) return;

    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          deleted_at: new Date().toISOString()
        })
        .eq('id', comment.id);

      if (error) throw error;
      this.loadComments();
    } catch (err) {
      console.error('Error deleted comment', err);
      this.showToast('Error al eliminar comentario', 'error');
    }
  }

  async restoreComment(comment: TicketComment) {
    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .update({
          deleted_at: null
        })
        .eq('id', comment.id);

      if (error) throw error;
      this.loadComments();
    } catch (err) {
      console.error('Error restoring comment', err);
    }
  }

  getCommentAuthorName(comment: TicketComment): string {
    if (comment.user?.name) {
      const surname = comment.user.surname || '';
      return surname ? `${comment.user.name} ${surname.charAt(0)}.` : comment.user.name;
    }
    if (comment.user?.surname) return comment.user.surname; // Fallback just in case
    if (comment.client) return this.getClientFullName(comment.client);
    return comment.client_id ? 'Cliente' : (comment.user?.email ? comment.user.email.split('@')[0] : 'Usuario');
  }

  getAuthorInitials(comment: TicketComment): string {
    const name = this.getCommentAuthorName(comment);
    if (!name) return '?';
    // If it's "Usuario" or "Cliente", take 2 chars?
    if (name === 'Usuario' || name === 'Cliente') return name.substring(0, 2).toUpperCase();

    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // --- REFACTORED ADD ---
  async postComment(content: string, parentId: string | null = null, forceInternal: boolean | null = null) {
    if (!content || content === '<p></p>') return;

    try {
      const { data: { user } } = await this.supabase.getClient().auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const isClient = this.isClient();
      let payload: any = {
        ticket_id: this.ticketId,
        comment: content,
        // If forceInternal is true (relying to internal), enforce it.
        // Otherwise fallback to checkbox or false for clients.
        is_internal: forceInternal === true ? true : (isClient ? false : this.isInternalComment),
        parent_id: parentId // Set parent for reply
      };

      if (isClient) {
        const { data: clientData } = await this.supabase.getClient()
          .from('clients')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();

        if (!clientData) throw new Error('Perfil de cliente no encontrado');
        payload.client_id = clientData.id;
        payload.user_id = null;
      } else {
        payload.user_id = user.id;
      }

      const { error } = await this.supabase.getClient()
        .from('ticket_comments')
        .insert(payload);

      if (error) throw error;

      this.editor?.commands.setContent('');
      // Reset internal check based on config
      this.isInternalComment = this.ticketConfig?.ticket_default_internal_comment || false;
      this.loadComments();
      this.showToast('Comentario añadido', 'success');

      // Auto-assign Logic
      if (!isClient && !this.ticket?.assigned_to && this.ticketConfig?.ticket_auto_assign_on_reply) {
        this.assignTicket(user.id);
      }

    } catch (e: any) {
      console.error('Error adding comment', e);
      if (e.code === '23503') {
        this.showToast('Error de permisos: No puedes comentar en este ticket.', 'error');
      } else {
        this.showToast('Error al añadir comentario: ' + (e?.message || ''), 'error');
      }
    }
  }

  // Wrapper for template
  async addComment() {
    if (this.isSubmitting) return;
    this.isSubmitting = true;
    try {
      const content = this.editor?.getHTML()?.trim() || '';
      await this.postComment(content);
    } finally {
      this.isSubmitting = false;
    }
  }

  // --- Smart Send Actions ---
  showSmartSendDropdown = false;

  get waitingStage() {
    return this.allStages.find(s => s.workflow_category === 'waiting' || s.stage_category === 'on_hold');
  }

  get solvedStage() {
    return this.allStages.find(s => s.workflow_category === 'final' || s.stage_category === 'completed');
  }

  toggleSmartSendDropdown() {
    this.showSmartSendDropdown = !this.showSmartSendDropdown;
  }

  async replyAndSetStage(stageId: string | undefined) {
    if (!stageId) return;
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    // Validar contenido
    const content = this.editor?.getHTML()?.trim() || '';
    if (!content || content === '<p></p>') return;

    try {
      // 1. Enviar comentario
      // Reuse postComment logic but we capture the promise to ensure order
      await this.postComment(content);

      // 2. Cambiar estado
      if (this.ticket && this.ticket.stage_id !== stageId) {
        try {
          await this.ticketsService.updateTicket(this.ticket.id, { stage_id: stageId });
          this.showToast('Estado actualizado automáticamente', 'success');
          // Update local state purely for UI snapiness before reload? 
          // Better to just reload to be safe
          this.loadTicketDetail();
        } catch (error) {
          console.error('Error auto-updating stage:', error);
          this.showToast('Comentario enviado, pero falló el cambio de estado', 'info');
        }
      }
    } catch (e) {
      console.error('Error in smart send:', e);
    } finally {
      this.showSmartSendDropdown = false;
      this.isSubmitting = false;
    }
  }

  // Auto-advance logic for First Open
  async handleFirstOpenAutoAdvance() {
    if (!this.ticket || !this.allStages?.length) return;

    const currentStageIndex = this.allStages.findIndex(s => s.id === this.ticket!.stage_id);
    if (currentStageIndex === -1) return; // Current stage not found?

    // Check if there is a next stage
    if (currentStageIndex < this.allStages.length - 1) {
      const nextStage = this.allStages[currentStageIndex + 1];

      console.log('🚀 Auto-advancing ticket on first open:', nextStage);

      // Update DB
      try {
        const updatePayload = {
          is_opened: true,
          stage_id: nextStage.id
        };
        await this.ticketsService.updateTicket(this.ticket.id, updatePayload);

        // Update Local State
        this.ticket.is_opened = true;
        this.ticket.stage_id = nextStage.id;
        this.ticket.stage = nextStage as any; // Update relation object nicely if possible

        this.showToast(`Ticket abierto: Avanzado a ${nextStage.name}`, 'info');
      } catch (e) {
        console.warn('Error auto-advancing ticket:', e);
        // Fallback: at least mark opened
        this.ticketsService.markTicketOpened(this.ticket.id);
      }
    } else {
      // Is last stage? Just mark opened
      this.ticketsService.markTicketOpened(this.ticket.id);
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
      this.showToast(`Se ha creado el presupuesto a partir del ticket #${(this.ticket as any)?.ticket_number || ''}`, 'success');
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

  // Helper: Check if ticket is in a final/solved state
  isTicketSolved(): boolean {
    return this.ticket?.stage?.workflow_category === 'final' || this.ticket?.stage?.name === 'Solucionado';
  }

  // Client action: Mark ticket as solved
  async markAsSolved() {
    if (!this.ticket) return;

    // Find 'Solucionado' or a final stage
    const solvedStage = this.allStages.find(s =>
      s.name.toLowerCase() === 'solucionado' ||
      s.workflow_category === 'final'
    );

    if (!solvedStage) {
      this.showToast('No se encontró un estado "Solucionado" configurado.', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de que quieres marcar este ticket como solucionado?')) return;

    try {
      this.loading = true;
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: solvedStage.id })
        .eq('id', this.ticket.id);

      if (error) throw error;

      this.showToast('Ticket marcado como solucionado', 'success');
      await this.loadTicketDetail();
    } catch (err: any) {
      this.showToast('Error al actualizar ticket: ' + err.message, 'error');
    } finally {
      this.loading = false;
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
      console.log('🎫 Ticket loaded:', ticketData);
      console.log('🎫 Initial Attachment URL:', ticketData.initial_attachment_url);
      this.ticket = ticketData;

      // UI-level check: does a quote already exist for this ticket?
      try {
        await this.checkActiveQuoteForTicket();
      } catch { }

      // Parallelize independent data loading
      await Promise.all([
        this.loadTicketServices(),
        this.loadTicketProducts(),

        this.loadTicketDevices(),
        this.loadComments()
      ]);

      // Cargar estados visibles (genéricos no ocultos + específicos de empresa)
      try {
        const { data, error } = await this.stagesSvc.getVisibleStages();
        if (error) {
          console.warn('Error cargando estados visibles:', error);
          this.allStages = [];
        } else {
          this.allStages = (data || []).slice().sort((a: any, b: any) => (Number(a?.position ?? 0) - Number(b?.position ?? 0)));

          // --- First Open Auto-Advance ---
          // DISABLED: User requested "First Open" logic to be replaced by "First Staff Comment" logic.
          /*
          if (this.ticket && !this.ticket.is_opened && !this.isClient()) {
            await this.handleFirstOpenAutoAdvance();
          }
           */
          // Ensure it is marked as opened regardless
          if (this.ticket && !this.ticket.is_opened && !this.isClient()) {
            try { this.ticketsService.markTicketOpened(this.ticket.id); } catch { }
          }
        }
      } catch (err) {
        console.warn('Excepción cargando estados visibles:', err);
        this.allStages = [];
      }

      // Load history (timeline)
      await this.loadTicketHistory();


    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
      // Ensure the editor initializes after the DOM renders the *ngIf block
      setTimeout(() => {
        try {
          this.initializeEditor();
        } catch { }
      }, 0);
    }
  }

  async loadTicketHistory() {
    this.recentActivity = [];

    // 1. Initial Creation
    if (this.ticket?.created_at) {
      this.recentActivity.push({
        action: 'Ticket creado',
        created_at: this.ticket.created_at,
        icon: 'fas fa-plus-circle',
        color: 'text-green-500'
      });
    }

    // 2. Fetch history from system comments (Stage changes, file attachments, etc.)
    // We filter for specific system messages to build the timeline
    try {
      const { data: historyComments } = await this.supabase.getClient()
        .from('ticket_comments')
        .select('comment, created_at')
        .eq('ticket_id', this.ticketId)
        .eq('is_internal', true)
        .or('comment.ilike.Cambiado a:%,comment.ilike.Servicio añadido:%,comment.ilike.Archivo adjuntado:%')
        .order('created_at', { ascending: false })
        .limit(20);

      if (historyComments) {
        historyComments.forEach(h => {
          this.recentActivity.push({
            action: h.comment,
            created_at: h.created_at,
            icon: 'fas fa-history', // Default icon
            color: 'text-blue-500'
          });
        });
      }
    } catch (err) {
      console.warn('Error fetching history:', err);
    }

    // 3. Add services from ticket_services creation time (if not covered by comments)
    // We already do this in loadTicketServices, but that pushes to this array.
    // If we want a unified sort, we should sort afterwards.

    // Sort all activity by date descending
    this.recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
        .in('status', ['draft', 'sent', 'viewed', 'accepted'])
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) { this.activeQuoteId = null; return; }
      const found = (data || [])[0];
      this.activeQuoteId = found?.id || null;
    } catch (e) {
      this.activeQuoteId = null;
    }
  }

  async saveStageChange() {
    if (!this.ticket || !this.selectedStageId) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('tickets')
        .update({ stage_id: this.selectedStageId })
        .eq('id', this.ticket.id);
      if (error) throw error;

      // Log timeline history
      const newStage = this.allStages.find(s => s.id === this.selectedStageId);
      if (newStage) {
        await this.addSystemComment(`Cambiado a: ${newStage.name}`);
      }

      await this.loadTicketDetail(); // This will reload activity
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
    try { window.print(); } catch { }
  }

  hasEditorContent(): boolean {
    if (!this.editor) return false;
    const html = this.editor.getHTML().trim();
    const text = this.editor.getText().trim();
    return !!text || /<img\b/i.test(html);
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
      } catch { }

      return url || null;
    } catch (e: any) {
      console.error('Error subiendo imagen pegada:', e);
      this.showToast('Error subiendo imagen', 'error');
      return null;
    } finally {
      this.isUploadingImage = false;
    }
  }

  // Handle file attachment selection from the file input
  async onCommentFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const isImage = file.type.startsWith('image/');

    try {
      this.isUploadingImage = true;
      const url = await this.uploadCommentFile(file);

      if (url && this.editor) {
        if (isImage) {
          // Insert image into editor
          this.editor.chain().focus().setImage({ src: url, alt: file.name } as any).run();
        } else {
          // Insert file as a link with icon
          const fileIcon = this.getFileIcon(file.name);
          const linkHtml = `<a href="${url}" target="_blank" class="inline-flex items-center gap-1 text-blue-600 hover:underline"><i class="${fileIcon}"></i> ${file.name}</a>`;
          this.editor.chain().focus().insertContent(linkHtml).run();
        }
        this.showToast('Archivo adjuntado correctamente', 'success');
      }
    } catch (e) {
      console.error('Error adjuntando archivo:', e);
      this.showToast('Error al adjuntar archivo', 'error');
    } finally {
      this.isUploadingImage = false;
      // Reset input to allow selecting same file again
      input.value = '';
    }
  }

  // Helper to get appropriate icon for file types
  private getFileIcon(filename: string): string {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const icons: Record<string, string> = {
      pdf: 'fas fa-file-pdf',
      doc: 'fas fa-file-word',
      docx: 'fas fa-file-word',
      xls: 'fas fa-file-excel',
      xlsx: 'fas fa-file-excel',
      txt: 'fas fa-file-alt',
      png: 'fas fa-file-image',
      jpg: 'fas fa-file-image',
      jpeg: 'fas fa-file-image',
      gif: 'fas fa-file-image'
    };
    return icons[ext] || 'fas fa-file';
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
        } catch { }
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

  scrollToComment() {
    this.activeTab = 'comments';
    // Small delay to allow tab switch/DOM render
    setTimeout(() => {
      if (this.editorElement && this.editorElement.nativeElement) {
        this.editorElement.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.focusEditor();
      }
    }, 100);
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

      // Add service names to timeline activity (if not already present)
      if (this.ticketServices && this.ticketServices.length > 0) {
        this.ticketServices.forEach((ts: any) => {
          const serviceName = ts?.service?.name;
          const createdAt = ts?.created_at || this.ticket?.updated_at;

          // Check if already exists from system comments to avoid duplicates
          const alreadyExists = this.recentActivity.some(a =>
            a.action.includes(serviceName) &&
            Math.abs(new Date(a.created_at).getTime() - new Date(createdAt).getTime()) < 5000 // 5 sec threshold
          );

          if (serviceName && !alreadyExists) {
            this.recentActivity.push({
              action: `Servicio añadido: ${serviceName}`,
              created_at: createdAt,
              icon: 'fas fa-tools',
              color: 'text-purple-500'
            });
          }
        });
        // Re-sort
        this.recentActivity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    } catch (error) {
      console.error('Error en loadTicketServices:', error);
      this.ticketServices = [];
    }
  }

  // UI helpers
  formatDescription(description?: string): string {
    const text = String(description || '');
    return text
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="mt-2 rounded-lg max-w-full h-auto border border-gray-200 dark:border-gray-700 block" />')
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

  // Status/Stage category helpers (using stage_category from ticket_stages table)
  getStatusClasses(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.classes || this.ticketStatusConfig['open'].classes;
  }

  getStatusLabel(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.label || this.ticketStatusConfig['open'].label;
  }

  getStatusIcon(stageCategory?: string): string {
    const key = stageCategory || 'open';
    return this.ticketStatusConfig[key]?.icon || this.ticketStatusConfig['open'].icon;
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

  // Get current stage color for progress bar styling
  getCurrentStageColor(): string {
    const stage = this.allStages?.find(s => s.id === this.ticket?.stage_id);
    return stage?.color || '#3b82f6'; // Fallback to blue-500
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

  calculateProductsTotal(): number {
    try {
      const items = this.ticketProducts || [];
      return items.reduce((sum: number, productItem: any) => sum + this.getProductLineTotal(productItem), 0);
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

  // ============================================
  // PRODUCTS MANAGEMENT
  // ============================================

  async openProductsModal() {
    try {
      this.showProductsModal = true;
      document.body.classList.add('modal-open');

      // Add to history for back button
      history.pushState({ modal: 'products-modal' }, '');
      if (!this.popStateListener) {
        this.popStateListener = (event: PopStateEvent) => {
          if (this.showProductsModal) this.closeProductsModal();
          else if (this.showServicesModal) this.closeServicesModal();
          else if (this.showDevicesModal) this.closeDevicesModal();
        };
        window.addEventListener('popstate', this.popStateListener);
      }

      // Load products catalog
      this.productsService.getProducts().subscribe({
        next: (products) => {
          this.productsCatalog = products || [];
          this.filteredProducts = [...this.productsCatalog];

          // Pre-select currently assigned products
          this.selectedProductIds.clear();
          this.tempProductQuantities.clear();
          for (const item of this.ticketProducts || []) {
            if (item.product?.id) {
              this.selectedProductIds.add(item.product.id);
              this.tempProductQuantities.set(item.product.id, item.quantity || 1);
            }
          }
        },
        error: (err) => {
          console.error('Error loading products:', err);
          this.showToast('Error cargando productos', 'error');
        }
      });
    } catch (err) {
      console.error('Error opening products modal:', err);
    }
  }

  closeProductsModal() {
    this.showProductsModal = false;
    document.body.classList.remove('modal-open');
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
  }

  filterProductsList() {
    if (!this.productSearchText.trim()) {
      this.filteredProducts = [...this.productsCatalog];
      return;
    }
    const search = this.productSearchText.toLowerCase();
    this.filteredProducts = this.productsCatalog.filter(p =>
      p.name?.toLowerCase().includes(search) ||
      p.brand?.toLowerCase().includes(search) ||
      p.category?.toLowerCase().includes(search)
    );
  }

  toggleProductSelection(product: any) {
    const id = product?.id;
    if (!id) return;
    if (this.selectedProductIds.has(id)) {
      this.selectedProductIds.delete(id);
      this.tempProductQuantities.delete(id);
    } else {
      this.selectedProductIds.add(id);
      this.tempProductQuantities.set(id, 1);
    }
  }

  getProductQuantity(product: any): number {
    return this.tempProductQuantities.get(product?.id) || 1;
  }

  setProductQuantity(product: any, qty: number) {
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    this.tempProductQuantities.set(product?.id, n);
  }

  increaseProductQty(product: any) {
    this.setProductQuantity(product, this.getProductQuantity(product) + 1);
  }

  decreaseProductQty(product: any) {
    this.setProductQuantity(product, Math.max(1, this.getProductQuantity(product) - 1));
  }

  async saveProductsSelection() {
    if (!this.ticket) return;
    try {
      // Build items array
      const items = Array.from(this.selectedProductIds).map(productId => ({
        product_id: productId,
        quantity: this.tempProductQuantities.get(productId) || 1
      }));

      // Get company ID
      const companyId = String((this.ticket as any).company_id || (this.ticket as any).company?.id || '');

      // Use tickets service to save products
      await this.ticketsService.replaceTicketProducts(this.ticket.id, companyId, items);
      await this.loadTicketProducts();

      this.closeProductsModal();
      this.showToast('Productos actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error saving products:', err);
      this.showToast('Error guardando productos: ' + (err?.message || ''), 'error');
    }
  }

  async loadTicketProducts() {
    if (!this.ticket) return;
    try {
      const { data, error } = await this.supabase.getClient()
        .from('ticket_products')
        .select('*, product:products(*)')
        .eq('ticket_id', this.ticket.id);

      if (error) throw error;
      this.ticketProducts = data || [];
    } catch (err) {
      console.error('Error loading ticket products:', err);
      this.ticketProducts = [];
    }
  }

  getProductUnitPrice(item: any): number {
    return item?.price_per_unit ?? item?.product?.price ?? 0;
  }

  getProductLineTotal(item: any): number {
    const qty = Math.max(1, Number(item?.quantity || 1));
    return this.getProductUnitPrice(item) * qty;
  }

  async removeProductFromTicket(productId: string) {
    if (!this.ticket || !confirm('¿Eliminar este producto del ticket?')) return;
    try {
      const { error } = await this.supabase.getClient()
        .from('ticket_products')
        .delete()
        .eq('ticket_id', this.ticket.id)
        .eq('product_id', productId);

      if (error) throw error;
      await this.loadTicketProducts();
      this.showToast('Producto eliminado', 'success');
    } catch (err: any) {
      console.error('Error removing product:', err);
      this.showToast('Error eliminando producto', 'error');
    }
  }

  // ============================================
  // DEVICES MANAGEMENT
  // ============================================

  async openDevicesModal() {
    try {
      this.showDevicesModal = true;
      document.body.classList.add('modal-open');

      // Add to history
      history.pushState({ modal: 'devices-modal' }, '');
      if (!this.popStateListener) {
        this.popStateListener = (event: PopStateEvent) => {
          if (this.showDevicesModal) this.closeDevicesModal();
          else if (this.showProductsModal) this.closeProductsModal();
          else if (this.showServicesModal) this.closeServicesModal();
        };
        window.addEventListener('popstate', this.popStateListener);
      }
      this.lockBodyScroll();

      // Load available devices
      // Filter primarily by client_id to ensure we only show devices belonging to the ticket's client
      const ticketClientId = (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id;

      if (ticketClientId) {
        this.availableDevices = this.companyDevices.filter(d => d.client_id === ticketClientId);
      } else {
        // If no client assigned to ticket yet, show all? Or none? Safe to show all for agent, none for client?
        // User requested: "el usuario sólo liste los dispositivos que pertenencen a ese cliente"
        // If no client, maybe we shouldn't show devices or show all.
        // Let's fallback to all if no client, but if isClient() is strictly enforcing RLS, they only see theirs anyway.
        this.availableDevices = [...this.companyDevices];
      }

      this.filteredDevices = [...this.availableDevices];

      // Pre-select linked devices
      this.selectedDeviceIds = new Set(this.linkedDeviceIds);
    } catch (err) {
      console.error('Error opening devices modal:', err);
    }
  }

  closeDevicesModal() {
    this.showDevicesModal = false;
    this.unlockBodyScroll();
    document.body.classList.remove('modal-open');
    if (window.history.state && window.history.state.modal) {
      window.history.back();
    }
  }

  filterDevicesList() {
    if (!this.deviceSearchText.trim()) {
      this.filteredDevices = [...this.availableDevices];
      return;
    }
    const search = this.deviceSearchText.toLowerCase();
    this.filteredDevices = this.availableDevices.filter(d =>
      d.brand?.toLowerCase().includes(search) ||
      d.model?.toLowerCase().includes(search) ||
      d.device_type?.toLowerCase().includes(search) ||
      d.imei?.toLowerCase().includes(search)
    );
  }

  toggleDeviceSelection(device: Device) {
    const id = device?.id;
    if (!id) return;
    if (this.selectedDeviceIds.has(id)) {
      this.selectedDeviceIds.delete(id);
    } else {
      this.selectedDeviceIds.add(id);
    }
  }

  async saveDevicesSelection() {
    if (!this.ticket) return;
    try {
      // Delete all existing links
      await this.supabase.getClient()
        .from('ticket_devices')
        .delete()
        .eq('ticket_id', this.ticket.id);

      // Insert new links
      if (this.selectedDeviceIds.size > 0) {
        const links = Array.from(this.selectedDeviceIds).map(deviceId => ({
          ticket_id: this.ticket!.id,
          device_id: deviceId
        }));

        const { error } = await this.supabase.getClient()
          .from('ticket_devices')
          .insert(links);

        if (error) throw error;
      }

      await this.loadTicketDevices();
      this.closeDevicesModal();
      this.showToast('Dispositivos actualizados correctamente', 'success');
    } catch (err: any) {
      console.error('Error saving devices:', err);
      this.showToast('Error guardando dispositivos: ' + (err?.message || ''), 'error');
    }
  }

  // ============================================
  // CREATE DEVICE MODAL LOGIC (Ported)
  // ============================================

  openCreateDeviceForm() {
    if (this.isClient()) {
      this.clientDevicesModalMode = 'select';
      this.showClientDevicesModal = true;
      this.lockBodyScroll();
      return;
    }

    this.deviceFormData = {
      // Use ticket's client and company context
      company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id || '',
      status: 'received',
      priority: 'normal',
      brand: '',
      model: '',
      device_type: '',
      reported_issue: '',
      imei: '',
      color: '',
      condition_on_arrival: ''
    };
    this.selectedDeviceImages = [];
    this.showCreateDeviceForm = true;

    this.returnToSelectionModal = this.showDevicesModal;
    this.showDevicesModal = false;
    this.lockBodyScroll();
  }

  cancelCreateDevice() {
    this.showCreateDeviceForm = false;
    this.deviceFormData = {};
    this.selectedDeviceImages = [];
    this.editingDeviceId = null;
    // Restore the selection modal only if we came from there
    if (this.returnToSelectionModal) {
      if (this.isClient()) {
        this.showClientDevicesModal = true;
      } else {
        this.showDevicesModal = true;
      }
    }
    this.unlockBodyScroll();
  }

  toggleDeletedDevices() {
    this.showDeletedDevices = !this.showDeletedDevices;
    this.loadTicketDevices();
  }

  editDevice(device: any) {
    if (this.isClient()) return; // Extra check

    this.editingDeviceId = device.id;
    this.deviceFormData = { ...device }; // Clone data

    this.returnToSelectionModal = this.showDevicesModal;
    this.showDevicesModal = false; // Hide selection modal if open

    this.showCreateDeviceForm = true;
    this.lockBodyScroll();
  }

  closeClientDevicesModalAndEdit(device: any) {
    this.showClientDevicesModal = false;
    this.editDevice(device);
  }

  async deleteConfirmDevice(device: any) {
    if (this.isClient()) return; // Extra check

    const reason = window.prompt('Por favor ingrese el motivo para eliminar el dispositivo ' + device.brand + ' ' + device.model + ':');
    if (reason === null) return; // Cancelled
    if (!reason.trim()) {
      this.showToast('Debe ingresar un motivo para eliminar el dispositivo', 'error');
      return;
    }

    try {
      await this.devicesService.softDeleteDevice(device.id, reason.trim());
      this.showToast('Dispositivo eliminado correctamente', 'success');
      this.loadTicketDevices();
    } catch (error: any) {
      console.error('Error deleting device:', error);
      this.showToast('Error al eliminar el dispositivo: ' + (error.message || error), 'error');
    }
  }

  async createAndSelectDevice() {
    if (!this.deviceFormData.brand || !this.deviceFormData.model ||
      !this.deviceFormData.device_type || !this.deviceFormData.reported_issue) {
      this.showToast('Por favor complete los campos obligatorios', 'error');
      return;
    }

    try {
      let deviceData = {
        ...this.deviceFormData,
        // Ensure authoritative IDs
        client_id: (this.ticket as any)?.client_id || (this.ticket as any)?.client?.id,
        company_id: (this.ticket as any)?.company_id || (this.ticket as any)?.company?.id,
      };

      let resultDevice;

      if (this.editingDeviceId) {
        // Update mode
        delete deviceData.id; // Don't update ID
        delete deviceData.created_at;
        delete deviceData.updated_at; // Let DB handle it or service

        resultDevice = await this.devicesService.updateDevice(this.editingDeviceId, deviceData);
        this.showToast('Dispositivo actualizado correctamente', 'success');
      } else {
        // Create mode
        deviceData = {
          ...deviceData,
          status: 'received',
          priority: 'normal',
          received_at: new Date().toISOString()
        };
        resultDevice = await this.devicesService.createDevice(deviceData);
        this.showToast('Dispositivo creado correctamente', 'success');
      }

      // If we created a new device, we MUST link it to the ticket to get the ticket_device_id
      // This is required for the new image storage structure and association
      let ticketDeviceId: string | undefined;

      if (!this.editingDeviceId && resultDevice && this.ticket?.id) {
        try {
          // Link immediately
          ticketDeviceId = await this.devicesService.linkDeviceToTicket(this.ticket.id, resultDevice.id);
          this.linkedDeviceIds.add(resultDevice.id);

          // Add to local list immediately to reflect stats
          this.companyDevices.push(resultDevice);
          if (this.filteredDevices) this.filteredDevices.unshift(resultDevice);
          this.selectedDeviceIds.add(resultDevice.id);
        } catch (linkError) {
          console.error('Error auto-linking created device:', linkError);
          this.showToast('Dispositivo creado pero error al vincular: ' + (linkError as Error).message, 'error');
        }
      } else if (this.editingDeviceId && this.ticket?.id) {
        // If editing, we might already have a link. We need to find the ticket_device_id.
        // Since we don't have it handy, we might need to fetch it or skip passing it if acceptable for updates.
        // But strict requirement says "asociar y mostrar en el ticket".
        // If we are editing, standard flow assumes it's already linked or we don't care about re-linking.
        // But for images, we ideally want them associated with this ticket context.
        // Let's try to find the link id from the loaded devices?
        // The current `availableDevices` or `companyDevices` are simple Device objects.
        // `getTicketDevices` returns devices with media, but maybe not the link ID directly visible?
        // `getTicketDevices` joins `ticket_devices`, but strict typing returns `Device[]`.
        // We might need to query it or just pass ticketId for path structure at least.
        // For now, let's pass ticketId for path structure. ticketDeviceId might be skipped for updates if too complex to fetch synchronously.
      }

      // Upload images if any (works for both create and update)
      if (this.selectedDeviceImages.length > 0) {
        for (const imageData of this.selectedDeviceImages) {
          try {
            await this.devicesService.uploadDeviceImage(
              resultDevice.id,
              imageData.file,
              'arrival',
              'Estado del dispositivo',
              ticketDeviceId, // Pass specific link ID if we have it (newly created)
              this.ticketId || this.ticket?.id, // Pass ticket ID for folder structure (prefer ID from route)
              { brand: resultDevice.brand, model: resultDevice.model } // deviceInfo for naming
            );
          } catch (imageError) {
            console.error('Error uploading device image:', imageError);
          }
        }
      }

      // Refresh list and close
      this.loadTicketDevices(); // Refresh ticket devices list (this will fetch the new media)
      this.cancelCreateDevice();

      // If we were editing, we don't necessarily need to "select" it for the ticket because it's already there.
      // But if we created it, we usually want to link it.
      // Wait, createAndSelectDevice was originally called from the SELECTION modal.
      // If we are in edit mode, we might have been called from the LIST directly.
      // The current logic in `cancelCreateDevice` re-opens `showDevicesModal`.
      // If we edited from the LIST, we probably don't want to open the selection modal.
      // But for now, keeping it simple is safer.
      // However, if we edit from the list, opening the selection modal is annoying.

      // Let's improve cancelCreateDevice logic later if needed. For now, let's assume sticking to the existing flow is acceptable MVP.
      // But wait! If I add "Edit" button to the MAIN LIST (Ticket Detail Tab), and I edit, then Save/Cancel...
      // `cancelCreateDevice` will open `showDevicesModal`. That is unintended behavior if I didn't come from there.
      // I need to know where I came from.
      // But the variable `showDevicesModal` was toggled.
      // If I come from list, `showDevicesModal` is false initially.
      // `openCreateDeviceForm` sets `showDevicesModal = false`.
      // `cancelCreateDevice` sets `showDevicesModal = true`.
      // This forces the modal open.

      // I should modify `openCreateDeviceForm` and `cancelCreateDevice` to handle source?
      // Or just check if it was open?
      // `showDevicesModal` is the visibility state.
      // I can add `returnToSelectionModal: boolean = false`.

      // I will add that property in the next step to fix the flow.

      // Refresh list and close
      // this.loadTicketDevices(); // Already called above

      // this.linkedDeviceIds.add(resultDevice.id); // Already handled in the new block above

      // Auto-select if created -> Logic moved up to "Link immediately" block using resultDevice
      if (this.editingDeviceId && resultDevice) {
        // Update local list
        const idx = this.companyDevices.findIndex(d => d.id === resultDevice.id);
        if (idx !== -1) this.companyDevices[idx] = resultDevice;
      }

      this.showToast(this.editingDeviceId ? 'Dispositivo actualizado' : 'Dispositivo creado y seleccionado', 'success');
      this.cancelCreateDevice();

    } catch (error: any) {
      console.error('Error processing device:', error);
      this.showToast('Error al procesar el dispositivo: ' + (error.message || error), 'error');
    }
  }

  onDeviceImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      Array.from(input.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.selectedDeviceImages.push({
              file: file,
              preview: e.target?.result as string
            });
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }

  removeDeviceImage(index: number) {
    this.selectedDeviceImages.splice(index, 1);
  }
}
