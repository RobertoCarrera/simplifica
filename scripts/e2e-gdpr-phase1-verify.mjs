/**
 * E2E Verification: GDPR Phase 1 — Consent Gate & Encryption Hooks
 * Date: 2026-03-24
 *
 * Runs 5 test scenarios sequentially:
 *   1. Non-health client → DNI encrypted, no consent required
 *   2. Health client WITHOUT historialClinico module → DNI encrypted, no consent error
 *   3. Health client WITH module but NO consent → 422 blocked
 *   4. Health client WITH module AND consent → created successfully
 *   5. Cross-tenant RLS isolation → SELECT + UPDATE blocked
 *
 * Usage:
 *   node scripts/e2e-gdpr-phase1-verify.mjs
 */

import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────
// Set these via environment variables — NEVER hardcode secrets in source code
// Usage: SUPABASE_URL=... SERVICE_ROLE_KEY=... ANON_KEY=... node scripts/e2e-gdpr-phase1-verify.mjs
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.ANON_KEY ?? '';
const EDGE_FN_URL = `${SUPABASE_URL}/functions/v1/upsert-client`;

// Unique suffix to avoid collisions
const TS = Date.now();
// User accounts (auth + public.users) — these are the logged-in employees
const USER1_EMAIL = `e2e-user1-${TS}@test.invalid`;
const USER3_EMAIL = `e2e-user3-${TS}@test.invalid`;
const EMAIL_CROSS = `e2e-cross-${TS}@test.invalid`;

// Client records (the people being registered in the CRM)
const EMAIL_S1 = `e2e-client1-${TS}@test.invalid`;
const EMAIL_S2 = `e2e-client2-${TS}@test.invalid`;
const EMAIL_S3 = `e2e-client3-${TS}@test.invalid`;

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

async function createTestUser(companyId, email) {
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password: `Test${TS}!Aa`,
    email_confirm: true,
  });
  if (authErr) throw new Error(`createUser auth: ${JSON.stringify(authErr)}`);
  const authUserId = authData.user.id;

  // The DB has a trigger (on_auth_user_created) that auto-creates a public.users row
  // when an auth user is created. We UPDATE that row instead of INSERTing.
  const { data: userData, error: userErr } = await adminClient
    .from('users')
    .update({ company_id: companyId, name: `E2E ${email}` })
    .eq('auth_user_id', authUserId)
    .select('id')
    .single();
  if (userErr) throw new Error(`createUser public.users update: ${JSON.stringify(userErr)}`);

  return { authUserId, internalUserId: userData.id };
}

async function signInUser(email) {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password: `Test${TS}!Aa`,
  });
  if (error) throw new Error(`signIn ${email}: ${JSON.stringify(error)}`);
  return data.session.access_token;
}

async function callEdgeFn(jwt, body) {
  // No Origin header → server-to-server call (isOriginAllowed returns true for !origin)
  const resp = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      // Intentionally NO Origin header — simulates server call, bypasses CORS check
      // The Edge Function's isOriginAllowed() returns true when origin is falsy
    },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await resp.json();
  } catch {
    json = {};
  }
  return { status: resp.status, body: json };
}

