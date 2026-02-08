import { Component, EventEmitter, Input, Output, inject, signal, ViewChild, ElementRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractsService, ContractTemplate } from '../../../../../../app/core/services/contracts.service';
import { ToastService } from '../../../../../../app/services/toast.service';

@Component({
  selector: 'app-contract-creation-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <!-- Header -->
        <div class="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center bg-gray-50 dark:bg-slate-800/50">
          <div class="flex items-center gap-4 flex-1">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">Crear Contrato</h2>
            <div class="h-6 w-px bg-gray-300 dark:bg-slate-600 mx-2"></div>
            <input 
              type="text" 
              [(ngModel)]="contractTitle" 
              class="bg-transparent border-none focus:ring-0 text-lg font-medium text-gray-700 dark:text-gray-200 w-full max-w-md placeholder-gray-400"
              placeholder="Título del contrato (ej. Contrato de Servicios)...">
          </div>
          <button (click)="close.emit()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <!-- Main Body -->
        <div class="flex-1 flex overflow-hidden">
          
          <!-- Sidebar (Tools) -->
          <div class="w-80 bg-gray-50 dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col">
            
            <!-- Template Selector -->
            <div class="p-4 border-b border-gray-200 dark:border-slate-700">
              <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Cargar Plantilla</label>
              <select 
                [ngModel]="selectedTemplateId()" 
                (ngModelChange)="onTemplateSelect($event)"
                class="w-full rounded-lg border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                [disabled]="isLoading()">
                <option value="">-- Seleccionar --</option>
                <option *ngFor="let t of templates()" [value]="t.id">{{ t.name }}</option>
              </select>
            </div>

            <!-- Draggable Items -->
            <div class="flex-1 overflow-y-auto p-4 space-y-6">
              
              <!-- Variables -->
              <div>
                <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                  <i class="fas fa-tags mr-1"></i> Variables
                </label>
                <div class="space-y-2">
                  <div *ngFor="let v of variables" 
                    draggable="true" 
                    (dragstart)="onDragStart($event, 'variable', v.value)"
                    class="p-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg cursor-move hover:border-blue-500 hover:shadow-sm transition-all flex items-center gap-2 group">
                    <div class="w-6 h-6 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">
                      <i class="fas fa-code"></i>
                    </div>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ v.label }}</span>
                    <i class="fas fa-grip-vertical ml-auto text-gray-300 group-hover:text-gray-500"></i>
                  </div>
                </div>
              </div>

              <!-- Blocks -->
              <div>
                <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">
                  <i class="fas fa-cubes mr-1"></i> Bloques
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <div *ngFor="let b of blocks" 
                    draggable="true" 
                    (dragstart)="onDragStart($event, 'block', b.content)"
                    class="p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg cursor-move hover:border-purple-500 hover:shadow-sm transition-all text-center group">
                    <i [class]="b.icon + ' text-2xl mb-2 text-gray-400 group-hover:text-purple-500 transition-colors'"></i>
                    <div class="text-xs font-medium text-gray-600 dark:text-gray-400">{{ b.label }}</div>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Editor Area -->
          <div class="flex-1 flex flex-col bg-gray-100 dark:bg-slate-950/50 p-8 overflow-y-auto">
            <div class="max-w-[210mm] mx-auto w-full bg-white dark:bg-slate-800 shadow-xl min-h-[297mm] p-[20mm] relative">
              
              <!-- Editable Content -->
              <div 
                #editor
                contenteditable="true"
                class="w-full h-full outline-none prose dark:prose-invert max-w-none"
                (input)="onContentChange()"
                (mousedown)="onEditorMouseDown($event)"
                (dragstart)="onEditorDragStart($event)"
                (drop)="onDrop($event)"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)">
              </div>

              <!-- Placeholder hint if empty -->
              <div *ngIf="!contractContent" class="absolute top-[20mm] left-[20mm] text-gray-300 dark:text-gray-600 pointer-events-none text-xl font-medium">
                Comienza a escribir o arrastra elementos aquí...
              </div>

            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-center">
          <div class="text-sm text-gray-500">
            <span *ngIf="lastSaved">Guardado a las {{ lastSaved | date:'mediumTime' }}</span>
          </div>
          
          <div class="flex gap-3">
             <button 
              (click)="saveAsTemplate()" 
              [disabled]="isSaving() || !isValid()"
              class="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2">
              <i class="fas fa-save"></i> Guardar como Plantilla
            </button>
            <div class="h-8 w-px bg-gray-200 dark:bg-slate-700 mx-2"></div>
            <button (click)="close.emit()" class="px-5 py-2 text-gray-700 dark:text-gray-300 font-medium hover:text-gray-900 transition-colors">
              Cancelar
            </button>
            <button 
              (click)="createContract()" 
              [disabled]="!isValid() || isSaving()"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <i class="fas fa-paper-plane" *ngIf="!isSaving()"></i>
              <i class="fas fa-spinner fa-spin" *ngIf="isSaving()"></i>
              {{ isSaving() ? 'Procesando...' : 'Crear y Enviar' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    /* Estilos básicos para el editor simulando página A4 */
    .prose { font-family: 'Inter', sans-serif; line-height: 1.6; }
    .prose h1 { font-size: 2em; font-weight: 700; margin-bottom: 0.5em; }
    .prose h2 { font-size: 1.5em; font-weight: 600; margin-bottom: 0.5em; }
    .prose p { margin-bottom: 1em; }
    .prose ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 1em; }
    /* Visual cues for blocks */
     .prose > *:not([contenteditable="false"]) {
      position: relative;
      border: 1px dashed rgba(148, 163, 184, 0.4);
      margin-bottom: 0.5em;
      padding: 4px;
      padding-left: 24px; /* Space for handle */
      border-radius: 4px;
      transition: all 0.2s;
    }

     .prose > *:not([contenteditable="false"]):hover {
      border-color: #64748b;
      background-color: rgba(148, 163, 184, 0.1);
    }

    /* Drag Handle visual */
     .prose > *:not([contenteditable="false"]):hover::before {
      content: '⋮⋮'; 
      position: absolute;
      left: 4px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      cursor: grab;
      font-size: 14px;
      font-weight: bold;
      line-height: 1;
      width: 16px;
      text-align: center;
      user-select: none;
    }
    
     .prose > *:hover::after {
      content: attr(data-label);
      position: absolute;
      top: -1.2em;
      right: 0;
      background: #475569;
      color: white;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      pointer-events: none;
      white-space: nowrap;
      z-index: 10;
    }

    /* Fallbacks */
     .prose h1:not([data-label]):hover::after { content: "Título H1"; }
     .prose h2:not([data-label]):hover::after { content: "Subtítulo H2"; }
     .prose p:not([data-label]):hover::after { content: "Párrafo"; }
     .prose ul:not([data-label]):hover::after { content: "Lista"; }
     .prose div:not([data-label]):hover::after { content: "Bloque"; }
    `],
  encapsulation: ViewEncapsulation.None
})
export class ContractCreationDialogComponent {
  @Input({ required: true }) clientId!: string;
  @Input({ required: true }) companyId!: string;
  @Input() clientName: string = '';
  @Input() clientEmail: string = '';

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  contractsService = inject(ContractsService);
  toast = inject(ToastService);

  @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;

  templates = signal<ContractTemplate[]>([]);
  selectedTemplateId = signal<string>('');

  contractTitle = '';
  contractContent = '';
  lastSaved: Date | null = null;

  isLoading = signal(false);
  isSaving = signal(false);

  draggedElement: HTMLElement | null = null;
  dragPlaceholder: HTMLElement | null = null;
  draggingType: 'variable' | 'block' | null = null;

  // Sidebar items
  variables = [
    { label: 'Nombre Cliente', value: '{{client_name}}' },
    { label: 'Email Cliente', value: '{{client_email}}' },
    { label: 'Fecha Actual', value: '{{today_date}}' },
    { label: 'Empresa', value: '{{company_name}}' }, // Placeholder for future
  ];

  blocks = [
    { label: 'Título Grande', icon: 'fas fa-heading', content: '<h1 data-label="Título H1">Título del Contrato</h1>' },
    { label: 'Subtítulo', icon: 'fas fa-font', content: '<h2 data-label="Subtítulo">Sección Importante</h2>' },
    { label: 'Párrafo', icon: 'fas fa-paragraph', content: '<p data-label="Párrafo">Escribe aquí los términos del contrato...</p>' },
    { label: 'Lista', icon: 'fas fa-list-ul', content: '<ul data-label="Lista"><li>Cláusula 1</li><li>Cláusula 2</li></ul>' },
    { label: 'Firma', icon: 'fas fa-signature', content: '<div data-label="Firma" style="margin-top: 50px; border-top: 1px solid #ccc; width: 200px; padding-top: 10px;">Firma del Cliente</div>' },
  ];

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.isLoading.set(true);
    this.contractsService.getTemplates(this.companyId).subscribe({
      next: (data) => {
        this.templates.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading templates', err);
        this.toast.error('Error', 'No se pudieron cargar las plantillas');
        this.isLoading.set(false);
      }
    });
  }

  onTemplateSelect(templateId: string) {
    this.selectedTemplateId.set(templateId);
    const template = this.templates().find(t => t.id === templateId);

    if (template) {
      if (!this.contractTitle) {
        this.contractTitle = template.name;
      }
      this.contractContent = template.content_html;

      // Update editor DOM directly to avoid binding issues
      if (this.editorRef) {
        this.editorRef.nativeElement.innerHTML = this.contractContent;
      }
    }
  }

  // Drag and Drop Logic
  onDragStart(event: DragEvent, type: 'variable' | 'block', content: string) {
    this.draggingType = type;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', content);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault(); // Allow dropping
    if (event.dataTransfer) {
      // Check if we are reordering (internal) vs new drop (sidebar)
      if (this.draggedElement) {
        event.dataTransfer.dropEffect = 'move';
      } else {
        event.dataTransfer.dropEffect = 'copy';
      }
    }

    // Don't show block placeholder for variables (they are inline)
    if (this.draggingType === 'variable') {
      this.removePlaceholder();
      return;
    }

    this.showPlaceholder(event);
  }

  onDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const editorEl = this.editorRef?.nativeElement;

    if (editorEl && (!relatedTarget || !editorEl.contains(relatedTarget) && relatedTarget !== editorEl)) {
      this.removePlaceholder();
    }
  }

  showPlaceholder(event: DragEvent) {
    const editorEl = this.editorRef?.nativeElement;
    if (!editorEl) return;

    if (!this.dragPlaceholder) {
      this.dragPlaceholder = document.createElement('div');
      this.dragPlaceholder.className = 'drag-placeholder';
      // Rounded, filled style
      this.dragPlaceholder.style.border = '2px dashed #93c5fd'; // Light blue dashed
      this.dragPlaceholder.style.height = '40px'; // Occupy space like a block
      this.dragPlaceholder.style.margin = '12px 0';
      this.dragPlaceholder.style.borderRadius = '8px'; // Rounded
      this.dragPlaceholder.style.backgroundColor = 'rgba(219, 234, 254, 0.4)'; // Light blue fill
      this.dragPlaceholder.style.pointerEvents = 'none';
      this.dragPlaceholder.setAttribute('contenteditable', 'false');
      this.dragPlaceholder.innerHTML = '<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #3b82f6; font-size: 0.8rem; font-weight: 500;">Soltar bloque aquí</div>';
    }

    const target = event.target as HTMLElement;
    let closestBlock = target;
    while (closestBlock && closestBlock.parentElement !== editorEl && closestBlock !== editorEl) {
      if (closestBlock.parentElement) closestBlock = closestBlock.parentElement;
      else break;
    }

    if (closestBlock && closestBlock.parentElement === editorEl && closestBlock !== this.dragPlaceholder && closestBlock !== this.draggedElement) {
      const rect = closestBlock.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (event.clientY < midY) {
        editorEl.insertBefore(this.dragPlaceholder, closestBlock);
      } else {
        editorEl.insertBefore(this.dragPlaceholder, closestBlock.nextSibling);
      }
    } else if (target === editorEl) {
      const children = Array.from(editorEl.children);
      const lastChild = children[children.length - 1];
      if (!lastChild || event.clientY > lastChild.getBoundingClientRect().bottom) {
        editorEl.appendChild(this.dragPlaceholder);
      }
    }
  }

  removePlaceholder() {
    if (this.dragPlaceholder && this.dragPlaceholder.parentElement) {
      this.dragPlaceholder.parentElement.removeChild(this.dragPlaceholder);
    }
    this.dragPlaceholder = null;
  }

  // Editor Internal Drag Logic
  onEditorMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Walk up to find the block (direct child of editor)
    let block = target;
    const editorEl = this.editorRef?.nativeElement;

    while (block && block.parentElement !== editorEl && block !== editorEl) {
      if (block.parentElement) block = block.parentElement;
      else break;
    }

    // Only proceed if we found a block inside the editor
    if (block && block.parentElement === editorEl) {
      // Check if click is in the "handle" area (left side padding)
      const rect = block.getBoundingClientRect();
      const clickX = event.clientX - rect.left;

      if (clickX <= 24) {
        // Clicked on handle area -> Enable drag
        block.setAttribute('draggable', 'true');
      } else {
        // Clicked on content -> Disable drag to allow text selection
        block.removeAttribute('draggable');
      }
    }
  }

  onEditorDragStart(event: DragEvent) {
    const target = event.target as HTMLElement;
    if (target.getAttribute('draggable') === 'true') {
      this.draggedElement = target;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-simplifica-reorder', 'true');
        this.draggingType = 'block'; // Internal drag is always a block (or we assume so for now)
      }
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation(); // Stop bubbling

    const editorEl = this.editorRef?.nativeElement;
    if (!editorEl) return;

    let insertBeforeNode: Node | null = null;
    let appendToEnd = false;

    if (this.dragPlaceholder && this.dragPlaceholder.parentElement === editorEl) {
      insertBeforeNode = this.dragPlaceholder.nextSibling;
      if (!insertBeforeNode) {
        appendToEnd = true;
      }
    }

    this.removePlaceholder();

    // Case 1: Reordering an internal block
    if (this.draggedElement) {
      if (appendToEnd) {
        editorEl.appendChild(this.draggedElement);
      } else if (insertBeforeNode) {
        editorEl.insertBefore(this.draggedElement, insertBeforeNode);
      } else {
        editorEl.appendChild(this.draggedElement);
      }

      this.draggedElement.removeAttribute('draggable');
      this.draggedElement = null;
      this.onContentChange();
      return;
    }

    // Case 2: New item from sidebar
    const content = event.dataTransfer?.getData('text/plain');

    if (content) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      const newElement = tempDiv.firstElementChild;

      if (newElement) {
        if (appendToEnd) {
          editorEl.appendChild(newElement);
        } else if (insertBeforeNode) {
          editorEl.insertBefore(newElement, insertBeforeNode);
        } else {
          editorEl.appendChild(newElement);
        }

        this.onContentChange();
      } else {
        if (content.trim().startsWith('{{')) {
          this.insertAtCursor(content);
          this.onContentChange();
          this.draggingType = null;
          return;
        }
        document.execCommand('insertHTML', false, content);
        this.onContentChange();
      }
    }
    this.draggingType = null;
  }

  insertAtCursor(text: string) {
    if (window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
      }
    }
  }

  onContentChange() {
    if (this.editorRef) {
      this.contractContent = this.editorRef.nativeElement.innerHTML;
    }
  }

  replacePlaceholders(content: string): string {
    let processed = content;
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    processed = processed.replace(new RegExp('{{client_name}}', 'g'), this.clientName || 'Cliente');
    processed = processed.replace(new RegExp('{{client_email}}', 'g'), this.clientEmail || '');
    processed = processed.replace(new RegExp('{{today_date}}', 'g'), dateStr);
    // Add more placeholders defaults here

    return processed;
  }

  isValid(): boolean {
    return !!this.contractTitle && !!this.contractContent && this.contractContent.length > 10;
  }

  saveAsTemplate() {
    if (!this.contractTitle) {
      this.toast.error('Error', 'Debes poner un título para guardar la plantilla');
      return;
    }

    const name = prompt('Nombre de la plantilla:', this.contractTitle);
    if (!name) return;

    this.isSaving.set(true);
    this.contractsService.createTemplate({
      company_id: this.companyId,
      name: name,
      content_html: this.contractContent
    }).subscribe({
      next: (newTemplate) => {
        this.toast.success('Guardado', 'Plantilla guardada correctamente');
        this.loadTemplates(); // Reload to show new template
        this.selectedTemplateId.set(newTemplate.id || '');
        this.isSaving.set(false);
      },
      error: (err) => {
        console.error('Error saving template', err);
        this.toast.error('Error', 'No se pudo guardar la plantilla');
        this.isSaving.set(false);
      }
    });
  }

  createContract() {
    if (!this.isValid()) return;

    this.isSaving.set(true);

    // Process placeholders BEFORE sending
    const finalContent = this.replacePlaceholders(this.contractContent);

    this.contractsService.createContract({
      company_id: this.companyId,
      client_id: this.clientId,
      title: this.contractTitle,
      content_html: finalContent,
      status: 'sent'
    }).subscribe({
      next: () => {
        this.toast.success('Éxito', 'Contrato creado y enviado correctamente');
        this.created.emit();
        this.close.emit();
      },
      error: (err) => {
        console.error('Error creating contract', err);
        this.toast.error('Error', 'No se pudo crear el contrato');
        this.isSaving.set(false);
      }
    });
  }
}
