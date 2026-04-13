import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-project-dialog-move-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 m-4 border border-gray-100 dark:border-gray-700 transform transition-all scale-100">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Mover a...</h3>
          <div class="max-h-60 overflow-y-auto space-y-2">
            <button
              (click)="selectedFolderId = null"
              [class.bg-blue-50]="selectedFolderId === null"
              class="w-full flex items-center px-3 py-2 text-left rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
              </svg>
              Documentos (Raíz)
              @if (selectedFolderId === null) {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-auto text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              }
            </button>
            @for (folder of availableFolders; track folder) {
              <button
                (click)="selectedFolderId = folder.id"
                [class.bg-blue-50]="selectedFolderId === folder.id"
                class="w-full flex items-center px-3 py-2 text-left rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                {{ folder.name }}
                @if (selectedFolderId === folder.id) {
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ml-auto text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                }
              </button>
            }
            @if (availableFolders.length === 0) {
              <div class="text-center text-sm text-gray-500 py-4">No hay carpetas disponibles</div>
            }
          </div>
          <div class="flex justify-end space-x-3 pt-2">
            <button (click)="close.emit()" class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 focus:outline-none transition-all">
              Cancelar
            </button>
            <button (click)="confirm.emit(selectedFolderId)" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none shadow-sm transition-all">
              Mover
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectDialogMoveModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() availableFolders: any[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<string | null>();

  selectedFolderId: string | null = null;

  ngOnChanges() {
    if (this.isOpen) {
      this.selectedFolderId = null;
    }
  }
}
