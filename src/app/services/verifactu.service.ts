import { Injectable, inject } from '@angular/core';
import { Observable, from, map, catchError, of } from 'rxjs';
import CryptoJS from 'crypto-js';
import { Invoice } from '../models/invoice.model';
import { SupabaseClientService } from './supabase-client.service';
import { 
  callEdgeFunction,
  IssueInvoiceRequest,
  IssueInvoiceResponse,
  UploadVerifactuCertRequest,
  ValidateInvoiceResponse,
  PreflightIssueResponse,
  VerifactuSettingsResponse,
  mapVerifactuError
} from '../lib/edge-functions.helper';

/**
 * SERVICIO VERI*FACTU
 * 
 * Sistema de verificación de facturas según normativa AEAT
 * Integrado con Edge Functions de Supabase para operaciones server-side
 * 
 * ARQUITECTURA:
 * - Frontend: Solo orquestación de llamadas y UI
 * - Backend: Toda la lógica fiscal en Edge Functions y RPC
 */

export interface VerifactuData {
  hash: string;
  signature?: string;
  timestamp: string;
  qr_code?: string;
  xml?: string;
  chain_position: number;
}

export interface VerifactuChainInfo {
  previous_hash: string;
  current_hash: string;
  chain_position: number;
  is_valid: boolean;
}

