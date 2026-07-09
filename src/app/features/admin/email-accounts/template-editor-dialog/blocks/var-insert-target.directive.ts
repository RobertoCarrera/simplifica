/**
 * VarInsertTargetDirective (Variables panel — email-block-editor).
 *
 * Standalone directive that opts an `<input>` or `<textarea>` element
 * into the variables-panel insertion target pool. On `focus`, the
 * directive tells `ActiveInputService` "this element is now the
 * insertion target"; on `blur`, it deregisters (the service keeps the
 * last active element, but the next focus to ANY other target wins,
 * so blur cleanup is defensive).
 *
 * Apply with `appVarInsertTarget`. The directive does NOT need to be
 * mentioned in the parent component's `imports` array — it is
 * `standalone: true`, so Angular's template compiler picks it up
 * implicitly. (Each typed editor component will still add it to its
 * own `imports` array because that editor explicitly lists every
 * directive it uses.)
 *
 * Usage in the typed editors:
 *
 *   <input formControlName="text" appVarInsertTarget ... />
 *   <textarea formControlName="text" appVarInsertTarget ... />
 *
 * The directive lives next to the typed editors because they own the
 * actual text inputs — co-locating keeps the change surface tight:
 * a future editor (e.g. divider block) just imports this directive
 * and adds the attribute.
 */
import {
  Directive,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';
import { ActiveInputService } from './active-input.service';

@Directive({
  selector: '[appVarInsertTarget]',
  standalone: true,
})
export class VarInsertTargetDirective {
  private readonly el = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);
  private readonly service = inject(ActiveInputService);

  /**
   * `focus` event — register this element as the active target the
   * moment the user clicks into it.
   */
  @HostListener('focus')
  onFocus(): void {
    this.service.set(this.el.nativeElement);
  }

  /**
   * `blur` event — deregister so a subsequent focus on a DIFFERENT
   * input/textarea (which fires its own `focus`) replaces the
   * pointer correctly. The service's `clear()` has an identity
   * check, so this is safe even if another input has already taken
   * the slot.
   */
  @HostListener('blur')
  onBlur(): void {
    this.service.clear(this.el.nativeElement);
  }
}
