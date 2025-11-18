import { Injectable, inject } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router, UrlTree } from '@angular/router';
import { Observable, of, switchMap, map, catchError } from 'rxjs';
import { SupabaseModulesService, EffectiveModule } from '../services/supabase-modules.service';

@Injectable({ providedIn: 'root' })
export class ModuleGuard implements CanActivate {
  private router = inject(Router);
  private modulesService = inject(SupabaseModulesService);

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    // Allowed keys can be provided as a single key or an array in route data
    const requiredKey: string | undefined = route.data?.['moduleKey'];
    const requiredKeys: string[] | undefined = route.data?.['moduleKeys'];

    // If no module key information is provided, allow by default
    if (!requiredKey && (!requiredKeys || requiredKeys.length === 0)) {
      return of(true);
    }

    // Try to read cached modules first
    const cached = this.modulesService.modulesSignal();
    if (cached) {
      return of(this.isAllowed(cached, requiredKey, requiredKeys) || this.redirectUrlTree());
    }

    // Otherwise fetch from server and decide
    return this.modulesService.fetchEffectiveModules().pipe(
      map((mods: EffectiveModule[]) => this.isAllowed(mods, requiredKey, requiredKeys) || this.redirectUrlTree()),
      catchError(() => of(this.redirectUrlTree()))
    );
  }

  private isAllowed(mods: EffectiveModule[], key?: string, keys?: string[]): boolean {
    const enabled = new Set(mods.filter(m => m.enabled).map(m => m.key));
    if (key) return enabled.has(key);
    if (keys && keys.length) return keys.some(k => enabled.has(k));
    return true;
  }

  private redirectUrlTree(): UrlTree {
    return this.router.createUrlTree(['/configuracion']);
  }
}