export interface VerifactuSettings {
  software_code: string;
  issuer_nif: string;
  environment: 'pre' | 'prod';
  // encrypted versions
  cert_pem_enc?: string;
  key_pem_enc?: string;
  key_pass_enc?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class VerifactuService {
  private sbClient = inject(SupabaseClientService);
  private supabase = this.sbClient.instance;

  // =====================================================
  // EDGE FUNCTIONS - SERVER-SIDE OPERATIONS
  // =====================================================

  /**
   * Valida una factura antes de emitirla con Verifactu
   * Llama a RPC validate_invoice_before_issue
   */
  validateInvoiceBeforeIssue(invoiceId: string): Observable<ValidateInvoiceResponse> {
    return from(
      this.supabase.rpc('validate_invoice_before_issue', {
        pinvoice_id: invoiceId
      })
    ).pipe(
      map((response: any) => {
        if (response.error) {
          console.error('❌ Error validating invoice:', response.error);
          return {
            valid: false,
            errors: [response.error.message || 'Error de validación']
          };
        }
        return response.data as ValidateInvoiceResponse;
      }),
      catchError((error) => {
        console.error('❌ RPC error:', error);
        return of({
          valid: false,
          errors: [mapVerifactuError(error.code || 'UNKNOWN_ERROR')]
        });
      })
    );
  }

  /**
   * Emite una factura con Verifactu (genera hash y registra en cadena)
   * Llama a Edge Function issue-invoice
   */
  issueInvoice(request: IssueInvoiceRequest): Observable<IssueInvoiceResponse | null> {
    console.log('📤 Issuing invoice with Verifactu:', request);
    
    return from(
      callEdgeFunction<IssueInvoiceRequest, IssueInvoiceResponse>(
        this.supabase,
        'issue-invoice',
        request
      )
    ).pipe(
      map((response) => {
        if (!response.ok || !response.data) {
          console.error('❌ Issue invoice failed:', response.error);
          throw new Error(mapVerifactuError(response.error || 'UNKNOWN_ERROR'));
        }
        console.log('✅ Invoice issued successfully:', response.data);
        return response.data;
      }),
      catchError((error) => {
        console.error('❌ Issue invoice error:', error);
        throw error;
      })
    );
  }

  /**
   * Sube certificado y configuración de Verifactu
   * Llama a Edge Function upload-verifactu-cert
   */
  uploadVerifactuCertificate(request: UploadVerifactuCertRequest): Observable<boolean> {
    console.log('📤 Uploading Verifactu certificate...');
    
    return from(
      callEdgeFunction<UploadVerifactuCertRequest, { ok: boolean }>(
        this.supabase,
        'upload-verifactu-cert',
        request
      )
    ).pipe(
      map((response) => {
        if (!response.ok) {
          console.error('❌ Upload certificate failed:', response.error);
          throw new Error(mapVerifactuError(response.error || 'cert_upload_failed'));
        }
        console.log('✅ Certificate uploaded successfully');
        return true;
      }),
      catchError((error) => {
        console.error('❌ Upload certificate error:', error);
        throw error;
      })
    );
  }

  /**
   * Preflight check antes de emitir (opcional, para debugging)
   * Llama a RPC verifactu_preflight_issue
   */
  preflightIssue(
    invoiceId: string,
    deviceId?: string,
    softwareId?: string
  ): Observable<PreflightIssueResponse> {
    return from(
      this.supabase.rpc('verifactu_preflight_issue', {
        pinvoice_id: invoiceId,
        pdevice_id: deviceId || null,
        psoftware_id: softwareId || null
      })
    ).pipe(
      map((response: any) => {
        if (response.error) {
          throw new Error(response.error.message);
        }
        return response.data as PreflightIssueResponse;
      }),
      catchError((error) => {
        console.error('❌ Preflight error:', error);
        throw error;
      })
    );
  }

  /**
   * Obtiene configuración de Verifactu para la empresa
   * Solo disponible para admin/owner (RPC con service_role)
   */
  getVerifactuSettings(companyId: string): Observable<VerifactuSettingsResponse | null> {
    return from(
      this.supabase.rpc('get_verifactu_settings_for_company', {
        pcompany_id: companyId
      })
    ).pipe(
      map((response: any) => {
        if (response.error) {
          console.warn('⚠️ No Verifactu settings found:', response.error);
          return null;
        }
        return response.data as VerifactuSettingsResponse;
      }),
      catchError((error) => {
        console.error('❌ Get settings error:', error);
        return of(null);
      })
    );
  }

  /**
   * Obtiene configuración directamente de la tabla verifactu_settings (sin RPC)
   * Uso: pantalla de configuración. Respeta RLS (selecciona por company_id).
   */
  fetchSettingsForCompany(companyId: string): Observable<VerifactuSettings | null> {
    return from(
      this.supabase
        .from('verifactu_settings')
        .select('software_code, issuer_nif, environment, cert_pem_enc, key_pem_enc, key_pass_enc, updated_at')
        .eq('company_id', companyId)
        .maybeSingle()
    ).pipe(
      map((response: any) => {
        if (response.error) {
          console.warn('⚠️ Verifactu settings direct select error:', response.error.message);
          return null;
        }
        if (!response.data) return null;
        const d = response.data;
        return {
          software_code: d.software_code,
          issuer_nif: d.issuer_nif,
          environment: d.environment,
          cert_pem_enc: d.cert_pem_enc,
          key_pem_enc: d.key_pem_enc,
          key_pass_enc: d.key_pass_enc
        } as VerifactuSettings;
      }),
      catchError(err => {
        console.error('❌ fetchSettingsForCompany error:', err);
        return of(null);
      })
    );
  }

  /**
   * Obtiene configuración actual y historial de rotaciones de certificados
   */
  fetchCertificateHistory(companyId: string): Observable<{settings: {software_code: string; issuer_nif: string; environment: 'pre' | 'prod'; configured: boolean; mode: 'encrypted' | 'none'}; history: Array<{version: number; stored_at: string; rotated_by: string | null; integrity_hash: string | null; notes: string | null; cert_len: number | null; key_len: number | null; pass_present: boolean;}>} | null> {
    return from(
      callEdgeFunction<any, { ok: boolean; settings: any; history: any[] }>(
        this.supabase,
        'verifactu-cert-history',
        {}
      )
    ).pipe(
      map(resp => {
        if (!resp.ok || !resp.data) {
          console.warn('⚠️ History fetch failed:', resp.error);
          return null;
        }
        return {
          settings: resp.data.settings || { software_code: '', issuer_nif: '', environment: 'pre', configured: false, mode: 'none' },
          history: resp.data.history || []
        };
      }),
      catchError(err => {
        console.error('❌ fetchCertificateHistory error:', err);
        return of(null);
      })
    );
  }

  // =====================================================
  // HASH GENERATION (SHA-256) - CLIENT-SIDE UTILITY
  // =====================================================

  /**
   * Genera hash SHA-256 para una factura
   * 
   * El hash incluye:
   * - Hash de la factura anterior
   * - Número completo de factura
   * - Fecha de emisión
   * - Importe total
   * - CIF emisor
   * - CIF receptor
   */
  generateInvoiceHash(
    invoice: Invoice,
    previousHash: string = 'GENESIS'
  ): string {
    // Construir string de datos para hash
    const dataString = [
      previousHash,
      invoice.full_invoice_number || '',
      invoice.invoice_date,
      invoice.total.toFixed(2),
      invoice.company_id, // En producción: CIF de la empresa
      invoice.client_id   // En producción: NIF/CIF del cliente
    ].join('|');

    // Generar hash SHA-256
    const hash = CryptoJS.SHA256(dataString).toString(CryptoJS.enc.Hex);

    console.log('🔐 Veri*Factu Hash generado:', {
      invoice_number: invoice.full_invoice_number,
      previous_hash: previousHash.substring(0, 16) + '...',
      new_hash: hash.substring(0, 16) + '...',
      data_string: dataString.substring(0, 100) + '...'
    });

    return hash;
  }

  /**
   * Verifica la integridad de la cadena de hashes
   */
  verifyHashChain(
    invoices: Invoice[]
  ): VerifactuChainInfo[] {
    const results: VerifactuChainInfo[] = [];
    let previousHash = 'GENESIS';

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const expectedHash = this.generateInvoiceHash(invoice, previousHash);
      const isValid = expectedHash === invoice.verifactu_hash;

      results.push({
        previous_hash: previousHash,
        current_hash: invoice.verifactu_hash || '',
        chain_position: i + 1,
        is_valid: isValid
      });

      if (!isValid) {
        console.error('❌ Cadena Veri*Factu rota en factura:', invoice.full_invoice_number);
      }

      previousHash = invoice.verifactu_hash || '';
    }

    return results;
  }

