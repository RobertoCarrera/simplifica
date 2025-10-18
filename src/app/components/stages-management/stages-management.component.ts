import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { SupabaseTicketStagesService, TicketStage, CreateStagePayload, UpdateStagePayload } from '../../services/supabase-ticket-stages.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-stages-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DragDropModule],
  template: `
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <button class="btn-back" routerLink="/configuracion" title="Volver a Configuración">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>
    </div>
    <div class="two-columns-layout">
      <div class="section">
        <div class="section-header">
          <h3><i class="fas fa-globe"></i> Estados del Sistema</h3>
          <button class="btn btn-outline" (click)="hideAllSystemStages()" [disabled]="hidingAllGenericStages" title="Ocultar todos los estados del sistema">
            <i class="fas fa-eye-slash"></i> Ocultar Todos
          </button>
        </div>
        <p class="info-text">
          <i class="fas fa-info-circle"></i>
          Estados predeterminados. Puedes reordenarlos arrastrando (solo los visibles; los ocultos quedan al final) y ocultarlos si no los necesitas.
        </p>
  <div class="stages-grid" cdkDropList [cdkDropListSortingDisabled]="true" [cdkDropListData]="visibleGenericStages" (cdkDropListDropped)="onDropGeneric($event)">
          @for (stage of genericStages; track stage.id) {
              <div class="stage-card generic justify-between" 
                   [class.hidden-stage]="stage.is_hidden" 
                   cdkDrag
                   [cdkDragDisabled]="stage.is_hidden">
                @if (!stage.is_hidden) {
                  <div class="drag-handle" cdkDragHandle>
                    <i class="fas fa-grip-vertical"></i>
                  </div>
                  <ng-template cdkDragPreview>
                    <div class="stage-card generic drag-preview">
                      <div class="drag-handle">
                        <i class="fas fa-grip-vertical"></i>
                      </div>
                      <div class="card-body">
                        <div class="title-row">
                          <div class="name">{{ stage.name }}</div>
                          <div>
                            <span class="badge">Pos: {{ stage.position }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ng-template>
                  <ng-template cdkDragPlaceholder>
                    <div class="stage-card generic placeholder"></div>
                  </ng-template>
                }
                <div class="card-body">
                  <div class="title-row flex flex-row">
                    <div>
                      @if(!stage.is_hidden) {
                        <span class="badge mr-2">Pos: {{ stage.is_hidden ? 9999 : stage.position }}</span>
                      }
                    </div>
                    <div class="name">
                      @if (stage.is_hidden) { <span class="badge badge-hidden">Oculto</span> }
                      {{ stage.name }}
                    </div>
                  </div>
                </div>
                <div class="actions">
                  @if (stage.is_hidden) {
                    <button 
                      class="btn btn-sm btn-success" 
                      (click)="unhideStage(stage)"
                      [disabled]="!!togglingVisibilityById[stage.id]"
                      title="Mostrar este estado">
                      <i class="fas fa-eye"></i>
                    </button>
                  } @else {
                    <button 
                      class="btn btn-sm btn-outline" 
                      (click)="hideStage(stage)"
                      [disabled]="!!togglingVisibilityById[stage.id]"
                      title="Ocultar este estado">
                      <i class="fas fa-eye-slash"></i>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
      </div>

        <!-- Company-Specific Stages Section -->

        <!-- Company-Specific Stages Section -->
        <div class="section">
          <div class="section-header">
            <h3><i class="fas fa-building"></i> Estados Personalizados</h3>
            <button class="btn btn-primary" (click)="showCreateForm = !showCreateForm">
              <i class="fas" [class.fa-plus]="!showCreateForm" [class.fa-times]="showCreateForm"></i>
              {{ showCreateForm ? 'Cancelar' : 'Nuevo Estado' }}
            </button>
          </div>

          <!-- Create Form -->
          @if (showCreateForm) {
            <div class="form-card">
              <h4>Crear Nuevo Estado</h4>
              <form (ngSubmit)="createStage()" class="stage-form">
                <div class="form-group">
                  <label for="newName">Nombre del Estado *</label>
                  <input
                    type="text"
                    id="newName"
                    [(ngModel)]="newStage.name"
                    name="newName"
                    class="form-control"
                    placeholder="Ej: En Revisión"
                    required
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="newPosition">Posición *</label>
                    <input
                      type="number"
                      id="newPosition"
                      [(ngModel)]="newStage.position"
                      name="newPosition"
                      class="form-control"
                      min="0"
                      required
                    />
                    <small class="form-hint">Orden en que aparece en la lista</small>
                  </div>

                  <div class="form-group">
                    <label for="newColor">Color *</label>
                    <input
                      type="color"
                      id="newColor"
                      [(ngModel)]="newStage.color"
                      name="newColor"
                      class="form-control color-input"
                      required
                    />
                  </div>
                </div>

                <div class="form-actions">
                  <button type="submit" class="btn btn-success" [disabled]="creating">
                    <i class="fas" [class.fa-spinner]="creating" [class.fa-spin]="creating" [class.fa-save]="!creating"></i>
                    {{ creating ? 'Guardando...' : 'Guardar Estado' }}
                  </button>
                  <button type="button" class="btn btn-secondary" (click)="cancelCreate()">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          }

          <!-- Company Stages List -->
          @if (companyStages.length === 0) {
            <div class="empty-state">
              <i class="fas fa-inbox fa-3x"></i>
              <p>No tienes estados personalizados aún</p>
              <p class="small">Crea estados específicos para las necesidades de tu empresa</p>
            </div>
          } @else {
            <div class="stages-grid" cdkDropList (cdkDropListDropped)="onDropCompany($event)">
              @for (stage of companyStages; track stage.id) {
                <div class="stage-card company" cdkDrag>
                  <div class="drag-handle" cdkDragHandle>
                    <i class="fas fa-grip-vertical"></i>
                  </div>
                  @if (editingStageId === stage.id) {
                    <!-- Edit Form -->
                    <form (ngSubmit)="saveEdit()" class="edit-form">
                      <div class="form-group-inline">
                        <input
                          type="text"
                          [(ngModel)]="editStage.name"
                          name="editName"
                          class="form-control"
                          required
                        />
                      </div>
                      <div class="form-row-inline">
                        <input
                          type="number"
                          [(ngModel)]="editStage.position"
                          name="editPosition"
                          class="form-control-small"
                          min="0"
                          required
                        />
                        <input
                          type="color"
                          [(ngModel)]="editStage.color"
                          name="editColor"
                          class="form-control-small"
                          required
                        />
                      </div>
                      <div class="edit-actions">
                        <button type="submit" class="btn-icon btn-success" title="Guardar">
                          <i class="fas fa-check"></i>
                        </button>
                        <button type="button" class="btn-icon btn-secondary" (click)="cancelEdit()" title="Cancelar">
                          <i class="fas fa-times"></i>
                        </button>
                      </div>
                    </form>
                  } @else {
                    <!-- View Mode -->
                    <div class="stage-color" [style.background-color]="stage.color"></div>
                    <div class="stage-info">
                      <div class="stage-name">{{ stage.name }}</div>
                      <div class="stage-meta">
                        <span class="badge">Posición: {{ stage.position }}</span>
                        <span class="badge badge-company">Personalizado</span>
                      </div>
                    </div>
                    <div class="stage-actions">
                      <button class="btn-icon btn-primary" (click)="startEdit(stage)" title="Editar">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button class="btn-icon btn-danger" (click)="deleteStage(stage.id)" title="Eliminar">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Info Box -->
      <div class="info-box">
        <h4><i class="fas fa-lightbulb"></i> Información Importante</h4>
        <ul>
          <li><strong>Estados del Sistema:</strong> Son comunes para todas las empresas y no se pueden modificar ni eliminar, pero puedes ocultarlos si no los necesitas.</li>
          <li><strong>Ocultar Estados:</strong> Los estados del sistema que ocultes no aparecerán en tus listas y formularios, pero seguirán disponibles para otras empresas.</li>
          <li><strong>Estados Personalizados:</strong> Puedes crear estados específicos para tu empresa que complementen los del sistema.</li>
          <li><strong>Posición:</strong> Determina el orden en que aparecen los estados en las listas y tableros.</li>
          <li><strong>Color:</strong> Ayuda a identificar visualmente cada estado en el sistema.</li>
        </ul>
      </div>
  `,
  styles: [`
    .header {
      margin-bottom: 2rem;
    }

    .header-top {
      margin-bottom: 1rem;
    }

    .btn-back {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      color: #374151;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .btn-back:hover {
      background: #e5e7eb;
      border-color: #9ca3af;
      color: #1f2937;
    }

    .btn-back i {
      font-size: 0.875rem;
    }

    .header h2 {
      color: #1f2937;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subtitle {
      color: #6b7280;
      margin: 0;
    }

    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .alert-success {
      background-color: #d1fae5;
      border: 1px solid #10b981;
      color: #065f46;
    }

    .alert-danger {
      background-color: #fee2e2;
      border: 1px solid #ef4444;
      color: #991b1b;
    }

    .loading-container {
      text-align: center;
      padding: 4rem 2rem;
      color: #6b7280;
    }

    /* Two Column Layout */
    .two-columns-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 1024px) {
      .two-columns-layout {
        grid-template-columns: 1fr;
      }
    }

    .section {
      background: white;
      border-radius: 0.75rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .section h3 {
      color: #1f2937;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.125rem;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .section-header h3 {
      margin: 0;
    }

    .info-text {
      color: #4b5563;
      padding: 0.75rem;
      background: #f3f4f6;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .stages-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 768px) {
      .stages-grid {
        grid-template-columns: 1fr;
      }
    }

    .stage-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-radius: 0.5rem;
      border: 2px solid #e5e7eb;
      transition: all 0.2s;
      background: white;
    }

    .stage-card:hover {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    /* Drag and Drop styles */
    .drag-handle {
      cursor: grab;
      color: #9ca3af;
      padding: 0.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s;
    }

    .drag-handle:hover {
      color: #6366f1;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .cdk-drag-preview {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.25);
      opacity: 0.95;
      border-radius: 0.5rem;
      transform: translateZ(0);
    }

    .cdk-drag-animating {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .stages-grid.cdk-drop-list-dragging .stage-card:not(.cdk-drag-placeholder) {
      transition: transform 250ms cubic-bezier(0, 0, 0.2, 1);
    }

    .cdk-drag-placeholder,
    .stage-card.placeholder {
      opacity: 0.5;
      background: #f3f4f6;
      border: 2px dashed #9ca3af;
      min-height: 84px;
    }

    .drag-preview {
      will-change: transform;
    }

    .stage-card.hidden-stage {
      opacity: 0.6;
      border-color: #d1d5db;
      background-color: #f9fafb;
      cursor: not-allowed;
    }

    .stage-card.hidden-stage:hover {
      opacity: 0.8;
    }

    .stage-card.generic {
      background: #f9fafb;
      cursor: move; /* draggable when visible */
    }

    .stage-card.company {
      background: white;
      cursor: move; /* draggable */
    }

    .stage-color {
      width: 50px;
      height: 50px;
      border-radius: 0.5rem;
      flex-shrink: 0;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .stage-info {
      flex: 1;
      min-width: 0;
    }

    .stage-name {
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }

    .stage-meta {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      font-weight: 500;
      background: #e5e7eb;
      color: #4b5563;
    }

    .badge-system {
      background: #dbeafe;
      color: #1e40af;
    }

    .badge-hidden {
      background: #fee2e2;
      color: #991b1b;
      margin-left: 0.5rem;
    }

    .stage-actions {
      margin-left: auto;
      display: flex;
      gap: 0.5rem;
    }

    .badge-company {
      background: #fef3c7;
      color: #92400e;
    }

    .stage-actions {
      display: flex;
      gap: 0.5rem;
    }

    .form-card {
      background: #f9fafb;
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .form-card h4 {
      color: #1f2937;
      margin-bottom: 1rem;
    }

    .stage-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
    }

    .form-group label {
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.5rem;
    }

    .form-control {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 1rem;
    }

    .form-control:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .color-input {
      height: 45px;
      cursor: pointer;
    }

    .form-hint {
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: 0.25rem;
    }

    .form-actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .btn {
      padding: 0.625rem 1.25rem;
      border: none;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s;
    }

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #6366f1;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #4f46e5;
    }

    .btn-success {
      background: #10b981;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #059669;
    }

    .btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-secondary:hover {
      background: #d1d5db;
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
    }

    .btn-outline {
      background: transparent;
      border: 1px solid #d1d5db;
      color: #6b7280;
    }

    .btn-outline:hover:not(:disabled) {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .btn-icon {
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 0.375rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .btn-icon.btn-primary {
      background: #6366f1;
      color: white;
    }

    .btn-icon.btn-primary:hover {
      background: #4f46e5;
    }

    .btn-icon.btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-icon.btn-danger:hover {
      background: #dc2626;
    }

    .btn-icon.btn-success {
      background: #10b981;
      color: white;
    }

    .btn-icon.btn-secondary {
      background: #e5e7eb;
      color: #374151;
    }

    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }

    .form-group-inline {
      width: 100%;
    }

    .form-row-inline {
      display: flex;
      gap: 0.5rem;
    }

    .form-control-small {
      padding: 0.375rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    .edit-actions {
      display: flex;
      gap: 0.5rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #9ca3af;
    }

    .empty-state i {
      color: #d1d5db;
      margin-bottom: 1rem;
    }

    .empty-state p {
      margin: 0.5rem 0;
    }

    .empty-state .small {
      font-size: 0.875rem;
    }

    .info-box {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 0.5rem;
      padding: 1.5rem;
    }

    .info-box h4 {
      color: #1e40af;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .info-box ul {
      margin: 0;
      padding-left: 1.5rem;
      color: #1e3a8a;
    }

    .info-box li {
      margin-bottom: 0.5rem;
    }

    @media (max-width: 768px) {
      .stages-management-container {
        padding: 1rem;
      }

      .stages-grid {
        grid-template-columns: 1fr;
      }

      .form-row {
        grid-template-columns: 1fr;
      }

      .section-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }
    }
  `]
})
export class StagesManagementComponent implements OnInit {
  private stagesService = inject(SupabaseTicketStagesService);
  private toast = inject(ToastService);

