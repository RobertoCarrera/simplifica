/**
 * AddBlockDropdownComponent (PR2a email-block-editor)
 *
 * "+ Añadir bloque" button + custom dropdown with 4 entries. Emits the
 * chosen BlockType. Logo entry is disabled with a tooltip when the
 * company has no logo URL configured (per spec id 1945 §3 —
 * hide-from-dropdown).
 *
 * Plain HTML + custom CSS — no Angular Material dependency. Uses an
 * inline overlay panel for the menu (no mat-menu).
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BlockType } from './block-types';

@Component({
  selector: 'app-add-block-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="abd-trigger"
      (click)="toggle()"
      [attr.aria-expanded]="open()"
      aria-haspopup="menu"
      data-testid="add-block-trigger"
    >
      + Añadir bloque ▾
    </button>
    @if (open()) {
      <div
        #menu
        class="abd-menu"
        role="menu"
        data-testid="add-block-menu"
      >
        <button
          type="button"
          class="abd-item"
          role="menuitem"
          [disabled]="!hasLogoUrl()"
          [title]="
            !hasLogoUrl()
              ? 'Configura el logo de tu empresa para añadir este bloque'
              : ''
          "
          (click)="pick('logo')"
          data-testid="add-block-logo"
        >
          Logo
        </button>
        <button
          type="button"
          class="abd-item"
          role="menuitem"
          (click)="pick('heading')"
          data-testid="add-block-heading"
        >
          Encabezado
        </button>
        <button
          type="button"
          class="abd-item"
          role="menuitem"
          (click)="pick('paragraph')"
          data-testid="add-block-paragraph"
        >
          Párrafo
        </button>
        <button
          type="button"
          class="abd-item"
          role="menuitem"
          (click)="pick('button')"
          data-testid="add-block-button"
        >
          Botón
        </button>
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; position: relative; }
    .abd-trigger {
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 14px;
      font: inherit;
      font-weight: 500;
      color: #334155;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .abd-trigger:hover {
      background: #f8fafc;
      border-color: #94a3b8;
    }
    .abd-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      min-width: 180px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(15,23,42,0.15);
      z-index: 50;
      display: flex;
      flex-direction: column;
      padding: 4px;
    }
    .abd-item {
      background: transparent;
      border: none;
      padding: 8px 12px;
      font: inherit;
      text-align: left;
      border-radius: 4px;
      cursor: pointer;
      color: #0f172a;
    }
    .abd-item:hover:not(:disabled) {
      background: #f1f5f9;
    }
    .abd-item:disabled {
      color: #94a3b8;
      cursor: not-allowed;
    }
  `],
})
export class AddBlockDropdownComponent {
  readonly hasLogoUrl = input.required<boolean>();
  readonly add = output<BlockType>();

  readonly open = signal(false);
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menu');

  toggle(): void {
    this.open.update((v) => !v);
  }

  pick(type: BlockType): void {
    this.open.set(false);
    this.add.emit(type);
  }

  /** Close the menu when clicking outside the host element. */
  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    // Click is "outside" if not inside this component's host element.
    // We rely on the menu being rendered inside the host.
    const host = this.menuRef()?.nativeElement?.parentElement;
    if (target && host && !host.contains(target)) {
      this.open.set(false);
    }
  }

  /** Close on ESC. */
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open()) this.open.set(false);
  }
}