  // =====================================================
  // QR CODE GENERATION
  // =====================================================

  /**
   * Genera código QR para verificación AEAT
   * 
   * El QR contiene URL de verificación con parámetros:
   * - Número de factura
   * - Hash de verificación
   * - CIF emisor
   */
  generateQRCode(invoice: Invoice): Observable<string> {
    return new Observable(observer => {
      try {
        // URL base de verificación AEAT (ejemplo, no oficial)
        const baseUrl = 'https://www.agenciatributaria.es/verifactu';
        
        // Parámetros de verificación
        const params = new URLSearchParams({
          nif: invoice.company_id, // En producción: CIF real
          numero: invoice.full_invoice_number || '',
          fecha: invoice.invoice_date,
          importe: invoice.total.toFixed(2),
          hash: invoice.verifactu_hash || ''
        });

        const qrUrl = `${baseUrl}?${params.toString()}`;

        // TODO: Generar QR Code real usando librería qrcode
        // import QRCode from 'qrcode';
        // const qrDataUrl = await QRCode.toDataURL(qrUrl);

        console.log('📱 QR Veri*Factu generado:', qrUrl);

        observer.next(qrUrl);
        observer.complete();
      } catch (error) {
        console.error('Error generando QR:', error);
        observer.error(error);
      }
    });
  }

  // =====================================================
  // XML GENERATION (Formato AEAT)
  // =====================================================

  /**
   * Genera XML estructurado según formato Veri*Factu
   * 
   * IMPORTANTE: Este es un ejemplo básico
   * La especificación real está en el PDF adjunto
   */
  generateVerifactuXML(invoice: Invoice): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<FacturaVerifactu xmlns="https://www.agenciatributaria.es/verifactu">
  <Cabecera>
    <NumFactura>${this.escapeXML(invoice.full_invoice_number || '')}</NumFactura>
    <FechaExpedicion>${invoice.invoice_date}</FechaExpedicion>
    <TipoFactura>${invoice.invoice_type}</TipoFactura>
  </Cabecera>
  
  <Emisor>
    <NIF>${this.escapeXML(invoice.company_id)}</NIF>
    <!-- TODO: Añadir datos reales de la empresa -->
  </Emisor>
  
  <Receptor>
    <NIF>${this.escapeXML(invoice.client_id)}</NIF>
    <!-- TODO: Añadir datos reales del cliente -->
  </Receptor>
  
  <Importes>
    <ImporteTotal>${invoice.total.toFixed(2)}</ImporteTotal>
    <BaseImponible>${invoice.subtotal.toFixed(2)}</BaseImponible>
    <CuotaIVA>${invoice.tax_amount.toFixed(2)}</CuotaIVA>
  </Importes>
  
  <Huella>
    <AlgoritmoHuella>SHA-256</AlgoritmoHuella>
    <Huella>${this.escapeXML(invoice.verifactu_hash || '')}</Huella>
    <PosicionCadena>${invoice.verifactu_chain_position || 0}</PosicionCadena>
  </Huella>
  
  <FechaHora>${invoice.verifactu_timestamp || new Date().toISOString()}</FechaHora>
  
