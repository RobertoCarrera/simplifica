/**
 * VERIFACTU EDGE FUNCTIONS HELPER
 * 
 * Cliente para invocar Edge Functions de Supabase con autenticación.
 * Todas las operaciones fiscales se ejecutan server-side.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface EdgeFunctionResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface IssueInvoiceRequest {
  // Edge Function expects lowercase, underscore-less keys: `invoiceid`, `deviceid`, `softwareid`
  invoiceid: string;
  deviceid?: string;
  softwareid?: string;
}

export interface IssueInvoiceResponse {
  ok: boolean;
  invoice_id: string;
  company_id: string;
  hash: string;
  chain_position: number;
}

export interface UploadVerifactuCertRequest {
  software_code: string;
  issuer_nif: string;
  // Plain PEM values - encryption happens server-side
  cert_pem: string;
  key_pem: string;
  key_pass?: string | null;
  environment: 'pre' | 'prod';
}

export interface ValidateInvoiceResponse {
  valid: boolean;
  errors: string[];
}

export interface PreflightIssueResponse {
  ok: boolean;
  invoice_id: string;
  company_id: string;
  hash: string;
  chain_position: number;
}

export interface VerifactuSettingsResponse {
  ok: boolean;
  software_code: string;
  issuer_nif: string;
  environment: 'pre' | 'prod';
}

/**
 * Llama a una Edge Function de Supabase con autenticación
 */
export async function callEdgeFunction<TRequest = any, TResponse = any>(
  supabase: SupabaseClient,
  functionName: string,
  body: TRequest
): Promise<EdgeFunctionResponse<TResponse>> {
  try {
    // Obtener token de autenticación
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return {
        ok: false,
        error: 'NO_AUTH',
        message: 'No hay sesión activa. Por favor, inicia sesión.'
      };
    }

    // Obtener URL base de Supabase
    const supabaseUrl = (supabase as any).supabaseUrl || '';
    if (!supabaseUrl) {
      throw new Error('Supabase URL not configured');
    }

    // Construir URL de la Edge Function
    const url = `${supabaseUrl}/functions/v1/${functionName}`;

    console.log(`🚀 Calling Edge Function: ${functionName}`);
    console.log('📤 Edge Function request:', url, body);

    // Hacer petición HTTP con Bearer token
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    });

    // Parsear respuesta JSON
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Edge Function error (${response.status}):`, data);
      return {
        ok: false,
        error: data?.error || 'EDGE_FUNCTION_ERROR',
        message: data?.message || `Error ${response.status}: ${response.statusText}`,
        data: data as any
      };
    }

    console.log(`✅ Edge Function success (${response.status}):`, data);
    return {
      ok: true,
      data: data as TResponse
    };

  } catch (error: any) {
    console.error(`❌ Edge Function network error:`, error);
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: error.message || 'Error de red al conectar con el servidor'
    };
  }
}

/**
 * Encripta contenido usando Web Crypto API (AES-GCM)
 * Para certificados y claves privadas antes de enviarlos al backend
 */
export async function encryptContent(content: string): Promise<string> {
  try {
    // Generar clave efímera AES-256
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );

    // Generar IV aleatorio
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Codificar texto a bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(content);

    // Encriptar
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Exportar clave
    const exportedKey = await crypto.subtle.exportKey('raw', key);

    // Combinar: key (32 bytes) + iv (12 bytes) + encrypted data
    const combined = new Uint8Array(
      exportedKey.byteLength + iv.byteLength + encrypted.byteLength
    );
    combined.set(new Uint8Array(exportedKey), 0);
    combined.set(iv, exportedKey.byteLength);
    combined.set(new Uint8Array(encrypted), exportedKey.byteLength + iv.byteLength);

    // Convertir a base64
    return btoa(String.fromCharCode(...combined));

  } catch (error) {
    console.error('Error encrypting content:', error);
    throw new Error('Error al encriptar el contenido');
  }
}

/**
 * Lee un archivo como texto
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
}

/**
 * Mapea códigos de error de Verifactu a mensajes user-friendly
 */
export function mapVerifactuError(errorCode: string): string {
  const errorMap: Record<string, string> = {
    'NO_AUTH': 'No hay sesión activa. Por favor, inicia sesión.',
    'NETWORK_ERROR': 'Error de conexión. Verifica tu conexión a internet.',
    'EDGE_FUNCTION_ERROR': 'Error en el servidor. Contacta con soporte.',
    'series_not_verifactu': 'La serie de esta factura no está configurada para Verifactu.',
    'invalid_total': 'El importe total de la factura es inválido.',
    'missing_client': 'Falta información del cliente.',
    'missing_client_vat': 'El cliente no tiene NIF/CIF configurado.',
    'totals_mismatch': 'Los totales de la factura no cuadran.',
    'invalid_status_state': 'El estado de la factura no permite emisión Verifactu.',
    'certificate_not_found': 'No se encontró el certificado Verifactu. Configúralo primero.',
    'invalid_certificate': 'El certificado Verifactu es inválido o ha expirado.',
    'cert_upload_failed': 'Error al subir el certificado. Verifica los archivos.',
    'missing_settings': 'Falta configuración de Verifactu para esta empresa.',
    'chain_broken': 'La cadena de hashes está rota. Contacta con soporte.',
    'aeat_error': 'Error al comunicar con AEAT. Intenta más tarde.',
    'INVALID_CERT_FORMAT': 'El formato del certificado no es válido (debe ser PEM).',
    'INVALID_KEY_FORMAT': 'El formato de la clave privada no es válido (debe ser PEM).',
    'UNAUTHORIZED': 'No tienes permisos para realizar esta operación.'
  };

  return errorMap[errorCode] || `Error: ${errorCode}`;
}
