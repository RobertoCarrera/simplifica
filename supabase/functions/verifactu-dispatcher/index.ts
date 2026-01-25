// @ts-nocheck
// Edge Function: verifactu-dispatcher
// Processes verifactu.events with backoff and transitions: pending -> sending -> accepted/rejected
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSuministroLRXml, type SistemaInformatico } from "./xml-generator.ts";
import { signXml } from "./xades-signer.ts";
import { createAEATClient } from "./aeat-client.ts";
import { transformToRegistroAlta, transformToRegistroAnulacion, buildCabecera as buildCabeceraFromSettings } from "./invoice-transformer.ts";

function cors(origin) {
  const allowAll = (Deno.env.get('ALLOW_ALL_ORIGINS') || 'false').toLowerCase() === 'true';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s)=>s.trim()).filter(Boolean);
  const isAllowed = allowAll || origin && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed && origin ? origin : allowAll ? '*' : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

const MAX_ATTEMPTS = Number(Deno.env.get('VERIFACTU_MAX_ATTEMPTS') || 7);
// minutes: 0, 1, 5, 15, 60, 180, 720
const BACKOFF_MIN = (Deno.env.get('VERIFACTU_BACKOFF') || '0,1,5,15,60,180,720').split(',').map((n)=>Number(n.trim())).filter((n)=>!isNaN(n));

const VERIFACTU_MODE = Deno.env.get('VERIFACTU_MODE') || 'live';
const ENABLE_FALLBACK = (Deno.env.get('VERIFACTU_ENABLE_FALLBACK') || 'false').toLowerCase() === 'true';
const VERIFACTU_CERT_ENC_KEY = Deno.env.get('VERIFACTU_CERT_ENC_KEY') || '';

const SISTEMA_INFORMATICO: SistemaInformatico = {
  nifProducer: 'B12345678', // NIF de la empresa desarrolladora
  nombreRazon: 'Simplifica Software SL',
  idSistema: 'SIMPLIFICA-VF-001',
  nombreSistema: 'Simplifica',
  version: '1.0.0',
  numInstalacion: '001',
  tipoUsoPosible: 'S',
  tipoUsoMultiOT: 'N'
};

async function decryptAesGcm(encryptedData: string, keyBase64: string): Promise<string> {
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  
  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted data format');
    iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    ciphertext = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));
  } else {
    const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    iv = encrypted.slice(0, 12);
    ciphertext = encrypted.slice(12);
  }
  
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error(`Invalid key length: ${keyBytes.length} bytes. Expected 32 bytes.`);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

async function getCertificateForCompany(admin: any, companyId: string): Promise<{
  certPem: string;
  keyPem: string;
  keyPass: string;
  nifEmisor: string;
  environment: 'pre' | 'prod';
} | null> {
  const { data: settings, error } = await admin
    .from('verifactu_settings')
    .select('cert_pem_enc, key_pem_enc, key_pass_enc, issuer_nif, environment')
    .eq('company_id', companyId)
    .maybeSingle();
  
  if (error || !settings) {
    console.error('[getCertificateForCompany] Error:', error?.message || 'No settings found');
    return null;
  }
  
  if (!settings.cert_pem_enc || !settings.key_pem_enc || !VERIFACTU_CERT_ENC_KEY) {
    console.error('[getCertificateForCompany] Missing certificate data or encryption key');
    return null;
  }
  
  try {
    const certPem = await decryptAesGcm(settings.cert_pem_enc, VERIFACTU_CERT_ENC_KEY);
    const keyPem = await decryptAesGcm(settings.key_pem_enc, VERIFACTU_CERT_ENC_KEY);
    const keyPass = settings.key_pass_enc 
      ? await decryptAesGcm(settings.key_pass_enc, VERIFACTU_CERT_ENC_KEY) 
      : '';
    
    const envMap: Record<string, 'pre' | 'prod'> = {
      'test': 'pre',
      'production': 'prod',
      'pre': 'pre',
      'prod': 'prod'
    };
    
    return {
      certPem,
      keyPem,
      keyPass,
      nifEmisor: settings.issuer_nif || '',
      environment: envMap[settings.environment] || 'pre'
    };
  } catch (e) {
    console.error('[getCertificateForCompany] Decryption error:', e.message);
    return null;
  }
}

