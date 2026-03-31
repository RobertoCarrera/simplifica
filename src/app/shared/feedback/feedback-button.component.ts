import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, HelpCircle } from 'lucide-angular';
import { FeedbackModalComponent } from './feedback-modal.component';
import { FeedbackService } from './feedback.service';

@Component({
  selector: 'app-feedback-button',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FeedbackModalComponent],
  template: `
    <!-- FAB: Fixed bottom-right, visible when panel is closed -->
    @if (!feedbackService.isOpen()) {
      <button
        type="button"
        (click)="feedbackService.open()"
        class="fixed bottom-4 right-4 z-[99997] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        title="Enviar feedback"
      >
        <lucide-icon name="help-circle" [size]="22"></lucide-icon>
      </button>
    }

    <!-- Panel + Close FAB (rendered by FeedbackModalComponent when open) -->
    <app-feedback-modal></app-feedback-modal>
  `,
})
export class FeedbackButtonComponent {
  feedbackService = inject(FeedbackService);
}
