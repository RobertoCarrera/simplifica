import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  /** Whether the feedback panel is open */
  isOpen = signal(false);

  /** Whether the feedback panel is minimized */
  isMinimized = signal(false);

  open(): void {
    this.isOpen.set(true);
    this.isMinimized.set(false);
  }

  close(): void {
    this.isOpen.set(false);
    this.isMinimized.set(false);
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  minimize(): void {
    this.isMinimized.set(true);
  }

  expand(): void {
    this.isMinimized.set(false);
  }

  toggleMinimized(): void {
    this.isMinimized.update((v) => !v);
  }
}
