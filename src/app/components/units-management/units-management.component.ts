import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseUnitsService, UnitOfMeasure } from '../../services/supabase-units.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-units-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <button class="btn-back" routerLink="/configuracion" title="Volver a Configuración">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>
    </div>

    @if (loading) {
      <div class="loading-container">
        <i class="fas fa-spinner fa-spin fa-3x"></i>
        <p>Cargando unidades...</p>
      </div>
    }

    @if (!loading) {
      <!-- Two Column Layout -->
      <div class="two-columns-layout">
        <!-- Genéricas -->
        <div class="section">
          <div class="section-header">
            <h3><i class="fas fa-globe"></i> Unidades del Sistema</h3>
            <button class="btn btn-outline" (click)="hideAllSystemUnits()" [disabled]="hidingAllGenericUnits" title="Ocultar todas las unidades del sistema">
              <i class="fas fa-eye-slash"></i> Ocultar Todos
            </button>
          </div>
          <p class="info-text">
            <i class="fas fa-info-circle"></i>
            Unidades predeterminadas. Puedes ocultarlas si no las necesitas.
          </p>

          <div class="units-grid">
            @for (u of genericUnits; track u.id) {
              <div class="unit-card generic" [class.hidden-item]="u.is_hidden">
                <div class="card-body">
                  <div class="title-row">
                    <div class="name">{{ u.name }}</div>
                    <div>
                      @if (u.is_hidden) { <span class="badge badge-hidden mr-1">Oculto</span> }
                      <span class="badge">{{ u.code }}</span>
                    </div>
                  </div>
                  <div class="desc" *ngIf="u.description">{{ u.description }}</div>
                </div>
                <div class="actions">
                  @if (u.is_hidden) {
                    <button class="btn btn-sm btn-success" (click)="unhide(u)" [disabled]="!!toggling[u.id]">
                      <i class="fas fa-eye"></i> Mostrar
                    </button>
                  } @else {
                    <button class="btn btn-sm btn-outline" (click)="hide(u)" [disabled]="!!toggling[u.id]">
                      <i class="fas fa-eye-slash"></i> Ocultar
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Empresa -->
        <div class="section">
          <div class="section-header">
            <h3><i class="fas fa-building"></i> Unidades Personalizadas</h3>
            <button class="btn btn-primary" (click)="showCreateForm = !showCreateForm">
              <i class="fas" [class.fa-plus]="!showCreateForm" [class.fa-times]="showCreateForm"></i>
              {{ showCreateForm ? 'Cancelar' : 'Nueva Unidad' }}
            </button>
          </div>

            @if (showCreateForm) {
              <div class="form-card">
                <h4>Nueva Unidad</h4>
                <form (ngSubmit)="create()" class="unit-form">
                  <div class="form-row">
                    <div class="form-group">
                      <label>Nombre *</label>
                      <input class="form-control" [(ngModel)]="newUnit.name" name="name" required />
                    </div>
                    <div class="form-group">
                      <label>Código *</label>
                      <input class="form-control" [(ngModel)]="newUnit.code" name="code" required />
                    </div>
                  </div>
                  <div class="form-group">
                    <label>Descripción</label>
                    <input class="form-control" [(ngModel)]="newUnit.description" name="description" />
                  </div>
                  <div class="form-actions">
                    <button class="btn btn-success" type="submit" [disabled]="creating">
                      <i class="fas" [class.fa-spinner]="creating" [class.fa-spin]="creating" [class.fa-save]="!creating"></i>
                      {{ creating ? 'Guardando...' : 'Guardar' }}
                    </button>
                    <button class="btn btn-secondary" type="button" (click)="cancelCreate()">Cancelar</button>
                  </div>
                </form>
              </div>
            }

            <div class="units-grid" *ngIf="companyUnits.length; else emptyCompany">
              @for (u of companyUnits; track u.id) {
                <div class="unit-card company">
                  <div class="card-body">
                    @if (editingId === u.id) {
                      <div class="form-group">
                        <label>Nombre</label>
                        <input class="form-control" [(ngModel)]="editUnit.name" name="editName" />
                      </div>
                      <div class="form-group">
                        <label>Código</label>
                        <input class="form-control" [(ngModel)]="editUnit.code" name="editCode" />
                      </div>
                      <div class="form-group">
                        <label>Descripción</label>
                        <input class="form-control" [(ngModel)]="editUnit.description" name="editDesc" />
                      </div>
                    } @else {
                      <div class="title-row">
                        <div class="name">{{ u.name }}</div>
                        <span class="badge badge-company">Personalizada</span>
                      </div>
                      <div class="meta"><span class="badge">{{ u.code }}</span></div>
                      <div class="desc" *ngIf="u.description">{{ u.description }}</div>
                    }
                  </div>
                  <div class="actions">
                    @if (editingId === u.id) {
                      <button class="btn btn-sm btn-success" (click)="saveEdit()"><i class="fas fa-check"></i> Guardar</button>
                      <button class="btn btn-sm btn-secondary" (click)="cancelEdit()"><i class="fas fa-times"></i> Cancelar</button>
                    } @else {
                      <button class="btn-icon btn-primary" (click)="startEdit(u)" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="btn-icon btn-danger" (click)="remove(u)" title="Eliminar"><i class="fas fa-trash"></i></button>
                    }
                  </div>
                </div>
              }
            </div>
            <ng-template #emptyCompany>
              <div class="empty-state">
                <i class="fas fa-inbox fa-3x"></i>
                <p>No hay unidades personalizadas</p>
              </div>
            </ng-template>
          </div>
        </div>
      }
  `,
  styles: [`
    .header-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem}
    .btn-back{display:inline-flex;align-items:center;gap:.5rem;background:#e5e7eb;border:1px solid #d1d5db;padding:.5rem .75rem;border-radius:.375rem}
    .subtitle{color:#6b7280;margin:0.25rem 0 1rem}
    .loading-container{display:flex;flex-direction:column;align-items:center;gap:.75rem;color:#6b7280}
    
    /* Two Column Layout */
    .two-columns-layout{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem}
    
    @media (max-width: 1024px) {
      .two-columns-layout {
        grid-template-columns: 1fr;
      }
    }

    .section{background:white;border-radius:.75rem;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.1)}
    .section h3{color:#1f2937;margin-bottom:.75rem;display:flex;align-items:center;gap:.5rem;font-size:1.125rem}
    .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem}
    .section-header h3{margin:0}
    .info-text{font-size:.875rem;color:#4b5563;padding:.75rem;background:#f3f4f6;border-radius:.5rem;margin-bottom:1rem;display:flex;align-items:center;gap:.5rem}
    
    /* Units Grid - 2 columns */
    .units-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    
    @media (max-width: 768px) {
      .units-grid {
        grid-template-columns: 1fr;
      }
    }

    .unit-card{display:flex;flex-direction:column;gap:0.75rem;border:2px solid #e5e7eb;border-radius:.5rem;padding:1rem;transition:all .2s}
    .unit-card:hover{box-shadow:0 4px 6px rgba(0,0,0,.1)}
    .unit-card.hidden-item{opacity:0.6;border-color:#d1d5db;background-color:#f9fafb}
    .unit-card.generic{background:#f9fafb}
    
    .card-body{flex:1}
    .title-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
    .name{font-weight:600;color:#1f2937}
    .meta{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem}
    .desc{font-size:.875rem;color:#6b7280}
    
    .actions{display:flex;gap:.5rem}
    
    .badge{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:9999px;padding:.125rem .5rem;font-size:.75rem;color:#374151}
    .badge-system{background:#eef2ff;color:#3730a3;border-color:#c7d2fe}
    .badge-company{background:#ecfeff;color:#155e75;border-color:#a5f3fc}
    .badge-hidden{background:#fee2e2;color:#991b1b;border-color:#fecaca}
    
    .btn{border:1px solid #e5e7eb;border-radius:.375rem;padding:.375rem .625rem;cursor:pointer;transition:all .2s}
    .btn-outline{background:#fff}
    .btn-success{background:#10b981;color:#fff;border-color:#059669}
    .btn-success:hover{background:#059669}
    .btn-primary{background:#6366f1;color:#fff;border-color:#4f46e5}
    .btn-primary:hover{background:#4f46e5}
    .btn-danger{background:#ef4444;color:#fff;border-color:#dc2626}
    .btn-danger:hover{background:#dc2626}
    .btn-secondary{background:#e5e7eb;color:#374151}
    .btn-secondary:hover{background:#d1d5db}
    .btn-sm{font-size:.875rem;padding:.25rem .5rem}
    .btn-icon{border:1px solid #e5e7eb;border-radius:.375rem;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
    
    .form-card{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem;background:white}
    .form-card h4{margin:0 0 1rem;color:#1f2937}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .form-group{display:flex;flex-direction:column;gap:.25rem}
    .form-group label{font-size:.875rem;font-weight:500;color:#374151}
    .form-control{border:1px solid #e5e7eb;border-radius:.375rem;padding:.5rem;font-size:.875rem}
    .form-actions{display:flex;gap:.5rem;margin-top:.5rem}
    
    .empty-state{text-align:center;padding:2rem;color:#9ca3af}
    .empty-state i{margin-bottom:.5rem;color:#d1d5db}
  `]
})
export class UnitsManagementComponent implements OnInit {
  private unitsSvc = inject(SupabaseUnitsService);
  private toast = inject(ToastService);

  loading = false;
  showCreateForm = false;
  creating = false;
  toggling: Record<string, boolean> = {};
  hidingAllGenericUnits = false;

  genericUnits: Array<UnitOfMeasure & { is_hidden?: boolean }> = [];
  companyUnits: UnitOfMeasure[] = [];

  newUnit: { name: string; code: string; description?: string } = { name: '', code: '' };
  editingId: string | null = null;
  editUnit: { name?: string; code?: string; description?: string } = {};

  async ngOnInit() { await this.load(); }

  private async load() {
    this.loading = true;
    try {
      // Generic (server-annotated)
      const cfg = await this.unitsSvc.getConfigUnits();
      if (cfg.error) throw new Error(cfg.error?.message || 'Error unidades genéricas');
      this.genericUnits = cfg.units || [];

  // Company-specific (listUnits already excludes deleted)
  const all = await this.unitsSvc.listUnits(true);
  this.companyUnits = (all || []).filter(u => u.company_id !== null);
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'Error cargando unidades');
    } finally { this.loading = false; }
  }

  async create() {
    if (!this.newUnit.name || !this.newUnit.code) {
      this.toast.error('Campos requeridos', 'Nombre y código son obligatorios');
      return;
    }
    this.creating = true;
    try {
      await this.unitsSvc.createUnit({ ...this.newUnit });
      this.toast.success('Unidad creada', `${this.newUnit.name} creada correctamente`);
      this.newUnit = { name: '', code: '' };
      this.showCreateForm = false;
      await this.load();
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo crear la unidad');
    } finally { this.creating = false; }
  }

  cancelCreate() { this.newUnit = { name: '', code: '' }; this.showCreateForm = false; }

  startEdit(u: UnitOfMeasure) {
    this.editingId = u.id;
    this.editUnit = { name: u.name, code: u.code, description: u.description };
  }
  cancelEdit() { this.editingId = null; this.editUnit = {}; }

  async saveEdit() {
    if (!this.editingId) return;
    try {
      await this.unitsSvc.updateUnit(this.editingId, this.editUnit);
      this.toast.success('Unidad actualizada', 'Cambios guardados correctamente');
      this.editingId = null;
      await this.load();
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo actualizar');
    }
  }

  async remove(u: UnitOfMeasure) {
    if (!confirm('¿Eliminar esta unidad personalizada?')) return;
    try {
      await this.unitsSvc.softDeleteUnit(u.id);
      this.toast.success('Unidad eliminada', `${u.name} eliminada`);
      await this.load();
    } catch (e: any) { this.toast.error('Error', e?.message || 'No se pudo eliminar'); }
  }

  async hide(u: UnitOfMeasure) {
    this.toggling = { ...this.toggling, [u.id]: true };
    try {
      const res = await this.unitsSvc.hideGenericUnit(u.id);
      if (res.error) throw new Error(res.error?.message || 'Error ocultando unidad');
      // local update
      const idx = this.genericUnits.findIndex(x => x.id === u.id);
      if (idx !== -1) { this.genericUnits[idx] = { ...this.genericUnits[idx], is_hidden: true }; this.genericUnits = [...this.genericUnits]; }
      this.toast.success('Unidad ocultada', `"${u.name}" ocultada correctamente`);
    } catch (e: any) { this.toast.error('Error', e?.message || 'No se pudo ocultar'); }
    finally { this.toggling = { ...this.toggling, [u.id]: false }; }
  }

  async unhide(u: UnitOfMeasure) {
    this.toggling = { ...this.toggling, [u.id]: true };
    try {
      const res = await this.unitsSvc.unhideGenericUnit(u.id);
      if (res.error) throw new Error(res.error?.message || 'Error mostrando unidad');
      const idx = this.genericUnits.findIndex(x => x.id === u.id);
      if (idx !== -1) { this.genericUnits[idx] = { ...this.genericUnits[idx], is_hidden: false }; this.genericUnits = [...this.genericUnits]; }
      this.toast.success('Unidad mostrada', `"${u.name}" ahora está visible`);
    } catch (e: any) { this.toast.error('Error', e?.message || 'No se pudo mostrar'); }
    finally { this.toggling = { ...this.toggling, [u.id]: false }; }
  }

  async hideAllSystemUnits() {
    if (!confirm('¿Estás seguro de que quieres ocultar todas las unidades del sistema visibles?')) return;
    this.hidingAllGenericUnits = true;
    try {
      const toHide = this.genericUnits.filter(u => !u.is_hidden);
      for (const u of toHide) {
        const res = await this.unitsSvc.hideGenericUnit(u.id);
        if (res.error) throw res.error;
      }
      this.toast.success('Operación completada', 'Todas las unidades del sistema visibles han sido ocultadas');
      await this.load();
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo ocultar todas las unidades');
    } finally {
      this.hidingAllGenericUnits = false;
    }
  }
}
