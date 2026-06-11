import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  trigger,
  style,
  transition,
  animate,
} from '@angular/animations';
import { AnimationService } from '../../../services/animation.service';

export interface SelectOption {
  label: string;
  value: any;
  disabled?: boolean;
}

export type SelectSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-select.component.html',
  styleUrls: ['./custom-select.component.scss'],
  animations: [
    AnimationService.fadeInUp,
    trigger('dropdownPanel', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-4px) scaleY(0.95)' }),
        animate(
          '180ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 1, transform: 'translateY(0) scaleY(1)' }),
        ),
      ]),
      transition(':leave', [
        animate(
          '120ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({ opacity: 0, transform: 'translateY(-4px) scaleY(0.95)' }),
        ),
      ]),
    ]),
  ],
})
export class CustomSelectComponent {
  private el = inject(ElementRef);

  // ── Inputs ──────────────────────────────────────────────
  @Input() options: SelectOption[] = [];
  @Input() placeholder: string = 'Seleccionar...';
  @Input() size: SelectSize = 'md';
  @Input() hasError: boolean = false;
  @Input() disabled: boolean = false;

  // New UX features
  @Input() searchable: boolean = false;
  @Input() clearable: boolean = true;
  @Input() searchPlaceholder: string = 'Buscar...';
  @Input() emptySearchText: string = 'Sin resultados';
  @Input() noOptionsText: string = 'Sin opciones disponibles';

  // Two-way binding for value
  @Input() value: any = null;
  @Output() valueChange = new EventEmitter<any>();

  // Events
  @Output() opened = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() cleared = new EventEmitter<void>();

  // ── View refs ───────────────────────────────────────────
  @ViewChild('triggerButton') triggerButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('optionsContainer') optionsContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  // ── State ───────────────────────────────────────────────
  isOpen: boolean = false;
  activeIndex: number = -1;
  searchTerm = signal('');

