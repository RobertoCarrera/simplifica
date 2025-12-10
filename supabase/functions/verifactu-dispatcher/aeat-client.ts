/**
 * VeriFactu AEAT SOAP Client
 * Cliente para comunicación con los servicios web de AEAT
 * 
 * Endpoints según WSDL oficial de AEAT (SistemaFacturacion):
 * - Preproducción: https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
 * - Producción: https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
 * 
 * Para certificados de sello usar www10 en lugar de www1
 */

import { signXml, CertificateInfo } from './xades-signer.ts';

// Endpoints AEAT VeriFactu (según WSDL oficial)
const ENDPOINTS = {
  // Preproducción (pruebas)
  pre: {
    // Endpoint principal (certificado de software)
    verifactu: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    // Endpoint con certificado de sello
    verifactuSello: 'https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    // Legado SII (no usar para VeriFactu)
    suministroLR: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    consulta: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
  },
  // Producción
  prod: {
    // Endpoint principal (certificado de software)
    verifactu: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    // Endpoint con certificado de sello
    verifactuSello: 'https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
    // Legado SII (no usar para VeriFactu)
    suministroLR: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    consulta: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
  },
};

// SOAP Envelope template
const SOAP_ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    {BODY}
  </soapenv:Body>
</soapenv:Envelope>`;

export interface AEATResponse {
  success: boolean;
  csv?: string;                    // Código Seguro de Verificación
  timestamp?: string;
  tiempoEspera?: number;           // Segundos para siguiente envío
  registrosAceptados?: number;
  registrosRechazados?: number;
  errores?: AEATError[];
  rawResponse?: string;
}

export interface AEATError {
  codigo: string;
  descripcion: string;
  registroAfectado?: string;
}

export interface AEATClientConfig {
  environment: 'pre' | 'prod';
  certificate: CertificateInfo;
  timeout?: number;                // Timeout en ms (default 60000)
  retryOnError?: boolean;
  maxRetries?: number;
}

/**
 * Parsea respuesta SOAP de AEAT
 * @throws Error si la respuesta es HTML indicando endpoint no disponible
 */
function parseAEATResponse(soapResponse: string): AEATResponse {
  // Check if response is HTML instead of SOAP (indicates endpoint not available)
  if (soapResponse.includes('<!DOCTYPE') || soapResponse.includes('<html')) {
    console.error('[AEAT] Received HTML instead of SOAP - endpoint may not be available');
    // Check if it's a 403 page
    if (soapResponse.includes('403') || soapResponse.includes('Forbidden')) {
      throw new Error('AEAT endpoint not available (HTTP 403). The VeriFactu service may not be deployed yet.');
    }
    throw new Error('AEAT endpoint returned HTML instead of SOAP. Service may be unavailable.');
  }
  
  // Extraer contenido del Body
  const bodyMatch = soapResponse.match(/<(?:soap(?:env)?:)?Body[^>]*>([\s\S]*?)<\/(?:soap(?:env)?:)?Body>/i);
  if (!bodyMatch) {
    return {
      success: false,
      errores: [{ codigo: 'PARSE_ERROR', descripcion: 'No se pudo parsear la respuesta SOAP' }],
      rawResponse: soapResponse,
    };
  }
  
  const body = bodyMatch[1];
  
  // Buscar CSV (Código Seguro Verificación)
  const csvMatch = body.match(/<CSV>([^<]+)<\/CSV>/i);
  const csv = csvMatch ? csvMatch[1] : undefined;
  
  // Buscar tiempo de espera
  const tiempoMatch = body.match(/<TiempoEsperaEnvio>(\d+)<\/TiempoEsperaEnvio>/i);
  const tiempoEspera = tiempoMatch ? parseInt(tiempoMatch[1], 10) : undefined;
  
  // Buscar errores
  const errores: AEATError[] = [];
  const errorRegex = /<(?:Error|RechazosRegistro)[^>]*>([\s\S]*?)<\/(?:Error|RechazosRegistro)>/gi;
  let errorMatch;
  while ((errorMatch = errorRegex.exec(body)) !== null) {
    const errorBlock = errorMatch[1];
    const codigoMatch = errorBlock.match(/<CodigoError(?:Registro)?>([^<]+)<\/CodigoError(?:Registro)?>/i);
    const descMatch = errorBlock.match(/<DescripcionError(?:Registro)?>([^<]+)<\/DescripcionError(?:Registro)?>/i);
    
    if (codigoMatch || descMatch) {
      errores.push({
        codigo: codigoMatch ? codigoMatch[1] : 'UNKNOWN',
        descripcion: descMatch ? descMatch[1] : 'Error desconocido',
      });
    }
  }
  
  // Buscar estado general
  const estadoMatch = body.match(/<EstadoEnvio>([^<]+)<\/EstadoEnvio>/i);
  const estado = estadoMatch ? estadoMatch[1] : '';
  
  // Contar registros
  const aceptadosMatch = body.match(/<RegistrosAceptados>(\d+)<\/RegistrosAceptados>/i);
  const rechazadosMatch = body.match(/<RegistrosRechazados>(\d+)<\/RegistrosRechazados>/i);
  
  const success = estado.toLowerCase() === 'correcto' || 
                  estado.toLowerCase() === 'parcialmente_correcto' ||
                  (csv !== undefined && errores.length === 0);
  
  return {
    success,
    csv,
    tiempoEspera,
    registrosAceptados: aceptadosMatch ? parseInt(aceptadosMatch[1], 10) : undefined,
    registrosRechazados: rechazadosMatch ? parseInt(rechazadosMatch[1], 10) : undefined,
    errores: errores.length > 0 ? errores : undefined,
    rawResponse: soapResponse,
  };
}

/**
 * Construye SOAP Action header
 */
function getSoapAction(action: 'suministro' | 'consulta' | 'anulacion'): string {
  switch (action) {
    case 'suministro':
      return 'SuministroLR';
    case 'anulacion':
      return 'AnulacionLR';
    case 'consulta':
      return 'ConsultaLR';
    default:
      return 'SuministroLR';
  }
}

/**
 * Cliente AEAT para VeriFactu
 */
export class AEATClient {
  private config: AEATClientConfig;
  private lastRequestTime: number = 0;
  private waitTime: number = 60;  // 60 segundos inicial según Art. 16.2
  
  constructor(config: AEATClientConfig) {
    this.config = {
      timeout: 60000,
      retryOnError: true,
      maxRetries: 3,
      ...config,
    };
  }
  
  /**
   * Obtiene el endpoint según el entorno y tipo de operación
   */
  private getEndpoint(action: 'suministro' | 'consulta' | 'anulacion'): string {
    const env = this.config.environment;
    // Por ahora usamos el endpoint VeriFactu (a confirmar por AEAT)
    return ENDPOINTS[env].verifactu;
  }
  
  /**
   * Espera el tiempo necesario según control de flujo (Art. 16.2)
   */
  private async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRequestTime) / 1000;
    
    if (this.lastRequestTime > 0 && elapsed < this.waitTime) {
      const waitMs = (this.waitTime - elapsed) * 1000;
      console.log(`[AEAT] Waiting ${waitMs}ms before next request (flow control)`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  
  /**
   * Envía request SOAP a AEAT con mTLS (certificado cliente)
   */
  private async sendRequest(
    endpoint: string,
    soapAction: string,
    body: string,
    attempt: number = 1
  ): Promise<AEATResponse> {
    await this.waitIfNeeded();
    
    // Crear SOAP envelope
    const soapBody = SOAP_ENVELOPE.replace('{BODY}', body);
    
    // Firmar el XML con XAdES
    const signedBody = await signXml(soapBody, this.config.certificate);
    
    console.log(`[AEAT] Sending request to ${endpoint} (attempt ${attempt})`);
    
    try {
      // Check if Deno.createHttpClient is available (might not be in Edge Functions)
      let response: Response;
      
      if (typeof Deno !== 'undefined' && typeof Deno.createHttpClient === 'function') {
        console.log('[AEAT] Using mTLS with Deno.createHttpClient');
        // Create HTTP client with mTLS (client certificate)
        const httpClient = Deno.createHttpClient({
          certChain: this.config.certificate.pem,
          privateKey: this.config.certificate.privateKey,
        });
        
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=UTF-8',
            'SOAPAction': soapAction,
          },
          body: signedBody,
          // @ts-ignore - Deno specific option
          client: httpClient,
        });
        
        // Close the HTTP client after use
        httpClient.close();
      } else {
        console.log('[AEAT] Deno.createHttpClient not available, using standard fetch (mTLS may not work)');
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=UTF-8',
            'SOAPAction': soapAction,
          },
          body: signedBody,
        });
      }
      
      this.lastRequestTime = Date.now();
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AEAT] HTTP Error ${response.status}: ${errorText.substring(0, 500)}`);
        
        // Check if this is a 403 with HTML response (endpoint doesn't exist)
        const isHtmlResponse = errorText.includes('<!DOCTYPE') || errorText.includes('<html');
        
        if (response.status === 403 && isHtmlResponse) {
          console.error('[AEAT] Received 403 with HTML - endpoint not available. Using fallback.');
          throw new Error(`AEAT endpoint not available (HTTP 403). The VeriFactu service may not be deployed yet.`);
        }
        
        if (this.config.retryOnError && attempt < (this.config.maxRetries || 3)) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.sendRequest(endpoint, soapAction, body, attempt + 1);
        }
        
        return {
          success: false,
          errores: [{
            codigo: `HTTP_${response.status}`,
            descripcion: `Error HTTP: ${response.statusText}. ${errorText.substring(0, 200)}`,
          }],
          rawResponse: errorText,
        };
      }
      
      const responseText = await response.text();
      const parsed = parseAEATResponse(responseText);
      
      // Actualizar tiempo de espera si la respuesta lo indica
      if (parsed.tiempoEspera !== undefined) {
        this.waitTime = parsed.tiempoEspera;
        console.log(`[AEAT] Updated wait time to ${this.waitTime}s`);
      }
      
      return parsed;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AEAT] Request error:`, errorMessage);
      
      // If this is an endpoint not available error, propagate it for fallback handling
      if (errorMessage.includes('AEAT endpoint not available')) {
        throw error;
      }
      
      if (this.config.retryOnError && attempt < (this.config.maxRetries || 3)) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.sendRequest(endpoint, soapAction, body, attempt + 1);
      }
      
      return {
        success: false,
        errores: [{
          codigo: 'NETWORK_ERROR',
          descripcion: `Error de conexión: ${errorMessage}`,
        }],
      };
    }
  }
  
  /**
   * Envía registros de facturación (alta) a AEAT
   */
  async suministroLR(verifactuXml: string): Promise<AEATResponse> {
    const endpoint = this.getEndpoint('suministro');
    const soapAction = getSoapAction('suministro');
    return this.sendRequest(endpoint, soapAction, verifactuXml);
  }
  
  /**
   * Envía registros de anulación a AEAT
   */
  async anulacionLR(verifactuXml: string): Promise<AEATResponse> {
    const endpoint = this.getEndpoint('anulacion');
    const soapAction = getSoapAction('anulacion');
    return this.sendRequest(endpoint, soapAction, verifactuXml);
  }
  
  /**
   * Consulta registros en AEAT
   */
  async consultaLR(verifactuXml: string): Promise<AEATResponse> {
    const endpoint = this.getEndpoint('consulta');
    const soapAction = getSoapAction('consulta');
    return this.sendRequest(endpoint, soapAction, verifactuXml);
  }
  
  /**
   * Obtiene el tiempo de espera actual para el siguiente envío
   */
  getWaitTime(): number {
    return this.waitTime;
  }
  
  /**
   * Indica si se puede enviar inmediatamente o hay que esperar
   */
  canSendNow(): boolean {
    const elapsed = (Date.now() - this.lastRequestTime) / 1000;
    return this.lastRequestTime === 0 || elapsed >= this.waitTime;
  }
  
  /**
   * Tiempo restante antes de poder enviar (en segundos)
   */
  getTimeToNextSend(): number {
    const elapsed = (Date.now() - this.lastRequestTime) / 1000;
    return Math.max(0, this.waitTime - elapsed);
  }
}

/**
 * Crea cliente AEAT con configuración
 */
export async function createAEATClient(config: AEATClientConfig): Promise<AEATClient> {
  console.log('[createAEATClient] Creating client with environment:', config.environment);
  return new AEATClient(config);
}

/**
 * Valida respuesta AEAT y extrae información relevante
 */
export function validateAEATResponse(response: AEATResponse): {
  valid: boolean;
  message: string;
  details?: Record<string, unknown>;
} {
  if (response.success) {
    return {
      valid: true,
      message: `Envío aceptado. CSV: ${response.csv || 'N/A'}`,
      details: {
        csv: response.csv,
        registrosAceptados: response.registrosAceptados,
        tiempoEspera: response.tiempoEspera,
      },
    };
  }
  
  const errorMessages = response.errores?.map(e => `${e.codigo}: ${e.descripcion}`).join('; ') || 'Error desconocido';
  
  return {
    valid: false,
    message: `Envío rechazado: ${errorMessages}`,
    details: {
      errores: response.errores,
      registrosRechazados: response.registrosRechazados,
    },
  };
}
