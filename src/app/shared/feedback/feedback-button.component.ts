import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedbackModalComponent } from './feedback-modal.component';

@Component({
  selector: 'app-feedback-button',
  standalone: true,
  imports: [CommonModule, FeedbackModalComponent],
  template: `
    <!-- Sidebar Feedback Button -->
    <button
      type="button"
      (click)="openModal()"
      class="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
      title="Enviar feedback"
    >
      <i class="fas fa-question-circle w-5"></i>
      <span>Feedback</span>
    </button>

    <!-- Modal -->
    <app-feedback-modal
      [visible]="modalVisible()"
      (closed)="onModalClosed()"
      (submitted)="onModalSubmitted()"
    ></app-feedback-modal>
  `,
})
export class FeedbackButtonComponent {
  modalVisible = signal(false);

  openModal(): void {
    this.modalVisible.set(true);
  }

  onModalClosed(): void {
    this.modalVisible.set(false);
  }

  onModalSubmitted(): void {
    this.modalVisible.set(false);
  }
}
