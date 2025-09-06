import { Component, signal, computed, OnInit, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import {
  Workflow,
  WorkflowNode,
  NodeLibraryItem,
  WorkflowTemplate
} from '../../models/workflow.interface';

interface CanvasPosition {
  x: number;
  y: number;
}

interface DragState {
  isDragging: boolean;
  nodeType?: string;
  startPos?: CanvasPosition;
  currentPos?: CanvasPosition;
  draggedNode?: WorkflowNode;
}

@Component({
  selector: 'app-workflow-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full bg-gray-50 flex">
      <!-- Sidebar con Librería de Nodos -->
      <div class="w-80 bg-white border-r border-gray-200 flex flex-col">
        <!-- Header del Sidebar -->
        <div class="p-4 border-b border-gray-200">
          <h2 class="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <i class="bi bi-diagram-3 text-blue-600"></i>
            Constructor de Workflows
          </h2>
          <p class="text-sm text-gray-600 mt-1">Arrastra nodos al canvas para crear tu workflow</p>
        </div>

        <!-- Controles del Workflow -->
        <div class="p-4 border-b border-gray-200 bg-gray-50">
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre del Workflow</label>
              <input
                type="text"
                [(ngModel)]="workflowName"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                placeholder="Mi Workflow Automático"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <textarea
                [(ngModel)]="workflowDescription"
                rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                placeholder="Describe lo que hace este workflow..."
              ></textarea>
            </div>
            <div class="flex gap-2">
              <button
                (click)="saveWorkflow()"
                [disabled]="!canSave()"
                class="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                <i class="bi bi-save mr-1"></i>
                Guardar
              </button>
              <button
                (click)="clearCanvas()"
                class="flex-1 px-3 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                <i class="bi bi-trash mr-1"></i>
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <!-- Plantillas -->
        <div class="p-4 border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <i class="bi bi-collection text-purple-600"></i>
            Plantillas
          </h3>
          <div class="space-y-2">
            @for (template of templates(); track template.id) {
              <div
                (click)="loadTemplate(template)"
                class="p-3 border border-gray-200 rounded-md hover:border-purple-300 hover:bg-purple-50 cursor-pointer transition-all group"
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <h4 class="text-sm font-medium text-gray-900 group-hover:text-purple-700 mb-1">
                      {{ template.name }}
                    </h4>
                    <p class="text-xs text-gray-600 line-clamp-2">{{ template.description }}</p>
                    <div class="flex items-center gap-2 mt-2">
                      <span class="inline-block px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                        {{ template.difficulty }}
                      </span>
                      <span class="text-xs text-gray-500">
                        <i class="bi bi-clock mr-1"></i>{{ template.estimatedSetupTime }}min
                      </span>
                    </div>
                  </div>
                  <i class="bi bi-arrow-right text-gray-400 group-hover:text-purple-600 transition-colors"></i>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Librería de Nodos -->
        <div class="flex-1 p-4 overflow-y-auto">
          <h3 class="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <i class="bi bi-puzzle text-green-600"></i>
            Librería de Nodos
          </h3>
          
          @for (category of nodeCategories(); track category) {
            <div class="mb-4">
              <h4 class="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                {{ getCategoryLabel(String(category)) }}
              </h4>
              <div class="space-y-2">
                @for (node of getNodesByCategory(String(category)); track node.type + node.name) {
                  <div
                    class="node-item p-3 border border-gray-200 rounded-md hover:border-gray-300 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all"
                    [attr.data-node-type]="node.type"
                    [attr.data-node-config]="getNodeConfig(node)"
                    draggable="true"
                    (dragstart)="onNodeDragStart($event, node)"
                    (dragend)="onNodeDragEnd($event)"
                  >
                    <div class="flex items-center gap-3">
                      <div 
                        class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm {{ node.color }}"
                      >
                        <i class="{{ node.icon }}"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <h5 class="text-sm font-medium text-gray-900">{{ node.name }}</h5>
                        <p class="text-xs text-gray-600 line-clamp-2">{{ node.description }}</p>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Canvas Principal -->
      <div class="flex-1 flex flex-col">
        <!-- Toolbar -->
        <div class="bg-white border-b border-gray-200 p-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <button
                  (click)="zoomIn()"
                  class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Zoom In"
                >
                  <i class="bi bi-zoom-in"></i>
                </button>
                <span class="text-sm text-gray-600 min-w-[60px] text-center">{{ Math.round(zoom() * 100) }}%</span>
                <button
                  (click)="zoomOut()"
                  class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Zoom Out"
                >
                  <i class="bi bi-zoom-out"></i>
                </button>
                <button
                  (click)="resetZoom()"
                  class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Reset Zoom"
                >
                  <i class="bi bi-fullscreen"></i>
                </button>
              </div>
              
              <div class="h-6 w-px bg-gray-300"></div>
              
              <div class="flex items-center gap-2">
                <button
                  (click)="toggleGrid()"
                  [class]="gridVisible() ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'"
                  class="p-2 rounded-md transition-colors"
                  title="Toggle Grid"
                >
                  <i class="bi bi-grid"></i>
                </button>
                <button
                  (click)="autoLayout()"
                  class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                  title="Auto Layout"
                >
                  <i class="bi bi-arrows-angle-expand"></i>
                </button>
              </div>
            </div>

            <!-- Workflow Info -->
            <div class="flex items-center gap-4">
              @if (currentWorkflow()) {
                <div class="flex items-center gap-2 text-sm text-gray-600">
                  <i class="bi bi-diagram-3"></i>
                  <span>{{ canvasNodes().length }} nodos</span>
                  <span class="text-gray-400">•</span>
                  <span>{{ getConnectionCount() }} conexiones</span>
                </div>
              }
              
              @if (canSave()) {
                <button
                  (click)="testWorkflow()"
                  class="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                >
                  <i class="bi bi-play-circle mr-2"></i>
                  Probar Workflow
                </button>
              }
            </div>
          </div>
        </div>

        <!-- Canvas -->
        <div class="flex-1 relative overflow-hidden bg-gray-100">
          <div
            #canvas
            class="absolute inset-0 workflow-canvas"
            [style.transform]="'scale(' + zoom() + ') translate(' + panOffset().x + 'px, ' + panOffset().y + 'px)'"
            [style.transform-origin]="'0 0'"
            (drop)="onCanvasDrop($event)"
            (dragover)="onCanvasDragOver($event)"
            (mousedown)="onCanvasMouseDown($event)"
            (mousemove)="onCanvasMouseMove($event)"
            (mouseup)="onCanvasMouseUp($event)"
          >
            <!-- Grid Background -->
            @if (gridVisible()) {
              <div class="absolute inset-0 pointer-events-none">
                <svg class="w-full h-full">
                  <defs>
                    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" stroke-width="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>
            }

            <!-- Conexiones -->
            <svg class="absolute inset-0 pointer-events-none" style="z-index: 1;">
              @for (connection of connections(); track connection.id) {
                <path
                  [attr.d]="connection.path"
                  fill="none"
                  stroke="#6b7280"
                  stroke-width="2"
                  stroke-linecap="round"
                  marker-end="url(#arrowhead)"
                />
              }
              
              <!-- Definir marcador de flecha -->
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                        refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
                </marker>
              </defs>
            </svg>

            <!-- Nodos en el Canvas -->
            @for (node of canvasNodes(); track node.id) {
              <div
                class="absolute workflow-node cursor-move"
                [style.left.px]="node.position.x"
                [style.top.px]="node.position.y"
                [style.z-index]="selectedNode()?.id === node.id ? 10 : 2"
                (mousedown)="onNodeMouseDown($event, node)"
                (click)="selectNode(node)"
              >
                <div 
                  class="relative bg-white rounded-lg shadow-lg border-2 transition-all"
                  [class]="selectedNode()?.id === node.id ? 'border-blue-500 shadow-xl' : 'border-gray-200 hover:border-gray-300'"
                >
                  <!-- Conexión de Entrada -->
                  <div 
                    class="absolute -left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-gray-400 border-2 border-white rounded-full cursor-pointer hover:bg-blue-500 transition-colors"
                    [class]="node.type === 'trigger' ? 'hidden' : ''"
                    (mouseenter)="showConnectionPoint(node.id, 'input')"
                    (mouseleave)="hideConnectionPoint()"
                  ></div>

                  <!-- Contenido del Nodo -->
                  <div class="p-4 min-w-[200px]">
                    <div class="flex items-center gap-3 mb-2">
                      <div 
                        class="w-10 h-10 rounded-lg flex items-center justify-center text-white {{ node.data.color }}"
                      >
                        <i class="{{ node.data.icon }}"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-900 text-sm">{{ node.data.title }}</h4>
                        @if (node.data.description) {
                          <p class="text-xs text-gray-600 line-clamp-2">{{ node.data.description }}</p>
                        }
                      </div>
                      <button
                        (click)="removeNode(node.id); $event.stopPropagation()"
                        class="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <i class="bi bi-x-lg text-sm"></i>
                      </button>
                    </div>

                    <!-- Configuración del Nodo -->
                    @if (node.data.config && hasVisibleConfig(node)) {
                      <div class="text-xs text-gray-600 space-y-1">
                        @if (node.type === 'condition') {
                          <div>{{ getConditionDisplay(node) }}</div>
                        } @else if (node.type === 'action') {
                          <div>{{ getActionDisplay(node) }}</div>
                        } @else if (node.type === 'delay') {
                          <div>{{ getDelayDisplay(node) }}</div>
                        }
                      </div>
                    }
                  </div>

                  <!-- Conexión de Salida -->
                  <div 
                    class="absolute -right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-gray-400 border-2 border-white rounded-full cursor-pointer hover:bg-blue-500 transition-colors"
                    (mousedown)="startConnection($event, node.id)"
                    (mouseenter)="showConnectionPoint(node.id, 'output')"
                    (mouseleave)="hideConnectionPoint()"
                  ></div>

                  <!-- Conexiones Especiales para Condiciones -->
                  @if (node.type === 'condition') {
                    <!-- Conexión True (Verde) -->
                    <div 
                      class="absolute -right-2 top-1/4 transform -translate-y-1/2 w-4 h-4 bg-green-500 border-2 border-white rounded-full cursor-pointer hover:bg-green-600 transition-colors"
                      (mousedown)="startConnection($event, node.id, 'true')"
                      title="Condición Verdadera"
                    ></div>
                    <!-- Conexión False (Roja) -->
                    <div 
                      class="absolute -right-2 top-3/4 transform -translate-y-1/2 w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-pointer hover:bg-red-600 transition-colors"
                      (mousedown)="startConnection($event, node.id, 'false')"
                      title="Condición Falsa"
                    ></div>
                  }
                </div>
              </div>
            }

            <!-- Línea de Conexión Temporal -->
            @if (connectingFrom()) {
              <svg class="absolute inset-0 pointer-events-none" style="z-index: 5;">
                <path
                  [attr.d]="tempConnectionPath()"
                  fill="none"
                  stroke="#3b82f6"
                  stroke-width="2"
                  stroke-dasharray="5,5"
                  stroke-linecap="round"
                />
              </svg>
            }
          </div>

          <!-- Empty State -->
          @if (canvasNodes().length === 0) {
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div class="text-center">
                <i class="bi bi-diagram-3 text-6xl text-gray-300 mb-4"></i>
                <h3 class="text-lg font-medium text-gray-600 mb-2">Canvas Vacío</h3>
                <p class="text-gray-500 max-w-md">
                  Arrastra nodos desde la librería para comenzar a construir tu workflow automatizado
                </p>
                <div class="mt-4 text-sm text-gray-400">
                  💡 <strong>Tip:</strong> Comienza con un nodo "Trigger" para definir cuándo se ejecuta el workflow
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Modal de Configuración de Nodo -->
    @if (configNode()) {
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <div class="p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-semibold text-gray-900">
                Configurar {{ configNode()?.data?.title || 'Nodo' }}
              </h3>
              <button
                (click)="closeConfig()"
                class="text-gray-400 hover:text-gray-600"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            
            <div class="space-y-4">
              <!-- Aquí iría el formulario de configuración dinámico -->
              <div class="text-sm text-gray-600">
                Configuración del nodo en desarrollo...
              </div>
            </div>

            <div class="flex justify-end gap-3 mt-6">
              <button
                (click)="closeConfig()"
                class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
              <button
                (click)="saveNodeConfig()"
                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .workflow-canvas {
      min-width: 2000px;
      min-height: 2000px;
    }

    .workflow-node {
      user-select: none;
    }

    .node-item:hover {
      transform: translateY(-1px);
    }

    .line-clamp-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Estilos para conexiones suaves */
    .workflow-connection {
      transition: stroke 0.2s ease;
    }

    .workflow-connection:hover {
      stroke: #3b82f6;
      stroke-width: 3;
    }
  `]
})
export class WorkflowBuilderComponent implements OnInit {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLDivElement>;

  // Add Math reference for template
  Math = Math;
  String = String;

  // Reactive state
  workflowName = signal('');
  workflowDescription = signal('');
  currentWorkflow = signal<Workflow | null>(null);
  canvasNodes = signal<WorkflowNode[]>([]);
  selectedNode = signal<WorkflowNode | null>(null);
  configNode = signal<WorkflowNode | null>(null);

  // Canvas state
  zoom = signal(1);
  panOffset = signal({ x: 0, y: 0 });
  gridVisible = signal(true);

  // Drag & Drop state
  isDragging = signal(false);
  dragOffset = signal({ x: 0, y: 0 });
  
  // Connection state
  connectingFrom = signal<{ nodeId: string; type?: string } | null>(null);
  mousePosition = signal({ x: 0, y: 0 });

  // Service data - initialized in constructor
  templates!: any;
  nodeLibrary!: any;

  // Computed values
  nodeCategories = computed(() => {
    const categories = new Set(this.nodeLibrary().map((node: NodeLibraryItem) => node.category));
    return Array.from(categories);
  });

  connections = computed(() => {
    const nodes = this.canvasNodes();
    const connections: Array<{ id: string; path: string }> = [];
    
    nodes.forEach(node => {
      node.connections.forEach(targetId => {
        const targetNode = nodes.find(n => n.id === targetId);
        if (targetNode) {
          const startX = node.position.x + 200; // Ancho del nodo
          const startY = node.position.y + 50; // Centro del nodo
          const endX = targetNode.position.x;
          const endY = targetNode.position.y + 50;
          
          const midX = (startX + endX) / 2;
          const path = `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`;
          
          connections.push({
            id: `${node.id}-${targetId}`,
            path
          });
        }
      });
    });
    
    return connections;
  });

  tempConnectionPath = computed(() => {
    const connecting = this.connectingFrom();
    if (!connecting) return '';
    
    const nodes = this.canvasNodes();
    const sourceNode = nodes.find(n => n.id === connecting.nodeId);
    if (!sourceNode) return '';
    
    const startX = sourceNode.position.x + 200;
    const startY = sourceNode.position.y + 50;
    const endX = this.mousePosition().x;
    const endY = this.mousePosition().y;
    
    const midX = (startX + endX) / 2;
    return `M ${startX} ${startY} C ${midX} ${startY} ${midX} ${endY} ${endX} ${endY}`;
  });

  constructor(
    private workflowService: WorkflowService,
    private router: Router
  ) {
    // Initialize service data
    this.templates = this.workflowService.templates$;
    this.nodeLibrary = this.workflowService.nodeLibrary$;

    // Track mouse position for temporary connections
    effect(() => {
      const handleMouseMove = (e: MouseEvent) => {
        this.mousePosition.set({ x: e.clientX, y: e.clientY });
      };
      
      if (this.connectingFrom()) {
        document.addEventListener('mousemove', handleMouseMove);
        return () => document.removeEventListener('mousemove', handleMouseMove);
      }
      return () => {};
    });
  }

  ngOnInit() {
    this.initializeNewWorkflow();
  }

  // Workflow Management
  initializeNewWorkflow() {
    this.workflowName.set('Nuevo Workflow');
    this.workflowDescription.set('');
    this.canvasNodes.set([]);
    this.selectedNode.set(null);
    this.currentWorkflow.set(null);
  }

  saveWorkflow() {
    if (!this.canSave()) return;

    const workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'statistics'> = {
      name: this.workflowName(),
      description: this.workflowDescription(),
      enabled: false,
      createdBy: 'current_user',
      category: 'custom',
      nodes: this.canvasNodes()
    };

    try {
      const workflowId = this.workflowService.createWorkflow(workflow);
      console.log('✅ Workflow guardado:', workflowId);
      
      // Redirigir a la lista de workflows
      this.router.navigate(['/workflows']);
    } catch (error) {
      console.error('❌ Error guardando workflow:', error);
    }
  }

  testWorkflow() {
    if (!this.canSave()) return;

    // Create a temporary workflow for testing
    const workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'statistics'> = {
      name: 'Test - ' + this.workflowName(),
      description: this.workflowDescription(),
      enabled: true,
      createdBy: 'current_user',
      category: 'custom',
      nodes: this.canvasNodes()
    };

    try {
      const workflowId = this.workflowService.createWorkflow(workflow);
      
      // Execute the workflow with test data
      this.workflowService.executeWorkflow(workflowId, {
        ticketId: 'TEST-001',
        priority: 'high',
        category: 'hardware',
        status: 'open'
      }).then(executionId => {
        console.log('🚀 Workflow ejecutado para prueba:', executionId);
      }).catch(error => {
        console.error('❌ Error ejecutando workflow:', error);
      });
    } catch (error) {
      console.error('❌ Error creando workflow de prueba:', error);
    }
  }

  clearCanvas() {
    this.canvasNodes.set([]);
    this.selectedNode.set(null);
    this.connectingFrom.set(null);
  }

  canSave() {
    return this.workflowName().trim().length > 0 && this.canvasNodes().length > 0;
  }

  // Template Management
  loadTemplate(template: WorkflowTemplate) {
    this.workflowName.set(template.name);
    this.workflowDescription.set(template.description);
    this.canvasNodes.set([...template.nodes]);
    this.selectedNode.set(null);
  }

  // Node Library Management
  getNodesByCategory(category: string): NodeLibraryItem[] {
    return this.nodeLibrary().filter((node: NodeLibraryItem) => node.category === category);
  }

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      triggers: 'Disparadores',
      conditions: 'Condiciones',
      actions: 'Acciones',
      utilities: 'Utilidades'
    };
    return labels[category] || category;
  }

  getNodeConfig(node: NodeLibraryItem): string {
    return JSON.stringify(node.defaultConfig);
  }

  // Drag & Drop
  onNodeDragStart(event: DragEvent, node: NodeLibraryItem) {
    if (!event.dataTransfer) return;
    
    event.dataTransfer.setData('application/json', JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'copy';
  }

  onNodeDragEnd(event: DragEvent) {
    // Cleanup if needed
  }

  onCanvasDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }

  onCanvasDrop(event: DragEvent) {
    event.preventDefault();
    
    const data = event.dataTransfer?.getData('application/json');
    if (!data) return;
    
    try {
      const nodeTemplate: NodeLibraryItem = JSON.parse(data);
      const rect = this.canvasRef.nativeElement.getBoundingClientRect();
      const x = (event.clientX - rect.left) / this.zoom() - this.panOffset().x;
      const y = (event.clientY - rect.top) / this.zoom() - this.panOffset().y;
      
      this.createNodeFromTemplate(nodeTemplate, { x, y });
    } catch (error) {
      console.error('Error processing drop:', error);
    }
  }

  createNodeFromTemplate(template: NodeLibraryItem, position: CanvasPosition) {
    const newNode: WorkflowNode = {
      id: this.generateId(),
      type: template.type,
      position,
      connections: [],
      data: {
        title: template.name,
        description: template.description,
        icon: template.icon,
        color: template.color,
        config: { ...template.defaultConfig }
      }
    };

    this.canvasNodes.update(nodes => [...nodes, newNode]);
    this.selectNode(newNode);
  }

  // Node Management
  selectNode(node: WorkflowNode) {
    this.selectedNode.set(node);
  }

  removeNode(nodeId: string) {
    this.canvasNodes.update(nodes => nodes.filter(n => n.id !== nodeId));
    
    // Remove connections to this node
    this.canvasNodes.update(nodes =>
      nodes.map(node => ({
        ...node,
        connections: node.connections.filter(id => id !== nodeId)
      }))
    );

    if (this.selectedNode()?.id === nodeId) {
      this.selectedNode.set(null);
    }
  }

  // Node Configuration
  hasVisibleConfig(node: WorkflowNode): boolean {
    return node.data.config && Object.keys(node.data.config).length > 0;
  }

  getConditionDisplay(node: WorkflowNode): string {
    const config = node.data.config as any;
    return `${config.field} ${config.operator} ${config.value}`;
  }

  getActionDisplay(node: WorkflowNode): string {
    const config = node.data.config as any;
    return `Acción: ${config.actionType}`;
  }

  getDelayDisplay(node: WorkflowNode): string {
    const config = node.data.config as any;
    return `Esperar ${config.duration} ${config.delayType}`;
  }

  // Canvas Controls
  zoomIn() {
    this.zoom.update(z => Math.min(z * 1.2, 3));
  }

  zoomOut() {
    this.zoom.update(z => Math.max(z / 1.2, 0.3));
  }

  resetZoom() {
    this.zoom.set(1);
    this.panOffset.set({ x: 0, y: 0 });
  }

  toggleGrid() {
    this.gridVisible.update(visible => !visible);
  }

  autoLayout() {
    // Simple auto-layout algorithm
    const nodes = this.canvasNodes();
    if (nodes.length === 0) return;

    const spacing = 250;
    let currentX = 100;
    let currentY = 100;

    // Find trigger nodes first
    const triggerNodes = nodes.filter(n => n.type === 'trigger');
    const otherNodes = nodes.filter(n => n.type !== 'trigger');

    const updatedNodes = [...nodes];

    // Position trigger nodes
    triggerNodes.forEach((node, index) => {
      const nodeIndex = updatedNodes.findIndex(n => n.id === node.id);
      if (nodeIndex >= 0) {
        updatedNodes[nodeIndex] = {
          ...node,
          position: { x: currentX, y: currentY + (index * spacing) }
        };
      }
    });

    // Position other nodes in a grid
    let gridX = currentX + spacing;
    let gridY = currentY;
    
    otherNodes.forEach((node, index) => {
      const nodeIndex = updatedNodes.findIndex(n => n.id === node.id);
      if (nodeIndex >= 0) {
        updatedNodes[nodeIndex] = {
          ...node,
          position: { x: gridX, y: gridY }
        };
        
        gridY += spacing;
        if (gridY > currentY + (spacing * 3)) {
          gridY = currentY;
          gridX += spacing;
        }
      }
    });

    this.canvasNodes.set(updatedNodes);
  }

  // Node Connections
  startConnection(event: MouseEvent, nodeId: string, type?: string) {
    event.stopPropagation();
    this.connectingFrom.set({ nodeId, type });
  }

  showConnectionPoint(nodeId: string, type: 'input' | 'output') {
    // Visual feedback for connection points
  }

  hideConnectionPoint() {
    // Hide visual feedback
  }

  // Canvas Mouse Events
  onCanvasMouseDown(event: MouseEvent) {
    if (event.target === this.canvasRef.nativeElement) {
      this.selectedNode.set(null);
    }
  }

  onCanvasMouseMove(event: MouseEvent) {
    // Handle canvas panning if needed
  }

  onCanvasMouseUp(event: MouseEvent) {
    if (this.connectingFrom()) {
      this.connectingFrom.set(null);
    }
  }

  onNodeMouseDown(event: MouseEvent, node: WorkflowNode) {
    event.stopPropagation();
    // Start node dragging
  }

  // Configuration Modal
  closeConfig() {
    this.configNode.set(null);
  }

  saveNodeConfig() {
    // Save node configuration
    this.closeConfig();
  }

  // Utility Methods
  getConnectionCount(): number {
    return this.canvasNodes().reduce((count, node) => count + node.connections.length, 0);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}
