import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseUnitsService, UnitOfMeasure } from '../../../services/supabase-units.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-units-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- Header -->
    <div class="mb-6">
      <div class="flex justify-between items-center mb-4">
        <button class="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" routerLink="/configuracion" title="Volver a Configuración">
          <i class="fas fa-arrow-left"></i> Volver
        </button>
      </div>
    </div>

    @if (loading) {
      <div class="flex flex-col items-center gap-3 text-gray-500 py-12">
        <i class="fas fa-spinner fa-spin fa-3x"></i>
        <p>Cargando unidades...</p>
      </div>
    }

    @if (!loading) {
      <!-- Two Column Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <!-- Genéricas -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2"><i class="fas fa-globe"></i> Unidades del Sistema</h3>
            <button class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="hideAllSystemUnits()" [disabled]="hidingAllGenericUnits" title="Ocultar todas las unidades del sistema">
              <i class="fas fa-eye-slash mr-1"></i> Ocultar Todos
            </button>
          </div>
          <p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-4 flex items-center gap-2">
            <i class="fas fa-info-circle"></i>
            Unidades predeterminadas. Puedes ocultarlas si no las necesitas.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (u of genericUnits; track u.id) {
              <div class="flex flex-col gap-3 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-gray-50" [class.opacity-60]="u.is_hidden">
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-2">
                    <div class="font-semibold text-gray-900">{{ u.name }}</div>
                    <div class="flex gap-1">
                      @if (u.is_hidden) { <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-1">Oculto</span> }
                      <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{{ u.code }}</span>
                    </div>
                  </div>
                  <div class="text-sm text-gray-500" *ngIf="u.description">{{ u.description }}</div>
                </div>
                <div class="flex gap-2">
                  @if (u.is_hidden) {
                    <button class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500" (click)="unhide(u)" [disabled]="!!toggling[u.id]">
                      <i class="fas fa-eye mr-1"></i> Mostrar
                    </button>
                  } @else {
                    <button class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="hide(u)" [disabled]="!!toggling[u.id]">
                      <i class="fas fa-eye-slash mr-1"></i> Ocultar
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Empresa -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-900 flex items-center gap-2"><i class="fas fa-building"></i> Unidades Personalizadas</h3>
            <button class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="showCreateForm = !showCreateForm">
              <i class="fas mr-1" [class.fa-plus]="!showCreateForm" [class.fa-times]="showCreateForm"></i>
              {{ showCreateForm ? 'Cancelar' : 'Nueva Unidad' }}
            </button>
          </div>

            @if (showCreateForm) {
              <div class="border border-gray-200 rounded-lg p-4 mb-4 bg-white shadow-sm">
                <h4 class="text-gray-900 font-medium mb-4">Nueva Unidad</h4>
                <form (ngSubmit)="create()" class="space-y-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Nombre *</label>
                      <input class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" [(ngModel)]="newUnit.name" name="name" required />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label class="text-sm font-medium text-gray-700">Código *</label>
                      <input class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" [(ngModel)]="newUnit.code" name="code" required />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label class="text-sm font-medium text-gray-700">Descripción</label>
                    <input class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" [(ngModel)]="newUnit.description" name="description" />
                  </div>
                  <div class="flex gap-2 justify-end pt-2">
                    <button class="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" type="button" (click)="cancelCreate()">Cancelar</button>
                    <button class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500" type="submit" [disabled]="creating">
                      <i class="fas mr-1" [class.fa-spinner]="creating" [class.fa-spin]="creating" [class.fa-save]="!creating"></i>
                      {{ creating ? 'Guardando...' : 'Guardar' }}
                    </button>
                  </div>
                </form>
              </div>
            }

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4" *ngIf="companyUnits.length; else emptyCompany">
              @for (u of companyUnits; track u.id) {
                <div class="flex flex-col gap-3 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div class="flex-1">
                    @if (editingId === u.id) {
                      <div class="space-y-3">
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-700">Nombre</label>
                          <input class="block w-full px-2 py-1 border border-gray-300 rounded-md text-sm" [(ngModel)]="editUnit.name" name="editName" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-700">Código</label>
                          <input class="block w-full px-2 py-1 border border-gray-300 rounded-md text-sm" [(ngModel)]="editUnit.code" name="editCode" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-xs font-medium text-gray-700">Descripción</label>
                          <input class="block w-full px-2 py-1 border border-gray-300 rounded-md text-sm" [(ngModel)]="editUnit.description" name="editDesc" />
                        </div>
                      </div>
                    } @else {
                      <div class="flex justify-between items-start mb-2">
                        <div class="font-semibold text-gray-900">{{ u.name }}</div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">Personalizada</span>
                      </div>
                      <div class="mb-2"><span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{{ u.code }}</span></div>
                      <div class="text-sm text-gray-500" *ngIf="u.description">{{ u.description }}</div>
                    }
                  </div>
                  <div class="actions">
                    @if (editingId === u.id) {
                      <button class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500" (click)="saveEdit()"><i class="fas fa-check mr-1"></i> Guardar</button>
                      <button class="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500" (click)="cancelEdit()"><i class="fas fa-times mr-1"></i> Cancelar</button>
                    } @else {
                      <button class="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors" (click)="startEdit(u)" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors" (click)="remove(u)" title="Eliminar"><i class="fas fa-trash"></i></button>
                    }
                  </div>
                </div>
              }
            </div>
            <ng-template #emptyCompany>
              <div class="text-center py-12 text-gray-400">
                <i class="fas fa-inbox fa-3x mb-2"></i>
                <p>No hay unidades personalizadas</p>
              </div>
            </ng-template>
          </div>
        </div>
      }
  `,
  styles: []
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