  <!-- Firma digital (requiere certificado) -->
  <Firma>
    ${invoice.verifactu_signature ? `<Signature>${this.escapeXML(invoice.verifactu_signature)}</Signature>` : '<!-- Pendiente de firma digital -->'}
  </Firma>
</FacturaVerifactu>`;

    return xml;
  }

  /**
   * Escape caracteres especiales XML
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // =====================================================
  // FIRMA DIGITAL (Requiere certificado)
  // =====================================================

  /**
   * Firma digitalmente una factura
   * 
   * ⚠️ IMPORTANTE: Requiere certificado digital de la empresa
   * 
   * TODO:
   * - Integrar con proveedor de certificados
   * - Implementar firma PKCS#7
   * - Validar certificado no revocado
   */
  signInvoice(invoice: Invoice, certificate?: any): Observable<string> {
    return new Observable(observer => {
      console.warn('⚠️ Firma digital no implementada aún');
      console.log('Requiere:');
      console.log('1. Certificado digital de la empresa');
      console.log('2. Librería de firma PKCS#7');
      console.log('3. Validación de certificado');
      
      // TODO: Implementar firma real
      // const signature = signWithCertificate(invoice, certificate);
      
      observer.next('FIRMA_PENDIENTE');
      observer.complete();
    });
  }

  // =====================================================
  // VALIDACIÓN DE FACTURAS
  // =====================================================

  /**
   * Valida una factura contra AEAT (cuando esté disponible)
   */
  validateInvoiceWithAEAT(invoice: Invoice): Observable<boolean> {
    return new Observable(observer => {
      console.warn('⚠️ Validación con AEAT no disponible aún');
      console.log('Esperando API oficial de la AEAT');
      
      // TODO: Cuando AEAT lance API oficial
      // const response = await fetch('https://www.agenciatributaria.es/api/verifactu/validate', {
      //   method: 'POST',
      //   body: JSON.stringify({
      //     nif: invoice.company_id,
      //     numero: invoice.full_invoice_number,
      //     hash: invoice.verifactu_hash
      //   })
      // });
      
      observer.next(true);
      observer.complete();
    });
  }

  // =====================================================
  // UTILIDADES
  // =====================================================

  /**
   * Verifica si Veri*Factu está habilitado para una serie
   */
  isVerifactuEnabled(seriesId: string): boolean {
    // TODO: Consultar configuración de la serie
    return true;
  }

  /**
   * Genera reporte de auditoría de la cadena
   */
  generateChainAuditReport(invoices: Invoice[]): {
    total_invoices: number;
    valid_chain: boolean;
    broken_links: number[];
    first_hash: string;
    last_hash: string;
  } {
    const chainInfo = this.verifyHashChain(invoices);
    const brokenLinks = chainInfo
      .map((info, idx) => info.is_valid ? -1 : idx)
      .filter(idx => idx !== -1);

    return {
      total_invoices: invoices.length,
      valid_chain: brokenLinks.length === 0,
      broken_links: brokenLinks,
      first_hash: invoices[0]?.verifactu_hash || '',
      last_hash: invoices[invoices.length - 1]?.verifactu_hash || ''
    };
  }

  /**
   * Exporta cadena de facturas para auditoría
   */
  exportChainForAudit(invoices: Invoice[]): Blob {
    const chainData = invoices.map(inv => ({
      numero: inv.full_invoice_number,
      fecha: inv.invoice_date,
      importe: inv.total,
      hash: inv.verifactu_hash,
      posicion: inv.verifactu_chain_position
    }));

    const json = JSON.stringify(chainData, null, 2);
    return new Blob([json], { type: 'application/json' });
  }
}

// =====================================================
// NOTAS DE IMPLEMENTACIÓN
// =====================================================

/**
 * ROADMAP VERI*FACTU:
 * 
 * FASE 1 (ACTUAL): ✅ Estructura preparada
 * - Tablas con campos verifactu_*
 * - Generación de hash SHA-256
 * - Verificación de cadena
 * - Generación XML básica
 * 
 * FASE 2: ⏳ Pendiente
 * - QR Code real (librería qrcode)
 * - XML conforme a especificación oficial
 * - Firma digital (certificado)
 * 
 * FASE 3: ⏳ Pendiente (cuando AEAT lance)
 * - Integración API AEAT
 * - Validación online
 * - Envío automático
 * 
 * FASE 4: ⏳ Opcional
 * - Blockchain privado para inmutabilidad
 * - Timestamp authority
 * - Auditoría avanzada
 */

/**
 * DEPENDENCIAS NECESARIAS:
 * 
 * npm install crypto-js
 * npm install qrcode
 * npm install @types/qrcode
 * npm install node-forge (para firma digital)
 */

/**
 * CERTIFICADO DIGITAL:
 * 
 * Necesitarás obtener un certificado digital de:
 * - FNMT (Fábrica Nacional de Moneda y Timbre)
 * - Autoridades certificadoras reconocidas
 * 
 * Formato: PKCS#12 (.p12, .pfx)
 * Uso: Firma de documentos
 */
