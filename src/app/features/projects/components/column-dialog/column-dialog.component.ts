import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../../../core/services/projects.service';
import { AppModalComponent } from '../../../../shared/ui/app-modal/app-modal.component';

@Component({
  selector: 'app-column-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, AppModalComponent],
  template: `
    <app-modal [visible]="visible" (close)="onClose()">
      <div class="w-full max-w-sm mx-auto">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div>
            <h2 class="text-lg font-bold text-gray-800 dark:text-white">{{ stageToEdit ? 'Editar Columna' : 'Nueva Columna' }}</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ stageToEdit ? 'Modifica el nombre de la etapa.' : 'Añade una nueva etapa a tu tablero.' }}</p>
          </div>
          <button (click)="onClose()" class="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="p-6">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Etapa</label>
          <input type="text" [(ngModel)]="name" placeholder="Ej: En Revisión"
            class="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm shadow-sm"
            (keyup.enter)="save()"
            autoFocus>
        </div>

        <div class="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end space-x-3">
          <button (click)="onClose()"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition-colors shadow-sm">
            Cancelar
          </button>
          <button (click)="save()" [disabled]="!name.trim() || isSaving"
            class="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
            <span *ngIf="isSaving" class="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
            {{ stageToEdit ? 'Guardar Cambios' : 'Crear Etapa' }}
          </button>
        </div>
      </div>
    </app-modal>
  `
})
export class ColumnDialogComponent {
  @Input() visible = false;
  @Input() stageToEdit: { id: string, name: string } | null = null;
  @Output() close = new EventEmitter<boolean>();

  private projectsService = inject(ProjectsService);
  name = '';
  isSaving = false;

  ngOnChanges() {
    if (this.visible && this.stageToEdit) {
      this.name = this.stageToEdit.name;
    } else if (this.visible && !this.stageToEdit) {
      this.name = '';
    }
  }

  onClose() {
    this.name = '';
    this.close.emit(false);
  }

  save() {
    if (!this.name.trim()) return;
    this.isSaving = true;

    if (this.stageToEdit) {
      this.projectsService.updateStage(this.stageToEdit.id, { name: this.name }).subscribe({
        next: () => {
          this.isSaving = false;
          this.name = '';
          this.close.emit(true);
        },
        error: (err) => {
          console.error('Error updating stage', err);
          this.isSaving = false;
        }
      });
    } else {
      // Use current time as default position sort of logic, 
      // real logic requires knowing max position of existing stages but for now just push.
      this.projectsService.createStage({ name: this.name, position: 999 }).subscribe({
        next: () => {
          this.isSaving = false;
          this.name = '';
          this.close.emit(true);
        },
        error: (err) => {
          console.error('Error creating stage', err);
          this.isSaving = false;
        }
      });
    }
  }
}
