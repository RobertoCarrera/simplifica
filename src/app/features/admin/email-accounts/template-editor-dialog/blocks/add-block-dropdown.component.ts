/**
 * AddBlockDropdownComponent (PR2a email-block-editor)
 *
 * "+ Añadir bloque" button + mat-menu with 4 entries. Emits the chosen
 * BlockType. Logo entry is disabled with a tooltip when the company has
 * no logo URL configured (per spec id 1945 §3 — hide-from-dropdown).
 *
 * Only used as a sub-element of BlockEditorComponent. Standalone so it
 * can be moved into other surfaces (e.g. campaigns editor) in future PRs.
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { BlockType } from './block-types';

@Component({
  selector: 'app-add-block-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule, MatMenuModule, MatTooltipModule],
  template: `
    <button
      mat-stroked-button
      type="button"
      [matMenuTriggerFor]="menu"
      class="abd-trigger"
      data-testid="add-block-trigger"
    >
      + Añadir bloque ▾
    </button>
    <mat-menu #menu="matMenu" data-testid="add-block-menu">
      <button
        mat-menu-item
        type="button"
        [disabled]="!hasLogoUrl()"
        [matTooltip]="
          !hasLogoUrl()
            ? 'Configura el logo de tu empresa para añadir este bloque'
            : ''
        "
        (click)="add.emit('logo')"
        data-testid="add-block-logo"
      >
        <span>Logo</span>
      </button>
      <button
        mat-menu-item
        type="button"
        (click)="add.emit('heading')"
        data-testid="add-block-heading"
      >
        <span>Encabezado</span>
      </button>
      <button
        mat-menu-item
        type="button"
        (click)="add.emit('paragraph')"
        data-testid="add-block-paragraph"
      >
        <span>Párrafo</span>
      </button>
      <button
        mat-menu-item
        type="button"
        (click)="add.emit('button')"
        data-testid="add-block-button"
      >
        <span>Botón</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    :host { display: inline-block; }
    .abd-trigger { font-weight: 500; }
  `],
})
export class AddBlockDropdownComponent {
  readonly hasLogoUrl = input.required<boolean>();
  readonly add = output<BlockType>();
}