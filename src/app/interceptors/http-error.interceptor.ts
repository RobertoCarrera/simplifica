import { Injectable, inject } from "@angular/core";
import {
  HttpEvent,
  HttpInterceptor,
  HttpHandler,
  HttpRequest,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError } from "rxjs/operators";
import { Router } from "@angular/router";
import { AuthService } from "../services/auth.service";

/**
 * Interceptor global para manejo de errores HTTP
 * Captura y procesa errores comunes de manera centralizada
 */
@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  private authService = inject(AuthService);
  private router = inject(Router);

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      // Manejo de errores
      catchError((error: HttpErrorResponse) => {
        let errorMessage = "Error desconocido";

        // ===================================
        // 1. ERROR DE RED O CORS (status 0)
        // ===================================
        if (error.status === 0) {
          if (req.url.includes("anychat.one")) {
            errorMessage =
              "🚫 Error CORS: AnyChat API no permite peticiones desde este dominio. Contacta con soporte.";
            console.error("❌ CORS Error - AnyChat:", {
              url: req.url,
              message:
                "La API de AnyChat necesita agregar tu dominio a su whitelist de CORS",
            });
          } else {
            errorMessage =
              "🌐 Error de conexión: No se pudo conectar al servidor";
            console.error("❌ Network Error:", {
              url: req.url,
              error: error.error,
            });
          }
        }

        // ===================================
        // 2. ERROR 200 CON PARSING FALLIDO
        // ===================================
        else if (error.status === 200 && error.error instanceof ProgressEvent) {
          errorMessage =
            "📄 Error de formato: La respuesta del servidor no es válida";
          console.error("❌ Parsing Error en Status 200:", {
            url: req.url,
            error: "Respuesta recibida pero no se pudo parsear como JSON",
            hint: "Verifica que el servidor esté devolviendo JSON válido",
          });
        }

        // ===================================
        // 3. ERROR 400 BAD REQUEST
        // ===================================
        else if (error.status === 400) {
          if (req.url.includes("supabase.co/rest/v1/clients")) {
            errorMessage =
              "🗄️ Error de consulta: Problema con la base de datos de clientes";
            console.error("❌ Supabase 400 Error - Clientes:", {
              url: req.url,
              error: error.error,
              hint: "Posible problema con foreign key o permisos RLS",
            });
          } else {
            errorMessage = "❌ Solicitud inválida";
            console.error("❌ Bad Request 400:", {
              url: req.url,
              error: error.error,
            });
          }
        }

        // ===================================
        // 4. ERROR 401 NO AUTORIZADO
        // ===================================
        else if (error.status === 401) {
          errorMessage =
            "🔒 No autorizado: Por favor, inicia sesión nuevamente";
          console.error("❌ Unauthorized 401:", {
            url: req.url,
            hint: "Token expirado o inválido",
          });
          // C-3: On 401, clear the local session and redirect to /login.
          // Previously the 401 just propagated to the caller, leaving the UI
          // in a broken state (isAuthenticated=true, sidebar visible, every
          // API call failing). We skip auth-token endpoints to avoid loops
          // during Supabase's internal refresh attempts.
          const isAuthEndpoint =
            req.url.includes('/auth/v1/token') ||
            req.url.includes('/auth/v1/signup') ||
            req.url.includes('/auth/v1/admin') ||
            req.url.includes('/auth/v1/verify') ||
            req.url.includes('/auth/v1/recover') ||
            req.url.includes('/auth/v1/otp');
          if (!isAuthEndpoint) {
            this.handleUnauthorized();
          }
        }

        // ===================================
        // 5. ERROR 403 PROHIBIDO
        // ===================================
        else if (error.status === 403) {
          errorMessage =
            "🚫 Acceso denegado: No tienes permisos para esta acción";
          console.error("❌ Forbidden 403:", {
            url: req.url,
            hint: "Verifica permisos RLS en Supabase",
          });
        }

        // ===================================
        // 6. ERROR 404 NO ENCONTRADO
        // ===================================
        else if (error.status === 404) {
          errorMessage = "🔍 No encontrado: El recurso solicitado no existe";
          console.error("❌ Not Found 404:", {
            url: req.url,
          });
        }

        // ===================================
        // 7. ERROR 500 SERVIDOR
        // ===================================
        else if (error.status >= 500) {
          errorMessage = "⚠️ Error del servidor: Intenta nuevamente más tarde";
          console.error("❌ Server Error 500+:", {
            url: req.url,
            status: error.status,
            error: error.error,
          });
        }

        // ===================================
        // 8. OTROS ERRORES
        // ===================================
        else {
          errorMessage = `Error ${error.status}`;
          console.error("❌ HTTP Error:", {
            url: req.url,
            status: error.status,
            error: error.error,
          });
        }

        // Crear objeto de error mejorado
        const enhancedError = new Error(errorMessage);
        (enhancedError as any).originalError = error;
        (enhancedError as any).status = error.status;
        (enhancedError as any).url = req.url;

        return throwError(() => enhancedError);
      }),
    );
  }

  /**
   * C-3: Handle 401 by clearing the local session and redirecting to /login.
   * Uses fire-and-forget pattern — we don't want to block the interceptor on
   * the async signOut. The router navigation is also synchronous.
   */
  private handleUnauthorized(): void {
    // Only act if we think we're authenticated; otherwise this is a stale 401
    // from before the user logged in and we shouldn't trigger a redirect.
    if (!this.authService.isAuthenticated()) {
      return;
    }
    console.warn('🔒 [HttpErrorInterceptor] 401 received — clearing session and redirecting to /login');
    try {
      this.authService.logout().catch((e) => {
        // logout() already handles errors and redirects, but ensure we don't crash
        console.error('❌ Error during forced logout on 401:', e);
        this.router.navigate(['/login']);
      });
    } catch (e) {
      console.error('❌ Failed to call logout() on 401:', e);
      this.router.navigate(['/login']);
    }
  }
}
