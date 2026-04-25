/**
 * E2E Verification: GDPR Phases 2 & 3 — Portal Consent, ARCO Self-Service, Overdue Alerts
 * Date: 2026-04-06
 *
 * Covers 7 test scenarios:
 *   1. portal_get_my_consents()          → returns consent records linked by subject_id
 *   2. portal_withdraw_my_consent()      → sets withdrawn_at + gdpr_audit_log entry
 *   3. portal_submit_arco_request()      → inserts pending ARCO request
 *   4. ARCO duplicate prevention         → returns {success:false, error:'already_open'}
 *   5. portal_export_my_data()           → returns profile/consents/arco_requests/bookings + audit log
 *   6. detect_overdue_arco_requests()    → inserts gdpr_anomalies row with severity='critical'
 *   7. Overdue ARCO dedup               → second call adds 0 new anomalies (24 h window)
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SERVICE_ROLE_KEY=eyJ... \
 *   ANON_KEY=eyJ... \
 *   node scripts/e2e-gdpr-phase2-verify.mjs
 *
 * Prerequisites:
 *   Migrations 20260406000003–20260406000005 must be applied to the target project.
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.ANON_KEY ?? '';

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SERVICE_ROLE_KEY env var is required');
  process.exit(1);
}
if (!ANON_KEY) {
  console.error('ERROR: ANON_KEY env var is required');
  process.exit(1);
}

// Unique suffix to avoid collisions between runs
const TS = Date.now();
const PORTAL_CLIENT_EMAIL = `e2e-portal-client-${TS}@test.invalid`;

// ─── Admin client (bypasses RLS for setup/teardown) ───────────────────────────
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Results accumulator ─────────────────────────────────────────────────────
const results = [];
function record(scenario, expected, actual, pass, notes = '') {
  results.push({ scenario, expected, actual, pass: pass ? '✅ PASS' : '❌ FAIL', notes });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestCompany(name) {
  const { data, error } = await adminClient
    .from('companies')
    .insert({ name })
    .select('id')
    .single();
  if (error) throw new Error(`createTestCompany "${name}" failed: ${JSON.stringify(error)}`);
  return data.id;
}

/**
 * Creates a portal client:
 *   1. auth.users row (auto-creates public.users via trigger)
 *   2. clients row with email + company_id + auth_user_id
 *
 * Returns { authUserId, clientId }
 */
async function createPortalClient(companyId, email) {
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password: `Portal${TS}!Aa`,
    email_confirm: true,
  });
  if (authErr) throw new Error(`createPortalClient auth: ${JSON.stringify(authErr)}`);
  const authUserId = authData.user.id;

  const { data: clientData, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      company_id: companyId,
      name: 'E2E Portal',
      surname: 'Client',
      email,
      auth_user_id: authUserId,
    })
    .select('id')
    .single();
  if (clientErr) throw new Error(`createPortalClient clients: ${JSON.stringify(clientErr)}`);

  return { authUserId, clientId: clientData.id };
}

async function signInPortalClient(email) {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password: `Portal${TS}!Aa`,
  });
  if (error) throw new Error(`signIn ${email}: ${JSON.stringify(error)}`);
  return data.session.access_token;
}

/** Returns a Supabase client that runs PostgREST calls as the given JWT user.
 *  SECURITY DEFINER RPCs use auth.email() / auth.uid() from this JWT. */