  // ── Computed ────────────────────────────────────────────
  readonly filteredOptions = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.options;
    return this.options.filter(
      (o) => o.label.toLowerCase().includes(term),
    );
  });

  get selectedLabel(): string {
    if (this.value == null) return '';
    // Primary: strict equality (works for primitives and stable object refs)
    let selected = this.options.find((o) => o.value === this.value);
    // Fallback: match by `id` when the value is an object but the option's
    // value is a different instance (common with computed signals that map
    // and spread, e.g. `...svc` — the displayed trigger would otherwise be
    // blank even though the dropdown correctly shows the option as selected).
    if (!selected && typeof this.value === 'object' && (this.value as any).id != null) {
      const vid = (this.value as any).id;
      selected = this.options.find((o) => {
        const ov = o.value;
        return ov != null && typeof ov === 'object' && (ov as any).id === vid;
      });
    }
    return selected?.label ?? '';
  }

  get showPlaceholder(): boolean {
    return this.value === null || this.value === undefined || this.value === '';
  }

  get hasValue(): boolean {
    return !this.showPlaceholder;
  }

  // ── Public API ──────────────────────────────────────────
  toggle(): void {
    if (this.disabled) return;
    this.isOpen ? this.close() : this.open();
  }

  open(): void {
    if (this.disabled || this.isOpen) return;
    this.isOpen = true;
    this.searchTerm.set('');
    this.activeIndex = this.filteredOptions().findIndex((o) => o.value === this.value);
    this.opened.emit();

    // Focus management: focus search input if searchable, else set up scroll
    requestAnimationFrame(() => {
      if (this.searchable && this.searchInput) {
        this.searchInput.nativeElement.focus();
      } else {
        this.scrollActiveIntoView();
      }
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.searchTerm.set('');
    this.activeIndex = -1;
    this.closed.emit();
    this.triggerButton?.nativeElement.focus();
  }

  selectOption(option: SelectOption): void {
    // Allow selecting "disabled" options too. The label already indicates
    // unavailability (e.g. "(no disponible)") so the user can see what
    // they're picking, and downstream validation in the parent component
    // (e.g. event-form's submitBlockReason) is the right place to block
    // submit — not the click handler. Dropping the click on disabled
    // options made the form silently appear "filled" (the label was shown
    // in the trigger) but never propagated to the form control, leaving
    // the user stuck with a tooltip claiming "Servicio not selected".
    this.value = option.value;
    this.valueChange.emit(option.value);
    this.close();
  }

  clear(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    if (this.disabled) return;
    this.value = null;
    this.valueChange.emit(null);
    this.cleared.emit();
    if (this.isOpen) {
      this.searchTerm.set('');
    }
  }

  // ── Keyboard ────────────────────────────────────────────
  onTriggerKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
      case ' ':
      case 'ArrowDown':
        event.preventDefault();
        this.open();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.open();
        // Open and jump to last filtered option
        this.activeIndex = this.filteredOptions().length - 1;
        requestAnimationFrame(() => this.scrollActiveIntoView());
        break;
      case 'Escape':
        this.close();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }

  onDropdownKeydown(event: KeyboardEvent): void {
    const filtered = this.filteredOptions();
    const len = filtered.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.activeIndex >= 0 && this.activeIndex < len) {
          const opt = filtered[this.activeIndex];
          this.selectOption(opt);
        }
        break;
      case 'Escape':
        event.preventDefault();
        // If search is active, clear it first; otherwise close
        if (this.searchable && this.searchTerm().trim()) {
          this.searchTerm.set('');
          this.activeIndex = -1;
          this.searchInput?.nativeElement.focus();
        } else {
          this.close();
        }
        break;
      case 'Tab':
        event.preventDefault();
        if (this.activeIndex >= 0 && this.activeIndex < len) {
          const opt = filtered[this.activeIndex];
          this.selectOption(opt);
        } else {
          this.close();
        }
        break;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const filtered = this.filteredOptions();
    const len = filtered.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeIndex >= 0 && this.activeIndex < len) {
          this.selectOption(filtered[this.activeIndex]);
        } else if (len > 0) {
          // Select first match on Enter when nothing is active-highlighted
          this.selectOption(filtered[0]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (this.searchTerm().trim()) {
          // Clear search first
          this.searchTerm.set('');
          this.activeIndex = -1;
        } else {
          this.close();
        }
        break;
      case 'Tab':
        // Let Tab close the dropdown naturally (handled by blur or onDropdownKeydown)
        if (this.activeIndex >= 0 && this.activeIndex < len) {
          event.preventDefault();
          this.selectOption(filtered[this.activeIndex]);
        } else {
          this.close();
        }
        break;
    }
  }

  private moveActive(direction: number): void {
    const filtered = this.filteredOptions();
    const len = filtered.length;
    if (len === 0) return;

    let next = this.activeIndex + direction;

    // Wrap around
    if (next < 0) next = len - 1;
    if (next >= len) next = 0;

    // Skip disabled options (single pass — won't loop forever on all-disabled)
    let attempts = 0;
    while (filtered[next]?.disabled && attempts < len) {
      next += direction;
      if (next < 0) next = len - 1;
      if (next >= len) next = 0;
      attempts++;
    }

    if (!filtered[next]?.disabled) {
      this.activeIndex = next;
      this.scrollActiveIntoView();
    }
  }

  private scrollActiveIntoView(): void {
    if (this.activeIndex < 0) return;
    const el = document.getElementById('custom-select-opt-' + this.activeIndex);
    el?.scrollIntoView({ block: 'nearest' });
  }

  // ── Query: reset active when search changes ─────────────
  onSearchInput(): void {
    // Reset active index when filter changes to avoid pointing to a removed option
    this.activeIndex = -1;
  }

  // ── Click outside ───────────────────────────────────────
  @HostListener('document:click', ['$event'])
  onClickOutside(event: Event): void {
    if (this.isOpen && !this.el.nativeElement.contains(event.target)) {
      this.close();
    }
  }

  // ── TrackBy for ngFor ───────────────────────────────────
  trackByValue(_index: number, option: SelectOption): any {
    return option.value;
  }
}