async function sendToAeat(admin: any, ev: any): Promise<{ success: boolean; response: any }> {
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select(`
      *,
      company:companies(*),
      client:clients(*)
    `)
    .eq('id', ev.invoice_id)
    .single();
  
  if (invErr || !invoice) throw new Error(`Invoice not found: ${invErr?.message || 'no data'}`);
  
  const { data: lines, error: linesErr } = await admin
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', ev.invoice_id);
  
  if (!linesErr && lines) {
    invoice.invoice_lines = lines;
  } else {
    const { data: lines2 } = await admin
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', ev.invoice_id);
    invoice.invoice_lines = lines2 || [];
  }
  
  const { data: vfSettings, error: settingsErr } = await admin
    .from('verifactu_settings')
    .select('*')
    .eq('company_id', invoice.company_id)
    .single();
  
  if (settingsErr || !vfSettings) throw new Error('VeriFactu settings not configured for company');
  
  const cert = await getCertificateForCompany(admin, invoice.company_id);
  if (!cert) throw new Error('Certificate not configured for company');
  
  const { data: prevMeta } = await admin
    .schema('verifactu')
    .from('invoice_meta')
    .select('huella, invoice_id')
    .eq('company_id', invoice.company_id)
    .neq('invoice_id', ev.invoice_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  const previousRecord = prevMeta ? {
    nif_emisor: cert.nifEmisor,
    numero_serie: '',
    fecha_expedicion: '',
    huella: prevMeta.huella
  } : undefined;
  
  const settings = {
    issuer_nif: cert.nifEmisor,
    issuer_name: invoice.company?.legal_name || invoice.company?.name || '',
    environment: cert.environment,
    software_code: SISTEMA_INFORMATICO.idSistema,
    software_name: SISTEMA_INFORMATICO.nombreSistema,
    software_version: SISTEMA_INFORMATICO.version,
    producer_nif: SISTEMA_INFORMATICO.nifProducer,
    producer_name: SISTEMA_INFORMATICO.nombreRazon,
    installation_number: SISTEMA_INFORMATICO.numInstalacion
  };
  
  const cabecera = buildCabeceraFromSettings(settings);
  
  let xmlBody: string;
  
  if (ev.event_type === 'anulacion') {
    const anulacion = await transformToRegistroAnulacion(invoice, settings, previousRecord);
    xmlBody = generateSuministroLRXml(cabecera, [anulacion], true);
  } else {
    const alta = await transformToRegistroAlta(invoice, settings, previousRecord);
    xmlBody = generateSuministroLRXml(cabecera, [alta], false);
  }
  
  const signedXml = await signXml(xmlBody, {
    pem: cert.certPem,
    privateKey: cert.keyPem,
    keyPassword: cert.keyPass
  });
  
  const aeatClient = await createAEATClient({
    environment: cert.environment,
    certificate: {
      pem: cert.certPem,
      privateKey: cert.keyPem,
      keyPassword: cert.keyPass
    },
    retryOnError: true,
    maxRetries: 2
  });
  
  const result = await aeatClient.suministroLR(signedXml);
  
  if (result.success) {
    return {
      success: true,
      response: {
        status: 'ACCEPTED',
        at: new Date().toISOString(),
        aeatResponse: result,
        csv: result.csv
      }
    };
  } else {
    return {
      success: false,
      response: {
        status: 'REJECTED',
        at: new Date().toISOString(),
        reason: result.errores?.[0]?.descripcion || 'Error AEAT',
        aeatResponse: result,
        errorCode: result.errores?.[0]?.codigo
      }
    };
  }
}

function isDue(ev) {
  const attempts = ev.attempts ?? 0;
  const last = ev.sent_at ? new Date(ev.sent_at).getTime() : new Date(ev.created_at).getTime();
  const now = Date.now();
  const waitMin = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] ?? 0;
  return now - last >= waitMin * 60_000;
}

async function simulateResponse(ev) {
  return {
    success: true,
    response: {
      status: 'ACCEPTED',
      at: new Date().toISOString(),
      echo: { id: ev.id },
      simulation: true,
      message: 'Respuesta simulada - VERIFACTU_MODE=mock'
    }
  };
}

