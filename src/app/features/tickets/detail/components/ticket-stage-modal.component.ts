import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-stage-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show) {
      <div class="modal-overlay" (click)="close.emit()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2 class="modal-title">Cambiar Estado</h2>
            <button (click)="close.emit()" class="modal-close" aria-label="Cerrar">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="space-y-3">
              @for (stage of stages; track stage) {
                <div
                  class="p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md"
                  [class.border-blue-500]="stage.id === selectedStageId"
                  [class.bg-blue-50]="stage.id === selectedStageId"
                  [class.dark:bg-blue-900/20]="stage.id === selectedStageId"
                  [class.border-gray-200]="stage.id !== selectedStageId"
                  [class.dark:border-gray-700]="stage.id !== selectedStageId"
                  (click)="selectStage(stage.id)"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      [style.border-color]="stage.color || '#6366f1'"
                      [style.background]="stage.id === selectedStageId ? (stage.color || '#6366f1') : 'transparent'"
                    ></div>
                    <div class="flex-1">
                      <div class="font-medium text-gray-900 dark:text-gray-100">{{ stage.name }}</div>
                      @if (stage.description) {
                        <div class="text-xs text-gray-500 mt-1">{{ stage.description }}</div>
                      }
                    </div>
                    @if (stage.id === selectedStageId) {
                      <i class="fas fa-check text-blue-500"></i>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
          <div class="modal-actions">
            <button (click)="close.emit()" class="btn btn-secondary">
              Cancelar
            </button>
            <button
              (click)="save.emit(selectedStageId)"
              [disabled]="!selectedStageId"
              class="btn btn-primary"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TicketStageModalComponent {
  @Input() show = false;
  @Input() stages: any[] = [];
  @Input() selectedStageId: string | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<string | null>();
  @Output() selectStageChange = new EventEmitter<string>();

  selectStage(stageId: string) {
    this.selectedStageId = stageId;
    this.selectStageChange.emit(stageId);
  }
}
