import { Injectable } from "@angular/core";
import { CanActivate, Router } from "@angular/router";
import { inject } from "@angular/core";
import { AuthService } from "../services/auth.service";

/**
 * ModuleGuard - Stub para control de acceso por módulo
 *
 * Este guard verifica si el usuario tiene acceso a un módulo específico
 * basado en sus permisos y la configuración de módulos activos.
 *
 * En el stub actual, siempre returns true. La implementación real
 * debería verificar getEffectiveModules() del usuario.
 */
@Injectable({ providedIn: "root" })
export class ModuleGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(): boolean {
    // Stub: permite todo por ahora
    // TODO: implementar verificación real de módulos
    return true;
  }
}
