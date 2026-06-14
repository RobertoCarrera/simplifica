import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, FileText, ChevronRight, GripVertical, Edit3, Archive, ArchiveRestore, Trash2 } from 'lucide-angular';

import { DocsCategory } from '../docs.service';
import { DocsNewEntityFormComponent } from './docs-new-entity-form.component';

/**
 * One category card in the landing grid. Renders one of three
 * states based on the parent's inputs:
 *   - view       → the clickable link to `/docs/:slug`
 *   - edit       → the inline rename form (delegated to
 *                  `DocsNewEntityFormComponent`)
 *   - new-slot   → the inline new-category form (also delegated
 *                  to `DocsNewEntityFormComponent`)
 *
 * The card wrapper is draggable in edit mode; the parent owns the
 * drag signal pair and passes the resulting booleans down. All
 * drag event handlers are forwarded to the parent as outputs.
 */
@Component({
  selector: 'app-docs-category-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, DocsNewEntityFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-category-card.component.html',
  styleUrl: './docs-category-card.component.css',
})
export class DocsCategoryCardComponent {
  @Input({ required: true }) category!: DocsCategory;

  /** Whether edit mode is globally on. */
  @Input() editing = false;
  /** Whether THIS specific card is currently in rename mode. */
  @Input() isEditingThis = false;
  /** Whether THIS card is the "new category" slot. */
  @Input() isNewSlot = false;

  /** Visual drag state. */
  @Input() isDragging = false;
  @Input() isDragOver = false;

  /** Initial values for the inline form. */
  @Input() initialName = '';
  @Input() initialSlug = '';
  @Input() initialDescription = '';
  @Input() error: string | null = null;

  /** Submit button label: "Guardar" (rename) or "Crear" (new slot). */
  @Input() submitLabel = 'Guardar';
  @Input() variant: 'category' | 'article' = 'category';

  // Drag events
  @Output() readonly dragStart = new EventEmitter<DragEvent>();
  @Output() readonly dragOver = new EventEmitter<DragEvent>();
  @Output() readonly dragLeave = new EventEmitter<void>();
  @Output() readonly dragEnd = new EventEmitter<void>();
  @Output() readonly drop = new EventEmitter<DragEvent>();

  // Action buttons
  @Output() readonly edit = new EventEmitter<void>();
  @Output() readonly archive = new EventEmitter<void>();
  @Output() readonly restore = new EventEmitter<void>();
  @Output() readonly deleteReq = new EventEmitter<void>();

  // Form
  @Output() readonly formSubmit = new EventEmitter<{ name: string; slug: string; description: string }>();
  @Output() readonly formCancel = new EventEmitter<void>();
  @Output() readonly nameChange = new EventEmitter<string>();

  readonly FileTextIcon = FileText;
  readonly ChevronRightIcon = ChevronRight;
  readonly GripVerticalIcon = GripVertical;
  readonly Edit3Icon = Edit3;
  readonly ArchiveIcon = Archive;
  readonly ArchiveRestoreIcon = ArchiveRestore;
  readonly Trash2Icon = Trash2;

  get wrapperClasses(): string {
    const base = 'docs-card-wrapper group relative transition-all duration-150';
    const editingCls = this.editing ? ' docs-card-wrapper--editing' : '';
    const archivedCls = this.category?.archived_at ? ' docs-card-wrapper--archived' : '';
    const draggingCls = this.isDragging ? ' docs-card-wrapper--dragging' : '';
    const dragOverCls = this.isDragOver ? ' docs-card-wrapper--drag-over' : '';
    return base + editingCls + archivedCls + draggingCls + dragOverCls;
  }

  onFormSubmit(values: { name: string; slug: string; description: string }): void {
    this.formSubmit.emit(values);
  }

  onFormCancel(): void {
    this.formCancel.emit();
  }

  onNameChange(v: string): void {
    this.nameChange.emit(v);
  }
}
