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
    <div class="units-management-container">
      <div class="header">
        <div class="header-top">
          <button class="btn-back" routerLink="/configuracion" title="Volver a Configuración">
            <i class="fas fa-arrow-left"></i> Volver
          </button>
        </div>
        <h2><i class="fas fa-ruler-combined"></i> Gestión de Unidades de Medida</h2>
        <p class="subtitle">Configura las unidades por defecto y personalizadas para tu empresa</p>
      </div>

      @if (loading) {
        <div class="loading-container">
          <i class="fas fa-spinner fa-spin fa-3x"></i>
          <p>Cargando unidades...</p>
        </div>
      }

      @if (!loading) {
        <div class="controls-row">
          <button class="btn btn-primary" (click)="showCreateForm = !showCreateForm">
            <i class="fas" [class.fa-plus]="!showCreateForm" [class.fa-times]="showCreateForm"></i>
            {{ showCreateForm ? 'Cancelar' : 'Nueva Unidad' }}
          </button>
        </div>

        <div class="two-columns">
          <!-- Genéricas -->
          <div class="section">
            <h3><i class="fas fa-globe"></i> Unidades del Sistema (Predeterminadas)</h3>
            <p class="info-text">
              <i class="fas fa-info-circle"></i>
              Estas unidades están disponibles para todas las empresas. Puedes ocultarlas si no las necesitas.
            </p>

            <div class="cards">
              @for (u of genericUnits; track u.id) {
                <div class="card generic" [class.hidden-item]="u.is_hidden">
                  <div class="card-body">
                    <div class="title-row">
                      <div class="name">{{ u.name }}</div>
                      @if (u.is_hidden) { <span class="badge badge-hidden">Oculto</span> }
                    </div>
                    <div class="meta">
                      <span class="badge">Código: {{ u.code }}</span>
                      <span class="badge badge-system">Sistema</span>
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
            <h3><i class="fas fa-building"></i> Unidades Personalizadas</h3>

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

            <div class="cards" *ngIf="companyUnits.length; else emptyCompany">
              @for (u of companyUnits; track u.id) {
                <div class="card company">
                  <div class="card-body">
                    @if (editingId === u.id) {
                      <div class="edit-row">
                        <input class="form-control" [(ngModel)]="editUnit.name" name="editName" />
                        <input class="form-control" [(ngModel)]="editUnit.code" name="editCode" />
                      </div>
                      <input class="form-control" [(ngModel)]="editUnit.description" name="editDesc" />
                    } @else {
                      <div class="title-row">
                        <div class="name">{{ u.name }}</div>
                        <span class="badge badge-company">Personalizada</span>
                      </div>
                      <div class="meta"><span class="badge">Código: {{ u.code }}</span></div>
                      <div class="desc" *ngIf="u.description">{{ u.description }}</div>
                    }
                  </div>
                  <div class="actions">
                    @if (editingId === u.id) {
                      <button class="btn-icon btn-success" (click)="saveEdit()"><i class="fas fa-check"></i></button>
                      <button class="btn-icon btn-secondary" (click)="cancelEdit()"><i class="fas fa-times"></i></button>
                    } @else {
                      <button class="btn-icon btn-primary" (click)="startEdit(u)"><i class="fas fa-edit"></i></button>
                      <button class="btn-icon btn-danger" (click)="remove(u)"><i class="fas fa-trash"></i></button>
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
    </div>
  `,
  styles: [`
    .units-management-container{padding:1.5rem;max-width:1200px;margin:0 auto}
    .header-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem}
    .btn-back{display:inline-flex;align-items:center;gap:.5rem;background:#e5e7eb;border:1px solid #d1d5db;padding:.5rem .75rem;border-radius:.375rem}
    .subtitle{color:#6b7280;margin:0.25rem 0 1rem}
    .loading-container{display:flex;flex-direction:column;align-items:center;gap:.75rem;color:#6b7280}
    .controls-row{display:flex;gap:.5rem;justify-content:flex-end;margin:0 0 1rem}
    .two-columns{display:grid;grid-template-columns:1fr 1fr;gap:1.25rem}
    .section{background:#fff;border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem}
    .info-text{font-size:.875rem;color:#374151;margin:.25rem 0 1rem}
    .cards{display:grid;grid-template-columns:1fr;gap:.75rem}
    .card{display:flex;align-items:stretch;gap:.75rem;border:1px solid #e5e7eb;border-radius:.5rem;padding:.75rem}
    .card.generic.hidden-item{opacity:.6}
    .card-body{flex:1}
    .title-row{display:flex;align-items:center;gap:.5rem;font-weight:600}
    .name{font-size:1rem}
    .meta{display:flex;gap:.5rem;margin-top:.25rem}
    .desc{margin-top:.25rem;color:#374151}
    .badge{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:9999px;padding:.125rem .5rem;font-size:.75rem;color:#374151}
    .badge-system{background:#eef2ff;color:#3730a3;border-color:#c7d2fe}
    .badge-company{background:#ecfeff;color:#155e75;border-color:#a5f3fc}
    .badge-hidden{background:#fee2e2;color:#991b1b;border-color:#fecaca}
    .actions{display:flex;align-items:center;gap:.5rem}
    .btn{border:1px solid #e5e7eb;border-radius:.375rem;padding:.375rem .625rem}
    .btn-outline{background:#fff}
    .btn-success{background:#10b981;color:#fff;border-color:#059669}
    .btn-primary{background:#6366f1;color:#fff;border-color:#4f46e5}
    .btn-danger{background:#ef4444;color:#fff;border-color:#dc2626}
    .btn-secondary{background:#e5e7eb}
    .btn-icon{border:1px solid #e5e7eb;border-radius:.375rem;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center}
    .form-card{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem;margin-bottom:1rem}
    .form-row{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .form-group{display:flex;flex-direction:column;gap:.25rem}
    .form-control{border:1px solid #e5e7eb;border-radius:.375rem;padding:.5rem}
    .form-actions{display:flex;gap:.5rem;margin-top:.5rem}
    @media (max-width: 900px){.two-columns{grid-template-columns:1fr}}
  `]
})
export class UnitsManagementComponent implements OnInit {
  private unitsSvc = inject(SupabaseUnitsService);
  private toast = inject(ToastService);

  loading = false;
  showCreateForm = false;
  creating = false;
  toggling: Record<string, boolean> = {};

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
}
