import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  Signal,
} from '@angular/core';

/**
 * Sidebar mobile backdrop overlay.
 *
 * Extracted from responsive-sidebar.component.html (was lines 1–4). Owns its own
 * render guard so the parent template stays clean: it just instantiates the
 * component and binds `closed` to `closeSidebar()`.
 *
 * Inputs are passed as signals (not unwrapped values) so the child template can
 * react to signal changes without re-creating bindings. This is the pattern
 * dictated by the quote-form lesson: child components carry ALL the logic the
 * template uses — strictTemplates does NOT validate cross-component calls.
 */
@Component({
  selector: 'app-sidebar-mobile-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen() && isMobile()) {
      <div
        class="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
        (click)="closed.emit()"
      ></div>
    }
  `,
})
export class SidebarMobileOverlayComponent {
  @Input({ required: true }) isOpen!: Signal<boolean>;
  @Input({ required: true }) isMobile!: Signal<boolean>;
  @Output() closed = new EventEmitter<void>();
}