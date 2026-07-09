/**
 * VariablesPanelComponent (Variables panel — email-block-editor).
 *
 * The user-visible list of `{{var}}` tokens available for the current
 * email type. Sits ABOVE the block list (the parent BlockEditorComponent
 * hosts it as the first child) so it is "super a la vista" — visible
 * at all times, never collapsed into a popover.
 *
 * Each token is a button. On click, the panel asks
 * `ActiveInputService` to splice `{{name}}` into the cursor position
 * of the currently focused input or textarea. If no input is focused
 * yet (the user clicked a token before clicking into a text field),
 * the click is a no-op — a gentle hint via the `vp__hint` line tells
 * the user "Click para insertar en el bloque activo".
 *
 * Sources the panel reads:
 *   - `emailType` input: drives `EMAIL_VARIABLES[emailType]` lookup.
 *   - `EMAIL_VARIABLES` constant from `./email-variables.ts`.
 *
 * Styling: scoped component CSS using project tokens (sky / cyan
 * family — `bg-sky-50` / `border-sky-200`). No Angular Material
 * dependency; no Tailwind class in the template (the project mixes
 * Tailwind for marketing pages and scoped CSS for component libraries;
 * this component follows the latter convention).
 *
 * Plain HTML + custom CSS — matches the file's sibling components.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { AllEmailType } from '../../../../../email-samples';
import { EMAIL_VARIABLES } from './email-variables';
import { ActiveInputService } from './active-input.service';

@Component({
  selector: 'app-variables-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="vp" data-testid="variables-panel">
      <header class="vp__header">
        <h3 class="vp__title">Variables disponibles</h3>
        <p class="vp__hint">Click para insertar en el bloque activo</p>
      </header>
      <ul class="vp__list" role="list">
        @for (v of variables(); track v.name) {
          <li>
            <button
              type="button"
              class="vp__item"
              (click)="insert(v.name)"
              [attr.data-var-name]="v.name"
              [attr.data-testid]="'var-' + v.name"
            >
              <code class="vp__token">{{ '{{' }}{{ v.name }}{{ '}}' }}</code>
              <span class="vp__desc">{{ v.description }}</span>
              @if (v.example) {
                <span class="vp__example">{{ v.example }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="vp__empty" data-testid="variables-panel-empty">
            No hay variables documentadas para este tipo de email.
          </li>
        }
      </ul>
    </aside>
  `,
  styles: [`
    :host { display: block; }
    .vp {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .vp__header { margin-bottom: 8px; }
    .vp__title {
      margin: 0 0 2px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #075985;
    }
    .vp__hint {
      margin: 0;
      font-size: 11px;
      color: #0369a1;
      font-style: italic;
    }
    .vp__list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 4px;
    }
    .vp__list li { margin: 0; }
    .vp__item {
      width: 100%;
      background: #fff;
      border: 1px solid #bae6fd;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: background 80ms ease, border-color 80ms ease;
    }
    .vp__item:hover {
      background: #e0f2fe;
      border-color: #7dd3fc;
    }
    .vp__item:focus-visible {
      outline: 2px solid #4f46e5;
      outline-offset: 2px;
    }
    .vp__token {
      font-family: 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      color: #0c4a6e;
      font-weight: 600;
    }
    .vp__desc { font-size: 12px; color: #334155; }
    .vp__example {
      font-size: 11px;
      color: #64748b;
      font-style: italic;
    }
    .vp__empty {
      font-size: 12px;
      color: #64748b;
      padding: 4px 0;
    }
  `],
})
export class VariablesPanelComponent {
  /** The current email type — drives the variable catalog lookup. */
  readonly emailType = input.required<AllEmailType>();

  private readonly activeInput = inject(ActiveInputService);

  /**
   * Computed signal: the list of variables for the current type.
   * Falls back to an empty array (which renders the @empty branch)
   * if the type is somehow not in the catalog — defensive against
   * future email types added to `AllEmailType` without catalog coverage.
   */
  readonly variables = computed(() => EMAIL_VARIABLES[this.emailType()] ?? []);

  /**
   * Click handler for a token button. Splices `{{name}}` at the caret
   * in the currently focused text input / textarea via
   * `ActiveInputService.insertAtCursor`. No-op if no input has focus.
   */
  insert(name: string): void {
    this.activeInput.insertAtCursor(`{{${name}}}`);
  }
}
