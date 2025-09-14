import { Component, signal, computed, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ExportImportService } from '../../services/export-import.service';
import {
  ExportConfig,
  ImportConfig,
  ExportJob,
  ImportJob,
  FileUpload,
  ExportTemplate,
  ImportTemplate,
  ExportEntityType,
  ImportEntityType,
  ExportFormat,
  ImportFormat,
  DragDropZone
} from '../../models/export-import.interface';

@Component({
  selector: 'app-export-import-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full bg-gray-50">
      <!-- Header -->
      <div class="bg-white border-b border-gray-200 px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <i class="bi bi-arrow-left-right text-blue-600"></i>
              Export & Import Manager
            </h1>
            <p class="text-gray-600 mt-1">Gestiona la exportación e importación de datos del sistema</p>
          </div>
          
          <div class="flex items-center gap-3">
            <!-- Quick Actions -->
            <div class="flex items-center gap-2">
              <button
                (click)="showQuickExport.set(true)"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <i class="bi bi-download"></i>
                Exportación Rápida
              </button>
              <button
                (click)="triggerFileInput()"
                class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <i class="bi bi-upload"></i>
                Importación Rápida
              </button>
            </div>
          </div>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div class="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-4 text-white">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-blue-100 text-sm">Total Exportaciones</p>
                <p class="text-2xl font-bold">{{ stats().totalExports }}</p>
              </div>
              <i class="bi bi-download text-3xl text-blue-200"></i>
            </div>
          </div>
          
          <div class="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 text-white">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-green-100 text-sm">Total Importaciones</p>
                <p class="text-2xl font-bold">{{ stats().totalImports }}</p>
              </div>
              <i class="bi bi-upload text-3xl text-green-200"></i>
            </div>
          </div>
          
          <div class="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-4 text-white">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-purple-100 text-sm">Tasa de Éxito</p>
                <p class="text-2xl font-bold">{{ Math.round(stats().successRate) }}%</p>
              </div>
              <i class="bi bi-check-circle text-3xl text-purple-200"></i>
            </div>
          </div>
          
          <div class="bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg p-4 text-white">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-orange-100 text-sm">Servicios Activos</p>
                <p class="text-2xl font-bold">{{ activeJobs().length }}</p>
              </div>
              <i class="bi bi-clock text-3xl text-orange-200"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex h-full">
        <!-- Sidebar -->
        <div class="w-80 bg-white border-r border-gray-200 flex flex-col">
          <!-- Tab Navigation -->
          <div class="flex border-b border-gray-200">
            <button
              (click)="activeTab.set('export')"
              [class]="activeTab() === 'export' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
              class="flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors"
            >
              <i class="bi bi-download mr-2"></i>
              Exportar
            </button>
            <button
              (click)="activeTab.set('import')"
              [class]="activeTab() === 'import' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'"
              class="flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors"
            >
              <i class="bi bi-upload mr-2"></i>
              Importar
            </button>
          </div>

          <!-- Export Tab Content -->
          @if (activeTab() === 'export') {
            <div class="flex-1 overflow-y-auto">
              <!-- Export Templates -->
              <div class="p-4">
                <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i class="bi bi-collection text-blue-600"></i>
                  Plantillas de Exportación
                </h3>
                
                <div class="space-y-3">
                  @for (template of exportTemplates(); track template.id) {
                    <div
                      (click)="createExportFromTemplate(template)"
                      class="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all group"
                    >
                      <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg {{ template.color }} flex items-center justify-center text-white">
                          <i class="{{ template.icon }}"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                          <h4 class="font-medium text-gray-900 group-hover:text-blue-700">{{ template.name }}</h4>
                          <p class="text-sm text-gray-600 line-clamp-2 mt-1">{{ template.description }}</p>
                          <div class="flex items-center gap-2 mt-2">
                            <span class="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                              {{ template.format.toUpperCase() }}
                            </span>
                            <span class="text-xs text-gray-500">
                              <i class="bi bi-star-fill text-yellow-400 mr-1"></i>{{ template.popularity }}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                </div>

                <!-- Custom Export Button -->
                <button
                  (click)="startCustomExport()"
                  class="w-full mt-4 p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <i class="bi bi-plus-circle mr-2"></i>
                  Crear Exportación Personalizada
                </button>
              </div>
            </div>
          }

          <!-- Import Tab Content -->
          @if (activeTab() === 'import') {
            <div class="flex-1 overflow-y-auto">
              <!-- Drag & Drop Zone -->
              <div class="p-4">
                <div
                  #dropZone
                  (drop)="onFileDrop($event)"
                  (dragover)="onDragOver($event)"
                  (dragleave)="onDragLeave($event)"
                  [class]="isDragging() ? 'border-blue-500 bg-blue-50' : 'border-gray-300'"
                  class="border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-50"
                  (click)="triggerFileInput()"
                >
                  <div class="space-y-3">
                    <i class="bi bi-cloud-upload text-4xl text-gray-400"></i>
                    <div>
                      <p class="text-lg font-medium text-gray-700">Arrastra archivos aquí</p>
                      <p class="text-sm text-gray-500">o haz clic para seleccionar</p>
                    </div>
                    <div class="flex items-center justify-center gap-2 text-xs text-gray-500">
                      <span class="px-2 py-1 bg-gray-100 rounded">CSV</span>
                      <span class="px-2 py-1 bg-gray-100 rounded">JSON</span>
                      <span class="px-2 py-1 bg-gray-100 rounded">XLSX</span>
                      <span class="px-2 py-1 bg-gray-100 rounded">XML</span>
                    </div>
                  </div>
                </div>

                <!-- File Input -->
                <input
                  #fileInput
                  type="file"
                  multiple
                  accept=".csv,.json,.xlsx,.xls,.xml"
                  (change)="onFileSelect($event)"
                  class="hidden"
                >
              </div>

              <!-- Import Templates -->
              <div class="p-4 border-t border-gray-200">
                <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <i class="bi bi-collection text-green-600"></i>
                  Plantillas de Importación
                </h3>
                
                <div class="space-y-3">
                  @for (template of importTemplates(); track template.id) {
                    <div
                      (click)="createImportFromTemplate(template)"
                      class="p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 cursor-pointer transition-all group"
                    >
                      <div class="flex items-start gap-3">
                        <div class="w-10 h-10 rounded-lg {{ template.color }} flex items-center justify-center text-white">
                          <i class="{{ template.icon }}"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                          <h4 class="font-medium text-gray-900 group-hover:text-green-700">{{ template.name }}</h4>
                          <p class="text-sm text-gray-600 line-clamp-2 mt-1">{{ template.description }}</p>
                          <div class="flex items-center gap-2 mt-2">
                            <span class="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                              {{ template.format.toUpperCase() }}
                            </span>
                            <span class="text-xs text-gray-500">
                              <i class="bi bi-star-fill text-yellow-400 mr-1"></i>{{ template.popularity }}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Main Panel -->
        <div class="flex-1 flex flex-col">
          <!-- Jobs Header -->
          <div class="bg-white border-b border-gray-200 px-6 py-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900">
                @if (activeTab() === 'export') {
                  Servicios de Exportación
                } @else {
                  Servicios de Importación
                }
              </h2>
              
              <div class="flex items-center gap-3">
                <!-- Refresh Button -->
                <button
                  (click)="refreshJobs()"
                  class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Actualizar"
                >
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
                
                <!-- Filter Dropdown -->
                <select
                  [(ngModel)]="jobFilter"
                  class="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Todos los servicios</option>
                  <option value="running">En progreso</option>
                  <option value="completed">Completados</option>
                  <option value="failed">Fallidos</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Jobs List -->
          <div class="flex-1 overflow-y-auto p-6">
            @if (filteredJobs().length === 0) {
              <div class="text-center py-12">
                <i class="bi bi-inbox text-6xl text-gray-300 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-600 mb-2">No hay servicios</h3>
                <p class="text-gray-500">
                  @if (activeTab() === 'export') {
                    Crea tu primera exportación usando las plantillas de la izquierda
                  } @else {
                    Arrastra un archivo o usa una plantilla para comenzar
                  }
                </p>
              </div>
            } @else {
              <div class="space-y-4">
                @for (job of filteredJobs(); track job.id) {
                  <div class="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                          <!-- Status Icon -->
                          @if (job.status === 'running') {
                            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <i class="bi bi-arrow-clockwise text-blue-600 animate-spin"></i>
                            </div>
                          } @else if (job.status === 'completed') {
                            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <i class="bi bi-check-circle text-green-600"></i>
                            </div>
                          } @else if (job.status === 'failed') {
                            <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                              <i class="bi bi-x-circle text-red-600"></i>
                            </div>
                          } @else {
                            <div class="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                              <i class="bi bi-clock text-gray-600"></i>
                            </div>
                          }
                          
                          <div>
                            <h3 class="font-semibold text-gray-900">
                              @if (isExportJob(job)) {
                                {{ getExportJobName(job) }}
                              } @else {
                                {{ job.fileName }}
                              }
                            </h3>
                            <p class="text-sm text-gray-600">
                              Iniciado {{ formatDate(job.startedAt) }}
                              @if (job.completedAt) {
                                • Completado {{ formatDate(job.completedAt) }}
                              }
                            </p>
                          </div>
                        </div>

                        <!-- Progress Info -->
                        <div class="mt-4">
                          @if (isExportJob(job)) {
                            <div class="flex items-center gap-6 text-sm">
                              <span class="text-gray-600">
                                <i class="bi bi-file-text mr-1"></i>
                                {{ job.recordsExported }} registros exportados
                              </span>
                              @if (job.fileSize) {
                                <span class="text-gray-600">
                                  <i class="bi bi-file-earmark mr-1"></i>
                                  {{ formatFileSize(job.fileSize) }}
                                </span>
                              }
                            </div>
                          } @else {
                            <div class="flex items-center gap-6 text-sm">
                              <span class="text-gray-600">
                                <i class="bi bi-file-text mr-1"></i>
                                {{ job.recordsProcessed }} procesados
                              </span>
                              <span class="text-green-600">
                                <i class="bi bi-check mr-1"></i>
                                {{ job.recordsImported }} importados
                              </span>
                              @if (job.recordsFailed > 0) {
                                <span class="text-red-600">
                                  <i class="bi bi-x mr-1"></i>
                                  {{ job.recordsFailed }} fallidos
                                </span>
                              }
                            </div>
                          }
                        </div>

                        <!-- Errors -->
                        @if (job.errors.length > 0) {
                          <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                            <p class="text-sm font-medium text-red-800 mb-1">
                              <i class="bi bi-exclamation-triangle mr-1"></i>
                              {{ job.errors.length }} error(es)
                            </p>
                            <div class="text-sm text-red-700">
                              @for (error of job.errors.slice(0, 2); track error.id) {
                                <p>• {{ error.message }}</p>
                              }
                              @if (job.errors.length > 2) {
                                <p class="font-medium">y {{ job.errors.length - 2 }} más...</p>
                              }
                            </div>
                          </div>
                        }
                      </div>

                      <!-- Actions -->
                      <div class="flex items-center gap-2 ml-4">
                        @if (isExportJob(job) && job.status === 'completed' && job.downloadUrl) {
                          <button
                            (click)="downloadExport(job.id)"
                            class="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                          >
                            <i class="bi bi-download mr-1"></i>
                            Descargar
                          </button>
                        }
                        
                        @if (job.status === 'running') {
                          <button
                            (click)="cancelJob(job.id)"
                            class="px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                          >
                            <i class="bi bi-stop mr-1"></i>
                            Cancelar
                          </button>
                        }
                        
                        <button
                          (click)="viewJobDetails(job)"
                          class="px-3 py-2 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
                        >
                          <i class="bi bi-eye mr-1"></i>
                          Detalles
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Upload Progress Modal -->
      @if (fileUploads().length > 0) {
        <div class="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <div class="p-4 border-b border-gray-200">
            <h3 class="font-semibold text-gray-900 flex items-center gap-2">
              <i class="bi bi-cloud-upload text-blue-600"></i>
              Subiendo archivos
            </h3>
          </div>
          <div class="max-h-64 overflow-y-auto">
            @for (upload of fileUploads(); track upload.id) {
              <div class="p-4 border-b border-gray-100 last:border-b-0">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-sm font-medium text-gray-900 truncate">{{ upload.file.name }}</span>
                  <span class="text-xs text-gray-500">{{ upload.progress }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    [style.width.%]="upload.progress"
                  ></div>
                </div>
                @if (upload.error) {
                  <p class="text-xs text-red-600 mt-1">{{ upload.error }}</p>
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Quick Export Modal -->
      @if (showQuickExport()) {
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div class="p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-gray-900">Exportación Rápida</h3>
                <button
                  (click)="showQuickExport.set(false)"
                  class="text-gray-400 hover:text-gray-600"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              </div>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Tipo de Datos</label>
                  <select
                    [(ngModel)]="quickExportEntity"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="customers">Clientes</option>
                    <option value="tickets">Tickets</option>
                    <option value="products">Productos</option>
                    <option value="works">Servicios</option>
                  </select>
                </div>
                
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-2">Formato</label>
                  <select
                    [(ngModel)]="quickExportFormat"
                    class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                    <option value="xlsx">Excel (XLSX)</option>
                  </select>
                </div>
              </div>

              <div class="flex justify-end gap-3 mt-6">
                <button
                  (click)="showQuickExport.set(false)"
                  class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  (click)="executeQuickExport()"
                  class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Exportar
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .animate-spin {
      animation: spin 1s linear infinite;
    }
  `]
})
export class ExportImportManagerComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('dropZone') dropZone!: ElementRef<HTMLDivElement>;

  // Add Math reference for template
  Math = Math;

  // Reactive state
  activeTab = signal<'export' | 'import'>('export');
  isDragging = signal(false);
  jobFilter = signal<'all' | 'running' | 'completed' | 'failed'>('all');
  showQuickExport = signal(false);
  quickExportEntity = signal<ExportEntityType>('customers');
  quickExportFormat = signal<ExportFormat>('csv');

  // Service data - initialized in constructor
  exportTemplates!: any;
  importTemplates!: any;
  exportJobs!: any;
  importJobs!: any;
  fileUploads!: any;
  stats!: any;

  // Computed values
  activeJobs = computed(() => {
    const allJobs = [...this.exportJobs(), ...this.importJobs()];
    return allJobs.filter(job => job.status === 'running' || job.status === 'pending');
  });

  filteredJobs = computed(() => {
    const jobs = this.activeTab() === 'export' ? this.exportJobs() : this.importJobs();
    const filter = this.jobFilter();
    
    if (filter === 'all') {
      return jobs.sort((a: any, b: any) => b.startedAt.getTime() - a.startedAt.getTime());
    }
    
    return jobs
      .filter((job: any) => job.status === filter)
      .sort((a: any, b: any) => b.startedAt.getTime() - a.startedAt.getTime());
  });

  constructor(
    private exportImportService: ExportImportService,
    private router: Router
  ) {
    // Initialize service data
    this.exportTemplates = this.exportImportService.exportTemplates$;
    this.importTemplates = this.exportImportService.importTemplates$;
    this.exportJobs = this.exportImportService.exportJobs$;
    this.importJobs = this.exportImportService.importJobs$;
    this.fileUploads = this.exportImportService.fileUploads$;
    this.stats = this.exportImportService.exportImportStats;
  }

  ngOnInit() {
    console.log('🚀 Export/Import Manager inicializado');
  }

  // Quick Export
  executeQuickExport() {
    this.exportImportService.quickExport(this.quickExportEntity(), this.quickExportFormat())
      .then(jobId => {
        console.log('✅ Exportación rápida iniciada:', jobId);
        this.showQuickExport.set(false);
      })
      .catch(error => {
        console.error('❌ Error en exportación rápida:', error);
      });
  }

  // Template Management
  createExportFromTemplate(template: ExportTemplate) {
    try {
      const configId = this.exportImportService.createExportFromTemplate(
        template.id, 
        `${template.name} - ${new Date().toLocaleDateString()}`
      );
      
      this.exportImportService.executeExport(configId)
        .then(jobId => {
          console.log('✅ Exportación desde plantilla iniciada:', jobId);
        })
        .catch(error => {
          console.error('❌ Error ejecutando exportación:', error);
        });
    } catch (error) {
      console.error('❌ Error creando exportación desde plantilla:', error);
    }
  }

  createImportFromTemplate(template: ImportTemplate) {
    console.log('📝 Plantilla de importación seleccionada:', template.name);
    // TODO: Open import configuration wizard
  }

  startCustomExport() {
    console.log('🛠️ Iniciando exportación personalizada');
    // TODO: Open export configuration wizard
  }

  // File Upload
  triggerFileInput() {
    try {
      console.log('export-import: triggerFileInput called, activeTab=', this.activeTab());
      // Ensure import tab is active so the file input is present in DOM
      if (this.activeTab() !== 'import') {
        console.log('export-import: switching to import tab before opening file input');
        this.activeTab.set('import');
        // Give Angular a tick to render the import tab DOM
        setTimeout(() => {
          try {
            console.log('export-import: clicking file input after tab switch', this.fileInput?.nativeElement);
            this.fileInput.nativeElement.click();
          } catch (err2) {
            console.error('export-import: failed clicking file input after tab switch', err2);
          }
        }, 50);
        return;
      }

      console.log('export-import: clicking file input directly', this.fileInput?.nativeElement);
      this.fileInput.nativeElement.click();
    } catch (err) {
      console.error('export-import: triggerFileInput failed', err);
    }
  }

  onFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      this.handleFiles(Array.from(target.files));
    }
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    
    if (event.dataTransfer?.files) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  private async handleFiles(files: File[]) {
    console.log('📁 Procesando archivos:', files.map(f => f.name));
    
    for (const file of files) {
      try {
        const uploadId = await this.exportImportService.uploadFile(file);
        console.log('✅ Archivo subido:', uploadId);
        
        // Auto-start import for common formats
        setTimeout(() => {
          this.exportImportService.executeImport(uploadId)
            .then(jobId => {
              console.log('✅ Importación iniciada:', jobId);
            })
            .catch(error => {
              console.error('❌ Error en importación:', error);
            });
        }, 1000);
        
      } catch (error) {
        console.error('❌ Error subiendo archivo:', error);
      }
    }
  }

  // Job Management
  downloadExport(jobId: string) {
    try {
      this.exportImportService.downloadExportFile(jobId);
      console.log('📥 Descarga iniciada para servicio:', jobId);
    } catch (error) {
      console.error('❌ Error descargando archivo:', error);
    }
  }

  cancelJob(jobId: string) {
    this.exportImportService.cancelJob(jobId);
    console.log('🛑 Servicio cancelado:', jobId);
  }

  viewJobDetails(job: ExportJob | ImportJob) {
    console.log('👁️ Viendo detalles del servicio:', job);
    // TODO: Open job details modal
  }

  refreshJobs() {
    console.log('🔄 Actualizando lista de servicios');
    // Force refresh - could call service methods if needed
  }

  // Utility methods
  isExportJob(job: ExportJob | ImportJob): job is ExportJob {
    return 'configId' in job && 'recordsExported' in job;
  }

  getExportJobName(job: ExportJob): string {
    // In a real implementation, you'd look up the config name
    return `Exportación ${job.id.slice(-6)}`;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}
