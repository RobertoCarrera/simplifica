import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-project-dialog-rename-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      >
        <div
          class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 m-4 border border-gray-100 dark:border-gray-700 transform transition-all scale-100"
        >
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Renombrar</h3>
          <input
            type="text"
            [(ngModel)]="renameName"
            (keyup.enter)="onConfirm()"
            autofocus
            autocomplete="off"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-all"
          />
          <div class="flex justify-end space-x-3 pt-2">
            <button
              (click)="close.emit()"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
            >
              Cancelar
            </button>
            <button
              (click)="onConfirm()"
              [disabled]="!renameName.trim()"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectDialogRenameModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() initialName = '';
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string>();

  renameName = '';

  ngOnChanges() {
    if (this.isOpen) {
      this.renameName = this.initialName;
    }
  }

  onConfirm() {
    if (!this.renameName.trim()) return;
    this.confirm.emit(this.renameName);
  }
}
