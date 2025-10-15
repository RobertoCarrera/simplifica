import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

/**
 * Interceptor global para manejo de errores HTTP
 * Captura y procesa errores comunes de manera centralizada
 */
@Injectable()
export class HttpErrorInterceptor implements HttpInterceptor {
  
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      // Log de respuestas exitosas (solo en desarrollo)
      tap(event => {
        if (event instanceof HttpResponse && !req.url.includes('supabase')) {
          const contentType = event.headers.get('content-type');
          
          // Advertir si no es JSON cuando se esperaba
          if (contentType && !contentType.includes('application/json') && !contentType.includes('text/html')) {
            console.warn('⚠️ Respuesta con Content-Type inesperado:', {
              url: req.url,
              contentType,
              status: event.status
            });
          }
        }
      }),
      
      // Manejo de errores
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'Error desconocido';
        
        // ===================================
        // 1. ERROR DE RED O CORS (status 0)
        // ===================================
        if (error.status === 0) {
          if (req.url.includes('anychat.one')) {
            errorMessage = '🚫 Error CORS: AnyChat API no permite peticiones desde este dominio. Contacta con soporte.';
            console.error('❌ CORS Error - AnyChat:', {
              url: req.url,
              message: 'La API de AnyChat necesita agregar tu dominio a su whitelist de CORS'
            });
          } else {
            errorMessage = '🌐 Error de conexión: No se pudo conectar al servidor';
            console.error('❌ Network Error:', {
              url: req.url,
              error: error.error
            });
          }
        }
        
        // ===================================
        // 2. ERROR 200 CON PARSING FALLIDO
        // ===================================
        else if (error.status === 200 && error.error instanceof ProgressEvent) {
          errorMessage = '📄 Error de formato: La respuesta del servidor no es válida';
          console.error('❌ Parsing Error en Status 200:', {
            url: req.url,
            error: 'Respuesta recibida pero no se pudo parsear como JSON',
            hint: 'Verifica que el servidor esté devolviendo JSON válido'
          });
        }
        
        // ===================================
        // 3. ERROR 400 BAD REQUEST
        // ===================================
        else if (error.status === 400) {
          if (req.url.includes('supabase.co/rest/v1/clients')) {
            errorMessage = '🗄️ Error de consulta: Problema con la base de datos de clientes';
            console.error('❌ Supabase 400 Error - Clientes:', {
              url: req.url,
              error: error.error,
              hint: 'Posible problema con foreign key o permisos RLS'
            });
          } else {
            errorMessage = `❌ Solicitud inválida: ${error.error?.message || error.message}`;
            console.error('❌ Bad Request 400:', {
              url: req.url,
              error: error.error
            });
          }
        }
        
        // ===================================
        // 4. ERROR 401 NO AUTORIZADO
        // ===================================
        else if (error.status === 401) {
          errorMessage = '🔒 No autorizado: Por favor, inicia sesión nuevamente';
          console.error('❌ Unauthorized 401:', {
            url: req.url,
            hint: 'Token expirado o inválido'
          });
        }
        
        // ===================================
        // 5. ERROR 403 PROHIBIDO
        // ===================================
        else if (error.status === 403) {
          errorMessage = '🚫 Acceso denegado: No tienes permisos para esta acción';
          console.error('❌ Forbidden 403:', {
            url: req.url,
            hint: 'Verifica permisos RLS en Supabase'
          });
        }
        
        // ===================================
        // 6. ERROR 404 NO ENCONTRADO
        // ===================================
        else if (error.status === 404) {
          errorMessage = '🔍 No encontrado: El recurso solicitado no existe';
          console.error('❌ Not Found 404:', {
            url: req.url
          });
        }
        
        // ===================================
        // 7. ERROR 500 SERVIDOR
        // ===================================
        else if (error.status >= 500) {
          errorMessage = '⚠️ Error del servidor: Intenta nuevamente más tarde';
          console.error('❌ Server Error 500+:', {
            url: req.url,
            status: error.status,
            error: error.error
          });
        }
        
        // ===================================
        // 8. OTROS ERRORES
        // ===================================
        else {
          errorMessage = `Error ${error.status}: ${error.error?.message || error.message}`;
          console.error('❌ HTTP Error:', {
            url: req.url,
            status: error.status,
            error: error.error
          });
        }
        
        // Crear objeto de error mejorado
        const enhancedError = new Error(errorMessage);
        (enhancedError as any).originalError = error;
        (enhancedError as any).status = error.status;
        (enhancedError as any).url = req.url;
        
        return throwError(() => enhancedError);
      })
    );
  }
}
