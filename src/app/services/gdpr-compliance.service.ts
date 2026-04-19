import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
import type { Database } from './supabase-db.types';
import { AuthService } from './auth.service';

export interface GdprAccessRequest {
  id?: string;
  request_type: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection';
  subject_email: string;
  subject_name?: string;
  subject_identifier?: string;
  request_details?: any;
  verification_method?: string;
  verification_status?: 'pending' | 'verified' | 'rejected';
  processing_status?: 'received' | 'in_progress' | 'completed' | 'rejected';
  deadline_date?: string;
  created_at?: string;
  response_data?: any;
  completed_at?: string;
  // Updated for verification details
}

export interface GdprConsentRecord {
  id?: string;
  subject_id?: string;
  subject_email: string;
  consent_type: 'marketing' | 'analytics' | 'data_processing' | 'third_party_sharing' | 'health_data' | 'privacy_policy';
  purpose: string;
  consent_given: boolean;
  consent_method: 'form' | 'email' | 'phone' | 'in_person' | 'website' | 'physical_document' | 'portal_digital';
  consent_evidence?: any;
  legal_basis?: string;
  data_processing_purposes?: string[];
  retention_period?: string;
  created_at?: string;
  withdrawn_at?: string;
}

export interface GdprBreachIncident {
  id?: string;
  incident_reference: string;
  breach_type: ('confidentiality' | 'integrity' | 'availability')[];
  discovered_at: string;
  affected_data_categories?: string[];
  estimated_affected_subjects?: number;
  likely_consequences?: string;
  mitigation_measures?: string;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
  resolution_status?: 'open' | 'investigating' | 'contained' | 'resolved';
  aepd_notified_at?: string | null;
  affected_subjects_notified?: boolean;
}

