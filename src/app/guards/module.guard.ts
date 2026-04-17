import { Injectable, inject } from "@angular/core";
import { CanActivate, Router, ActivatedRouteSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { SupabaseModulesService } from "../services/supabase-modules.service";

/**
 * ModuleGuard — Control de acceso por módulo activo
 *
 * Verifica que el usuario tenga el módulo habilitado antes de permitir
 * acceso a rutas protegidas por `data.moduleKey`.
 *
 * Usage in app.routes.ts:
 *   { path: 'tickets', canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } }
 *
 * Redirects to /inicio if:
 *   - Module signal not yet loaded (null) after a short wait
 *   - Module is disabled for the user's company
 */
@Injectable({ providedIn: "root" })
export class ModuleGuard implements CanActivate {
  private modulesService = inject(SupabaseModulesService);
  private router = inject(Router);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const moduleKey = route.data["moduleKey"] as string | undefined;

    // No module key configured — allow access (auth guard handles permissions)
    if (!moduleKey) {
      return true;
    }

    // If modules are already loaded in signal, check immediately
    if (this.modulesService.modulesSignal() !== null) {
      const enabled = this.modulesService.isModuleEnabled(moduleKey);
      if (enabled === true) return true;
      this.router.navigate(["/inicio"]);
      return false;
    }

    // Modules not yet loaded — fetch them before deciding
    try {
      await firstValueFrom(this.modulesService.fetchEffectiveModules());
      const enabled = this.modulesService.isModuleEnabled(moduleKey);
      if (enabled === true) return true;
      this.router.navigate(["/inicio"]);
      return false;
    } catch {
      // Network error or session expired — deny access
      this.router.navigate(["/inicio"]);
      return false;
    }
  }
}
