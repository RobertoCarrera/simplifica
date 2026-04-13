import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ticket-hours-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay" (click)="close.emit()">
        <div class="modal-content max-w-md" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Actualizar Horas</h2>
            <button (click)="close.emit()" class="modal-close" aria-label="Cerrar">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Horas realizadas
              </label>
              <input
                type="number"
                [(ngModel)]="hours"
                min="0"
                step="0.5"
                class="form-input w-full"
                placeholder="0"
              />
              <p class="text-xs text-gray-500 mt-1">
                Añade las horas trabajadas en este ticket
              </p>
            </div>
          </div>
          <div class="modal-actions">
            <button (click)="close.emit()" class="btn btn-secondary">
              Cancelar
            </button>
            <button (click)="save.emit(hours)" class="btn btn-primary">
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketHoursModalComponent {
  @Input() show = false;
  @Input() hours = 0;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<number>();
}
