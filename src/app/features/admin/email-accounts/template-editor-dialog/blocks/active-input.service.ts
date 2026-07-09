/**
 * ActiveInputService (Variables panel — email-block-editor).
 *
 * Root-provided singleton that tracks which `<input>` / `<textarea>`
 * inside the email block editor currently has focus. The variables
 * panel asks this service for the active element and inserts a
 * `{{var}}` token at the user's cursor position when clicked.
 *
 * Lifecycle: when a typed editor renders a text input / textarea
 * decorated with `appVarInsertTarget` (see
 * `var-insert-target.directive.ts`), that directive calls
 * `set(nativeElement)` on init and `clear(nativeElement)` on destroy.
 * Because only ONE input has focus at any given moment, the service
 * always holds at most one active element.
 *
 * Cursor-aware insertion: `insertAtCursor(text)` reads
 * `selectionStart` / `selectionEnd` (or falls back to "append"), splices
 * the text into `value`, restores the cursor past the inserted text,
 * and dispatches a bubbled `input` event so Angular's `FormControl`
 * (which is normally the source of truth for the input's value)
 * detects the change. Without the dispatched event, the FormControl
 * would keep its stale value and the preview pipeline would never
 * refresh — this is the same trick the Angular Forms docs use for
 * "update model programmatically".
 *
 * Why a service and not an output() callback:
 *   The variables panel is a sibling of the typed editors (both
 *   children of the BlockEditorComponent tree). Using an output()
 *   would require the panel to know about the typed editors'
 *   individual outputs — leaky. A root-provided service keeps the
 *   coupling minimal: any input in the editor tree that wants to be
 *   an insertion target opts in with a single directive.
 */
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ActiveInputService {
  private activeInput: HTMLInputElement | HTMLTextAreaElement | null = null;

  /**
   * Register a text input / textarea as the currently focused insertion
   * target. Called by `VarInsertTargetDirective.ngOnInit`.
   *
   * NOTE: this method does NOT call `el.focus()` — the directive should
   * not steal focus from the user. The service only TRACKS which
   * element the user has focused (via the directive, which listens
   * to `focus` via Angular's standard binding).
   */
  set(input: HTMLInputElement | HTMLTextAreaElement): void {
    this.activeInput = input;
  }

  /**
   * Deregister the element. Called by `VarInsertTargetDirective.ngOnDestroy`.
   * The identity check prevents clearing if another input has since
   * taken focus (e.g. when two inputs exist briefly during a view
   * re-render).
   */
  clear(input: HTMLInputElement | HTMLTextAreaElement): void {
    if (this.activeInput === input) this.activeInput = null;
  }

  /**
   * Insert `text` at the user's cursor (or selection) inside the
   * active input. Updates the underlying `value`, restores the caret
   * position past the inserted text, re-focuses, and dispatches the
   * bubbled `input` event so any Angular `FormControl` bound to this
   * input receives a `valueChanges` emission.
   *
   * No-op when no active input is registered (panel visible before
   * the user has clicked into any text field).
   */
  insertAtCursor(text: string): void {
    const input = this.activeInput;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const newValue = input.value.substring(0, start) + text + input.value.substring(end);
    input.value = newValue;
    const caret = start + text.length;
    input.selectionStart = caret;
    input.selectionEnd = caret;
    // Re-focus so the user can keep typing immediately.
    input.focus();
    // Bubbled `input` event so Angular FormControl.valueChanges fires.
    // `bubbles: true` matters — Angular's value accessor listens at
    // the host element, but Angular runs in capture phase; bubbles
    // alone is sufficient because the listener is bound directly to
    // the element.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
