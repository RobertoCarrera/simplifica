import { Injectable, inject } from "@angular/core";
import { CanActivate, Router, ActivatedRouteSnapshot } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { SupabaseModulesService } from "../services/supabase-modules.service";
import { AuthService } from "../services/auth.service";

/**
 * ModuleGuard — Control de acceso por módulo activo + visibilidad por rol
 *
 * Verifica que el usuario tenga el módulo habilitado Y que su rol tenga
 * visibilidad configurada (visible_to_clients / visible_to_team) antes
 * de permitir acceso a rutas protegidas por `data.moduleKey`.
 *
 * Usage in app.routes.ts:
 *   { path: 'tickets', canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } }
 *
 * Redirects to /inicio if:
 *   - Module signal not yet loaded (null) after a short wait
 *   - Module is disabled for the user's company
 *   - Module is enabled but hidden from the user's role via sidebar visibility flags
 */
@Injectable({ providedIn: "root" })
export class ModuleGuard implements CanActivate {
  private modulesService = inject(SupabaseModulesService);
  private authService = inject(AuthService);
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
      if (enabled !== true) {
        this.router.navigate(["/inicio"]);
        return false;
      }
      // Module is enabled — now check sidebar visibility by role
      return this.checkSidebarVisibility(moduleKey);
    }

    // Modules not yet loaded — fetch them before deciding
    try {
      await firstValueFrom(this.modulesService.fetchEffectiveModules());
      const enabled = this.modulesService.isModuleEnabled(moduleKey);
      if (enabled !== true) {
        this.router.navigate(["/inicio"]);
        return false;
      }
      // Module is enabled — now check sidebar visibility by role
      return this.checkSidebarVisibility(moduleKey);
    } catch {
      // Network error or session expired — deny access
      this.router.navigate(["/inicio"]);
      return false;
    }
  }

  /**
   * Check sidebar visibility flags (visibleToClients / visibleToTeam).
   * Ensures sidebar order is loaded before checking.
   * Defaults to visible=true if order hasn't been loaded or entry not found.
   */
  private async checkSidebarVisibility(moduleKey: string): Promise<boolean> {
    // If sidebar order hasn't been loaded yet, try to load it
    if (this.modulesService.sidebarOrderSignal().size === 0) {
      try {
        await this.modulesService.fetchSidebarOrder();
      } catch {
        // If fetch fails (e.g., network error), default to allowing access
        // so we don't lock users out. The sidebar itself will handle the
        // visual filtering next time it loads successfully.
        return true;
      }
    }

    const role = this.authService.userRole();
    const isSuperAdmin =
      role === "super_admin" ||
      !!this.authService.userProfile?.is_super_admin;

    // Super admin bypasses visibility restrictions
    if (isSuperAdmin) return true;

    const isClient = role === "client";

    if (isClient) {
      const visible =
        this.modulesService.isSidebarItemVisibleToClients(moduleKey);
      if (!visible) {
        this.router.navigate(["/inicio"]);
        return false;
      }
    } else {
      // Team member (admin, owner, member, professional, etc.)
      const visible =
        this.modulesService.isSidebarItemVisibleToTeam(moduleKey);
      if (!visible) {
        this.router.navigate(["/inicio"]);
        return false;
      }
    }

    return true;
  }
}
