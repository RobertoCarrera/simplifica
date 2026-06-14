import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  signal,
  OnChanges,
  SimpleChanges,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, X, Check } from 'lucide-angular';

/**
 * Reusable inline form used by both `DocsCategoryCard` and
 * `DocsArticleRow` for the in-place "rename" / "create new" flows.
 *
 * The parent owns no form state — the local `name`, `slug`, and
 * `description` signals are local. Parent receives the final
 * values via the `submit` output and is responsible for the
 * actual network call.
 *
 * Two visual variants:
 *   - 'category' → larger padding, font-semibold title (used in
 *     the category card grid).
 *   - 'article'  → compact padding, smaller text (used inside the
 *     article list rows between existing articles).
 */
@Component({
  selector: 'app-docs-new-entity-form',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './docs-new-entity-form.component.html',
  styleUrl: './docs-new-entity-form.component.css',
})
export class DocsNewEntityFormComponent implements OnChanges {
  /** First field label, e.g. "Nombre" or "Título". */
  @Input() nameLabel = 'Nombre';
  @Input() namePlaceholder = 'Nombre';
  @Input() slugPlaceholder = 'slug';
  @Input() descriptionLabel = 'Descripción';
  @Input() descriptionPlaceholder = 'Descripción (opcional)';
  @Input() descriptionRows = 2;

  /** Initial values seeded by the parent on form open. */
  @Input() initialName = '';
  @Input() initialSlug = '';
  @Input() initialDescription = '';

  /** Validation / server error from the parent (displayed below form). */
  @Input() error: string | null = null;

  /** Visual variant: 'category' (large) or 'article' (compact). */
  @Input() variant: 'category' | 'article' = 'category';

  /** Whether the first input should autofocus when rendered. */
  @Input() autofocus = true;

  @Input() submitLabel = 'Guardar';
  @Input() showCancel = true;
  @Input() wrapInCentered = false;

  /** Whether the form is in "create new" mode (changes submit icon). */
  @Input() isCreate = false;

  @Output() readonly nameChange = new EventEmitter<string>();
  @Output() readonly submit = new EventEmitter<{ name: string; slug: string; description: string }>();
  @Output() readonly cancel = new EventEmitter<void>();

  readonly PlusIcon = Plus;
  readonly XIcon = X;
  readonly CheckIcon = Check;

  readonly name = signal('');
  readonly slug = signal('');
  readonly description = signal('');

  // Computed class strings so the template stays declarative. These
  // are pure functions of `variant` (an @Input) and don't depend on
  // any signal that changes at runtime, so they re-evaluate only on
  // input changes (which is exactly what we want).
  readonly wrapperClass = computed(() => {
    const base = 'docs-new-entity-form block rounded-xl p-5';
    const border = 'border-2 border-dashed border-amber-400 bg-amber-50/40 dark:bg-amber-900/10';
    const align = this.wrapInCentered ? 'text-left max-w-md mx-auto' : 'text-left';
    return `${base} ${border} ${align}`;
  });

  readonly nameInputClass = computed(() => {
    const base = 'w-full mb-2 bg-white dark:bg-gray-900 border rounded placeholder:text-gray-400 dark:placeholder:text-gray-500';
    const border = 'border-amber-300 dark:border-amber-700';
    const text = this.variant === 'category'
      ? 'px-3 py-2 text-base font-semibold text-gray-900 dark:text-white'
      : 'px-2 py-1.5 text-sm font-semibold text-gray-900 dark:text-white';
    return `${base} ${border} ${text}`;
  });

  readonly slugInputClass = computed(() => {
    const base = 'w-full mb-2 bg-white dark:bg-gray-900 border rounded';
    const border = 'border-gray-200 dark:border-gray-700';
    const text = this.variant === 'category'
      ? 'px-3 py-1.5 text-xs font-mono text-gray-500 dark:text-gray-400'
      : 'px-2 py-1 text-xs font-mono text-gray-500 dark:text-gray-400';
    return `${base} ${border} ${text}`;
  });

  readonly descriptionInputClass = computed(() => {
    const base = 'w-full mb-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder:text-gray-400 dark:placeholder:text-gray-500';
    const text = this.variant === 'category'
      ? 'px-3 py-2 text-sm text-gray-900 dark:text-white'
      : 'px-2 py-1.5 text-xs text-gray-900 dark:text-white';
    return `${base} ${text}`;
  });

  readonly submitButtonClass = computed(() => {
    const size = this.variant === 'category' ? 'text-sm px-3 py-1.5' : 'text-xs px-3 py-1.5';
    return `inline-flex items-center gap-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 ${size}`;
  });

  readonly cancelButtonClass = computed(() => {
    const size = this.variant === 'category' ? 'text-sm px-3 py-1.5' : 'text-xs px-3 py-1.5';
    return `inline-flex items-center gap-1 rounded text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 ${size}`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialName']) this.name.set(this.initialName);
    if (changes['initialSlug']) this.slug.set(this.initialSlug);
    if (changes['initialDescription']) this.description.set(this.initialDescription);
  }

  onNameChange(v: string): void {
    this.name.set(v);
    this.nameChange.emit(v);
  }

  onSubmit(): void {
    this.submit.emit({
      name: this.name().trim(),
      slug: this.slug().trim(),
      description: this.description().trim(),
    });
  }
}
