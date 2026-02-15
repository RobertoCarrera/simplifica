import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseClientService } from './supabase-client.service';
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
  consent_method: 'form' | 'email' | 'phone' | 'in_person' | 'website';
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

    return from(
      this.supabase
        .from('gdpr_access_requests')
        .insert(requestData)
        .select()
        .single()
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
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
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
   */
  anonymizeClientData(clientId: string, reason: string = 'gdpr_erasure_request'): Observable<any> {
    const currentUser = this.authService.currentUser;

    if (!currentUser) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.rpc('gdpr_anonymize_client', {
        client_id: clientId,
        requesting_user_id: currentUser.id,
        anonymization_reason: reason
      })
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

    // specific RPC for restriction, or update metadata directly if no RPC exists yet.
    // Plan said: "Use access_restrictions JSONB field in Customer model"
    // Since we don't have a specific RPC for this in the plan, we'll likely updates the customer directly.
    // However, for audit trail, it's better to update via a specific path or log it.
    // Let's implement it by updating the 'access_restrictions' field on the customer record.

    const restrictionData = {
      blocked: true,
      blocked_at: new Date().toISOString(),
      blocked_by: currentUser.id,
      reason: reason
    };

    return from(
      this.supabase
        .from('clients')
        .update({
          access_restrictions: restrictionData,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap(() => this.logGdprEvent('restriction', 'clients', clientId, undefined, `Processing restricted: ${reason}`)),
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
      this.supabase
        .from('clients')
        .update({
          access_restrictions: null, // Clear restrictions or set blocked: false
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap(() => this.logGdprEvent('unrestriction', 'clients', clientId, undefined, `Processing restriction lifted: ${reason}`)),
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
        ip_address: 'client_ip', // Should be captured from frontend
        user_agent: navigator.userAgent,
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
      tap(() => this.logGdprEvent('consent', 'gdpr_consent_records', undefined, consent.subject_email, `Consent ${consent.consent_given ? 'granted' : 'withdrawn'} for ${consent.consent_type}`)),
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
      .select('*')
      .eq('company_id', companyId);

    if (subjectEmail) {
      query = query.eq('subject_email', subjectEmail);
    }

    return from(query.order('created_at', { ascending: false })).pipe(
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
   * Report a data breach incident
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
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      }),
      tap(() => this.logGdprEvent('breach_report', 'gdpr_breach_incidents', undefined, undefined, `Breach incident reported: ${incident.incident_reference}`)),
      catchError(error => {
        console.error('Error reporting breach incident:', error);
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
        .select('*')
        .eq('company_id', companyId)
        .order('discovered_at', { ascending: false })
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
   * Log GDPR-related events
   */
  public logGdprEvent(
    actionType: string,
    tableName: string,
    recordId?: string,
    subjectEmail?: string,
    purpose?: string,
    oldValues?: any,
    newValues?: any
  ): void {
    const currentUser = this.authService.currentUser;
    const companyId = this.authService.companyId();

    if (!currentUser) return;

    this.supabase.rpc('gdpr_log_access', {
      user_id: currentUser.id,
      company_id: companyId, // Pass company_id for RLS visibility
      action_type: actionType,
      table_name: tableName,
      record_id: recordId,
      subject_email: subjectEmail,
      purpose: purpose,
      old_values: oldValues,
      new_values: newValues
    }).then(({ error }) => {
      if (error) {
        console.error('Error logging GDPR event:', error);
      }
    });
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
      .select('*');

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

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

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

    // Aggregate multiple queries for dashboard overview
    return from(Promise.all([
      // 1. Access Requests
      this.supabase.from('gdpr_access_requests').select('*', { count: 'exact' }).eq('company_id', companyId),
      // 2. Active Consents
      this.supabase.from('gdpr_consent_records').select('*', { count: 'exact' }).eq('company_id', companyId).eq('is_active', true),
      // 3. Data Exports (Audit Log)
      this.supabase.from('gdpr_audit_log')
        .select('*', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('action_type', 'export'),
      // 4. Anonymizations (Audit Log)
      this.supabase.from('gdpr_audit_log')
        .select('*', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('action_type', 'anonymization')
    ])).pipe(
      map(([accessRequests, consents, exports, anonymizations]) => {
        return {
          accessRequests: accessRequests.count || 0,
          activeConsents: consents.count || 0,
          dataExports: exports.count || 0,
          anonymizations: anonymizations.count || 0,

          // Additional derived stats if needed
          pendingAccessRequests: accessRequests.data?.filter(r => r.processing_status === 'received').length || 0,
          overdueAccessRequests: accessRequests.data?.filter(r =>
            new Date(r.deadline_date) > new Date() && r.processing_status !== 'completed'
          ).length || 0
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
        .select('*')
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