async function processEvent(admin, ev) {
  const modeAtProcessTime = VERIFACTU_MODE;
  const fallbackAtProcessTime = ENABLE_FALLBACK;
  console.log(`[VeriFactu] Processing event ${ev.id}, VERIFACTU_MODE=${modeAtProcessTime}, ENABLE_FALLBACK=${fallbackAtProcessTime}`);
  
  const { error: sendingErr } = await admin.schema('verifactu').from('events').update({
    status: 'sending',
    sent_at: new Date().toISOString()
  }).eq('id', ev.id);
  if (sendingErr) console.error(`[VeriFactu] ERROR marking event ${ev.id} as sending: ${sendingErr.message}`);

  let result = { success: false, response: {}, _debug: { mode: modeAtProcessTime, fallback: fallbackAtProcessTime, path: 'init' } };
  try {
    if (modeAtProcessTime === 'live') {
      console.log(`[VeriFactu] Sending to AEAT in LIVE mode for event ${ev.id}`);
      result = await sendToAeat(admin, ev);
      result._debug = { mode: modeAtProcessTime, fallback: fallbackAtProcessTime, path: 'live-success' };
      console.log(`[VeriFactu] AEAT response for ${ev.id}:`, JSON.stringify(result).substring(0, 500));
    } else {
      console.log(`[VeriFactu] Using MOCK mode for event ${ev.id}`);
      result = await simulateResponse(ev);
      result._debug = { mode: modeAtProcessTime, fallback: fallbackAtProcessTime, path: 'mock' };
    }
  } catch (err) {
    console.error(`[VeriFactu] Error processing event ${ev.id}:`, err.message);
    if (fallbackAtProcessTime) {
      console.log(`[Fallback] Error in ${modeAtProcessTime} mode for event ${ev.id}: ${err.message}. Using simulation.`);
      result = await simulateResponse(ev);
      result._debug = { mode: modeAtProcessTime, fallback: fallbackAtProcessTime, path: 'fallback', error: err.message };
    } else {
      throw err;
    }
  }

  if (result.success) {
    console.log(`[VeriFactu] Event ${ev.id} ACCEPTED, saving response`);
    const responseWithDebug = { ...result.response, _debug: result._debug };
    const { error: updateErr } = await admin.schema('verifactu').from('events').update({
      status: 'accepted',
      response: responseWithDebug
    }).eq('id', ev.id);
    if (updateErr) console.error(`[VeriFactu] Error updating event to accepted: ${updateErr.message}`);

    if (ev.event_type === 'anulacion') {
      await admin.schema('verifactu').from('invoice_meta').update({ status: 'void' }).eq('invoice_id', ev.invoice_id);
    } else {
      await admin.schema('verifactu').from('invoice_meta').update({ status: 'accepted' }).eq('invoice_id', ev.invoice_id);
    }
    return { id: ev.id, status: 'accepted', mode: result.response.simulation ? 'simulation' : 'live' };
  } else {
    const attempts = (ev.attempts ?? 0) + 1;
    const rawResponse = result.response || { status: 'REJECTED', at: new Date().toISOString(), reason: 'unknown error' };
    
    let aeatSummary = null;
    if (rawResponse.aeatResponse) {
      const aeat = rawResponse.aeatResponse;
      aeatSummary = {
        success: aeat.success,
        estado: aeat.estado,
        csv: aeat.csv,
        errores: aeat.errores?.slice?.(0, 5) || aeat.errores,
        _raw: typeof aeat === 'object' ? JSON.stringify(aeat).substring(0, 500) : String(aeat).substring(0, 500)
      };
    }
    
    const response = {
      status: rawResponse.status,
      at: rawResponse.at,
      reason: typeof rawResponse.reason === 'string' ? rawResponse.reason.substring(0, 500) : rawResponse.reason,
      errorCode: rawResponse.errorCode,
      aeatResponse: aeatSummary
    };
    
    if (attempts >= MAX_ATTEMPTS) {
      await admin.schema('verifactu').from('events').update({
        status: 'rejected',
        attempts,
        last_error: 'max_attempts',
        response
      }).eq('id', ev.id);
      await admin.schema('verifactu').from('invoice_meta').update({ status: 'rejected' }).eq('invoice_id', ev.invoice_id);
      return { id: ev.id, status: 'rejected', attempts };
    } else {
      console.log(`[VeriFactu] Event ${ev.id} needs RETRY (attempt ${attempts})`);
      const { error: retryErr } = await admin.schema('verifactu').from('events').update({
        status: 'pending',
        attempts,
        last_error: 'retry',
        response
      }).eq('id', ev.id);
      if (retryErr) console.error(`[VeriFactu] Error updating event to pending: ${retryErr.message}`);
      await admin.schema('verifactu').from('invoice_meta').update({ status: 'rejected' }).eq('invoice_id', ev.invoice_id);
      return { id: ev.id, status: 'retry', attempts };
    }
  }
}

