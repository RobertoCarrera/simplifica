import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { SupabaseTicketStagesService, TicketStage, CreateStagePayload, UpdateStagePayload } from '../../../services/supabase-ticket-stages.service';
import { TextContrastPipe } from '../../../pipes/text-contrast.pipe';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-stages-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DragDropModule, TextContrastPipe],
  template: `
    <!-- Header -->
    <div class="mb-6">
      <div class="flex justify-between items-center mb-4">
        <button class="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" routerLink="/configuracion" title="Volver a Configuración">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2"><i class="fas fa-globe"></i> Estados del Sistema</h3>
          <button
            class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            (click)="hideAllSystemStages()"
            [disabled]="hidingAllGenericStages"
            title="Ocultar todos los estados del sistema"
            [style.color]="newStage.color | textContrast"
            [style.background-color]="(newStage.color | textContrast) === '#000' ? '#fff' : '#000'"
          >
            <i class="fas fa-eye-slash mr-1"></i> Ocultar Todos
          </button>
        </div>
        <p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4 flex items-center gap-2">
          <i class="fas fa-info-circle"></i>
          Estados predeterminados. Puedes reordenarlos arrastrando (solo los visibles; los ocultos quedan al final) y ocultarlos si no las necesitas.
        </p>
        <div 
          class="grid grid-cols-1 md:grid-cols-2 gap-4 relative" 
          cdkDropList 
          [cdkDropListData]="visibleGenericStages" 
          (cdkDropListDropped)="onDropGeneric($event)"
          cdkDropListSortingDisabled="false"
          [cdkDropListAutoScrollDisabled]="false"
        >
          @for (stage of visibleGenericStages; track stage.id) {
            <div
              class="flex items-center gap-3 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md"
              cdkDrag
              [style.background-color]="stage.color"
              [style.color]="stage.color | textContrast"
            >
              <div class="cursor-grab p-2 flex items-center justify-center transition-colors hover:text-blue-600 active:cursor-grabbing" cdkDragHandle [style.color]="stage.color | textContrast">
                <i class="fas fa-grip-vertical"></i>
              </div>

              <ng-template cdkDragPreview>
                <div class="flex items-center gap-3 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md drag-preview" [style.background-color]="stage.color" [style.color]="stage.color | textContrast">
                  <div class="cursor-grab p-2 flex items-center justify-center transition-colors hover:text-blue-600 active:cursor-grabbing" [style.color]="stage.color | textContrast">
                    <i class="fas fa-grip-vertical"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-2">
                      <div class="font-semibold text-gray-900">{{ stage.name }}</div>
                      <div class="flex gap-1">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          [style.color]="stage.color | textContrast"
                          [style.background-color]="(stage.color | textContrast) === '#000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'">
                          Pos: {{ stage.position }}
                        </span>
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          [style.color]="stage.color | textContrast"
                          [style.background-color]="(stage.color | textContrast) === '#000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'">
                          Sistema
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </ng-template>

              <ng-template cdkDragPlaceholder>
                <div class="flex items-center gap-3 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md placeholder bg-transparent border-dashed border-2 border-blue-500 opacity-0 min-h-[84px] scale-95 transition-all duration-200"></div>
              </ng-template>

              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">{{ stage.name }}</div>
                <div class="flex gap-1 mt-1">
                  <span
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                    [style.color]="stage.color | textContrast"
                    [style.background-color]="(stage.color | textContrast) === '#000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'">
                    Posición: {{ stage.position }}
                  </span>
                </div>
              </div>

              <div class="ml-auto flex gap-2">
                <button
                  class="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                  (click)="hideStage(stage)"
                  [disabled]="!!togglingVisibilityById[stage.id]"
                  title="Ocultar este estado"
                  (mouseenter)="setBtnHover(stage.id, true)"
                  (mouseleave)="setBtnHover(stage.id, false)"
                  [style.color]="stage.color | textContrast"
                  [style.background-color]="btnHoverById[stage.id] ? ((stage.color | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'"
                >
                  <i class="fas fa-eye-slash"></i>
                </button>
              </div>
            </div>
          }
        </div>
        @if (hiddenGenericStages.length > 0) {
          <div class="my-6 border-t border-gray-100 pt-4 flex items-center gap-2 text-sm font-medium text-gray-500">
            <button
              class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              (click)="toggleHiddenGenerics()"
              [attr.aria-expanded]="!hiddenGenericsCollapsed"
              (mouseenter)="setBtnHover('hidden-toggle', true)"
              (mouseleave)="setBtnHover('hidden-toggle', false)"
              [style.color]="btnHoverById['hidden-toggle'] ? ((((newStage.color || '#6366f1') | textContrast) === '#000') ? '#fff' : '#000') : ((newStage.color || '#6366f1') | textContrast)"
              [style.background-color]="btnHoverById['hidden-toggle'] ? ((((newStage.color || '#6366f1') | textContrast) === '#000') ? '#000' : '#fff') : ((((newStage.color || '#6366f1') | textContrast) === '#000') ? 'transparent' : '#000')"
            >
              <i class="fas mr-1" [class.fa-chevron-down]="hiddenGenericsCollapsed" [class.fa-chevron-up]="!hiddenGenericsCollapsed"></i>
              Estados ocultos ({{ hiddenGenericStages.length }})
            </button>
          </div>
          @if (!hiddenGenericsCollapsed) {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 hidden-list">
              @for (stage of hiddenGenericStages; track stage.id) {
                  <div class="flex items-center gap-3 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md opacity-60 bg-gray-50" [style.background-color]="stage.color" [style.color]="stage.color | textContrast">
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold truncate">{{ stage.name }}</div>
                      <div class="flex gap-1 mt-1">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                          [style.color]="stage.color | textContrast"
                          [style.background-color]="(stage.color | textContrast) === '#000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'">
                          Posición: {{ stage.position }}
                        </span>
                      </div>
                    </div>
                    <div class="ml-auto flex gap-2">
                      <button
                        class="w-9 h-9 flex items-center justify-center rounded-md transition-colors"
                        (click)="unhideStage(stage)"
                        [disabled]="!!togglingVisibilityById[stage.id]"
                        title="Mostrar este estado"
                        (mouseenter)="setBtnHover(stage.id + '-unhide', true)"
                        (mouseleave)="setBtnHover(stage.id + '-unhide', false)"
                        [style.color]="stage.color | textContrast"
                        [style.background-color]="btnHoverById[stage.id + '-unhide'] ? ((stage.color | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'"
                      >
                        <i class="fas fa-eye"></i>
                      </button>
                    </div>
                  </div>
              }
            </div>
          }
        }
      </div>

        <!-- Company-Specific Stages Section -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2"><i class="fas fa-building"></i> Estados Personalizados</h3>
            <button class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="showCreateForm = !showCreateForm">
              <i class="fas mr-1" [class.fa-plus]="!showCreateForm" [class.fa-times]="showCreateForm"></i>
              {{ showCreateForm ? 'Cancelar' : 'Nuevo Estado' }}
            </button>
          </div>

          <!-- Create Form -->
          @if (showCreateForm) {
            <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm">
              <h4 class="text-gray-900 font-medium mb-4">Crear Nuevo Estado</h4>
              <form (ngSubmit)="createStage()" class="space-y-4">
                <div class="flex flex-col gap-1">
                  <label for="newName" class="text-sm font-medium text-gray-700">Nombre del Estado *</label>
                  <input
                    type="text"
                    id="newName"
                    [(ngModel)]="newStage.name"
                    name="newName"
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Ej: En Revisión"
                    required
                  />
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="flex flex-col gap-1">
                    <label for="newPosition" class="text-sm font-medium text-gray-700">Posición *</label>
                    <input
                      type="number"
                      id="newPosition"
                      [(ngModel)]="newStage.position"
                      name="newPosition"
                      class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      min="0"
                      required
                    />
                    <small class="text-xs text-gray-500">Orden en que aparece en la lista</small>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label for="newColor" class="text-sm font-medium text-gray-700">Color *</label>
                    <input
                      type="color"
                      id="newColor"
                      [(ngModel)]="newStage.color"
                      name="newColor"
                      class="block w-full h-10 p-1 border border-gray-300 rounded-md cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div class="flex flex-col gap-1">
                  <label for="newWorkflowCategory" class="text-sm font-medium text-gray-700">Categoría de flujo *</label>
                  <select
                    id="newWorkflowCategory"
                    [(ngModel)]="newStage.workflow_category"
                    name="newWorkflowCategory"
                    class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    required
                  >
                    <option value="waiting">Espera (Abierto)</option>
                    <option value="analysis">Análisis (En Progreso)</option>
                    <option value="action">Acción (En Progreso)</option>
                    <option value="final">Final (Completado)</option>
                    <option value="cancel">Cancelación (Completado)</option>
                  </select>
                  <small class="text-xs text-gray-500">Define cómo cuenta este estado en las estadísticas</small>
                </div>

                <div class="flex gap-2 justify-end pt-2">
                  <button type="button" class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="cancelCreate()">
                    Cancelar
                  </button>
                  <button type="submit" class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500" [disabled]="creating">
                    <i class="fas mr-1" [class.fa-spinner]="creating" [class.fa-spin]="creating" [class.fa-save]="!creating"></i>
                    {{ creating ? 'Guardando...' : 'Guardar Estado' }}
                  </button>
                </div>
              </form>
            </div>
          }

          <!-- Company Stages List -->
          @if (companyStages.length === 0) {
            <div class="text-center py-12 text-gray-400">
              <i class="fas fa-inbox fa-3x mb-2"></i>
              <p>No tienes estados personalizados aún</p>
              <p class="text-xs">Crea estados específicos para las necesidades de tu empresa</p>
            </div>
          } @else {
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 relative" cdkDropList (cdkDropListDropped)="onDropCompany($event)">
              @for (stage of companyStages; track stage.id) {
                  <div class="flex items-center gap-3 p-4 rounded-lg border border-gray-200 transition-all hover:shadow-md bg-white" cdkDrag [style.background-color]="stage.color" [style.color]="stage.color | textContrast">
                    <div class="cursor-grab p-2 flex items-center justify-center transition-colors hover:text-blue-600 active:cursor-grabbing" cdkDragHandle [style.color]="stage.color | textContrast">
                        <i class="fas fa-grip-vertical"></i>
                      </div>
                  @if (editingStageId === stage.id) {
                    <!-- Edit Form -->
                    <form (ngSubmit)="saveEdit()" class="flex flex-col gap-3 w-full">
                      <div class="w-full">
                        <input
                          type="text"
                          [(ngModel)]="editStage.name"
                          name="editName"
                          class="block w-full px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-900"
                          required
                        />
                      </div>
                      <div class="flex gap-2">
                        <input
                          type="number"
                          [(ngModel)]="editStage.position"
                          name="editPosition"
                          class="block w-16 px-2 py-1 border border-gray-300 rounded-md text-sm text-gray-900"
                          min="0"
                          required
                        />
                        <input
                          type="color"
                          [(ngModel)]="editStage.color"
                          name="editColor"
                          class="block w-10 h-8 p-1 border border-gray-300 rounded-md text-gray-900"
                          required
                        />
                        <select
                          [(ngModel)]="editStage.workflow_category"
                          name="editWorkflowCategory"
                          class="block flex-1 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900"
                          required
                        >
                          <option value="waiting">Espera</option>
                          <option value="analysis">Análisis</option>
                          <option value="action">Acción</option>
                          <option value="final">Final</option>
                          <option value="cancel">Cancelación</option>
                        </select>
                      </div>
                      <div class="flex gap-2 justify-end">
                        <button
                          type="submit"
                          class="p-2 transition-colors rounded-full"
                          title="Guardar"
                          (mouseenter)="setBtnHover(stage.id + '-save', true)"
                          (mouseleave)="setBtnHover(stage.id + '-save', false)"
                          [style.color]="(editStage.color || stage.color) | textContrast"
                          [style.background-color]="btnHoverById[stage.id + '-save'] ? (((editStage.color || stage.color) | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'">
                          <i class="fas fa-check"></i>
                        </button>
                        <button
                          type="button"
                          class="p-2 transition-colors rounded-full"
                          (click)="cancelEdit()"
                          title="Cancelar"
                          (mouseenter)="setBtnHover(stage.id + '-cancel', true)"
                          (mouseleave)="setBtnHover(stage.id + '-cancel', false)"
                          [style.color]="(editStage.color || stage.color) | textContrast"
                          [style.background-color]="btnHoverById[stage.id + '-cancel'] ? (((editStage.color || stage.color) | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'">
                          <i class="fas fa-times"></i>
                        </button>
                      </div>
                    </form>
                  } @else {
                    <!-- View Mode -->
                    <div class="flex-1 min-w-0">
                      <div class="font-semibold truncate">{{ stage.name }}</div>
                      <div class="flex gap-1 mt-1">
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                          [style.color]="stage.color | textContrast"
                          [style.background-color]="(stage.color | textContrast) === '#000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)'">
                          Posición: {{ stage.position }}
                        </span>
                      </div>
                    </div>
                    <div class="ml-auto flex gap-1">
                      <button
                        class="p-2 transition-colors rounded-full"
                        (click)="startEdit(stage)"
                        title="Editar"
                        (mouseenter)="setBtnHover(stage.id + '-edit', true)"
                        (mouseleave)="setBtnHover(stage.id + '-edit', false)"
                        [style.color]="stage.color | textContrast"
                        [style.background-color]="btnHoverById[stage.id + '-edit'] ? ((stage.color | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'"
                      >
                        <i class="fas fa-edit"></i>
                      </button>
                      <button
                        class="p-2 transition-colors rounded-full"
                        (click)="deleteStage(stage.id)"
                        title="Eliminar"
                        (mouseenter)="setBtnHover(stage.id + '-delete', true)"
                        (mouseleave)="setBtnHover(stage.id + '-delete', false)"
                        [style.color]="stage.color | textContrast"
                        [style.background-color]="btnHoverById[stage.id + '-delete'] ? ((stage.color | textContrast) === '#000' ? '#fff' : '#000') : 'transparent'"
                      >
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
            @if (showingReassignPicker && pendingDeleteStageId) {
              <div class="border border-gray-200 rounded-lg p-4 mt-4 bg-white shadow-sm">
                <h4 class="text-gray-900 font-medium mb-2">Reasignar tickets antes de eliminar</h4>
                <p class="text-sm text-gray-600 mb-4">Este estado tiene tickets asociados. Selecciona a qué estado moverlos para poder eliminarlo.</p>
                <div class="flex flex-col gap-1 mb-4">
                  <label for="reassignTarget" class="text-sm font-medium text-gray-700">Mover tickets a</label>
                  <select id="reassignTarget" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" [(ngModel)]="reassignTargetId" name="reassignTarget">
                    <option [ngValue]="null" disabled>Selecciona un estado</option>
                    @for (s of getReassignOptions(pendingDeleteStageId); track s.id) {
                      <option [ngValue]="s.id">{{ s.name }}</option>
                    }
                  </select>
                  <small class="text-xs text-gray-500">No puedes reasignar a un estado genérico oculto</small>
                </div>
                <div class="flex gap-2 justify-end">
                  <button class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="cancelReassign()">
                    Cancelar
                  </button>
                  <button class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500" [disabled]="!reassignTargetId" (click)="confirmReassignAndDelete()">
                    <i class="fas fa-check mr-1"></i> Confirmar y eliminar
                  </button>
                </div>
              </div>
            }
          }
        </div>
      </div>

      <!-- Info Box -->
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 class="text-blue-800 font-bold mb-4 flex items-center gap-2"><i class="fas fa-lightbulb"></i> Información Importante</h4>
        <ul class="list-disc pl-5 space-y-2 text-blue-900">
          <li><strong>Estados del Sistema:</strong> Son comunes para todas las empresas y no se pueden modificar ni eliminar, pero puedes ocultarlos si no las necesitas.</li>
          <li><strong>Ocultar Estados:</strong> Los estados del sistema que ocultes no aparecerán en tus listas y formularios, pero seguirán disponibles para otras empresas.</li>
          <li><strong>Estados Personalizados:</strong> Puedes crear estados específicos para tu empresa que complementen los del sistema.</li>
          <li><strong>Posición:</strong> Determina el orden en que aparecen los estados en las listas y tableros.</li>
          <li><strong>Color:</strong> Ayuda a identificar visualmente cada estado en el sistema.</li>
        </ul>
      </div>

  `,
  styles: []
})
export class StagesManagementComponent implements OnInit {
  private stagesService = inject(SupabaseTicketStagesService);
  private toast = inject(ToastService);