function asUser(jwt) {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

async function insertConsent(clientId, email, companyId, consentType) {
  const { error } = await adminClient.from('gdpr_consent_records').insert({
    subject_id: clientId,
    subject_email: email,
    company_id: companyId,
    consent_type: consentType,
    consent_given: true,
    consent_method: 'e2e_test',
    purpose: `E2E Test — ${consentType}`,
  });
  if (error) throw new Error(`insertConsent (${consentType}): ${JSON.stringify(error)}`);
}

async function cleanup(companyIds, authUserIds) {
  console.log('\n⚙️  Cleaning up test data...');
  for (const cid of companyIds) {
    if (!cid) continue;
    await adminClient.from('gdpr_anomalies').delete().eq('company_id', cid);
    await adminClient.from('gdpr_access_requests').delete().eq('company_id', cid);
    await adminClient
      .from('gdpr_audit_log')
      .delete()
      .like('subject_email', `e2e-%@test.invalid`);
    await adminClient.from('gdpr_consent_records').delete().eq('company_id', cid);
    await adminClient.from('clients').delete().eq('company_id', cid);
    await adminClient.from('users').update({ company_id: null }).eq('company_id', cid);
    await adminClient.from('companies').delete().eq('id', cid);
  }
  for (const uid of authUserIds) {
    if (!uid) continue;
    try {
      await adminClient.auth.admin.deleteUser(uid);
    } catch {
      await adminClient.from('users').delete().eq('auth_user_id', uid);
    }
  }
  console.log('   ✅ Cleanup complete');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(' GDPR Phases 2 & 3 — E2E Manual Verification');
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(`  Suffix: ${TS}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const authUserIds = [];
  let companyId;
  let clientId;
  let jwt;

  try {
    // ─── Setup ──────────────────────────────────────────────────────────────
    console.log('⚙️  Creating test infrastructure...');

    companyId = await createTestCompany(`E2E GDPR P2 Company ${TS}`);
    console.log(`   Company: ${companyId}`);

    const portalClient = await createPortalClient(companyId, PORTAL_CLIENT_EMAIL);
    clientId = portalClient.clientId;
    authUserIds.push(portalClient.authUserId);
    console.log(`   Portal client auth ID: ${portalClient.authUserId}`);
    console.log(`   Portal client DB ID:   ${clientId}`);

    jwt = await signInPortalClient(PORTAL_CLIENT_EMAIL);
    console.log(`   JWT obtained. Setup done.\n`);

    const userClient = asUser(jwt);

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 1: portal_get_my_consents() returns records linked by subject_id
    // ════════════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 1: portal_get_my_consents() — lists active consents');
    console.log('─────────────────────────────────────────────────────────────────────');

    // Insert two consents linked to the client UUID
    await insertConsent(clientId, PORTAL_CLIENT_EMAIL, companyId, 'marketing');
    await insertConsent(clientId, PORTAL_CLIENT_EMAIL, companyId, 'data_processing');
    console.log('   Inserted 2 consent records (marketing, data_processing)');

    const { data: s1Data, error: s1Err } = await userClient.rpc('portal_get_my_consents');
    console.log(`   RPC result:`, JSON.stringify(s1Data)?.substring(0, 300));

    const s1IsArray = Array.isArray(s1Data);
    const s1Count = s1IsArray ? s1Data.length : 0;
    const s1HasMarketing = s1IsArray && s1Data.some((r) => r.consent_type === 'marketing');
    const s1HasDataProc = s1IsArray && s1Data.some((r) => r.consent_type === 'data_processing');
    const s1Pass = !s1Err && s1Count >= 2 && s1HasMarketing && s1HasDataProc;

    record(
      '1. portal_get_my_consents',
      'Array ≥2, has marketing + data_processing',
      `count=${s1Count}, marketing=${s1HasMarketing}, data_processing=${s1HasDataProc}, err=${s1Err?.message ?? 'none'}`,
      s1Pass,
      s1Pass ? 'Consent list returned correctly' : `FAIL: ${s1Err?.message || 'count=' + s1Count}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 2: portal_withdraw_my_consent() sets withdrawn_at + audit log
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 2: portal_withdraw_my_consent() — withdrawal + audit');
    console.log('─────────────────────────────────────────────────────────────────────');

    const { data: s2Data, error: s2Err } = await userClient.rpc('portal_withdraw_my_consent', {
      p_consent_type: 'marketing',
      p_evidence: { channel: 'e2e_test', ts: TS },
    });
    console.log(`   RPC result:`, JSON.stringify(s2Data));

    const s2Success = s2Data?.success === true && s2Data?.records_updated >= 1;

    // Verify withdrawn_at was actually set in the DB
    const { data: s2Row } = await adminClient
      .from('gdpr_consent_records')
      .select('withdrawn_at, withdrawal_method')
      .eq('subject_id', clientId)
      .eq('consent_type', 'marketing')
      .maybeSingle();
    const s2WithdrawnSet = !!s2Row?.withdrawn_at;
    const s2MethodOk = s2Row?.withdrawal_method === 'portal_self_service';
    console.log(
      `   withdrawn_at: ${s2Row?.withdrawn_at ?? 'null'}, method: ${s2Row?.withdrawal_method}`,
    );

    // Verify audit log entry
    const { data: s2Log } = await adminClient
      .from('gdpr_audit_log')
      .select('action_type, subject_email')
      .eq('action_type', 'consent_withdrawn')
      .like('subject_email', `e2e-%@test.invalid`)
      .limit(1)
      .maybeSingle();
    const s2AuditOk = !!s2Log;
    console.log(`   gdpr_audit_log row: ${s2AuditOk ? s2Log.action_type : 'NOT FOUND'}`);

    const s2Pass = !s2Err && s2Success && s2WithdrawnSet && s2MethodOk && s2AuditOk;
    record(
      '2. portal_withdraw_my_consent',
      'success=true, withdrawn_at set, audit row created',
      `success=${s2Success}, withdrawn=${s2WithdrawnSet}, method_ok=${s2MethodOk}, audit=${s2AuditOk}, err=${s2Err?.message ?? 'none'}`,
      s2Pass,
      s2Pass ? 'Withdrawal + audit log correct' : `FAIL: ${s2Err?.message || JSON.stringify(s2Data)}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 3: portal_submit_arco_request() inserts pending request
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 3: portal_submit_arco_request() — creates pending request');
    console.log('─────────────────────────────────────────────────────────────────────');

    const { data: s3Data, error: s3Err } = await userClient.rpc('portal_submit_arco_request', {
      p_request_type: 'access',
      p_details: { reason: 'E2E test scenario 3', ts: TS },
    });
    console.log(`   RPC result:`, JSON.stringify(s3Data));

    const s3Success = s3Data?.success === true && !!s3Data?.request_id;

    // Verify row in gdpr_access_requests
    const { data: s3Row } = await adminClient
      .from('gdpr_access_requests')
      .select('id, request_type, verification_status, subject_email, company_id')
      .eq('subject_email', PORTAL_CLIENT_EMAIL)
      .eq('request_type', 'access')
      .maybeSingle();
    const s3RowOk =
      s3Row?.verification_status === 'pending' && s3Row?.company_id === companyId;
    console.log(
      `   gdpr_access_requests: status=${s3Row?.verification_status}, company_match=${s3Row?.company_id === companyId}`,
    );

    const s3Pass = !s3Err && s3Success && s3RowOk;
    record(
      '3. portal_submit_arco_request',
      'success=true, request_id set, DB row status=pending',
      `success=${s3Success}, row_ok=${s3RowOk}, err=${s3Err?.message ?? 'none'}`,
      s3Pass,
      s3Pass ? 'ARCO request created correctly' : `FAIL: ${s3Err?.message || JSON.stringify(s3Data)}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 4: Duplicate open ARCO request is blocked
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 4: Duplicate ARCO request prevention');
    console.log('─────────────────────────────────────────────────────────────────────');

    const { data: s4Data, error: s4Err } = await userClient.rpc('portal_submit_arco_request', {
      p_request_type: 'access',
      p_details: { reason: 'E2E duplicate test scenario 4' },
    });
    console.log(`   RPC result:`, JSON.stringify(s4Data));

    const s4Blocked = s4Data?.success === false && s4Data?.error === 'already_open';
    const s4Pass = !s4Err && s4Blocked;
    record(
      '4. Duplicate ARCO prevention',
      'success=false, error=already_open',
      `success=${s4Data?.success}, error=${s4Data?.error}, rpc_err=${s4Err?.message ?? 'none'}`,
      s4Pass,
      s4Pass ? 'Duplicate blocked correctly' : `FAIL: ${s4Err?.message || JSON.stringify(s4Data)}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 5: portal_export_my_data() returns structured JSON + audit log
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 5: portal_export_my_data() — Art. 20 data portability');
    console.log('─────────────────────────────────────────────────────────────────────');

    const { data: s5Data, error: s5Err } = await userClient.rpc('portal_export_my_data');
    console.log(`   RPC keys:`, s5Data ? Object.keys(s5Data) : 'null');

    const s5HasProfile = !!s5Data?.profile;
    const s5HasConsents = Array.isArray(s5Data?.consents);
    const s5HasArco = Array.isArray(s5Data?.arco_requests);
    const s5HasBookings = Array.isArray(s5Data?.bookings);
    const s5HasExportedAt = !!s5Data?.exported_at;
    console.log(
      `   profile=${s5HasProfile}, consents=${s5HasConsents}, arco_requests=${s5HasArco}, bookings=${s5HasBookings}`,
    );

    // Verify audit log — export action written
    const { data: s5Log } = await adminClient
      .from('gdpr_audit_log')
      .select('action_type, user_id')
      .eq('action_type', 'export')
      .eq('table_name', 'clients')
      .limit(1)
      .maybeSingle();
    const s5AuditOk = !!s5Log;
    console.log(`   gdpr_audit_log export row: ${s5AuditOk ? 'found' : 'NOT FOUND'}`);

    const s5Pass =
      !s5Err && s5HasProfile && s5HasConsents && s5HasArco && s5HasBookings && s5HasExportedAt && s5AuditOk;
    record(
      '5. portal_export_my_data',
      'profile+consents+arco_requests+bookings keys, audit row',
      `profile=${s5HasProfile}, consents=${s5HasConsents}, arco=${s5HasArco}, bookings=${s5HasBookings}, audit=${s5AuditOk}`,
      s5Pass,
      s5Pass ? 'Art. 20 export correct' : `FAIL: ${s5Err?.message || 'missing keys or audit log'}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 6: detect_overdue_arco_requests() inserts critical anomaly
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 6: detect_overdue_arco_requests() — critical anomaly for >60d request');
    console.log('─────────────────────────────────────────────────────────────────────');

    // Insert an ARCO request backdated 70 days (severity should be 'critical')
    const { data: s6ArcoRow, error: s6InsertErr } = await adminClient
      .from('gdpr_access_requests')
      .insert({
        request_type: 'erasure',
        subject_email: PORTAL_CLIENT_EMAIL,
        subject_name: 'E2E Portal Client',
        company_id: companyId,
        requested_by: null,
        verification_status: 'pending',
      })
      .select('id')
      .single();
    if (s6InsertErr) throw new Error(`S6 ARCO insert: ${JSON.stringify(s6InsertErr)}`);

    // Backdate created_at to 70 days ago
    await adminClient
      .from('gdpr_access_requests')
      .update({ created_at: new Date(Date.now() - 70 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', s6ArcoRow.id);
    console.log(`   Backdated ARCO request ID: ${s6ArcoRow.id} (70 days ago)`);

    const anomalyCountBefore = await adminClient
      .from('gdpr_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('anomaly_type', 'arco_request_overdue');
    const countBefore = anomalyCountBefore.count ?? 0;

    // Call the detection function (SECURITY DEFINER — callable by service_role)
    const { error: s6RpcErr } = await adminClient.rpc('detect_overdue_arco_requests');
    console.log(`   detect_overdue_arco_requests error: ${s6RpcErr?.message ?? 'none'}`);

    const anomalyCountAfter = await adminClient
      .from('gdpr_anomalies')
      .select('id, severity, anomaly_type, evidence', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('anomaly_type', 'arco_request_overdue');
    const countAfter = anomalyCountAfter.count ?? 0;
    const newAnomaly = anomalyCountAfter.data?.find(
      (a) => a.evidence?.request_id === s6ArcoRow.id,
    );
    const s6SeverityOk = newAnomaly?.severity === 'critical';
    console.log(
      `   anomalies before=${countBefore}, after=${countAfter}, new anomaly severity=${newAnomaly?.severity ?? 'not found'}`,
    );

    const s6Pass = !s6RpcErr && countAfter > countBefore && s6SeverityOk;
    record(
      '6. detect_overdue_arco_requests',
      'anomaly count increases, severity=critical for 70d',
      `before=${countBefore}, after=${countAfter}, severity=${newAnomaly?.severity ?? 'N/A'}, err=${s6RpcErr?.message ?? 'none'}`,
      s6Pass,
      s6Pass ? 'Critical anomaly raised correctly' : `FAIL: ${s6RpcErr?.message || 'anomaly not created or wrong severity'}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 7: Overdue ARCO dedup — second call within 24 h adds 0 anomalies
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 7: Overdue ARCO dedup — re-running adds no anomalies');
    console.log('─────────────────────────────────────────────────────────────────────');

    const { error: s7RpcErr } = await adminClient.rpc('detect_overdue_arco_requests');
    console.log(`   detect_overdue_arco_requests error: ${s7RpcErr?.message ?? 'none'}`);

    const anomalyCountDedup = await adminClient
      .from('gdpr_anomalies')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('anomaly_type', 'arco_request_overdue');
    const countDedup = anomalyCountDedup.count ?? 0;
    const s7NoNewAnomaly = countDedup === countAfter;
    console.log(`   anomalies after re-run: ${countDedup} (expected ${countAfter})`);

    const s7Pass = !s7RpcErr && s7NoNewAnomaly;
    record(
      '7. ARCO overdue dedup',
      `count stays at ${countAfter} (no new rows within 24 h)`,
      `count=${countDedup}, rpc_err=${s7RpcErr?.message ?? 'none'}`,
      s7Pass,
      s7Pass ? 'Dedup correctly prevents duplicate anomalies' : `FAIL: count ${countDedup} ≠ expected ${countAfter}`,
    );
  } catch (err) {
    console.error('\n💥 Unexpected error:', err);
    record('SETUP/RUNTIME ERROR', 'N/A', String(err), false, 'Script aborted');
  } finally {
    await cleanup([companyId], authUserIds);
  }

  // ─── Print Results ───────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════════════════════');
  console.log(' GDPR PHASES 2 & 3 E2E VERIFICATION — RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const colW = {
    scenario: Math.max(...results.map((r) => r.scenario.length), 10),
    expected: Math.max(...results.map((r) => r.expected.length), 8),
    actual: Math.max(...results.map((r) => r.actual.length), 6),
    pass: 10,
    notes: Math.max(...results.map((r) => r.notes.length), 5),
  };

  const pad = (s, n) => String(s).padEnd(n);
  const sep = `+-${'-'.repeat(colW.scenario)}-+-${'-'.repeat(colW.expected)}-+-${'-'.repeat(colW.actual)}-+-${'-'.repeat(colW.pass)}-+-${'-'.repeat(colW.notes)}-+`;
  const hdr = `| ${pad('Scenario', colW.scenario)} | ${pad('Expected', colW.expected)} | ${pad('Actual', colW.actual)} | ${pad('Pass/Fail', colW.pass)} | ${pad('Notes', colW.notes)} |`;

  console.log(sep);
  console.log(hdr);
  console.log(sep);
  for (const r of results) {
    console.log(
      `| ${pad(r.scenario, colW.scenario)} | ${pad(r.expected, colW.expected)} | ${pad(r.actual, colW.actual)} | ${pad(r.pass, colW.pass)} | ${pad(r.notes, colW.notes)} |`,
    );
  }
  console.log(sep);

  const passed = results.filter((r) => r.pass.startsWith('✅')).length;
  const total = results.length;

  console.log(`\n  Results: ${passed}/${total} scenarios passed\n`);
  if (passed === total) {
    console.log('  ✅ PRODUCTION READY — All GDPR Phase 2 & 3 scenarios verified.');
    console.log('     Portal self-service ARCO and consent withdrawal are operational.');
  } else {
    console.log('  ❌ NOT PRODUCTION READY — Review failures above before enabling portal features.');
  }
  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
