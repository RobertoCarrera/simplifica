import { Injectable, Injector, signal, inject } from '@angular/core';
import { Overlay, OverlayRef, ConnectedPosition } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Observable, Subject } from 'rxjs';
import { ContextMenuOpenRequest } from './context-menu.types';
import { ContextMenuComponent } from './context-menu.component';

export interface ContextMenuCloseEvent<T = unknown> {
  /** If the user picked an item, this is its id */
  pickedId?: string;
  /** The data context that was passed to open() */
  data?: T;
  /** True if the user dismissed the menu (click outside, Esc, etc.) */
  dismissed?: boolean;
}

/**
 * Service for opening the shared context menu.
 *
 * Decoupled from any specific component — any feature can call
 * `ContextMenuService.open({ event, entries, data })` and the menu
 * will appear anchored at the event's coordinates.
 *
 * After the menu closes, the Observable emits a close event so the
 * caller can react (e.g. reload the message list after a delete).
 */
@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);

  /** Currently visible (or null if closed) */
  private _current = signal<{
    ref: OverlayRef;
    cmpRef: any;
    data: unknown;
  } | null>(null);

  /** Re-emit when the menu closes (item click or dismiss) */
  private _closed$ = new Subject<ContextMenuCloseEvent>();

  get closed$(): Observable<ContextMenuCloseEvent> {
    return this._closed$.asObservable();
  }

  get isOpen(): boolean {
    return this._current() !== null;
  }

  /**
   * Open the context menu at the position of the event.
   * The caller is responsible for ensuring the event was a right-click
   * (e.g. `(contextmenu)="onCtx($event)"` and `$event.preventDefault()`).
   */
  open<T>(request: ContextMenuOpenRequest<T>): void {
    this.close(); // close any existing menu first

    const point = this.toPoint(request.event);
    const entries = request.entries;
    const data = request.data;
    const closeOnItemClick = request.closeOnItemClick !== false;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo({ x: point.x, y: point.y } as any)
      .withPositions(this.buildPositions())
      .withPush(true)
      .withFlexibleDimensions(false);

    const overlayRef = this.overlay.create({
      positionStrategy,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      panelClass: 'app-context-menu-panel',
    });

    overlayRef.backdropClick().subscribe(() => this.close('dismiss'));

    const portal: ComponentPortal<ContextMenuComponent> = new ComponentPortal(
      ContextMenuComponent,
      null,
      this.injector,
    );
    const cmpRef: import('@angular/core').ComponentRef<ContextMenuComponent> = overlayRef.attach(portal);

    // Wire inputs
    cmpRef.setInput('entries', entries);
    cmpRef.setInput('closeOnItemClick', closeOnItemClick);
    const subPicked = cmpRef.instance.itemPicked.subscribe((id: string) =>
      this.close('item', id),
    );
    const subEscape = cmpRef.instance.escapePressed.subscribe(() =>
      this.close('dismiss'),
    );

    // Clean up subscriptions when the overlay disposes
    overlayRef.detachments().subscribe(() => {
      subPicked.unsubscribe();
      subEscape.unsubscribe();
    });

    this._current.set({ ref: overlayRef, cmpRef, data });
  }

  /** Manually close the menu. */
  close(reason: 'item' | 'dismiss' = 'dismiss', pickedId?: string): void {
    const cur = this._current();
    if (!cur) return;
    this._current.set(null);
    try {
      cur.ref.dispose();
    } catch {
      /* ignore */
    }
    this._closed$.next({
      pickedId,
      data: cur.data,
      dismissed: reason === 'dismiss',
    });
  }

  // ── Internals ───────────────────────────────────────────────────────

  private toPoint(event: MouseEvent | TouchEvent): { x: number; y: number } {
    if (event instanceof MouseEvent) {
      return { x: event.clientX, y: event.clientY };
    }
    const t = (event as TouchEvent).touches?.[0] ?? (event as TouchEvent).changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: 0, y: 0 };
  }

  private buildPositions(): ConnectedPosition[] {
    return [
      { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'top' },
      { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top' },
      { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
      { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'bottom' },
    ];
  }
}
