import { Injectable, signal } from '@angular/core';

/**
 * Lightweight service that coordinates drag-and-drop state between
 * message-list (drag source) and folder-tree (drop target).
 *
 * Used instead of wiring CDK connected lists across sibling components
 * because messages don't actually *transfer* between lists — we just
 * need to know which message IDs are being dragged and where they land.
 */
@Injectable({ providedIn: 'root' })
export class MailDragStateService {
  /** IDs of messages currently being dragged */
  draggedMessageIds = signal<string[]>([]);

  /** Whether a drag operation is in progress */
  isDragging = signal(false);

  setDragData(ids: string[]): void {
    this.draggedMessageIds.set(ids);
    this.isDragging.set(true);
  }

  clearDrag(): void {
    this.draggedMessageIds.set([]);
    this.isDragging.set(false);
  }
}
