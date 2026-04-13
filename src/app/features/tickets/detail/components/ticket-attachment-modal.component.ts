import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-attachment-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay" (click)="close.emit()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">
              <i class="fas fa-paperclip"></i>
              Adjuntar Archivo
            </h2>
            <button (click)="close.emit()" class="modal-close" aria-label="Cerrar modal">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Seleccionar Archivo</label>
              <input
                type="file"
                (change)="onFileSelected($event)"
                class="form-input"
                accept="image/*,.pdf,.doc,.docx,.txt"
              />
              <small class="form-help">
                Formatos permitidos: imágenes, PDF, documentos de Word, texto
              </small>
            </div>
            @if (selectedFile()) {
              <div class="file-preview">
                <div class="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                  <i class="fas fa-file text-blue-500"></i>
                  <span class="text-sm font-medium">{{ selectedFile()!.name }}</span>
                  <span class="text-xs text-gray-500"
                    >({{ (selectedFile()!.size / 1024 / 1024).toFixed(2) }} MB)</span
                  >
                </div>
              </div>
            }
          </div>
          <div class="modal-actions">
            <button (click)="close.emit()" class="btn btn-secondary">Cancelar</button>
            <button
              (click)="upload.emit(selectedFile())"
              [disabled]="!selectedFile()"
              class="btn btn-primary"
            >
              <i class="fas fa-upload"></i>
              Subir Archivo
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketAttachmentModalComponent {
  @Input() show = false;
  @Output() close = new EventEmitter<void>();
  @Output() upload = new EventEmitter<File | null>();

  selectedFile = signal<File | null>(null);

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }
}