export interface GdprAuditEntry {
  id?: string;
  action_type: string;
  table_name: string;
  record_id?: string;
  subject_email?: string;
  purpose?: string;
  old_values?: any;
  new_values?: any;
  created_at?: string;
  user_id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GdprComplianceService {
  private supabase: SupabaseClient;
  private authService = inject(AuthService);

  constructor(private sbClient: SupabaseClientService) {
    this.supabase = this.sbClient.instance;
  }

  // ========================================
  // DATA SUBJECT ACCESS REQUESTS (GDPR Article 15-22)
  // ========================================

  /**
   * Create a new GDPR access request
   */
  createAccessRequest(request: GdprAccessRequest): Observable<GdprAccessRequest> {
    const companyId = this.authService.companyId();
    const currentUser = this.authService.currentUser;

    if (!companyId || !currentUser) {
      return throwError(() => new Error('User not authenticated or no company assigned'));
    }

    // Fix #15: Verify that the subject_email belongs to a client of this company
    // before creating a GDPR request. This prevents creating requests for arbitrary emails.
    const verifySubject$ = request.subject_email
      ? from(
          this.supabase
            .from('clients')
            .select('id')
            .eq('company_id', companyId)
            .ilike('email', request.subject_email.trim())
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle()
        ).pipe(
          map(({ data }) => {
            if (!data) throw new Error('El email no corresponde a ningún cliente de esta empresa');
            return true;
          })
        )
      : of(true);

    // Calculate deadline (30 days from request, or 90 days for complex requests)
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + (request.request_type === 'portability' ? 90 : 30));

    const requestData = {
      ...request,
      company_id: companyId,
      requested_by: currentUser.id,
      deadline_date: deadline.toISOString(),
      verification_status: 'pending',
      processing_status: 'received'
    };

    return verifySubject$.pipe(
      switchMap(() =>
        from(
          this.supabase
            .from('gdpr_access_requests')
            .insert(requestData)
            .select()
            .single()
        )
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap(() => this.logGdprEvent('access_request', 'gdpr_access_requests', undefined, request.subject_email, 'New GDPR access request created')),
      catchError(error => {
        console.error('Error creating GDPR access request:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get all access requests for the company
   */
  getAccessRequests(): Observable<GdprAccessRequest[]> {
    const companyId = this.authService.companyId();

    if (!companyId) {
      return throwError(() => new Error('No company assigned'));
    }

    return from(
      this.supabase
        .from('gdpr_access_requests')
        .select('id, request_type, subject_email, subject_name, subject_identifier, request_details, verification_method, verification_status, processing_status, deadline_date, created_at, response_data, completed_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching GDPR access requests:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get requests that are past their deadline and still not completed.
   * Returns requests with urgency levels: 'warning' (within 5 days), 'overdue' (past deadline).
   */
  getOverdueRequests(): Observable<(GdprAccessRequest & { urgency: 'warning' | 'overdue' })[]> {
    const companyId = this.authService.companyId();
    if (!companyId) return of([]);

    const now = new Date();
    const warningThreshold = new Date();
    warningThreshold.setDate(now.getDate() + 5);

    return from(
      this.supabase
        .from('gdpr_access_requests')
        .select('id, request_type, subject_email, subject_name, subject_identifier, request_details, verification_method, verification_status, processing_status, deadline_date, created_at, response_data, completed_at')
        .eq('company_id', companyId)
        .not('processing_status', 'eq', 'completed')
        .not('verification_status', 'eq', 'rejected')
        .not('deadline_date', 'is', null)
        .lte('deadline_date', warningThreshold.toISOString())
        .order('deadline_date', { ascending: true })
        .limit(200)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        // Urgency classification must stay in JS — PostgREST cannot return computed fields
        return (data || []).map(r => {
          const deadline = new Date(r.deadline_date);
          if (deadline <= now) {
            return { ...r, urgency: 'overdue' as const };
          }
          return { ...r, urgency: 'warning' as const };
        });
      }),
      catchError(error => {
        console.error('Error checking GDPR deadlines:', error);
        return of([]);
      })
    );
  }

  /**
   * Update access request status
   */
  updateAccessRequestStatus(
    requestId: string,
    status: 'verified' | 'rejected' | 'in_progress' | 'completed',
    responseData?: any
  ): Observable<GdprAccessRequest> {
    const updates: any = {};

    if (status === 'verified' || status === 'rejected') {
      updates.verification_status = status;
    } else {
      updates.processing_status = status;
    }

    if (responseData) {
      updates.response_data = responseData;
    }

    if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    return from(
      this.supabase
        .from('gdpr_access_requests')
        .update(updates)
        .eq('id', requestId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap(() => this.logGdprEvent('update', 'gdpr_access_requests', requestId, undefined, `Access request status updated to ${status}`)),
      catchError(error => {
        console.error('Error updating access request:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Export all data for a specific client (GDPR Article 20 - Data Portability)
   */
  exportClientData(clientEmail: string): Observable<any> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.rpc('gdpr_export_client_data', {
        client_email: clientEmail,
        requesting_user_id: currentUser.id
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      catchError(error => {
        console.error('Error exporting client data:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Download client data as JSON file
   */
  downloadClientData(clientEmail: string, clientName: string): Observable<boolean> {
    // We need to fetch the email first or change export logic. 
    // The old service used 'rpc export_client_gdpr_data' with p_client_id. 
    // The NEW service uses 'rpc gdpr_export_client_data' with client_email.
    // Let's assume we can fetch the email or use the new RPC if p_client_id is supported.
    // Checking the Code View of GdprComplianceService... it uses client_email.
    // I should probably fetch the client email if not provided, OR try to use the clientId if the RPC supports it.
    // To match the Component's expectation (which passes clientId), I will adapt.

    // BUT wait, GdprComplianceService.exportClientData takes `clientEmail`.
    // The component `ClientGdprPanelComponent` has `clientEmail` as @Input.
    // So I can just call exportClientData with this.clientEmail.

    // Let's update `downloadClientData` to take `clientEmail` instead of (or in addition to) clientId? 
    // The legacy component passes (clientId, clientName).
    // I will update the COMPONENT to pass email later.
    // For now, let's add `downloadClientData(clientEmail: string, clientName: string)` here.

    return this.exportClientData(clientEmail).pipe(
      tap(() => {
        // Fire-and-forget: log data access without blocking the observable
        // recordId not available here (only clientEmail), so pass null
        this.logDataAccess('clients', null, clientEmail, 'Client data export (GDPR portability)').catch(err => {
          console.error('Error logging data access:', err);
        });
      }),
      map(data => {
        if (!data) return false;

        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const url = window.URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gdpr-export-${this.sanitizeFilename(clientName)}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        window.URL.revokeObjectURL(url);
        return true;
      }),
      catchError(error => {
        console.error('Error downloading data:', error);
        return throwError(() => error);
      })
    );
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);
  }

  /**
   * Anonymize client data (GDPR Article 17 - Right to Erasure)
   * Fix #14: Audit log is awaited BEFORE the operation — if logging fails the
   * operation is still attempted, but a warning is raised.
   */
  anonymizeClientData(clientId: string, reason: string = 'gdpr_erasure_request'): Observable<any> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.logGdprEvent('ANONYMIZE_CLIENT', 'clients', clientId, undefined,
        `Anonymization requested: ${reason}`
      ).then(() =>
        this.supabase.rpc('gdpr_anonymize_client', {
          client_id: clientId,
          requesting_user_id: currentUser.id,
          anonymization_reason: reason
        })
      )
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      catchError(error => {
        console.error('Error anonymizing client data:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Restrict processing for a client (GDPR Article 18 - Right to Restriction)
   */
  restrictProcessing(clientId: string, reason: string): Observable<any> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.rpc('gdpr_restrict_processing', {
        p_client_id: clientId,
        p_reason: reason
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      catchError(error => {
        console.error('Error restricting processing:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Unrestrict/Unblock processing for a client
   */
  unrestrictProcessing(clientId: string, reason: string = 'admin_unlock'): Observable<any> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.rpc('gdpr_lift_processing_restriction', {
        p_client_id: clientId,
        p_reason: reason
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      catchError(error => {
        console.error('Error unrestricting processing:', error);
        return throwError(() => error);
      })
    );
  }

  // ========================================
  // CONSENT MANAGEMENT (GDPR Article 7)
  // ========================================

  /**
   * Record consent for a data subject
   */
  recordConsent(consent: GdprConsentRecord, overrides?: { companyId?: string, userId?: string }): Observable<GdprConsentRecord> {
    const companyId = overrides?.companyId || this.authService.companyId();
    const currentUserId = overrides?.userId || this.authService.currentUser?.id;

    if (!companyId || !currentUserId) {
      return throwError(() => new Error('User not authenticated or no company assigned'));
    }

    const consentData = {
      ...consent,
      company_id: companyId,
      processed_by: currentUserId,
      consent_evidence: {
        ...consent.consent_evidence,
        ip_address: 'captured_server_side',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        screen_resolution: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown',
        timestamp: new Date().toISOString()
      }
    };

    return from(
      this.supabase
        .from('gdpr_consent_records')
        .insert(consentData)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap((data) => this.logGdprEvent('consent', 'gdpr_consent_records', data?.id, consent.subject_email, `Consent ${consent.consent_given ? 'granted' : 'withdrawn'} for ${consent.consent_type}`, undefined, undefined, { companyId, userId: currentUserId })),
      catchError(error => {
        console.error('Error recording consent:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Withdraw consent for a data subject
   */
  withdrawConsent(consentId: string, withdrawalMethod: string, withdrawalEvidence?: any): Observable<GdprConsentRecord> {
    const withdrawalData = {
      withdrawn_at: new Date().toISOString(),
      withdrawal_method: withdrawalMethod,
      withdrawal_evidence: {
        ...withdrawalEvidence,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent
      }
    };

    return from(
      this.supabase
        .from('gdpr_consent_records')
        .update(withdrawalData)
        .eq('id', consentId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap((data) => this.logGdprEvent('consent', 'gdpr_consent_records', consentId, data.subject_email, 'Consent withdrawn')),
      catchError(error => {
        console.error('Error withdrawing consent:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get consent records for a specific email
   */
  getConsentRecords(subjectEmail?: string): Observable<GdprConsentRecord[]> {
    const companyId = this.authService.companyId();

    if (!companyId) {
      return throwError(() => new Error('No company assigned'));
    }

    let query = this.supabase
      .from('gdpr_consent_records')
      .select('id, subject_id, subject_email, consent_type, purpose, consent_given, consent_method, consent_evidence, legal_basis, data_processing_purposes, retention_period, created_at, withdrawn_at')
      .eq('company_id', companyId);

    if (subjectEmail) {
      query = query.eq('subject_email', subjectEmail);
    }

    return from(query.order('created_at', { ascending: false }).limit(500)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching consent records:', error);
        return throwError(() => error);
      })
    );
  }

  // ========================================
  // BREACH INCIDENT MANAGEMENT (GDPR Article 33-34)
  // ========================================

  /**
   * Report a data breach incident (GDPR Article 33).
   * For high/critical severity, triggers AEPD notification workflow via notify-breach-aepd Edge Function.
   */
  reportBreachIncident(incident: GdprBreachIncident): Observable<GdprBreachIncident> {
    const companyId = this.authService.companyId();
    const currentUser = this.authService.currentUser;

    if (!companyId || !currentUser) {
      return throwError(() => new Error('User not authenticated or no company assigned'));
    }

    const incidentData = {
      ...incident,
      company_id: companyId,
      reported_by: currentUser.id,
      reported_at: new Date().toISOString(),
      incident_details: {
        ...incident,
        reported_by_user: currentUser.id,
        reported_from_ip: 'client_ip' // Should be captured
      }
    };

    return from(
      this.supabase
        .from('gdpr_breach_incidents')
        .insert(incidentData)
        .select()
        .single()
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) throw error;

        // Trigger AEPD notification workflow for high/critical severity
        const severity = data.severity_level as string;
        if (severity === 'high' || severity === 'critical') {
          this.triggerAepdNotification(data.id as string).catch(err => {
            console.error('[GdprComplianceService] AEPD notification trigger failed:', err);
          });
        }

        return of(data);
      }),
      tap((incidentData: any) =>
        this.logGdprEvent('breach_report', 'gdpr_breach_incidents', incidentData?.id, undefined, `Breach incident reported: ${incident.incident_reference}`)
      ),
      catchError(error => {
        console.error('Error reporting breach incident:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Trigger AEPD notification Edge Function for high/critical breach incidents.
   * This creates an in-app notification reminding the company owner to notify AEPD within 72h.
   * NOTE: External notification via sede.aepd.gob.es must be done manually.
   */
  private async triggerAepdNotification(incidentId: string): Promise<void> {
    try {
      const { error } = await this.supabase.functions.invoke('notify-breach-aepd', {
        body: { incidentId }
      });
      if (error) {
        console.error('[GdprComplianceService] notify-breach-aepd error:', error);
      }
    } catch (err) {
      console.error('[GdprComplianceService] notify-breach-aepd exception:', err);
    }
  }

  /**
   * Get breach incidents for a specific company (used by Edge Functions).
   */
  getBreachIncidentsForCompany(companyId: string): Observable<GdprBreachIncident[]> {
    return from(
      this.supabase
        .from('gdpr_breach_incidents')
        .select('id, incident_reference, breach_type, discovered_at, affected_data_categories, estimated_affected_subjects, likely_consequences, mitigation_measures, severity_level, resolution_status, aepd_notified_at, affected_subjects_notified')
        .eq('company_id', companyId)
        .order('discovered_at', { ascending: false })
        .limit(500)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching breach incidents for company:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get breach incidents for the company
   */
  getBreachIncidents(): Observable<GdprBreachIncident[]> {
    const companyId = this.authService.companyId();

    if (!companyId) {
      return throwError(() => new Error('No company assigned'));
    }

    return from(
      this.supabase
        .from('gdpr_breach_incidents')
        .select('id, incident_reference, breach_type, discovered_at, affected_data_categories, estimated_affected_subjects, likely_consequences, mitigation_measures, severity_level, resolution_status, aepd_notified_at, affected_subjects_notified')
        .eq('company_id', companyId)
        .order('discovered_at', { ascending: false })
        .limit(500)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching breach incidents:', error);
        return throwError(() => error);
      })
    );
  }

  // ========================================
  // AUDIT AND MONITORING
  // ========================================

  /**
   * Log GDPR-related events.
   * Fix #14: Now returns Promise<void> so callers can await it for critical operations.
   * For sensitive ops (anonymize, export) the caller should await this before proceeding.
   */
  public async logGdprEvent(
    actionType: string,
    tableName: string,
    recordId?: string,
    subjectEmail?: string,
    purpose?: string,
    oldValues?: any,
    newValues?: any,
    overrides?: { companyId?: string, userId?: string }
  ): Promise<void> {
    const userId = overrides?.userId || this.authService.currentUser?.id;
    const companyId = overrides?.companyId || this.authService.companyId();

    if (!userId) return;

    const { error } = await this.supabase.rpc('gdpr_log_access', {
      user_id: userId || null,
      company_id: companyId || null,
      action_type: actionType,
      table_name: tableName,
      record_id: recordId || null,
      subject_email: subjectEmail,
      purpose: purpose,
      old_values: oldValues,
      new_values: newValues
    });
    if (error) {
      console.error('Error logging GDPR event:', error);
    }
  }

  /**
   * Log a data access event (who accessed which client's data and when).
   * Used for GDPR Article 5(1)(e) - accountability principle.
   * Logs ONLY to gdpr_audit_log with action_type = 'data_access'.
   *
   * @param tableName  - The table being accessed (e.g. 'clients', 'bookings')
   * @param recordId   - The ID of the record being accessed
   * @param subjectEmail - The email of the client whose data was accessed (optional)
   * @param purpose    - Why the data was accessed (e.g. 'Client detail view', 'Data export')
   */
  public async logDataAccess(
    tableName: string,
    recordId: string | null,
    subjectEmail?: string,
    purpose?: string
  ): Promise<void> {
    const userId = this.authService.currentUser?.id;
    const companyId = this.authService.companyId();

    if (!userId) return;

    const { error } = await this.supabase.rpc('gdpr_log_access', {
      user_id: userId,
      company_id: companyId || null,
      action_type: 'data_access',
      table_name: tableName,
      record_id: recordId || null,
      subject_email: subjectEmail || null,
      purpose: purpose || 'Data access',
      old_values: null,
      new_values: null
    });

    if (error) {
      console.error('Error logging data access:', error);
    }
  }

  /**
   * Get access history for a specific client.
   * Returns who accessed the client's data, when, and what action was performed.
   */
  getClientAccessHistory(clientId: string): Observable<{
    user_id: string;
    user_name: string;
    accessed_at: string;
    table_name: string;
    action_type: string;
    purpose: string;
    record_id: string;
  }[]> {
    return from(
      this.supabase.rpc('get_client_access_history', { p_client_id: clientId })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Error fetching client access history:', error);
          return [];
        }
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching client access history:', error);
        return of([]);
      })
    );
  }

  // ========================================
  // CONSENT PORTAL HELPERS
  // ========================================

  /**
   * Create a tokenized consent request for a client and return a shareable URL path
   */
  createConsentRequest(clientId: string | null, email: string, consentTypes: string[] = ['data_processing', 'marketing', 'analytics'], purpose?: string): Observable<{ path: string; token: string; }> {
    const sb = this.supabase;
    return from(sb.rpc('gdpr_create_consent_request', {
      p_client_id: clientId,
      p_subject_email: email,
      p_consent_types: consentTypes,
      p_purpose: purpose || 'Consent management'
    })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to create consent request');
        return { path: data.path as string, token: data.token as string };
      })
    );
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filters?: {
    tableName?: string;
    subjectEmail?: string;
    actionType?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Observable<GdprAuditEntry[]> {
    let query = this.supabase
      .from('gdpr_audit_log')
      .select('id, action_type, table_name, record_id, subject_email, purpose, old_values, new_values, created_at, user_id');

    if (filters?.tableName) {
      query = query.eq('table_name', filters.tableName);
    }
    if (filters?.subjectEmail) {
      query = query.eq('subject_email', filters.subjectEmail);
    }
    if (filters?.actionType) {
      query = query.eq('action_type', filters.actionType);
    }
    if (filters?.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }
    if (filters?.toDate) {
      query = query.lte('created_at', filters.toDate);
    }

    query = query.order('created_at', { ascending: false });

    query = query.limit(filters?.limit ?? 500);

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(error => {
        console.error('Error fetching audit log:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get GDPR compliance dashboard data
   */
  getComplianceDashboard(): Observable<any> {
    const companyId = this.authService.companyId();

    if (!companyId) {
      return throwError(() => new Error('No company assigned'));
    }

    const now = new Date().toISOString();

    // All queries use head:true (HTTP HEAD) — returns only count, zero rows transferred
    return from(Promise.all([
      // 1. Total Access Requests (count only)
      this.supabase.from('gdpr_access_requests')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId),
      // 2. Active Consents (consent_given = true AND not withdrawn)
      this.supabase.from('gdpr_consent_records')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('consent_given', true)
        .is('withdrawn_at', null),
      // 3. Revoked Consents (consent_given = false OR withdrawn)
      this.supabase.from('gdpr_consent_records')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .or('consent_given.eq.false,withdrawn_at.not.is.null'),
      // 4. Data Exports (count only)
      this.supabase.from('gdpr_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('action_type', 'export'),
      // 5. Anonymizations (count only)
      this.supabase.from('gdpr_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('action_type', 'anonymization'),
      // 6. Pending Access Requests (count only)
      this.supabase.from('gdpr_access_requests')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('processing_status', 'received'),
      // 7. Overdue requests (deadline in the past AND not completed)
      this.supabase.from('gdpr_access_requests')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .lt('deadline_date', now)
        .not('processing_status', 'eq', 'completed'),
      // 8. Open breach incidents (resolution_status = 'open' or 'investigating')
      this.supabase.from('gdpr_breach_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('resolution_status', ['open', 'investigating'])
    ])).pipe(
      map(([accessRequests, activeConsents, revokedConsents, exports, anonymizations, pendingRequests, overdueRequests, openBreaches]) => {
        return {
          accessRequests: accessRequests.count || 0,
          activeConsents: activeConsents.count || 0,
          revokedConsents: revokedConsents.count || 0,
          dataExports: exports.count || 0,
          anonymizations: anonymizations.count || 0,
          pendingAccessRequests: pendingRequests.count || 0,
          overdueAccessRequests: overdueRequests.count || 0,
          openBreaches: openBreaches.count || 0
        };
      }),
      catchError(error => {
        console.error('Error fetching compliance dashboard:', error);
        return throwError(() => error);
      })
    );
  }

  // ========================================
  // CONSENT INVITATIONS AND STATUS (NEW GDPR FLOW)
  // ========================================

  /**
   * Get current GDPR status from clients table
   */
  getClientGdprStatus(clientId: string): Observable<any> {
    const companyId = this.authService.companyId();
    if (!companyId) return throwError(() => new Error('No company assigned'));

    return from(
      this.supabase
        .from('clients')
        .select('id, consent_status, marketing_consent, invitation_status, invitation_sent_at, consent_date')
        .eq('id', clientId)
        .eq('company_id', companyId) // Security check
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || null;
      }),
      catchError(error => {
        console.error('Error fetching client GDPR status:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Send consent invitation email via Edge Function
   */
  sendConsentInvite(clientId: string): Observable<any> {
    return from(
      this.supabase.functions.invoke('send-client-consent-invite', {
        body: { clientId }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data; // { success: true, message: ... }
      }),
      tap(() => {
        // Log the action? The Edge Function updates DB, which triggers audit log if configured.
        // We can also log explicit action from frontend if needed, but backend is safer.
      }),
      catchError(error => {
        console.error('Error sending consent invite:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Validate if user has sufficient permissions for GDPR operations
   */
  validateGdprPermissions(operation: string): Observable<boolean> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase
        .from('users')
        .select('is_dpo, data_access_level')
        .eq('auth_user_id', currentUser.id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        // DPO can perform all operations
        if (data.is_dpo) return true;

        // Check access level for specific operations
        const requiredLevel = this.getRequiredAccessLevel(operation);
        return this.hasAccessLevel(data.data_access_level, requiredLevel);
      }),
      catchError(error => {
        console.error('Error validating GDPR permissions:', error);
        return throwError(() => error);
      })
    );
  }

  private getRequiredAccessLevel(operation: string): string {
    const operationLevels: { [key: string]: string } = {
      'access_request': 'standard',
      'data_export': 'elevated',
      'data_anonymization': 'elevated',
      'breach_management': 'elevated',
      'audit_log_access': 'admin',
      'consent_management': 'standard'
    };
    return operationLevels[operation] || 'admin';
  }

  private hasAccessLevel(userLevel: string, requiredLevel: string): boolean {
    const levels = ['minimal', 'standard', 'elevated', 'admin'];
    const userIndex = levels.indexOf(userLevel);
    const requiredIndex = levels.indexOf(requiredLevel);
    return userIndex >= requiredIndex;
  }

  /**
   * Fetch GDPR Audit Logs from the database
   */
  getAuditLogs(limit: number = 50): Observable<GdprAuditEntry[]> {
    return from(
      this.supabase
        .from('gdpr_audit_log')
        .select('id, action_type, table_name, record_id, subject_email, purpose, old_values, new_values, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GdprAuditEntry[];
      })
    );
  }
}
