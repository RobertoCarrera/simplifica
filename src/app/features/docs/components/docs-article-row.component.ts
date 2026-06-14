import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, FileText, ChevronRight, GripVertical } from 'lucide-angular';

import { DocsArticle } from '../docs.service';
import { DocsNewEntityFormComponent } from './docs-new-entity-form.component';

/**
 * One row in the category article list. Renders either the
 * article link or the inline "new article" form. In edit mode
 * the row is draggable for reordering within the category.
 */
@Component({
  selector: 'app-docs-article-row',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, DocsNewEntityFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-article-row.component.html',
  styleUrl: './docs-article-row.component.css',
})
export class DocsArticleRowComponent {
  @Input({ required: true }) article!: DocsArticle;
  @Input({ required: true }) categorySlug!: string;

  @Input() editing = false;
  @Input() isDragging = false;
  @Input() isDragOver = false;
  @Input() isNewSlot = false;

  @Input() initialTitle = '';
  @Input() initialSlug = '';
  @Input() initialSummary = '';
  @Input() error: string | null = null;

  @Input() submitLabel = 'Crear';
  @Input() variant: 'category' | 'article' = 'article';

  // Drag events
  @Output() readonly dragStart = new EventEmitter<DragEvent>();
  @Output() readonly dragOver = new EventEmitter<DragEvent>();
  @Output() readonly dragLeave = new EventEmitter<void>();
  @Output() readonly dragEnd = new EventEmitter<void>();
  @Output() readonly drop = new EventEmitter<DragEvent>();

  // Form
  @Output() readonly formSubmit = new EventEmitter<{ name: string; slug: string; description: string }>();
  @Output() readonly formCancel = new EventEmitter<void>();
  @Output() readonly titleChange = new EventEmitter<string>();

  readonly FileTextIcon = FileText;
  readonly ChevronRightIcon = ChevronRight;
  readonly GripVerticalIcon = GripVertical;

  get wrapperClasses(): string {
    const base = 'docs-article-row group transition-all duration-150';
    const editingCls = this.editing ? ' docs-article-row--editing' : '';
    const dragOverCls = this.isDragOver ? ' docs-article-row--drag-over' : '';
    return base + editingCls + dragOverCls;
  }

  onFormSubmit(values: { name: string; slug: string; description: string }): void {
    this.formSubmit.emit(values);
  }

  onFormCancel(): void {
    this.formCancel.emit();
  }

  onTitleChange(v: string): void {
    this.titleChange.emit(v);
  }
}