  loading = false;
  creating = false;
  // Per-item loading map for hide/unhide actions
  togglingVisibilityById: Record<string, boolean> = {};
  // Per-button hover state map for outline buttons inside colored cards
  btnHoverById: Record<string, boolean> = {};
  showCreateForm = false;
  successMessage = '';
  errorMessage = '';
  hidingAllGenericStages = false;
  // Control collapsed state for hidden generic stages accordion
  hiddenGenericsCollapsed = true;

  genericStages: TicketStage[] = [];
  companyStages: TicketStage[] = [];
  visibleGenericStages: TicketStage[] = [];
  hiddenGenericStages: TicketStage[] = [];
  // UI state for delete-with-reassign flow
  pendingDeleteStageId: string | null = null;
  reassignTargetId: string | null = null;
  showingReassignPicker = false;

  newStage: CreateStagePayload = {
    name: '',
    position: 0,
    color: '#6366f1',
    workflow_category: 'waiting'
  };

  editingStageId: string | null = null;
  editStage: UpdateStagePayload = {};

  private refreshGenericBuckets() {
    const sorted = this.sortGenerics(this.genericStages);
    this.genericStages = sorted;
    this.visibleGenericStages = sorted.filter(stage => !stage.is_hidden);
    this.hiddenGenericStages = sorted.filter(stage => !!stage.is_hidden);
  }

