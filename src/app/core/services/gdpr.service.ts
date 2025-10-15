import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Observable, from, map, catchError, of } from 'rxjs';
import { AuthService } from '../../services/auth.service';

/**
 * Servicio GDPR para gestión de datos personales y cumplimiento normativo
 * Implementa todos los derechos GDPR (Art. 15-22)
 */
@Injectable({
  providedIn: 'root'
})
export class GDPRService {
  private supabase: SupabaseClient;

  constructor(private authService: AuthService) {
    // ✅ Usar el singleton de AuthService en lugar de crear nuevo cliente
    this.supabase = this.authService['supabase'];
  }

  // ============================================================================
  // ART. 15 & 20 - DERECHO DE ACCESO Y PORTABILIDAD
  // ============================================================================

  /**
   * Exporta todos los datos de un cliente en formato JSON
   * @param clientId UUID del cliente
   * @returns Observable con los datos completos del cliente
   */
  exportClientData(clientId: string): Observable<GDPRExportResponse> {
    return from(
      this.supabase.rpc('export_client_gdpr_data', {
        p_client_id: clientId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRExportResponse;
      }),
      catchError(error => {
        console.error('Error exportando datos GDPR:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        } as GDPRExportResponse);
      })
    );
  }

  /**
   * Descarga los datos del cliente como archivo JSON
   * @param clientId UUID del cliente
   * @param clientName Nombre del cliente (para el archivo)
   */
  downloadClientData(clientId: string, clientName: string): Observable<boolean> {
    return this.exportClientData(clientId).pipe(
      map(response => {
        if (!response.success) {
          throw new Error(response.error || 'Error desconocido');
        }

        // Crear archivo JSON
        const dataStr = JSON.stringify(response.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Descargar archivo
        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gdpr-export-${this.sanitizeFilename(clientName)}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        window.URL.revokeObjectURL(url);
        return true;
      }),
      catchError(error => {
        console.error('Error descargando datos:', error);
        return of(false);
      })
    );
  }

  // ============================================================================
  // ART. 17 - DERECHO AL OLVIDO
  // ============================================================================

  /**
   * Anonimiza los datos de un cliente (cumple con derecho de supresión)
   * @param clientId UUID del cliente
   * @param reason Motivo de la anonimización
   * @returns Observable con el resultado
   */
  anonymizeClient(clientId: string, reason: string): Observable<GDPRResponse> {
    return from(
      this.supabase.rpc('anonymize_client_data', {
        p_client_id: clientId,
        p_reason: reason,
        p_requesting_user_id: null // Usa el usuario actual
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRResponse;
      }),
      catchError(error => {
        console.error('Error anonimizando cliente:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        });
      })
    );
  }

  /**
   * Alias para anonymizeClient - mantiene compatibilidad con componentes
   */
  anonymizeClientData(clientId: string, reason: string): Observable<GDPRResponse> {
    return this.anonymizeClient(clientId, reason);
  }

  // ============================================================================
  // ART. 15-22 - SOLICITUDES DE ACCESO GDPR
  // ============================================================================

  /**
   * Crea una solicitud de acceso GDPR (acceso, rectificación, supresión, etc.)
   * @param email Email del interesado
   * @param requestType Tipo de solicitud
   * @param details Detalles de la solicitud
   * @returns Observable con el resultado
   */
  createAccessRequest(
    email: string,
    requestType: GDPRRequestType,
    details: string
  ): Observable<GDPRAccessRequestResponse> {
    return from(
      this.supabase.rpc('create_gdpr_access_request', {
        p_subject_email: email,
        p_request_type: requestType,
        p_request_details: details,
        p_requesting_user_id: null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRAccessRequestResponse;
      }),
      catchError(error => {
        console.error('Error creando solicitud GDPR:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        } as GDPRAccessRequestResponse);
      })
    );
  }

  /**
   * Procesa una solicitud de eliminación (aprobar o rechazar)
   * @param requestId UUID de la solicitud
   * @param approve true para aprobar, false para rechazar
   * @param rejectionReason Motivo del rechazo (si approve=false)
   * @returns Observable con el resultado
   */
  processDeletionRequest(
    requestId: string,
    approve: boolean,
    rejectionReason?: string
  ): Observable<GDPRResponse> {
    return from(
      this.supabase.rpc('process_gdpr_deletion_request', {
        p_request_id: requestId,
        p_approve: approve,
        p_rejection_reason: rejectionReason || null,
        p_requesting_user_id: null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRResponse;
      }),
      catchError(error => {
        console.error('Error procesando solicitud de eliminación:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        });
      })
    );
  }

  // ============================================================================
  // GESTIÓN DE CONSENTIMIENTOS
  // ============================================================================

  /**
   * Obtiene el estado de todos los consentimientos de un cliente
   * @param clientId UUID del cliente
   * @returns Observable con los consentimientos
   */
  getConsentStatus(clientId: string): Observable<GDPRConsentStatusResponse> {
    return from(
      this.supabase.rpc('get_client_consent_status', {
        p_client_id: clientId,
        p_requesting_user_id: null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRConsentStatusResponse;
      }),
      catchError(error => {
        console.error('Error obteniendo estado de consentimientos:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        } as GDPRConsentStatusResponse);
      })
    );
  }

  /**
   * Actualiza el consentimiento de un cliente
   * @param clientId UUID del cliente
   * @param consentType Tipo de consentimiento (marketing o data_processing)
   * @param consentGiven true para otorgar, false para retirar
   * @param method Método de obtención del consentimiento
   * @param purpose Propósito del consentimiento
   * @returns Observable con el resultado
   */
  updateConsent(
    clientId: string,
    consentType: 'marketing' | 'data_processing',
    consentGiven: boolean,
    method: ConsentMethod = 'explicit',
    purpose?: string
  ): Observable<GDPRResponse> {
    return from(
      this.supabase.rpc('update_client_consent', {
        p_client_id: clientId,
        p_consent_type: consentType,
        p_consent_given: consentGiven,
        p_consent_method: method,
        p_purpose: purpose || `Consentimiento de ${consentType}`,
        p_requesting_user_id: null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRResponse;
      }),
      catchError(error => {
        console.error('Error actualizando consentimiento:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        });
      })
    );
  }

  // ============================================================================
  // AUDITORÍA Y ACCESO
  // ============================================================================

  /**
   * Marca un cliente como accedido (registra en audit log)
   * Llamar cuando se visualicen los datos del cliente
   * @param clientId UUID del cliente
   */
  markClientAccessed(clientId: string): Observable<void> {
    return from(
      this.supabase.rpc('mark_client_accessed', {
        p_client_id: clientId,
        p_user_id: null // Usa el usuario actual
      })
    ).pipe(
      map(() => undefined),
      catchError(error => {
        // No bloquear si falla el registro de acceso
        console.warn('Error marcando cliente como accedido:', error);
        return of(undefined);
      })
    );
  }

  /**
   * Registra un evento de auditoría manual
   * @param actionType Tipo de acción
   * @param tableName Tabla afectada
   * @param recordId ID del registro
   * @param purpose Propósito del acceso
   * @returns Observable con el resultado
   */
  logAuditEvent(
    actionType: GDPRAuditAction,
    tableName: string,
    recordId: string,
    purpose: string
  ): Observable<GDPRResponse> {
    return from(
      this.supabase.rpc('log_gdpr_audit', {
        p_action_type: actionType,
        p_table_name: tableName,
        p_record_id: recordId,
        p_purpose: purpose,
        p_requesting_user_id: null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GDPRResponse;
      }),
      catchError(error => {
        console.error('Error registrando evento de auditoría:', error);
        return of({
          success: false,
          error: error.message,
          error_detail: error.code
        });
      })
    );
  }

  // ============================================================================
  // UTILIDADES
  // ============================================================================

  /**
   * Sanitiza un nombre de archivo
   * @param filename Nombre original
   * @returns Nombre sanitizado
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);
  }

  /**
   * Verifica si GDPR está habilitado en el entorno
   * @returns true si está habilitado
   */
  isGDPREnabled(): boolean {
    return environment.gdpr?.enabled || false;
  }

  /**
   * Obtiene la configuración GDPR del entorno
   * @returns Configuración GDPR
   */
  getGDPRConfig(): GDPRConfig {
    return {
      enabled: environment.gdpr?.enabled || false,
      dpoEmail: environment.gdpr?.dpoEmail || '',
      retentionYears: environment.gdpr?.retentionYears || 7,
      autoDeleteAfterDays: environment.gdpr?.autoDeleteAfterDays || 2555
    };
  }
}

// ============================================================================
// INTERFACES Y TIPOS
// ============================================================================

export interface GDPRResponse {
  success: boolean;
  message?: string;
  error?: string;
  error_detail?: string;
}

export interface GDPRExportResponse extends GDPRResponse {
  data?: {
    personal_data: any;
    consent_information: any;
    related_data: {
      services: any[];
      tickets: any[];
      devices: any[];
    };
    gdpr_records: {
      consent_records: any[];
      access_requests: any[];
    };
  };
}

export interface GDPRAccessRequestResponse extends GDPRResponse {
  request_id?: string;
  deadline_date?: string;
}

export interface GDPRConsentStatusResponse extends GDPRResponse {
  data?: {
    client_consents: {
      marketing_consent: boolean;
      data_processing_consent: boolean;
      data_retention_until: string;
      last_consent_update: string;
    };
    consent_records: any[];
  };
}

export type GDPRRequestType = 
  | 'access'           // Art. 15 - Derecho de acceso
  | 'rectification'    // Art. 16 - Derecho de rectificación
  | 'erasure'          // Art. 17 - Derecho de supresión
  | 'portability'      // Art. 20 - Derecho de portabilidad
  | 'restriction'      // Art. 18 - Derecho de limitación
  | 'objection';       // Art. 21 - Derecho de oposición

export type ConsentMethod = 
  | 'explicit'         // Consentimiento explícito
  | 'implicit'         // Consentimiento implícito
  | 'checkbox'         // Checkbox marcado
  | 'email'            // Por email
  | 'phone'            // Por teléfono
  | 'in_person';       // En persona

export type GDPRAuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'export'
  | 'anonymize'
  | 'consent'
  | 'access_request';

export interface GDPRConfig {
  enabled: boolean;
  dpoEmail: string;
  retentionYears: number;
  autoDeleteAfterDays: number;
}