async function getClientByEmail(email, companyId) {
  const { data } = await adminClient
    .from('clients')
    .select('id,dni,dni_encrypted,pii_key_version,company_id,metadata')
    .eq('email', email)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

async function activateHistorialClinicoModule(companyId) {
  // Upsert to avoid unique constraint issues
  const { error } = await adminClient
    .from('company_modules')
    .upsert(
      { company_id: companyId, module_key: 'historialClinico', status: 'active' },
      { onConflict: 'company_id,module_key' },
    );
  if (error) {
    // Try plain insert if upsert fails
    const { error: e2 } = await adminClient.from('company_modules').insert({
      company_id: companyId,
      module_key: 'historialClinico',
      status: 'active',
    });
    if (e2) throw new Error(`activateModule: ${JSON.stringify(e2)}`);
  }
}

async function grantHealthConsent(email, companyId) {
  const { error } = await adminClient.from('gdpr_consent_records').insert({
    subject_email: email,
    company_id: companyId,
    consent_type: 'health_data',
    consent_given: true,
    consent_method: 'form',
    purpose: 'E2E Test — Art. 9 GDPR health data consent',
    withdrawn_at: null,
    // is_active is a generated column — omit it
  });
  if (error) throw new Error(`grantConsent: ${JSON.stringify(error)}`);
}

async function cleanup(companyIds, authUserIds) {
  console.log('\n⚙️  Cleaning up test data...');
  for (const cid of companyIds) {
    if (!cid) continue;
    await adminClient.from('clients').delete().eq('company_id', cid);
    await adminClient.from('gdpr_consent_records').delete().eq('company_id', cid);
    await adminClient.from('company_modules').delete().eq('company_id', cid);
    // Nullify company_id on users before deleting company (FK constraint)
    await adminClient.from('users').update({ company_id: null }).eq('company_id', cid);
    await adminClient.from('companies').delete().eq('id', cid);
  }
  // Delete auth users (and by cascade, public.users rows)
  for (const uid of authUserIds) {
    if (!uid) continue;
    try {
      await adminClient.auth.admin.deleteUser(uid);
    } catch (e) {
      // If auth delete fails, delete public.users row directly
      await adminClient.from('users').delete().eq('auth_user_id', uid);
    }
  }
  // Clean up any public.users rows with null company_id from this run
  await adminClient.from('users').delete().like('email', `e2e-%@test.invalid`);
  console.log('   ✅ Cleanup complete');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(' GDPR Phase 1 — E2E Manual Verification');
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(`  Suffix: ${TS}`);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const authUserIds = [];
  let companyId1, companyId2;
  let jwt1, jwtCross;

  try {
    // ─── Setup ──────────────────────────────────────────────────────────────
    console.log('⚙️  Creating test infrastructure...');

    companyId1 = await createTestCompany(`E2E Company Alpha ${TS}`);
    companyId2 = await createTestCompany(`E2E Company Beta ${TS}`);
    console.log(`   Company 1: ${companyId1}`);
    console.log(`   Company 2: ${companyId2}`);

    // User1 = employee of company1 (creates all clients in S1/S2/S3/S4)
    const user1 = await createTestUser(companyId1, USER1_EMAIL);
    authUserIds.push(user1.authUserId);

    const userCross = await createTestUser(companyId2, EMAIL_CROSS);
    authUserIds.push(userCross.authUserId);

    jwt1 = await signInUser(USER1_EMAIL);
    jwtCross = await signInUser(EMAIL_CROSS);
    console.log(`   JWTs obtained. Setup done.\n`);

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 1: Non-health client (no metadata.is_health_client)
    // ════════════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 1: Non-health client (health_category=false / no flag)');
    console.log('─────────────────────────────────────────────────────────────────────');

    const s1Resp = await callEdgeFn(jwt1, {
      p_name: 'Test NonHealth S1',
      p_email: EMAIL_S1,
      p_dni: '11111111A',
      p_phone: '600000001',
      // No metadata.is_health_client — should just create and encrypt
    });
    console.log(`   HTTP ${s1Resp.status}:`, JSON.stringify(s1Resp.body).substring(0, 200));

    const s1Client = await getClientByEmail(EMAIL_S1, companyId1);
    const s1Enc = !!s1Client?.dni_encrypted;
    const s1Kv = s1Client?.pii_key_version === 1;
    const s1DniOk = s1Client?.dni === '11111111A';

    console.log(
      `   dni_encrypted: ${s1Enc ? `present (${s1Client.dni_encrypted.length} chars)` : 'MISSING'}`,
    );
    console.log(`   pii_key_version: ${s1Client?.pii_key_version}`);
    console.log(`   dni (plaintext): ${s1Client?.dni}`);

    const s1Pass = (s1Resp.status === 200 || s1Resp.status === 201) && s1Enc && s1Kv;
    record(
      '1. Non-health client',
      'HTTP 200/201, dni_encrypted≠null, pii_key_version=1',
      `HTTP ${s1Resp.status}, encrypted=${s1Enc}, kv=${s1Client?.pii_key_version}, dni=${s1Client?.dni}`,
      s1Pass,
      s1Pass ? 'DNI encrypted correctly' : `FAIL: encrypted=${s1Enc}, status=${s1Resp.status}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 2: Health client WITHOUT historialClinico module
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 2: Health client, historialClinico module NOT active');
    console.log('─────────────────────────────────────────────────────────────────────');

    // Ensure no historialClinico module for company1
    await adminClient
      .from('company_modules')
      .delete()
      .eq('company_id', companyId1)
      .eq('module_key', 'historialClinico');

    const s2Resp = await callEdgeFn(jwt1, {
      p_name: 'Test Health NoModule',
      p_email: EMAIL_S2,
      p_dni: '22222222B',
      p_metadata: { is_health_client: true },
    });
    console.log(`   HTTP ${s2Resp.status}:`, JSON.stringify(s2Resp.body).substring(0, 200));

    const s2Client = await getClientByEmail(EMAIL_S2, companyId1);
    const s2Enc = !!s2Client?.dni_encrypted;
    const s2NoConsentErr = s2Resp.body?.code !== 'CONSENT_REQUIRED';

    console.log(`   Client created: ${!!s2Client}`);
    console.log(`   dni_encrypted: ${s2Enc ? 'present' : 'MISSING'}`);
    console.log(`   consent_error: ${!s2NoConsentErr}`);

    const s2Pass = (s2Resp.status === 200 || s2Resp.status === 201) && s2Enc && s2NoConsentErr;
    record(
      '2. Health, no historialClinico module',
      'HTTP 200/201, no CONSENT_REQUIRED, DNI encrypted',
      `HTTP ${s2Resp.status}, encrypted=${s2Enc}, consent_err=${!s2NoConsentErr}`,
      s2Pass,
      s2Pass
        ? 'Module-check bypass works correctly'
        : `FAIL: ${s2Resp.body?.error || s2Resp.body?.code}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 3: Health client WITH module active, NO consent
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 3: Health client WITH historialClinico module, NO consent');
    console.log('─────────────────────────────────────────────────────────────────────');

    // Activate historialClinico module
    await activateHistorialClinicoModule(companyId1);
    console.log('   historialClinico module activated for company 1');

    const s3Resp = await callEdgeFn(jwt1, {
      p_name: 'Test Health NoConsent',
      p_email: EMAIL_S3,
      p_dni: '33333333C',
      p_metadata: { is_health_client: true },
    });
    console.log(`   HTTP ${s3Resp.status}:`, JSON.stringify(s3Resp.body).substring(0, 300));

    const s3Client = await getClientByEmail(EMAIL_S3, companyId1);

    console.log(`   code: ${s3Resp.body?.code}`);
    console.log(`   Client in DB: ${s3Client ? '⚠️ EXISTS (UNEXPECTED)' : 'null (correct)'}`);

    const s3Pass =
      s3Resp.status === 422 && s3Resp.body?.code === 'CONSENT_REQUIRED' && s3Client === null;

    record(
      '3. Health + module active, no consent',
      'HTTP 422, code=CONSENT_REQUIRED, client NOT inserted',
      `HTTP ${s3Resp.status}, code=${s3Resp.body?.code}, in_db=${s3Client !== null}`,
      s3Pass,
      s3Pass
        ? 'Consent gate blocks correctly'
        : `FAIL: status=${s3Resp.status} code=${s3Resp.body?.code} in_db=${!!s3Client}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 4: Grant consent, then create health client
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 4: Grant health_data consent → create health client');
    console.log('─────────────────────────────────────────────────────────────────────');

    await grantHealthConsent(EMAIL_S3, companyId1);
    console.log(`   gdpr_consent_records inserted for ${EMAIL_S3}`);

    // Retry the exact same call from S3 (same employee jwt1)
    const s4Resp = await callEdgeFn(jwt1, {
      p_name: 'Test Health WithConsent',
      p_email: EMAIL_S3,
      p_dni: '33333333C',
      p_metadata: { is_health_client: true },
    });
    console.log(`   HTTP ${s4Resp.status}:`, JSON.stringify(s4Resp.body).substring(0, 200));

    const s4Client = await getClientByEmail(EMAIL_S3, companyId1);
    const s4Enc = !!s4Client?.dni_encrypted;
    const s4Inserted = s4Client !== null;

    console.log(`   Client created: ${s4Inserted}`);
    console.log(`   dni_encrypted: ${s4Enc ? 'present' : 'MISSING'}`);

    const s4Pass = (s4Resp.status === 200 || s4Resp.status === 201) && s4Inserted && s4Enc;
    record(
      '4. Health + consent granted',
      'HTTP 200/201, client created, DNI encrypted',
      `HTTP ${s4Resp.status}, inserted=${s4Inserted}, encrypted=${s4Enc}`,
      s4Pass,
      s4Pass ? 'Consent flow works end-to-end' : `FAIL: ${s4Resp.body?.error}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // SCENARIO 5: Cross-tenant RLS isolation
    // ════════════════════════════════════════════════════════════════════════
    console.log('\n─────────────────────────────────────────────────────────────────────');
    console.log('SCENARIO 5: Cross-tenant RLS isolation');
    console.log('─────────────────────────────────────────────────────────────────────');

    const s1ClientFresh = await getClientByEmail(EMAIL_S1, companyId1);
    if (!s1ClientFresh) {
      record(
        '5. Cross-tenant RLS',
        'SELECT=0, UPDATE=0',
        'N/A — S1 client not found',
        false,
        'S1 prerequisite failed',
      );
    } else {
      const targetId = s1ClientFresh.id;
      console.log(`   Target (company1) client ID: ${targetId}`);
      console.log(`   Attacker: company2 user JWT`);

      // Use RLS-enforcing client with company2 user's JWT
      const crossClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${jwtCross}` } },
      });

      // SELECT attempt — should return 0 rows
      const { data: selData, error: selErr } = await crossClient
        .from('clients')
        .select('id,company_id,name')
        .eq('id', targetId);

      console.log(`   SELECT: ${JSON.stringify({ rows: selData?.length, err: selErr?.message })}`);

      // UPDATE attempt — should affect 0 rows
      const { data: updData, error: updErr } = await crossClient
        .from('clients')
        .update({ phone: '999999999' })
        .eq('id', targetId)
        .select();

      console.log(`   UPDATE: ${JSON.stringify({ rows: updData?.length, err: updErr?.message })}`);

      const s5SelectBlocked = !selErr && selData?.length === 0;
      const s5UpdateBlocked = !updErr && updData?.length === 0;
      const s5Pass = s5SelectBlocked && s5UpdateBlocked;

      record(
        '5. Cross-tenant RLS isolation',
        'SELECT=0 rows, UPDATE=0 rows',
        `SELECT=${selData?.length ?? `err:${selErr?.message}`}, UPDATE=${updData?.length ?? `err:${updErr?.message}`}`,
        s5Pass,
        s5Pass
          ? 'RLS correctly blocks cross-tenant access'
          : `SELECT_blocked=${s5SelectBlocked}, UPDATE_blocked=${s5UpdateBlocked}`,
      );
    }
  } catch (err) {
    console.error('\n💥 Unexpected error:', err);
    record('SETUP/RUNTIME ERROR', 'N/A', String(err), false, 'Script aborted');
  } finally {
    await cleanup([companyId1, companyId2], authUserIds);
  }

  // ─── Print Results ───────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════════════════════════');
  console.log(' GDPR PHASE 1 E2E VERIFICATION — RESULTS');
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
    console.log('  ✅ PRODUCTION READY — All GDPR Phase 1 scenarios verified.');
    console.log('     System is safe to store real client data.');
  } else {
    console.log('  ❌ NOT PRODUCTION READY — Review failures above before storing real data.');
  }
  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