  async ngOnInit() {
    await this.loadStages();
  }

  async hideAllSystemStages() {
    if (!confirm('¿Estás seguro de que quieres ocultar todos los estados del sistema visibles?')) return;
    this.hidingAllGenericStages = true;
    try {
      const toHide = this.genericStages.filter(s => !s.is_hidden);
      for (const s of toHide) {
        const res = await this.stagesService.hideGenericStage(s.id);
        if (res.error) throw res.error;
      }
      this.toast.success('Operación completada', 'Todos los estados del sistema visibles han sido ocultados');
      await this.loadStages();
    } catch (e: any) {
      this.errorMessage = 'Error al ocultar todos los estados: ' + (e?.message || 'Error desconocido');
    } finally {
      this.hidingAllGenericStages = false;
    }
  }

  async loadStages() {
    this.loading = true;
    this.clearMessages();

    try {
      // Load generic stages
      const genericResult = await this.stagesService.getGenericStages();
      if (genericResult.error) {
        throw genericResult.error;
      }
      this.genericStages = genericResult.data || [];
      this.refreshGenericBuckets();

      // 🔍 DEBUG: Ver datos recibidos
      console.log('🔍 DEBUG - Generic stages loaded:', this.genericStages);
      console.log('🔍 DEBUG - Hidden stages:', this.hiddenGenericStages.map(s => s.name));

      // Load company stages
      const companyResult = await this.stagesService.getCompanyStages();
      if (companyResult.error) {
        throw companyResult.error;
      }
      this.companyStages = companyResult.data || [];

    } catch (error: any) {
      this.errorMessage = 'Error al cargar los estados: ' + (error.message || 'Error desconocido');
    } finally {
      this.loading = false;
    }
  }

