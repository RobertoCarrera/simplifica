import { Injectable } from '@angular/core';

export interface MailError {
  code: string;
  message: string;
  userMessage: string;
  details?: any;
}

@Injectable({ providedIn: 'root' })
export class MailErrorService {

  parse(error: unknown): MailError {
    // Case 1: Edge Function error with structured body
    if (error && typeof error === 'object' && 'context' in error) {
      const e = error as any;
      if (e.context && typeof e.context.json === 'function') {
        try {
          const body = e.context.json();
          if (body?.error) {
            return {
              code: body.code || 'EDGE_FUNCTION_ERROR',
              message: body.error,
              userMessage: body.userMessage || this.humanize(body.error),
              details: body.details,
            };
          }
        } catch { /* fall through */ }
      }
    }

    // Case 2: Direct error object
    if (error && typeof error === 'object' && 'message' in error) {
      const e = error as any;
      return {
        code: e.code || 'UNKNOWN',
        message: e.message,
        userMessage: this.humanize(e.message),
        details: e.details,
      };
    }

    // Case 3: String error
    if (typeof error === 'string') {
      return {
        code: 'STRING_ERROR',
        message: error,
        userMessage: this.humanize(error),
      };
    }

    // Case 4: Unknown shape
    return {
      code: 'UNKNOWN',
      message: 'Error desconocido',
      userMessage: 'Ocurrió un error inesperado. Por favor intenta de nuevo.',
    };
  }

  humanize(message: string): string {
    const msg = message.toLowerCase();

    if (msg.includes('duplicate') || msg.includes('unique')) {
      return 'Ya existe un registro con esos datos.';
    }
    if (msg.includes('not found') || msg.includes('no encontrado')) {
      return 'El elemento solicitado no fue encontrado.';
    }
    if (msg.includes('unauthorized') || msg.includes('401')) {
      return 'No tienes permisos para realizar esta acción.';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
      return 'Error de conexión. Verifica tu conexión a internet.';
    }
    if (msg.includes('timeout')) {
      return 'La operación tardó demasiado. Intenta de nuevo.';
    }
    if (msg.includes('rate limit') || msg.includes('429')) {
      return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
    }

    return message.length > 80 ? message.substring(0, 80) + '...' : message;
  }

  throw(error: unknown): never {
    const parsed = this.parse(error);
    throw parsed;
  }
}
