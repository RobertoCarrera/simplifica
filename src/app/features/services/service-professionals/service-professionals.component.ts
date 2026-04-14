import { Component, Input, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseProfessionalsService, Professional } from '../../../services/supabase-professionals.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';

interface AssignedProfessional {
  id: string; // professional_services row id
  professional_id: string;
  display_name: string;
  avatar_url: string | null;
  is_primary: boolean;
}

@Component({
  selector: 'app-service-professionals',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="service-professionals-container">
      <!-- Assigned professionals list -->
      @if (loading) {
        <div class="flex items-center justify-center py-6 text-gray-400">
          <i class="fas fa-spinner fa-spin mr-2"></i> Cargando...
        </div>
      } @else if (assigned.length === 0) {
        <div class="text-center py-6 text-gray-400 dark:text-gray-500">
          <i class="fas fa-user-md text-2xl mb-2"></i>
          <p class="text-sm">No hay profesionales asignados a este servicio.</p>
        </div>
      } @else {
        <div class="space-y-2">
          @for (p of assigned; track p.id) {
            <div
              class="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600"
            >
              <!-- Avatar / Initials -->
              <div
                class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                [class]="p.avatar_url ? '' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'"
              >
                @if (p.avatar_url) {
                  <img
                    [src]="p.avatar_url"
                    [alt]="p.display_name"
                    class="w-8 h-8 rounded-full object-cover"
                  />
                } @else {
                  {{ getInitials(p.display_name) }}
                }
              </div>

              <!-- Name -->
              <span class="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">
                {{ p.display_name }}
              </span>

              <!-- Primary badge -->
              @if (p.is_primary) {
                <span
                  class="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium"
                >
                  Principal
                </span>
              }

              <!-- Toggle primary -->
              <button
                type="button"
                class="p-1.5 rounded text-gray-400 hover:text-amber-500 transition-colors"
                [title]="p.is_primary ? 'Quitar como principal' : 'Marcar como principal'"
                (click)="togglePrimary(p)"
              >
                <i class="fas fa-star" [class.text-amber-500]="p.is_primary"></i>
              </button>

              <!-- Remove -->
              <button
                type="button"
                class="p-1.5 rounded text-gray-400 hover:text-red-500 transition-colors"
                title="Quitar profesional"
                (click)="removeAssignment(p)"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
          }
        </div>
      }

      <!-- Add professional -->
      <div class="mt-3 relative">
        @if (!showDropdown) {
          <button
            type="button"
            class="w-full px-4 py-2 text-sm font-medium rounded-lg border-2 border-dashed border-gray-300 dark:border-slate-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
            (click)="openDropdown()"
            [disabled]="!serviceId"
          >
            <i class="fas fa-plus mr-1"></i> Añadir profesional
          </button>
        } @else {
          <div
            class="border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 shadow-lg overflow-hidden"
          >
            <!-- Search input -->
            <div class="p-2 border-b border-gray-100 dark:border-slate-600">
              <input
                #searchInput
                type="text"
                class="w-full px-3 py-1.5 text-sm rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Buscar profesional..."
                (input)="filterAvailable($any($event.target).value)"
              />
            </div>
            <!-- Options -->
            <div class="max-h-48 overflow-y-auto">
              @if (filteredAvailable.length === 0) {
                <div class="px-3 py-4 text-sm text-gray-400 text-center">
                  No hay profesionales disponibles
                </div>
              }
              @for (p of filteredAvailable; track p.id) {
                <button
                  type="button"
                  class="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-2 transition-colors"
                  (click)="addProfessional(p)"
                >
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
                    [class]="p.avatar_url ? '' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'"
                  >
                    @if (p.avatar_url) {
                      <img
                        [src]="p.avatar_url"
                        [alt]="p.display_name"
                        class="w-6 h-6 rounded-full object-cover"
                      />
                    } @else {
                      {{ getInitials(p.display_name) }}
                    }
                  </div>
                  <span class="text-gray-700 dark:text-gray-200">{{ p.display_name }}</span>
                </button>
              }
            </div>
            <!-- Close -->
            <div class="p-2 border-t border-gray-100 dark:border-slate-600 text-right">
              <button
                type="button"
                class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                (click)="showDropdown = false"
              >
                Cerrar
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ServiceProfessionalsComponent implements OnInit, OnChanges {
  private supabaseService = inject(SimpleSupabaseService);
  private profService = inject(SupabaseProfessionalsService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);

  @Input() serviceId = '';
  @Input() companyId = '';

  assigned: AssignedProfessional[] = [];
  allProfessionals: Professional[] = [];
  filteredAvailable: Professional[] = [];
  loading = false;
  showDropdown = false;

  ngOnInit() {
    if (this.serviceId && this.companyId) {
      this.loadData();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['serviceId'] && !changes['serviceId'].firstChange && this.serviceId) {
      this.loadData();
    }
  }

  async loadData() {
    this.loading = true;
    try {
      await Promise.all([this.loadAssigned(), this.loadAllProfessionals()]);
    } finally {
      this.loading = false;
    }
  }

  private async loadAssigned() {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('professional_services')
      .select('id, professional_id, is_primary, professional:professionals(id, display_name, avatar_url)')
      .eq('service_id', this.serviceId);

    if (error) {
      console.error('Error loading service professionals:', error);
      return;
    }

    this.assigned = (data || []).map((row: any) => ({
      id: row.id,
      professional_id: row.professional_id,
      display_name: row.professional?.display_name ?? 'Sin nombre',
      avatar_url: row.professional?.avatar_url ?? null,
      is_primary: row.is_primary ?? false,
    }));
  }

  private async loadAllProfessionals() {
    if (!this.companyId) return;
    try {
      const pros = await new Promise<Professional[]>((resolve, reject) => {
        this.profService.getProfessionals(this.companyId).subscribe({
          next: resolve,
          error: reject,
        });
      });
      this.allProfessionals = pros;
    } catch (e) {
      console.error('Error loading professionals:', e);
    }
  }

  openDropdown() {
    this.filterAvailable('');
    this.showDropdown = true;
  }

  filterAvailable(term: string) {
    const assignedIds = new Set(this.assigned.map(a => a.professional_id));
    const lowerTerm = term.toLowerCase();
    this.filteredAvailable = this.allProfessionals
      .filter(p => !assignedIds.has(p.id))
      .filter(p => !lowerTerm || p.display_name.toLowerCase().includes(lowerTerm));
  }

  async addProfessional(p: Professional) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('professional_services')
      .insert({ service_id: this.serviceId, professional_id: p.id });

    if (error) {
      this.toastService.error('Error', 'Error al asignar profesional');
      console.error(error);
      return;
    }

    this.showDropdown = false;
    await this.loadAssigned();
    this.toastService.success('Asignado', `${p.display_name} asignado`);
  }

  async removeAssignment(p: AssignedProfessional) {
    const supabase = this.supabaseService.getClient();
    const { error } = await supabase
      .from('professional_services')
      .delete()
      .eq('id', p.id);

    if (error) {
      this.toastService.error('Error', 'Error al quitar profesional');
      console.error(error);
      return;
    }

    this.assigned = this.assigned.filter(a => a.id !== p.id);
    this.toastService.success('Quitado', `${p.display_name} quitado`);
  }

  async togglePrimary(p: AssignedProfessional) {
    const supabase = this.supabaseService.getClient();
    const newValue = !p.is_primary;

    // If setting as primary, first clear any existing primary for this service
    if (newValue) {
      const currentPrimary = this.assigned.find(a => a.is_primary && a.id !== p.id);
      if (currentPrimary) {
        await supabase
          .from('professional_services')
          .update({ is_primary: false })
          .eq('id', currentPrimary.id);
      }
    }

    const { error } = await supabase
      .from('professional_services')
      .update({ is_primary: newValue })
      .eq('id', p.id);

    if (error) {
      this.toastService.error('Error', 'Error al cambiar profesional principal');
      console.error(error);
      return;
    }

    // Update local state
    this.assigned = this.assigned.map(a => ({
      ...a,
      is_primary: a.id === p.id ? newValue : (newValue ? false : a.is_primary),
    }));
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join('');
  }
}