serve(async (req)=>{
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });

  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const admin = createClient(url, key, { auth: { persistSession: false } });

    let body = null;
    try {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : null;
    } catch (_) {}

    async function requireInvoiceAccess(invoice_id) {
      const authHeader = req.headers.get('authorization') || '';
      const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
      if (!token) return { error: 'Missing Bearer token' };
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      if (!anonKey) return { error: 'Missing SUPABASE_ANON_KEY' };
      const userClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      const { data: inv, error: invErr } = await userClient.from('invoices').select('id').eq('id', invoice_id).maybeSingle();
      if (invErr) return { error: invErr.message };
      if (!inv) return { error: 'Invoice not found', status: 404 };
      return { ok: true };
    }

    // Secure helper for company-level access (replaces IDOR vulnerability in test-cert)
    async function requireCompanyAccess() {
      const authHeader = req.headers.get('authorization') || '';
      const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
      if (!token) return { error: 'Missing Bearer token', status: 401 };
      
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      const userClient = createClient(url, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return { error: 'Invalid token', status: 401 };

      const { data: userProfile, error: profileError } = await userClient
        .from('users')
        .select('company_id')
        .eq('auth_user_id', user.id)
        .single();

      if (profileError || !userProfile?.company_id) {
        return { error: 'No se pudo determinar la empresa del usuario', status: 403 };
      }

      return { ok: true, company_id: userProfile.company_id };
    }
    
    // --- REMOVED INSECURE DEBUG ENDPOINTS (debug-test-update, debug-env, debug-last-event, debug-aeat-process) ---

    // Safe manual retry: reset last rejected event to pending for an invoice
    if (body && body.action === 'retry' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      const access = await requireInvoiceAccess(invoice_id);
      if (access.error) {
        return new Response(JSON.stringify({ ok: false, error: access.error }), { status: access.status || 401, headers: { ...headers, 'Content-Type': 'application/json' } });
      }

      const { data: ev, error: evErr } = await admin.schema('verifactu').from('events').select('*').eq('invoice_id', invoice_id).eq('status', 'rejected').order('created_at', { ascending: false }).limit(1).single();
      if (evErr) return new Response(JSON.stringify({ ok: false, error: evErr.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      if (!ev) return new Response(JSON.stringify({ ok: false, message: 'No rejected event to retry for invoice' }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });

      const { error: updErr } = await admin.schema('verifactu').from('events').update({ status: 'pending', last_error: null }).eq('id', ev.id);
      if (updErr) return new Response(JSON.stringify({ ok: false, error: updErr.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, retried_event_id: ev.id }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'config') {
      return new Response(JSON.stringify({
        ok: true,
        maxAttempts: MAX_ATTEMPTS,
        backoffMinutes: BACKOFF_MIN,
        mode: VERIFACTU_MODE,
        fallbackEnabled: ENABLE_FALLBACK,
        certEncKeyConfigured: !!VERIFACTU_CERT_ENC_KEY
      }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    // Test certificate: validates that the certificate can be decrypted and used
    // SECURED: now requires authentication and uses verified company_id from user profile
    if (body && body.action === 'test-cert') {
      // 1. Verify access and get company_id
      const access = await requireCompanyAccess();
      if (access.error) {
        return new Response(JSON.stringify({
          ok: false,
          certificate: { valid: false, error: access.error }
        }), { status: access.status || 401, headers: { ...headers, 'Content-Type': 'application/json' } });
      }
      const company_id = access.company_id;
      
      const errorResponse = (decryptionError?: string, certError?: string, aeatError?: string) => {
        return new Response(JSON.stringify({
          ok: false,
          decryption: { success: !decryptionError, error: decryptionError },
          certificate: { valid: false, error: certError },
          aeatConnection: { success: false, error: aeatError || 'No se pudo probar la conexión' },
          config: { environment: 'unknown', issuerNif: '', softwareCode: '' }
        }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
      };
      
      if (!VERIFACTU_CERT_ENC_KEY) return errorResponse('VERIFACTU_CERT_ENC_KEY no está configurada en las variables de entorno');
      
      let keyLength = 0;
      try {
        const keyBytes = Uint8Array.from(atob(VERIFACTU_CERT_ENC_KEY), c => c.charCodeAt(0));
        keyLength = keyBytes.length;
        if (keyLength !== 32) return errorResponse(`La clave de encriptación tiene ${keyLength} bytes, pero debe tener 32 bytes`);
      } catch (keyParseErr: any) {
        return errorResponse(`La clave de encriptación no es base64 válido: ${keyParseErr.message}`);
      }

      const { data: settings, error: settingsErr } = await admin
        .from('verifactu_settings')
        .select('cert_pem_enc, key_pem_enc, key_pass_enc, issuer_nif, environment, software_code')
        .eq('company_id', company_id)
        .maybeSingle();
      
      if (settingsErr || !settings) return errorResponse('No se encontró configuración VeriFactu para la empresa');
      if (!settings.cert_pem_enc || !settings.key_pem_enc) return errorResponse('Certificado o clave privada no cargados en la base de datos');

      let certPem: string, keyPem: string, keyPass: string;
      try {
        certPem = await decryptAesGcm(settings.cert_pem_enc, VERIFACTU_CERT_ENC_KEY);
        keyPem = await decryptAesGcm(settings.key_pem_enc, VERIFACTU_CERT_ENC_KEY);
        keyPass = settings.key_pass_enc ? await decryptAesGcm(settings.key_pass_enc, VERIFACTU_CERT_ENC_KEY) : '';
      } catch (decryptErr: any) {
        return errorResponse(`Error al desencriptar: ${decryptErr.message}. Posible causa: clave incorrecta.`);
      }

      const certValid = certPem.includes('-----BEGIN CERTIFICATE-----');
      const keyValid = keyPem.includes('-----BEGIN') && keyPem.includes('PRIVATE KEY');
      
      if (!certValid || !keyValid) {
        return new Response(JSON.stringify({
          ok: false,
          decryption: { success: true, certLength: certPem.length, keyLength: keyPem.length, hasPassphrase: !!keyPass },
          certificate: { valid: false, error: 'El certificado o la clave privada no tienen formato PEM válido' },
          aeatConnection: { success: false, error: 'No se probó la conexión' },
          config: { environment: settings.environment, issuerNif: settings.issuer_nif, softwareCode: settings.software_code || '' }
        }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
      }

      let signTest = { attempted: false, success: false, error: null as string | null };
      try {
        const testXml = '<test>VeriFactu Certificate Test</test>';
        const signed = await signXml(testXml, { pem: certPem, privateKey: keyPem, keyPassword: keyPass });
        signTest = { attempted: true, success: signed.includes('<ds:Signature') || signed.includes('<Signature'), error: null };
      } catch (signErr: any) {
        signTest = { attempted: true, success: false, error: signErr.message };
      }

      let aeatConnection = { success: false, endpoint: '', httpStatus: 0, responseTime: 0, error: null as string | null };
      try {
        const env = settings.environment || 'pre';
        const aeatEndpoint = env === 'prod' 
          ? 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
          : 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
        
        const startTime = Date.now();
        const aeatResp = await fetch(aeatEndpoint, { method: 'GET', headers: { 'Accept': 'text/html' } });
        aeatConnection = { success: aeatResp.status > 0, endpoint: aeatEndpoint, httpStatus: aeatResp.status, responseTime: Date.now() - startTime, error: null };
      } catch (aeatErr: any) {
        aeatConnection.error = aeatErr.message;
      }

      return new Response(JSON.stringify({
        ok: signTest.success && aeatConnection.success,
        decryption: { success: true, certLength: certPem.length, keyLength: keyPem.length, hasPassphrase: !!keyPass },
        certificate: { valid: certValid && keyValid && signTest.success, subject: 'Ver detalles en el certificado original', error: signTest.success ? undefined : signTest.error || 'No se pudo firmar con el certificado' },
        aeatConnection: { success: aeatConnection.success, endpoint: aeatConnection.endpoint, httpStatus: aeatConnection.httpStatus, responseTime: aeatConnection.responseTime, error: aeatConnection.error || undefined },
        config: { environment: settings.environment, issuerNif: settings.issuer_nif, softwareCode: settings.software_code || '' },
        message: signTest.success && aeatConnection.success ? '🎉 El certificado está correctamente configurado y puede conectar con AEAT' : signTest.success ? '⚠️ Certificado OK pero no se pudo conectar con AEAT' : '⚠️ El certificado no pudo firmar. Revisa la contraseña o el formato.'
      }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'health') {
      const evTable = admin.schema('verifactu').from('events');
      const [pendingRes, lastRes, lastAccRes, lastRejRes] = await Promise.all([
        evTable.select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        evTable.select('created_at').order('created_at', { ascending: false }).limit(1),
        evTable.select('created_at').eq('status', 'accepted').order('created_at', { ascending: false }).limit(1),
        evTable.select('created_at').eq('status', 'rejected').order('created_at', { ascending: false }).limit(1)
      ]);
      return new Response(JSON.stringify({
        ok: true,
        pending: pendingRes.count || 0,
        lastEventAt: lastRes.data && lastRes.data[0]?.created_at || null,
        lastAcceptedAt: lastAccRes.data && lastAccRes.data[0]?.created_at || null,
        lastRejectedAt: lastRejRes.data && lastRejRes.data[0]?.created_at || null
      }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'meta' && body.invoice_id) {
      const access = await requireInvoiceAccess(String(body.invoice_id));
      if (access.error) return new Response(JSON.stringify({ ok: false, error: access.error }), { status: access.status || 401, headers: { ...headers, 'Content-Type': 'application/json' } });
      const { data: meta, error: metaErr } = await admin.schema('verifactu').from('invoice_meta').select('*').eq('invoice_id', body.invoice_id).maybeSingle();
      if (metaErr) return new Response(JSON.stringify({ ok: false, error: metaErr.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, meta }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'events' && body.invoice_id) {
      const access = await requireInvoiceAccess(String(body.invoice_id));
      if (access.error) return new Response(JSON.stringify({ ok: false, error: access.error }), { status: access.status || 401, headers: { ...headers, 'Content-Type': 'application/json' } });
      const { data: events, error: evErr } = await admin.schema('verifactu').from('events').select('*').eq('invoice_id', body.invoice_id).order('created_at', { ascending: false }).limit(Number(body.limit || 5));
      if (evErr) return new Response(JSON.stringify({ ok: false, error: evErr.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true, events: events || [] }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'list-registry') {
      const authHeader = req.headers.get('authorization') || '';
      const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
      if (!token) return new Response(JSON.stringify({ ok: false, error: 'Missing Bearer token' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
      
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      const userClient = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
      
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });

      const { data: userProfile, error: profileError } = await userClient.from('users').select('company_id').eq('auth_user_id', user.id).single();
      if (profileError || !userProfile?.company_id) return new Response(JSON.stringify({ ok: false, error: 'No se pudo determinar la empresa del usuario' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      
      const companyId = userProfile.company_id;
      const page = Number(body.page || 1);
      const pageSize = Math.min(Number(body.pageSize || 50), 100);
      const offset = (page - 1) * pageSize;
      
      const { data: invoices, error: listErr, count } = await admin
        .from('invoices')
        .select(`id, full_invoice_number, invoice_date, status, total, currency, created_at, client:clients!invoices_client_id_fkey(name, apellidos, business_name)`, { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      
      if (listErr) return new Response(JSON.stringify({ ok: false, error: listErr.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
      
      const invoiceIds = (invoices || []).map(i => i.id);
      const { data: metaList } = await admin.schema('verifactu').from('invoice_meta').select('invoice_id, status, series, number, chained_hash, issue_time, created_at, updated_at').in('invoice_id', invoiceIds);
      const { data: eventsList } = await admin.schema('verifactu').from('events').select('invoice_id, event_type, status, created_at').in('invoice_id', invoiceIds).order('created_at', { ascending: false });
      
      const eventsByInvoice = new Map();
      for (const ev of (eventsList || [])) { if (!eventsByInvoice.has(ev.invoice_id)) eventsByInvoice.set(ev.invoice_id, ev); }
      
      const metaMap = new Map((metaList || []).map(m => [m.invoice_id, m]));
      const registry = (invoices || []).map(inv => {
        const meta = metaMap.get(inv.id);
        const lastEvent = eventsByInvoice.get(inv.id);
        const clientName = inv.client?.business_name || [inv.client?.name, inv.client?.apellidos].filter(Boolean).join(' ') || 'Sin cliente';
        return {
          id: inv.id,
          invoice_number: inv.full_invoice_number,
          invoice_date: inv.invoice_date,
          app_status: inv.status,
          total: inv.total,
          currency: inv.currency,
          client_name: clientName,
          verifactu: meta ? { status: meta.status, series: meta.series, number: meta.number, huella: meta.chained_hash, issue_time: meta.issue_time, registered_at: meta.created_at, updated_at: meta.updated_at } : null,
          last_event: lastEvent ? { type: lastEvent.event_type, status: lastEvent.status, date: lastEvent.created_at } : null
        };
      });
      
      const { data: statsData } = await admin.schema('verifactu').from('invoice_meta').select('status').eq('company_id', companyId);
      const stats = {
        total: count || 0,
        registered: (statsData || []).length,
        accepted: (statsData || []).filter(s => s.status === 'accepted').length,
        rejected: (statsData || []).filter(s => s.status === 'rejected').length,
        pending: (statsData || []).filter(s => s.status === 'pending' || s.status === 'sending').length,
        void: (statsData || []).filter(s => s.status === 'void').length
      };
      
      return new Response(JSON.stringify({ ok: true, registry, stats, pagination: { page, pageSize, total: count || 0, totalPages: Math.ceil((count || 0) / pageSize) } }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    if (body && body.action === 'diag') {
      const out = { ok: true };
      const evTest = await admin.schema('verifactu').from('events').select('id,status,created_at').order('created_at', { ascending: false }).limit(3);
      out.events_ok = !evTest.error;
      out.events_error = evTest.error?.message || null;
      out.events_sample = evTest.data || [];
      const metaTest = await admin.schema('verifactu').from('invoice_meta').select('invoice_id,status,updated_at').order('updated_at', { ascending: false }).limit(3);
      out.meta_ok = !metaTest.error;
      out.meta_error = metaTest.error?.message || null;
      out.meta_sample = metaTest.data || [];
      const pendingHead = await admin.schema('verifactu').from('events').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      out.pending_count = pendingHead.count ?? 0;
      out.pending_error = pendingHead.error?.message || null;
      out.mode = VERIFACTU_MODE;
      out.fallbackEnabled = ENABLE_FALLBACK;
      out.maxAttempts = MAX_ATTEMPTS;
      out.backoffMinutes = BACKOFF_MIN;
      return new Response(JSON.stringify(out), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const { data: events, error } = await admin.schema('verifactu').from('events').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });

    const due = (events || []).filter(isDue);
    const results = [];
    for (const ev of due){
      try {
        results.push(await processEvent(admin, ev));
      } catch (e) {
        const attempts = (ev.attempts ?? 0) + 1;
        await admin.schema('verifactu').from('events').update({
          status: attempts >= MAX_ATTEMPTS ? 'rejected' : 'pending',
          attempts,
          last_error: e?.message || 'dispatch_error'
        }).eq('id', ev.id);
      }
    }
    return new Response(JSON.stringify({ ok: true, polled: (events || []).length, processed: results.length, results }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
});
