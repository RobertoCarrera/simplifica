/**
 * Edge Function: data-retention-policy
 *
 * Cron-triggered (runs monthly via pg_cron):
 * - Applies GDPR-compliant retention rules per company:
 *   - Clients: soft-delete (set deleted_at) clients with no activity for X years (default 5)
 *   - Bookings: archive (status = 'archived') bookings older than X years (default 3)
 *   - GDPR Consent Records: hard-delete consent records older than X years (default 10)
 *   - GDPR Access Requests: hard-delete resolved requests older than 6 years
 * - Respects per-company settings (data_retention_enabled, retention_*_years)
 * - Logs all retention actions to gdpr_audit_log with action_type = 'retention_policy'
 *
 * Security: service_role required (internal cron endpoint).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RetentionResult {
  action: string;
  records_affected: number;
  details?: string;
}

interface CompanyRetentionSettings {
  company_id: string;
  data_retention_enabled: boolean;
  retention_client_years: number;
  retention_booking_years: number;
  retention_consent_years: number;
}

function jsonSuccess(status: number, data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function logRetentionEvent(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  actionType: string,
  tableName: string,
  recordId: string | null,
  oldValues: unknown,
  newValues: unknown,
  purpose: string
) {
  const { error } = await supabase.rpc('gdpr_log_access', {
    user_id: null,
    company_id: companyId,
    action_type: actionType,
    table_name: tableName,
    record_id: recordId,
    subject_email: null,
    purpose,
    old_values: oldValues,
    new_values: newValues,
  });
  if (error) {
    console.error('[data-retention-policy] Failed to log retention event:', error);
  }
}

async function applyClientRetention(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  retentionYears: number
): Promise<number> {
  // Find clients with no bookings AND no invoices for the retention period
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);
  const cutoffStr = cutoffDate.toISOString();

  // Clients with activity (bookings or invoices) in the retention period are excluded
  const { data: inactiveClients, error } = await supabase
    .from('clients')
    .select('id, email, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .lt('created_at', cutoffStr);

  if (error) {
    console.error('[data-retention-policy] Error fetching inactive clients:', error);
    return 0;
  }

  if (!inactiveClients || inactiveClients.length === 0) {
    return 0;
  }

  // For each potentially inactive client, check if they have bookings or invoices
  let softDeleted = 0;
  for (const client of inactiveClients) {
    // Check for bookings within retention period
    const { count: bookingCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('start_time', cutoffStr);

    // Check for invoices within retention period
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('created_at', cutoffStr);

    // If no activity, soft-delete the client
    if ((bookingCount || 0) === 0 && (invoiceCount || 0) === 0) {
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('clients')
        .update({ deleted_at: now, is_active: false })
        .eq('id', client.id)
        .is('deleted_at', null);

      if (!updateError) {
        softDeleted++;
        await logRetentionEvent(
          supabase,
          companyId,
          'retention_policy',
          'clients',
          client.id,
          { is_active: true, deleted_at: null },
          { is_active: false, deleted_at: now },
          `Client soft-deleted due to inactivity (${retentionYears}+ years without bookings or invoices)`
        );
        console.log(`[data-retention-policy] Soft-deleted client ${client.id} (${client.email})`);
      }
    }
  }

  return softDeleted;
}

async function applyBookingRetention(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  retentionYears: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);
  const cutoffStr = cutoffDate.toISOString();

  // Find bookings older than cutoff that are not already archived
  const { data: oldBookings, error } = await supabase
    .from('bookings')
    .select('id, client_id, start_time')
    .eq('company_id', companyId)
    .neq('status', 'archived')
    .neq('status', 'cancelled')
    .lt('end_time', cutoffStr)
    .limit(500);

  if (error) {
    console.error('[data-retention-policy] Error fetching old bookings:', error);
    return 0;
  }

  if (!oldBookings || oldBookings.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'archived', updated_at: now })
    .eq('company_id', companyId)
    .neq('status', 'archived')
    .neq('status', 'cancelled')
    .lt('end_time', cutoffStr);

  if (updateError) {
    console.error('[data-retention-policy] Error archiving bookings:', updateError);
    return 0;
  }

  // Log each archived booking
  for (const booking of oldBookings) {
    await logRetentionEvent(
      supabase,
      companyId,
      'retention_policy',
      'bookings',
      booking.id,
      { status: booking.status },
      { status: 'archived' },
      `Booking archived due to retention policy (${retentionYears} years old)`
    );
  }

  console.log(`[data-retention-policy] Archived ${oldBookings.length} bookings for company ${companyId}`);
  return oldBookings.length;
}

async function applyConsentRetention(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  retentionYears: number
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);
  const cutoffStr = cutoffDate.toISOString();

  // Find consent records older than retention period
  // Only delete records where consent was NOT given (given consents should be kept as proof)
  // OR records where the subject has withdrawn consent AND record is old enough
  const { data: oldConsents, error } = await supabase
    .from('gdpr_consent_records')
    .select('id, subject_email, consent_given, withdrawn_at, created_at')
    .eq('company_id', companyId)
    .or(`created_at.lt.${cutoffStr},and(withdrawn_at.not.is.null,withdrawn_at.lt.${cutoffStr})`)
    .limit(500);

  if (error) {
    console.error('[data-retention-policy] Error fetching old consent records:', error);
    return 0;
  }

  if (!oldConsents || oldConsents.length === 0) {
    return 0;
  }

  // Hard-delete only records where consent was not given OR consent was withdrawn
  const toDelete = oldConsents.filter(
    (c) => !c.consent_given || c.withdrawn_at !== null
  );

  if (toDelete.length === 0) {
    return 0;
  }

  const idsToDelete = toDelete.map((c) => c.id);
  const { error: deleteError } = await supabase
    .from('gdpr_consent_records')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('[data-retention-policy] Error deleting consent records:', deleteError);
    return 0;
  }

  for (const consent of toDelete) {
    await logRetentionEvent(
      supabase,
      companyId,
      'retention_policy',
      'gdpr_consent_records',
      consent.id,
      { consent_given: consent.consent_given, withdrawn_at: consent.withdrawn_at },
      null,
      `Consent record hard-deleted due to retention policy (${retentionYears} years old, consent_given=${consent.consent_given}, withdrawn=${!!consent.withdrawn_at})`
    );
  }

  console.log(`[data-retention-policy] Hard-deleted ${toDelete.length} consent records for company ${companyId}`);
  return toDelete.length;
}

async function applyAccessRequestRetention(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<number> {
  // GDPR requests must be kept for 6 years after resolution (Art. 5 GDPR principle of storage limitation)
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 6);
  const cutoffStr = cutoffDate.toISOString();

  // Find resolved (completed/rejected) requests older than 6 years
  const { data: oldRequests, error } = await supabase
    .from('gdpr_access_requests')
    .select('id, subject_email, processing_status, completed_at')
    .eq('company_id', companyId)
    .in('processing_status', ['completed', 'rejected'])
    .lt('completed_at', cutoffStr)
    .limit(500);

  if (error) {
    console.error('[data-retention-policy] Error fetching old access requests:', error);
    return 0;
  }

  if (!oldRequests || oldRequests.length === 0) {
    return 0;
  }

  const idsToDelete = oldRequests.map((r) => r.id);
  const { error: deleteError } = await supabase
    .from('gdpr_access_requests')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('[data-retention-policy] Error deleting access requests:', deleteError);
    return 0;
  }

  for (const request of oldRequests) {
    await logRetentionEvent(
      supabase,
      companyId,
      'retention_policy',
      'gdpr_access_requests',
      request.id,
      { processing_status: request.processing_status, completed_at: request.completed_at },
      null,
      'GDPR access request hard-deleted due to retention policy (6 years after resolution)'
    );
  }

  console.log(`[data-retention-policy] Hard-deleted ${oldRequests.length} access requests for company ${companyId}`);
  return oldRequests.length;
}

serve(async (req: Request) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed. Use POST.');
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // Internal auth: require service role key as Bearer token
  const authHeader = req.headers.get('Authorization') || '';
  const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!token || token !== serviceRoleKey) {
    return jsonError(401, 'Unauthorized: valid service role key required');
  }

  // Optional: allow filtering by company_id from request body
  let targetCompanyId: string | null = null;
  try {
    const body = await req.json();
    targetCompanyId = body.company_id || null;
  } catch {
    // No body or invalid JSON - run for all companies
  }

  try {
    const supabase = createClient(SUPABASE_URL, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const now = new Date().toISOString();
    const results: RetentionResult[] = [];

    // ── 1. Get companies with retention enabled ───────────────────────────────
    let companiesQuery = supabase
      .from('company_settings')
      .select('company_id, data_retention_enabled, retention_client_years, retention_booking_years, retention_consent_years')
      .eq('data_retention_enabled', true);

    if (targetCompanyId) {
      companiesQuery = companiesQuery.eq('company_id', targetCompanyId);
    }

    const { data: companies, error: companiesError } = await companiesQuery;

    if (companiesError) {
      console.error('[data-retention-policy] Error fetching companies:', companiesError);
      return jsonError(500, 'Error fetching companies: ' + companiesError.message);
    }

    if (!companies || companies.length === 0) {
      return jsonSuccess(200, { companies_processed: 0, results: [], message: 'No companies with retention enabled' });
    }

    console.log(`[data-retention-policy] Processing ${companies.length} companies`);

    // ── 2. Process each company ────────────────────────────────────────────────
    for (const company of companies) {
      const settings = company as unknown as CompanyRetentionSettings;
      const companyId = settings.company_id;
      const clientYears = settings.retention_client_years ?? 5;
      const bookingYears = settings.retention_booking_years ?? 3;
      const consentYears = settings.retention_consent_years ?? 10;

      // Skip if data_retention_enabled is explicitly false
      if (settings.data_retention_enabled === false) {
        console.log(`[data-retention-policy] Skipping company ${companyId} - retention disabled`);
        continue;
      }

      console.log(`[data-retention-policy] Processing company ${companyId} (client=${clientYears}y, booking=${bookingYears}y, consent=${consentYears}y)`);

      // Apply retention rules
      const clientsDeleted = await applyClientRetention(supabase, companyId, clientYears);
      if (clientsDeleted > 0) {
        results.push({
          action: 'clients_soft_deleted',
          records_affected: clientsDeleted,
          details: `Soft-deleted clients inactive for ${clientYears}+ years`,
        });
      }

      const bookingsArchived = await applyBookingRetention(supabase, companyId, bookingYears);
      if (bookingsArchived > 0) {
        results.push({
          action: 'bookings_archived',
          records_affected: bookingsArchived,
          details: `Archived bookings older than ${bookingYears} years`,
        });
      }

      const consentsDeleted = await applyConsentRetention(supabase, companyId, consentYears);
      if (consentsDeleted > 0) {
        results.push({
          action: 'consent_records_deleted',
          records_affected: consentsDeleted,
          details: `Hard-deleted consent records older than ${consentYears} years`,
        });
      }

      const requestsDeleted = await applyAccessRequestRetention(supabase, companyId);
      if (requestsDeleted > 0) {
        results.push({
          action: 'access_requests_deleted',
          records_affected: requestsDeleted,
          details: 'Hard-deleted GDPR access requests resolved 6+ years ago',
        });
      }

      // Update last_retention_run in company_settings
      await supabase
        .from('company_settings')
        .update({ last_retention_run: now })
        .eq('company_id', companyId);

      // Log overall company retention run
      await logRetentionEvent(
        supabase,
        companyId,
        'retention_policy_run',
        'company_settings',
        null,
        null,
        { last_retention_run: now },
        `Data retention policy executed. Clients: ${clientsDeleted}, Bookings: ${bookingsArchived}, Consents: ${consentsDeleted}, Requests: ${requestsDeleted}`
      );
    }

    const totalRecords = results.reduce((sum, r) => sum + r.records_affected, 0);

    return jsonSuccess(200, {
      companies_processed: companies.length,
      results,
      total_records_affected: totalRecords,
      executed_at: now,
    });
  } catch (err: any) {
    console.error('[data-retention-policy] Unhandled error:', err?.message, err?.stack);
    return jsonError(500, 'Internal server error: ' + err?.message);
  }
});
