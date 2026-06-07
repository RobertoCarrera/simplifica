import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  signal,
  computed,
  ElementRef,
  inject,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextMenuEntry, ContextMenuItem, ContextMenuSubmenu } from './context-menu.types';

/**
 * Generic context menu rendered inside a CDK Overlay.
 *
 * Most consumers should use `ContextMenuService.open({...})` instead
 * of mounting this directly. The component is public so it can be
 * tested and embedded in stories.
 *
 * Keyboard navigation:
 *   ArrowDown / ArrowUp — move focus between visible items
 *   Enter / Space       — trigger the focused item's action
 *   ArrowRight          — open a submenu (when focused on a submenu trigger)
 *   ArrowLeft           — close an open submenu / return to parent
 *   Escape              — close the entire menu
 */
@Component({
  selector: 'app-context-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe],
  template: `
    <div
      class="ctx-menu"
      role="menu"
      [attr.aria-label]="'webmail.contextMenu.label' | transloco"
      (click)="$event.stopPropagation()"
      (contextmenu)="$event.preventDefault()"
    >
      @for (entry of visibleEntries(); track entryId($index, entry)) {
        @switch (entry.type) {
          @case ('separator') {
            <div class="ctx-sep" role="separator"></div>
          }
          @case ('label') {
            <div class="ctx-label" role="presentation">
              {{ entry.label | transloco }}
            </div>
          }
          @case ('item') {
            <button
              type="button"
              role="menuitem"
              class="ctx-item"
              [class.disabled]="entry.item.disabled"
              [class.danger]="entry.item.danger"
              [class.focused]="focusedIndex() === visibleItemIndex($index)"
              [disabled]="entry.item.disabled"
              (click)="onItemClick(entry.item, $event)"
              (mouseenter)="focusItem(visibleItemIndex($index))"
            >
              <span class="ctx-item-icon" aria-hidden="true">
                <i *ngIf="entry.item.icon" [class]="entry.item.icon"></i>
              </span>
              <span class="ctx-item-label">{{ entry.item.label | transloco }}</span>
              <span *ngIf="entry.item.shortcut" class="ctx-item-shortcut">
                {{ entry.item.shortcut }}
              </span>
            </button>
          }
          @case ('submenu') {
            <div
              class="ctx-submenu-trigger"
              [class.focused]="focusedIndex() === visibleItemIndex($index)"
              [class.open]="openSubmenuId() === entry.submenu.id"
              (mouseenter)="focusItem(visibleItemIndex($index)); openSubmenuId.set(entry.submenu.id)"
              (mouseleave)="onSubmenuLeave()"
            >
              <button
                type="button"
                role="menuitem"
                class="ctx-item ctx-submenu-btn"
                [class.disabled]="entry.submenu.disabled"
                [class.danger]="false"
                [disabled]="entry.submenu.disabled"
                (click)="toggleSubmenu(entry.submenu)"
              >
                <span class="ctx-item-icon" aria-hidden="true">
                  <i *ngIf="entry.submenu.icon" [class]="entry.submenu.icon"></i>
                </span>
                <span class="ctx-item-label">{{ entry.submenu.label | transloco }}</span>
                <span class="ctx-item-arrow">
                  <i class="fas fa-chevron-right"></i>
                </span>
              </button>
              @if (openSubmenuId() === entry.submenu.id) {
                <div class="ctx-submenu" role="menu">
                  @for (child of entry.submenu.children; track childId($index, child)) {
                    @if (child.type === 'separator') {
                      <div class="ctx-sep" role="separator"></div>
                    } @else if (child.type === 'item') {
                      <button
                        type="button"
                        role="menuitem"
                        class="ctx-item ctx-sub-item"
                        [class.disabled]="child.item.disabled"
                        [class.danger]="child.item.danger"
                        [disabled]="child.item.disabled"
                        (click)="onItemClick(child.item, $event)"
                      >
                        <span class="ctx-item-icon" aria-hidden="true">
                          <i *ngIf="child.item.icon" [class]="child.item.icon"></i>
                        </span>
                        <span class="ctx-item-label">{{ child.item.label | transloco }}</span>
                      </button>
                    }
                  }
                </div>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styleUrl: './context-menu.component.scss',
})
export class ContextMenuComponent {
  @Input({ required: true }) entries: ContextMenuEntry[] = [];
  @Input() closeOnItemClick = true;

  @Output() itemPicked = new EventEmitter<string>();
  @Output() escapePressed = new EventEmitter<void>();

  private _entries = signal<ContextMenuEntry[]>([]);
  private elementRef = inject(ElementRef);

  /** 0-based index into the visible items (items + submenus only, not separators/labels) */
  focusedIndex = signal(-1);

  /** Currently open submenu id (null = none) */
  openSubmenuId = signal<string | null>(null);

  visibleEntries = computed(() => {
    const list = this._entries();
    return list.filter((e) => {
      if (e.type === 'item' && e.item.hidden) return false;
      if (e.type === 'submenu' && e.submenu.hidden) return false;
      return true;
    });
  });

  /**
   * Computed list of visible *interactable* entries (items + submenus only)
   * Used for keyboard navigation — separators and labels are skipped.
   */
  visibleInteractables = computed(() => {
    const entries = this.visibleEntries();
    const result: { index: number; type: 'item' | 'submenu'; id: string }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type === 'item') {
        result.push({ index: i, type: 'item', id: e.item.id });
      } else if (e.type === 'submenu') {
        result.push({ index: i, type: 'submenu', id: e.submenu.id });
      }
    }
    return result;
  });

  ngOnInit() {
    this._entries.set(this.entries);
  }

  ngOnChanges() {
    this._entries.set(this.entries);
    this.focusedIndex.set(-1);
    this.openSubmenuId.set(null);
  }

  /** Unique tracking id for each entry (for @for track) */
  entryId(index: number, entry: ContextMenuEntry): string {
    if (entry.type === 'item') return `item-${entry.item.id}`;
    if (entry.type === 'submenu') return `sub-${entry.submenu.id}`;
    if (entry.type === 'label') return `label-${index}`;
    return `sep-${index}`;
  }

  /** Unique tracking id for submenu children */
  childId(index: number, entry: ContextMenuEntry & { type: 'item' | 'separator' | 'label' }): string {
    if (entry.type === 'item') return `child-item-${entry.item.id}`;
    if (entry.type === 'label') return `child-label-${index}`;
    return `child-sep-${index}`;
  }

  /**
   * Given the index into visibleEntries(), return the index into
   * visibleInteractables(). Returns -1 if it's not interactable.
   */
  visibleItemIndex(visibleIndex: number): number {
    const interactables = this.visibleInteractables();
    return interactables.findIndex((v) => v.index === visibleIndex);
  }

  focusItem(index: number) {
    this.focusedIndex.set(index);
  }

  onItemClick(item: ContextMenuItem, ev: MouseEvent) {
    ev.stopPropagation();
    if (item.disabled) return;
    this.itemPicked.emit(item.id);
    if (item.action) {
      try {
        void item.action();
      } catch (err) {
        console.error('ContextMenu item action threw:', err);
      }
    }
  }

  toggleSubmenu(submenu: ContextMenuSubmenu) {
    if (submenu.disabled) return;
    const current = this.openSubmenuId();
    this.openSubmenuId.set(current === submenu.id ? null : submenu.id);
  }

  onSubmenuLeave() {
    // Keep open — close only on explicit action or when leaving the menu entirely
  }

  // ── Keyboard navigation ────────────────────────────────────────────

  @HostListener('document:keydown.arrowdown', ['$event'])
  onArrowDown(ev: Event) {
    if (!this.isMenuVisible()) return;
    (ev as KeyboardEvent).preventDefault();
    (ev as KeyboardEvent).stopPropagation();
    const interactables = this.visibleInteractables();
    if (interactables.length === 0) return;
    const next = Math.min(this.focusedIndex() + 1, interactables.length - 1);
    this.focusedIndex.set(next);
    this.scrollToFocused();
  }

  @HostListener('document:keydown.arrowup', ['$event'])
  onArrowUp(ev: Event) {
    if (!this.isMenuVisible()) return;
    (ev as KeyboardEvent).preventDefault();
    (ev as KeyboardEvent).stopPropagation();
    const interactables = this.visibleInteractables();
    if (interactables.length === 0) return;
    const prev = Math.max(this.focusedIndex() - 1, 0);
    this.focusedIndex.set(prev);
    this.scrollToFocused();
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(ev: Event) {
    if (!this.isMenuVisible()) return;
    const interactables = this.visibleInteractables();
    const idx = this.focusedIndex();
    if (idx < 0 || idx >= interactables.length) return;
    const focused = interactables[idx];
    const entries = this.visibleEntries();
    const entry = entries[focused.index];

    if (focused.type === 'submenu' && entry.type === 'submenu') {
      (ev as KeyboardEvent).preventDefault();
      (ev as KeyboardEvent).stopPropagation();
      this.toggleSubmenu(entry.submenu);
      return;
    }

    if (focused.type === 'item' && entry.type === 'item') {
      (ev as KeyboardEvent).preventDefault();
      (ev as KeyboardEvent).stopPropagation();
      this.itemPicked.emit(entry.item.id);
      if (entry.item.action) {
        try {
          void entry.item.action();
        } catch (err) {
          console.error('ContextMenu item action threw:', err);
        }
      }
      return;
    }
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onArrowRight(ev: Event) {
    if (!this.isMenuVisible()) return;
    const interactables = this.visibleInteractables();
    const idx = this.focusedIndex();
    if (idx < 0 || idx >= interactables.length) return;
    const focused = interactables[idx];
    if (focused.type === 'submenu') {
      (ev as KeyboardEvent).preventDefault();
      (ev as KeyboardEvent).stopPropagation();
      this.openSubmenuId.set(focused.id);
    }
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onArrowLeft(ev: Event) {
    if (!this.isMenuVisible()) return;
    if (this.openSubmenuId()) {
      (ev as KeyboardEvent).preventDefault();
      (ev as KeyboardEvent).stopPropagation();
      this.openSubmenuId.set(null);
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEsc(ev: Event) {
    if (!ev.defaultPrevented) {
      this.escapePressed.emit();
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private isMenuVisible(): boolean {
    // The menu is visible when the CDK overlay has attached this component.
    // We check if the host element is in the DOM.
    return !!this.elementRef.nativeElement?.offsetParent;
  }

  private scrollToFocused() {
    // Focus visible item so it scrolls into view
    setTimeout(() => {
      const el = this.elementRef.nativeElement?.querySelector('.ctx-item.focused');
      if (el) {
        (el as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    });
  }
}