  private sortGenerics(list: TicketStage[]): TicketStage[] {
    // Visible first by position asc, then hidden by position asc (but at the end)
    return [...list].sort((a, b) => {
      const ah = !!a.is_hidden;
      const bh = !!b.is_hidden;
      if (ah !== bh) return ah ? 1 : -1; // hidden to the end
      const ap = Number(a.position ?? 0);
      const bp = Number(b.position ?? 0);
      return ap - bp;
    });
  }

  async createStage() {
    if (!this.newStage.name.trim()) {
      this.errorMessage = 'El nombre del estado es obligatorio';
      return;
    }
    if (!this.newStage.workflow_category) {
      this.errorMessage = 'Selecciona una categoría de flujo';
      return;
    }

    this.creating = true;
    this.clearMessages();

    try {
      const result = await this.stagesService.createStage(this.newStage);

      if (result.error) {
        throw result.error;
      }

      this.successMessage = 'Estado creado correctamente';
      this.showCreateForm = false;
      this.resetNewStage();
      await this.loadStages();

    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('ux_ticket_stages_company_final') || msg.includes('workflow_category = "final"')) {
        this.errorMessage = 'Ya existe un estado "Final" en tu empresa. Solo puede haber uno.';
      } else if (msg.includes('ux_ticket_stages_company_cancel') || msg.includes('workflow_category = "cancel"')) {
        this.errorMessage = 'Ya existe un estado de "Cancelación" en tu empresa. Solo puede haber uno.';
      } else if (msg.includes('debe existir al menos un estado de la categoría')) {
        this.errorMessage = 'No puedes eliminar o mover el último estado de una categoría requerida. Asegúrate de mantener al menos uno por categoría.';
      } else {
        this.errorMessage = 'Error al crear el estado: ' + (error.message || 'Error desconocido');
      }
      this.toast.error('No se pudo crear el estado', this.errorMessage);
    } finally {
      this.creating = false;
    }
  }

  startEdit(stage: TicketStage) {
    this.editingStageId = stage.id;
    this.editStage = {
      name: stage.name,
      position: stage.position,
      color: stage.color,
      workflow_category: stage.workflow_category || 'waiting'
    };
    this.clearMessages();
  }

  async saveEdit() {
    if (!this.editingStageId) return;

    this.clearMessages();

    try {
      const result = await this.stagesService.updateStage(this.editingStageId, this.editStage);

      if (result.error) {
        throw result.error;
      }

      this.successMessage = 'Estado actualizado correctamente';
      this.editingStageId = null;
      await this.loadStages();

    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('ux_ticket_stages_company_final') || msg.includes('workflow_category = "final"')) {
        this.errorMessage = 'Ya existe un estado "Final" en tu empresa. Solo puede haber uno.';
      } else if (msg.includes('ux_ticket_stages_company_cancel') || msg.includes('workflow_category = "cancel"')) {
        this.errorMessage = 'Ya existe un estado de "Cancelación" en tu empresa. Solo puede haber uno.';
      } else if (msg.includes('debe existir al menos un estado de la categoría')) {
        this.errorMessage = 'No puedes eliminar o mover el último estado de una categoría requerida. Asegúrate de mantener al menos uno por categoría.';
      } else {
        this.errorMessage = 'Error al actualizar el estado: ' + (error.message || 'Error desconocido');
      }
      this.toast.error('No se pudo actualizar', this.errorMessage);
    }
  }

  cancelEdit() {
    this.editingStageId = null;
    this.editStage = {};
    this.clearMessages();
  }

  private resetNewStage() {
    this.newStage = {
      name: '',
      position: 0,
      color: '#6366f1',
      workflow_category: 'waiting'
    };
  }

  async deleteStage(stageId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este estado?')) {
      return;
    }

    this.clearMessages();

    try {
      const result = await this.stagesService.deleteStage(stageId);

      if (result.error) {
        const status = Number(result.error?.status || 0);
        const code = result.error?.code as string | undefined;
        const msg = (result.error?.message || result.error?.error || '').toString().toLowerCase();

        // Only open reassignment picker when the backend explicitly requests it
        if (status === 409 && (code === 'REASSIGN_REQUIRED' || msg.includes('reassign') || msg.includes('asignar') || msg.includes('tickets referenciando'))) {
          this.pendingDeleteStageId = stageId;
          this.reassignTargetId = null;
          this.showingReassignPicker = true;
          this.toast.info('Este estado tiene tickets', 'Selecciona un estado destino para reasignar los tickets.');
          return;
        }

        // Show clear coverage message when category coverage would break
        if (status === 409 && (code === 'COVERAGE_BREAK' || msg.includes('categor') || msg.includes('coverage'))) {
          this.errorMessage = 'No puedes eliminar este estado porque dejaría una categoría sin cobertura. Muestra un estado del sistema equivalente o crea otro antes de eliminar.';
          this.toast.error('Cobertura insuficiente', this.errorMessage);
          return;
        }

        throw result.error;
      }

      this.successMessage = 'Estado eliminado correctamente';
      await this.loadStages();

    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('debe existir al menos un estado de la categoría') || msg.includes('coverage') || msg.includes('categoría requerida')) {
        this.errorMessage = 'No puedes eliminar este estado porque dejaría una categoría sin cobertura. Muestra un estado del sistema equivalente o crea otro antes de eliminar.';
      } else {
        this.errorMessage = 'Error al eliminar el estado: ' + (error.message || 'Error desconocido');
      }
    }
  }

  getReassignOptions(excludeStageId: string): TicketStage[] {
    // Options: all visible generics + company stages except the one being deleted
    const visibleGenerics = this.visibleGenericStages;
    const company = this.companyStages.filter(s => s.id !== excludeStageId);
    return [...visibleGenerics, ...company]
      .sort((a, b) => (Number(a.position ?? 0) - Number(b.position ?? 0)));
  }

  async confirmReassignAndDelete() {
    if (!this.pendingDeleteStageId || !this.reassignTargetId) return;
    this.clearMessages();
    try {
      // Prefer hide-with-reassign when the pending action was triggered by hide, but we don't track origin explicitly.
      // Heuristic: try hide-with-reassign first; if it returns 400/404 fallback to delete-with-reassign.
      let res = await this.stagesService.hideGenericStageWithReassign(this.pendingDeleteStageId, this.reassignTargetId);
      if (res.error && Number(res.error.status || 0) >= 400) {
        res = await this.stagesService.deleteStageWithReassign(this.pendingDeleteStageId, this.reassignTargetId);
      }
      if (res.error) {
        throw res.error;
      }
      this.toast.success('Reasignado', 'Tickets reasignados y operación completada.');
      this.cancelReassign();
      await this.loadStages();
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('debe existir al menos un estado de la categoría') || msg.includes('coverage') || msg.includes('categoría requerida')) {
        this.errorMessage = 'No se pudo completar porque se rompería la cobertura de categorías. Revisa los estados visibles.';
      } else {
        this.errorMessage = 'No se pudo completar la reasignación: ' + (e?.message || 'Error desconocido');
      }
    }
  }

  cancelReassign() {
    this.pendingDeleteStageId = null;
    this.reassignTargetId = null;
    this.showingReassignPicker = false;
  }

  cancelCreate() {
    this.showCreateForm = false;
    this.resetNewStage();
    this.clearMessages();
  }

  isToggling(id: string): boolean {
    return !!this.togglingVisibilityById[id];
  }

  private setToggling(id: string, value: boolean) {
    this.togglingVisibilityById = { ...this.togglingVisibilityById, [id]: value };
  }

  setBtnHover(id: string, value: boolean) {
    this.btnHoverById = { ...this.btnHoverById, [id]: value };
  }

  toggleHiddenGenerics() {
    this.hiddenGenericsCollapsed = !this.hiddenGenericsCollapsed;
  }

  async hideStage(stage: TicketStage) {
    this.setToggling(stage.id, true);
    this.clearMessages();

    try {
      const result = await this.stagesService.hideGenericStage(stage.id);

      if (result.error) {
        const status = Number(result.error?.status || 0);
        const code = result.error?.code;
        const msg = (result.error?.message || result.error?.error || '').toString().toLowerCase();
        if (status === 409 && (code === 'REASSIGN_REQUIRED' || msg.includes('reassign') || msg.includes('asignar'))) {
          this.pendingDeleteStageId = stage.id;
          this.reassignTargetId = null;
          this.showingReassignPicker = true;
          this.toast.info('Este estado tiene tickets', 'Selecciona un estado destino para reasignar los tickets y vuelve a ocultar.');
          return;
        }
        if (status === 409 && (code === 'COVERAGE_BREAK' || msg.includes('categor') || msg.includes('coverage'))) {
          this.errorMessage = 'No se puede ocultar: dejaría la categoría sin estados visibles.';
          this.toast.error('Cobertura insuficiente', this.errorMessage);
          return;
        }
        throw result.error;
      }
      // Notify via global toast system for consistency
      this.toast.success('Estado ocultado', `"${stage.name}" ocultado correctamente`);
      // Update only the affected item locally
      const idx = this.genericStages.findIndex(s => s.id === stage.id);
      if (idx !== -1) {
        this.genericStages[idx] = { ...this.genericStages[idx], is_hidden: true } as TicketStage;
        this.refreshGenericBuckets();
      }

    } catch (error: any) {
      this.errorMessage = 'Error al ocultar el estado: ' + (error.message || 'Error desconocido');
    } finally {
      this.setToggling(stage.id, false);
    }
  }

  async unhideStage(stage: TicketStage) {
    this.setToggling(stage.id, true);
    this.clearMessages();

    try {
      const result = await this.stagesService.unhideGenericStage(stage.id);

      if (result.error) {
        throw result.error;
      }
      // Notify via global toast system for consistency
      this.toast.success('Estado mostrado', `"${stage.name}" ahora está visible`);
      // Update only the affected item locally
      const idx = this.genericStages.findIndex(s => s.id === stage.id);
      if (idx !== -1) {
        this.genericStages[idx] = { ...this.genericStages[idx], is_hidden: false } as TicketStage;
        this.refreshGenericBuckets();
      }

    } catch (error: any) {
      this.errorMessage = 'Error al mostrar el estado: ' + (error.message || 'Error desconocido');
    } finally {
      this.setToggling(stage.id, false);
    }
  }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }



  // Drag and Drop handlers
  async onDropGeneric(event: CdkDragDrop<TicketStage[]>) {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    // Clone arrays to compute new order for visible stages
    const visible = [...this.visibleGenericStages];
    const hidden = [...this.hiddenGenericStages];

    moveItemInArray(visible, event.previousIndex, event.currentIndex);

    visible.forEach((stage, index) => {
      stage.position = index;
    });
    hidden.forEach((stage, index) => {
      stage.position = 9999 + index;
    });

    const combined = [...visible, ...hidden];
    this.genericStages = combined;
    this.refreshGenericBuckets();

    // Persist full ordered list of generic stage IDs (visible first, then hidden)
    try {
      const orderedIds = this.genericStages.map(s => s.id);
      const { error } = await this.stagesService.reorderGenericStages(orderedIds);
      if (error) throw error;
      this.toast.success('Orden actualizado', 'El orden de los estados del sistema se ha guardado');
    } catch (error: any) {
      this.errorMessage = 'Error al actualizar el orden: ' + (error.message || 'Error desconocido');
      await this.loadStages();
    }
  }

  async onDropCompany(event: CdkDragDrop<TicketStage[]>) {
    if (event.previousIndex === event.currentIndex) return;

    // Reorder locally
    moveItemInArray(this.companyStages, event.previousIndex, event.currentIndex);

    // Update positions in backend
    try {
      await this.updateStagePositions(this.companyStages);
      this.toast.success('Orden actualizado', 'El orden de los estados se ha actualizado correctamente');
    } catch (error: any) {
      this.errorMessage = 'Error al actualizar el orden: ' + (error.message || 'Error desconocido');
      // Reload to restore correct order
      await this.loadStages();
    }
  }

  private async updateStagePositions(stages: TicketStage[]) {
    // Only update company-specific stages; generic/system stages are handled by reorderGenericStages overlay
    const updatable = stages.filter(s => s.company_id !== null);
    const updates = updatable.map((stage, index) =>
      this.stagesService.updateStage(stage.id, { position: index })
    );
    await Promise.all(updates);
  }
}