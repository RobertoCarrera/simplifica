import { Component, EventEmitter, Input, Output, inject, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../../../core/services/projects.service';
import { ProjectStage } from '../../../../models/project';
import { AppModalComponent } from '../../../../shared/ui/app-modal/app-modal.component';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-column-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent],
  template: `
    <app-modal [visible]="visible" (close)="onClose()">
      <div class="w-full max-w-2xl mx-auto">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div>
            <h2 class="text-lg font-bold text-gray-800 dark:text-white">Configurar Etapas</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Administra, reordena y configura las etapas del tablero.</p>
          </div>
          <button (click)="onClose()" class="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <!-- Stages List -->
          <div class="space-y-3">
             <div *ngFor="let s of sortedStages; let i = index" 
                  class="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-sm transition-shadow">
               
               <!-- Reorder Handles -->
               <div class="flex flex-col gap-1">
                 <button (click)="moveStage(-1, i)" [disabled]="i === 0" class="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" /></svg>
                 </button>
                 <button (click)="moveStage(1, i)" [disabled]="i === sortedStages.length - 1" class="text-gray-400 hover:text-blue-500 disabled:opacity-30">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                 </button>
               </div>

               <!-- Stage Info -->
               <div class="flex-1 min-w-0">
                 <div class="flex items-center gap-2 mb-1">
                   <span class="text-xs font-mono text-gray-400 w-5">{{i + 1}}</span>
                   <h3 class="font-medium text-gray-900 dark:text-gray-100 truncate" [title]="s.name">{{ s.name }}</h3>
                 </div>
                 
                 <!-- Toggles -->
                 <div class="flex flex-wrap gap-4 mt-2">
                   <!-- Review Toggle -->
                   <label class="flex items-center gap-2 cursor-pointer group">
                     <div class="relative inline-flex items-center">
                       <input type="checkbox" [checked]="s.is_review" (change)="toggleStageType(s, 'review')" class="sr-only peer">
                       <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-600 peer-checked:bg-amber-500"></div>
                     </div>
                     <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors flex items-center gap-1">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                       Revisión
                     </span>
                   </label>

                   <!-- Default Toggle -->
                   <label class="flex items-center gap-2 cursor-pointer group">
                     <div class="relative inline-flex items-center">
                       <input type="checkbox" [checked]="s.is_default" (change)="toggleStageType(s, 'default')" class="sr-only peer">
                       <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-600 peer-checked:bg-blue-500"></div>
                     </div>
                     <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>
                       Proceso
                     </span>
                   </label>

                   <!-- Landing Toggle -->
                   <label class="flex items-center gap-2 cursor-pointer group">
                     <div class="relative inline-flex items-center">
                       <input type="checkbox" [checked]="s.is_landing" (change)="toggleStageType(s, 'landing')" class="sr-only peer">
                       <div class="w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[0px] after:left-[0px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-600 peer-checked:bg-indigo-500"></div>
                     </div>
                     <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1">
                       <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                       Nuevos
                     </span>
                   </label>
                 </div>
               </div>

               <!-- Delete Button -->
               <button (click)="confirmDelete(s)" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Eliminar etapa">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                 </svg>
               </button>
             </div>
          </div>

          <!-- Add New Stage -->
          <div class="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg border border-gray-100 dark:border-gray-700 flex gap-3 items-center">
             <div class="flex-1">
               <input type="text" [(ngModel)]="newStageName" placeholder="Nombre de nueva etapa..." 
                      class="w-full px-4 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-sm text-gray-900 dark:text-white"
                      (keyup.enter)="createStage()">
             </div>
             <button (click)="createStage()" [disabled]="!newStageName.trim() || isCreating"
                     class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap">
               <span *ngIf="isCreating" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
               Agregar
             </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button (click)="onClose()" class="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            Listo
          </button>
        </div>
      </div>
    </app-modal>
  `
})
export class ColumnDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() allStages: ProjectStage[] = [];
  @Output() close = new EventEmitter<boolean>();

  private projectsService = inject(ProjectsService);
  private toastService = inject(ToastService);

  newStageName = '';
  isCreating = false;
  isSaving = false;
  isDeleting = false;
  sortedStages: ProjectStage[] = [];

  ngOnChanges() {
    if (this.visible) {
      this.sortedStages = [...this.allStages].sort((a, b) => a.position - b.position);
      this.newStageName = '';
    }
  }

  onClose() {
    this.close.emit(false);
  }

  moveStage(direction: -1 | 1, index: number) {
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= this.sortedStages.length) return;

    // Swap locally
    [this.sortedStages[index], this.sortedStages[newIdx]] = [this.sortedStages[newIdx], this.sortedStages[index]];

    // Save order immediately (debounce could be better but this is fine for now)
    const reorderData = this.sortedStages.map((s, i) => ({ id: s.id, position: i }));
    this.projectsService.reorderStages(reorderData).subscribe({
      error: (err) => {
        console.error('Error reordering stages', err);
        this.toastService.error('Error', 'No se pudo guardar el orden.');
        // Revert? For now just show error.
      }
    });
  }

  toggleStageType(stage: ProjectStage, type: 'review' | 'default' | 'landing') {
    const stageId = stage.id;
    const companyId = stage.company_id;
    const currentValue = type === 'review' ? stage.is_review : type === 'default' ? stage.is_default : stage.is_landing;

    if (currentValue) {
      // Uncheck
      const update = type === 'review' ? { is_review: false } : type === 'default' ? { is_default: false } : { is_landing: false };
      this.projectsService.updateStage(stageId, update as any).subscribe({
        next: () => {
          // Manually update local state to reflect change immediately (optimistic-ish)
          if (type === 'review') stage.is_review = false;
          if (type === 'default') stage.is_default = false;
          if (type === 'landing') stage.is_landing = false;
        },
        error: (err) => {
          this.toastService.error('Error', 'No se pudo actualizar la etapa.');
          // Revert checkbox in UI would require reloading stages or force change detection
        }
      });
    } else {
      // Check (Set exclusive)
      let obs;
      if (type === 'review') obs = this.projectsService.setReviewStage(stageId, companyId);
      else if (type === 'default') obs = this.projectsService.setDefaultStage(stageId, companyId);
      else obs = this.projectsService.setLandingStage(stageId, companyId);

      obs.subscribe({
        next: () => {
          // Update local list to reflect exclusivity
          this.sortedStages.forEach(s => {
            if (type === 'review') s.is_review = (s.id === stageId);
            if (type === 'default') s.is_default = (s.id === stageId);
            if (type === 'landing') s.is_landing = (s.id === stageId);
          });
        },
        error: (err) => {
          this.toastService.error('Error', 'No se pudo establecer la etapa.');
        }
      });
    }
  }

  createStage() {
    if (!this.newStageName.trim() || this.isCreating) return;

    this.isCreating = true;
    const maxPos = this.allStages.reduce((max, s) => Math.max(max, s.position), -1);

    this.projectsService.createStage({ name: this.newStageName, position: maxPos + 1 }).subscribe({
      next: (newStage) => {
        this.isCreating = false;
        this.newStageName = '';
        this.toastService.success('Etapa creada', 'Se ha añadido la nueva etapa.');
        // The parent component should refresh the list via realtime or manually, 
        // but let's emit close(true) if we want a hard refresh, or just wait for subscription updates?
        // ProjectsComponent listens to realtime, so 'allStages' input should update automatically logic-wise,
        // but we need to update sortedStages when input changes. 
        // We rely on ngOnChanges for that, but we might want to manually append it here for instant feedback if realtime is slow.
        // For now, let's rely on the Output event to trigger a refresh if needed, but ProjectsComponent handles data.
        this.close.emit(true);
      },
      error: (err) => {
        console.error('Error creating stage', err);
        this.isCreating = false;
        this.toastService.error('Error', 'No se pudo crear la etapa.');
      }
    });
  }

  confirmDelete(stage: ProjectStage) {
    if (!confirm(`¿Estás seguro de que quieres eliminar la etapa "${stage.name}"? Los proyectos que estén en ella perderán su etapa asignada (quedarán sin etapa o necesitarán reasignación).`)) {
      return;
    }

    // Ensure we are not deleting a special stage without warning? (User can see the icon)

    this.projectsService.deleteStage(stage.id).subscribe({
      next: () => {
        this.toastService.success('Etapa eliminada', 'La etapa se ha eliminado correctamente.');
        this.close.emit(true); // Helper to refresh parent
      },
      error: (err) => {
        console.error('Error deleting stage', err);
        this.toastService.error('Error', 'No se pudo eliminar la etapa. Puede que tenga proyectos asignados.');
      }
    });
  }

  save() {
    this.onClose();
  }
}
