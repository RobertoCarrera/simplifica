import { Injectable, DestroyRef, inject } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseModulesService } from '../../services/supabase-modules.service';

export interface ModuleAwareOptions<T> {
  moduleKey: string;
  destroyRef: DestroyRef;
  factory: () => Observable<T>;
  next?: (value: T) => void;
  error?: (err: unknown) => void;
}

/**
 * Singleton service that gates Observable subscriptions behind a module-enabled check.
 *
 * Usage:
 *   this.moduleAware.moduleAwareSubscribe({
 *     moduleKey: 'moduloChat',
 *     destroyRef: this.destroyRef,
 *     factory: () => this.service.data$,
 *     next: (data) => this.data.set(data),
 *   });
 *
 * Returns:
 *   - A live `Subscription` auto-cancelled on component destroy  → module is enabled
 *   - `null` (no-op, no crash, no memory leak)                  → module disabled or not loaded yet
 *
 * Precondition: modules must be loaded before calling this (ModuleGuard has run,
 * or `fetchEffectiveModules()` has resolved). If called before modules load, the
 * service returns null silently — intentional to prevent crashes.
 */
@Injectable({ providedIn: 'root' })
export class ModuleAwareService {
  private modulesService = inject(SupabaseModulesService);

  /**
   * Creates a subscription only if the given module is enabled.
   * Automatically cancels on component destroy via `DestroyRef`.
   */
  moduleAwareSubscribe<T>(opts: ModuleAwareOptions<T>): Subscription | null {
    const enabled = this.modulesService.isModuleEnabled(opts.moduleKey);

    // null  → modules not loaded yet
    // false → module disabled for this user/company
    // Both cases: skip silently, return null
    if (!enabled) return null;

    return opts
      .factory()
      .pipe(takeUntilDestroyed(opts.destroyRef))
      .subscribe({
        next: opts.next,
        error:
          opts.error ??
          ((err) =>
            console.error(`[ModuleAwareService][${opts.moduleKey}] subscription error`, err)),
      });
  }

  /**
   * Convenience method: check only, no subscription.
   * Returns true iff module is loaded AND enabled.
   */
  isEnabled(moduleKey: string): boolean {
    return this.modulesService.isModuleEnabled(moduleKey) === true;
  }
}
