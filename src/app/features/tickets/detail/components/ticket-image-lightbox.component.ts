import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket-image-lightbox',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl) {
      <div
        class="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
        (click)="close.emit()"
      >
        <!-- Close Button -->
        <button
          class="absolute top-4 right-4 text-white/80 hover:text-white text-3xl z-10"
          (click)="close.emit()"
        >
          <i class="fas fa-times"></i>
        </button>
        <!-- Image -->
        <img
          [src]="imageUrl"
          class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          (click)="$event.stopPropagation()"
        />
      </div>
    }
  `,
})
export class TicketImageLightboxComponent {
  @Input() imageUrl: string | null = null;
  @Output() close = new EventEmitter<void>();
}
