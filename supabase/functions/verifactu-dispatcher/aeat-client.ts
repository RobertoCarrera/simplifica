/**
 * VeriFactu AEAT SOAP Client
 * Cliente para comunicación con los servicios web de AEAT
 * 
 * Endpoints según Artículo 16 de la Orden HAC/1177/2024:
 * - Preproducción: https://prewww1.aeat.es/wlpl/SSII-FACT/ws/...
 * - Producción: https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/...
 * 
 * Nota: Los endpoints específicos de VeriFactu pueden variar.
 * La AEAT publicará las URLs definitivas en su sede electrónica.
 */

import { signXml, CertificateInfo } from './xades-signer.ts';

// Endpoints AEAT (basados en SII - VeriFactu usará estructura similar)
const ENDPOINTS = {
  // Preproducción (pruebas)
  pre: {
    suministroLR: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    consulta: 'https://prewww1.aeat.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    // Endpoints VeriFactu específicos (a confirmar por AEAT)
    verifactu: 'https://prewww1.aeat.es/wlpl/VERIFACTU-FACT/ws/SuministroLR',
  },
  // Producción
  prod: {
    suministroLR: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    consulta: 'https://www1.agenciatributaria.gob.es/wlpl/SSII-FACT/ws/fe/SiiFactFEV2SOAP',
    // Endpoints VeriFactu específicos (a confirmar por AEAT)
    verifactu: 'https://www1.agenciatributaria.gob.es/wlpl/VERIFACTU-FACT/ws/SuministroLR',
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
 */
function parseAEATResponse(soapResponse: string): AEATResponse {
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
   * Envía request SOAP a AEAT con mTLS
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
      // En Deno, para mTLS necesitamos usar Deno.connectTls con certificados
      // Sin embargo, en Edge Functions de Supabase esto puede tener limitaciones
      // Por ahora usamos fetch estándar con el cuerpo firmado
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8',
          'SOAPAction': soapAction,
        },
        body: signedBody,
      });
      
      this.lastRequestTime = Date.now();
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AEAT] HTTP Error ${response.status}: ${errorText}`);
        
        if (this.config.retryOnError && attempt < (this.config.maxRetries || 3)) {
          console.log(`[AEAT] Retrying in 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          return this.sendRequest(endpoint, soapAction, body, attempt + 1);
        }
        
        return {
          success: false,
          errores: [{
            codigo: `HTTP_${response.status}`,
            descripcion: `Error HTTP: ${response.statusText}. ${errorText.substring(0, 200)}`,
          }],
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
      console.error(`[AEAT] Request error:`, error);
      
      if (this.config.retryOnError && attempt < (this.config.maxRetries || 3)) {
        console.log(`[AEAT] Retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.sendRequest(endpoint, soapAction, body, attempt + 1);
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
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
 * Crea cliente AEAT con configuración de Supabase secrets
 */
export async function createAEATClient(
  environment: 'pre' | 'prod',
  certPem: string,
  keyPem: string,
  keyPassword?: string
): Promise<AEATClient> {
  return new AEATClient({
    environment,
    certificate: {
      pem: certPem,
      privateKey: keyPem,
      keyPassword,
    },
  });
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