  loading = false;
  creating = false;
  // Per-item loading map for hide/unhide actions
  togglingVisibilityById: Record<string, boolean> = {};
  showCreateForm = false;
  successMessage = '';
  errorMessage = '';
  hidingAllGenericStages = false;

  genericStages: TicketStage[] = [];
  companyStages: TicketStage[] = [];

  newStage: CreateStagePayload = {
    name: '',
    position: 0,
    color: '#6366f1'
  };

  editingStageId: string | null = null;
  editStage: UpdateStagePayload = {};

  // Use a getter to expose only visible generic stages for CDK drop list data binding
  get visibleGenericStages(): TicketStage[] {
    return this.genericStages.filter(s => !s.is_hidden);
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
  this.genericStages = this.sortGenerics(genericResult.data || []);
      
      // 🔍 DEBUG: Ver datos recibidos
      console.log('🔍 DEBUG - Generic stages loaded:', this.genericStages);
      console.log('🔍 DEBUG - Hidden stages:', this.genericStages.filter(s => s.is_hidden).map(s => s.name));

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
      this.errorMessage = 'Error al crear el estado: ' + (error.message || 'Error desconocido');
    } finally {
      this.creating = false;
    }
  }

  startEdit(stage: TicketStage) {
    this.editingStageId = stage.id;
    this.editStage = {
      name: stage.name,
      position: stage.position,
      color: stage.color
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
      this.errorMessage = 'Error al actualizar el estado: ' + (error.message || 'Error desconocido');
    }
  }

  cancelEdit() {
    this.editingStageId = null;
    this.editStage = {};
    this.clearMessages();
  }

  async deleteStage(stageId: string) {
    if (!confirm('¿Estás seguro de que quieres eliminar este estado?')) {
      return;
    }

    this.clearMessages();

    try {
      const result = await this.stagesService.deleteStage(stageId);
      
      if (result.error) {
        throw result.error;
      }

      this.successMessage = 'Estado eliminado correctamente';
      await this.loadStages();

    } catch (error: any) {
      this.errorMessage = 'Error al eliminar el estado: ' + (error.message || 'Error desconocido');
    }
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

  async hideStage(stage: TicketStage) {
    this.setToggling(stage.id, true);
    this.clearMessages();

    try {
      const result = await this.stagesService.hideGenericStage(stage.id);
      
      if (result.error) {
        throw result.error;
      }

  // Notify via global toast system for consistency
  this.toast.success('Estado ocultado', `"${stage.name}" ocultado correctamente`);
      // Update only the affected item locally
      const idx = this.genericStages.findIndex(s => s.id === stage.id);
      if (idx !== -1) {
        this.genericStages[idx] = { ...this.genericStages[idx], is_hidden: true } as TicketStage;
        this.genericStages = this.sortGenerics(this.genericStages);
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
        this.genericStages = this.sortGenerics(this.genericStages);
      }

    } catch (error: any) {
      this.errorMessage = 'Error al mostrar el estado: ' + (error.message || 'Error desconocido');
    } finally {
      this.setToggling(stage.id, false);
    }
  }

  private resetNewStage() {
    this.newStage = {
      name: '',
      position: 0,
      color: '#6366f1'
    };
  }

  private clearMessages() {
    this.successMessage = '';
    this.errorMessage = '';
  }

  // Drag and Drop handlers
  async onDropGeneric(event: CdkDragDrop<TicketStage[]>) {
    if (event.previousIndex === event.currentIndex) return;

    // Work only with visible generics (hidden are not draggable and stay at the end)
    const visible = this.genericStages.filter(s => !s.is_hidden);
    const hidden = this.genericStages.filter(s => !!s.is_hidden);

    const from = event.previousIndex;
    const to = event.currentIndex;
    const a = visible[from];
    const b = visible[to];
    if (!a || !b) return;

    // Swap their visual positions: swap 'position' values so that sorting reflects a swap
    const tmpPos = a.position;
    a.position = b.position;
    b.position = tmpPos;

    // Rebuild the combined list and sort (visible by position asc, then hidden)
    this.genericStages = this.sortGenerics([...visible, ...hidden]);

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

