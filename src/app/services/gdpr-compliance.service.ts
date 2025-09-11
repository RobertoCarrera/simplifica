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
}

export interface GdprConsentRecord {
  id?: string;
  subject_id?: string;
  subject_email: string;
  consent_type: 'marketing' | 'analytics' | 'data_processing' | 'third_party_sharing';
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

  // ========================================
  // CONSENT MANAGEMENT (GDPR Article 7)
  // ========================================

  /**
   * Record consent for a data subject
   */
  recordConsent(consent: GdprConsentRecord): Observable<GdprConsentRecord> {
    const companyId = this.authService.companyId();
    const currentUser = this.authService.currentUser;
    
    if (!companyId || !currentUser) {
      return throwError(() => new Error('User not authenticated or no company assigned'));
    }

    const consentData = {
      ...consent,
      company_id: companyId,
      processed_by: currentUser.id,
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
  private logGdprEvent(
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
  createConsentRequest(clientId: string | null, email: string, consentTypes: string[] = ['data_processing','marketing','analytics'], purpose?: string): Observable<{ path: string; token: string; }>
  {
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
      this.supabase.from('gdpr_access_requests').select('*', { count: 'exact' }).eq('company_id', companyId),
      this.supabase.from('gdpr_consent_records').select('*', { count: 'exact' }).eq('company_id', companyId).eq('is_active', true),
      this.supabase.from('gdpr_breach_incidents').select('*', { count: 'exact' }).eq('company_id', companyId),
      this.supabase.from('gdpr_audit_log').select('*', { count: 'exact' }).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ])).pipe(
      map(([accessRequests, consents, breaches, auditLogs]) => {
        return {
          accessRequestsCount: accessRequests.count || 0,
          activeConsentsCount: consents.count || 0,
          breachIncidentsCount: breaches.count || 0,
          auditLogsLastMonth: auditLogs.count || 0,
          pendingAccessRequests: accessRequests.data?.filter(r => r.processing_status === 'received').length || 0,
          overdueAccessRequests: accessRequests.data?.filter(r => 
            new Date(r.deadline_date) < new Date() && r.processing_status !== 'completed'
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
  // DATA VALIDATION AND SECURITY
  // ========================================

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
}
