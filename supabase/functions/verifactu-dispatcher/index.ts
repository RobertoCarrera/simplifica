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
const REJECT_RATE = Number(Deno.env.get('VERIFACTU_REJECT_RATE') || 0); // 0..1 for simulation
const VERIFACTU_MODE = Deno.env.get('VERIFACTU_MODE') || 'mock'; // 'mock' | 'live'
const ENABLE_FALLBACK = (Deno.env.get('VERIFACTU_ENABLE_FALLBACK') || 'false').toLowerCase() === 'true';
const VERIFACTU_CERT_ENC_KEY = Deno.env.get('VERIFACTU_CERT_ENC_KEY') || '';

// Sistema informático (software) registrado según Art. 16
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

// Decrypt AES-GCM encrypted data from verifactu_settings
async function decryptAesGcm(encryptedBase64: string, keyHex: string): Promise<string> {
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  // First 12 bytes are IV, rest is ciphertext+tag
  const iv = encrypted.slice(0, 12);
  const ciphertext = encrypted.slice(12);
  
  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
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

// Fetch and decrypt certificate from verifactu_settings
async function getCertificateForCompany(admin: any, companyId: string): Promise<{
  certPem: string;
  keyPem: string;
  keyPass: string;
  nifEmisor: string;
  environment: 'pre' | 'prod';
} | null> {
  const { data: settings, error } = await admin
    .from('verifactu_settings')
    .select('cert_pem_enc, key_pem_enc, key_pass_enc, nif, environment')
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
    
    return {
      certPem,
      keyPem,
      keyPass,
      nifEmisor: settings.nif || '',
      environment: settings.environment === 'prod' ? 'prod' : 'pre'
    };
  } catch (e) {
    console.error('[getCertificateForCompany] Decryption error:', e.message);
    return null;
  }
}

// Send invoice to AEAT (real implementation)
async function sendToAeat(admin: any, ev: any): Promise<{ success: boolean; response: any }> {
  // Get invoice data with all related info
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .select(`
      *,
      company:companies(*),
      client:clients(*),
      invoice_lines(*)
    `)
    .eq('id', ev.invoice_id)
    .single();
  
  if (invErr || !invoice) {
    throw new Error(`Invoice not found: ${invErr?.message || 'no data'}`);
  }
  
  // Get verifactu_settings for company
  const { data: vfSettings, error: settingsErr } = await admin
    .from('verifactu_settings')
    .select('*')
    .eq('company_id', invoice.company_id)
    .single();
  
  if (settingsErr || !vfSettings) {
    throw new Error('VeriFactu settings not configured for company');
  }
  
  // Get certificate
  const cert = await getCertificateForCompany(admin, invoice.company_id);
  if (!cert) {
    throw new Error('Certificate not configured for company');
  }
  
  // Get previous record for chain
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
    numero_serie: '', // Would need to get from previous invoice
    fecha_expedicion: '',
    huella: prevMeta.huella
  } : undefined;
  
  // Build settings object for transformer (matching VerifactuSettings interface)
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
  
  // Build cabecera
  const cabecera = buildCabeceraFromSettings(settings);
  
  let xmlBody: string;
  
  if (ev.event_type === 'anulacion') {
    const anulacion = await transformToRegistroAnulacion(invoice, settings, previousRecord);
    xmlBody = generateSuministroLRXml(cabecera, [anulacion], true);
  } else {
    const alta = await transformToRegistroAlta(invoice, settings, previousRecord);
    xmlBody = generateSuministroLRXml(cabecera, [alta], false);
  }
  
  // Sign XML with XAdES
  const signedXml = await signXml(xmlBody, {
    pem: cert.certPem,
    privateKey: cert.keyPem,
    keyPassword: cert.keyPass
  });
  
  // Create AEAT client and send
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
  
  // Send to AEAT - use suministroLR for invoice registration
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
  const accept = Math.random() >= REJECT_RATE;
  if (accept) {
    return {
      success: true,
      response: {
        status: 'ACCEPTED',
        at: new Date().toISOString(),
        echo: {
          id: ev.id
        },
        simulation: true
      }
    };
  } else {
    return {
      success: false,
      response: {
        status: 'REJECTED',
        at: new Date().toISOString(),
        reason: 'simulated rejection',
        simulation: true
      }
    };
  }
}
async function processEvent(admin, ev) {
  // mark sending + sent_at
  await admin.schema('verifactu').from('events').update({
    status: 'sending',
    sent_at: new Date().toISOString()
  }).eq('id', ev.id);
  let result = {
    success: false,
    response: {}
  };
  try {
    if (VERIFACTU_MODE === 'live') {
      result = await sendToAeat(admin, ev);
    } else {
      result = await simulateResponse(ev);
    }
  } catch (err) {
    if (ENABLE_FALLBACK) {
      console.log(`[Fallback] Error in ${VERIFACTU_MODE} mode for event ${ev.id}: ${err.message}. Using simulation.`);
      result = await simulateResponse(ev);
    } else {
      throw err;
    }
  }
  if (result.success) {
    await admin.schema('verifactu').from('events').update({
      status: 'accepted',
      response: result.response
    }).eq('id', ev.id);
    // reflect on invoice_meta
    if (ev.event_type === 'anulacion') {
      await admin.schema('verifactu').from('invoice_meta').update({
        status: 'void'
      }).eq('invoice_id', ev.invoice_id);
    } else {
      await admin.schema('verifactu').from('invoice_meta').update({
        status: 'accepted'
      }).eq('invoice_id', ev.invoice_id);
    }
    return {
      id: ev.id,
      status: 'accepted',
      mode: result.response.simulation ? 'simulation' : 'live'
    };
  } else {
    const attempts = (ev.attempts ?? 0) + 1;
    const response = result.response || {
      status: 'REJECTED',
      at: new Date().toISOString(),
      reason: 'unknown error'
    };
    if (attempts >= MAX_ATTEMPTS) {
      await admin.schema('verifactu').from('events').update({
        status: 'rejected',
        attempts,
        last_error: 'max_attempts',
        response
      }).eq('id', ev.id);
      await admin.schema('verifactu').from('invoice_meta').update({
        status: 'rejected'
      }).eq('invoice_id', ev.invoice_id);
      return {
        id: ev.id,
        status: 'rejected',
        attempts
      };
    } else {
      await admin.schema('verifactu').from('events').update({
        status: 'pending',
        attempts,
        last_error: 'retry',
        response
      }).eq('id', ev.id);
      await admin.schema('verifactu').from('invoice_meta').update({
        status: 'rejected'
      }).eq('invoice_id', ev.invoice_id);
      return {
        id: ev.id,
        status: 'retry',
        attempts
      };
    }
  }
}
serve(async (req)=>{
  const origin = req.headers.get('Origin') || undefined;
  const headers = cors(origin);
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({
    error: 'Method not allowed'
  }), {
    status: 405,
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  });
  try {
    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const admin = createClient(url, key, {
      auth: {
        persistSession: false
      }
    });
    // Optional manual actions via body
    let body = null;
    try {
      const txt = await req.text();
      body = txt ? JSON.parse(txt) : null;
    } catch (_) {}
    // For actions that require validating the caller against RLS (per-invoice access),
    // create a user-scoped client from the Authorization header and ensure the invoice exists for them.
    async function requireInvoiceAccess(invoice_id) {
      const authHeader = req.headers.get('authorization') || '';
      const token = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1];
      if (!token) return {
        error: 'Missing Bearer token'
      };
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      if (!anonKey) return {
        error: 'Missing SUPABASE_ANON_KEY'
      };
      const userClient = createClient(url, anonKey, {
        auth: {
          persistSession: false
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      });
      const { data: inv, error: invErr } = await userClient.from('invoices').select('id').eq('id', invoice_id).maybeSingle();
      if (invErr) return {
        error: invErr.message
      };
      if (!inv) return {
        error: 'Invoice not found',
        status: 404
      };
      return {
        ok: true
      };
    }
    // Safe manual retry: reset last rejected event to pending for an invoice
    if (body && body.action === 'retry' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      // Find most recent rejected event for this invoice
      const { data: ev, error: evErr } = await admin.schema('verifactu').from('events').select('*').eq('invoice_id', invoice_id).eq('status', 'rejected').order('created_at', {
        ascending: false
      }).limit(1).single();
      if (evErr) {
        return new Response(JSON.stringify({
          ok: false,
          error: evErr.message
        }), {
          status: 400,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }
      // If nothing to retry, respond gracefully
      if (!ev) {
        return new Response(JSON.stringify({
          ok: false,
          message: 'No rejected event to retry for invoice'
        }), {
          status: 200,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }
      // Reset to pending without changing attempts; clear last_error to avoid confusion
      const { error: updErr } = await admin.schema('verifactu').from('events').update({
        status: 'pending',
        last_error: null
      }).eq('id', ev.id);
      if (updErr) {
        return new Response(JSON.stringify({
          ok: false,
          error: updErr.message
        }), {
          status: 400,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        retried_event_id: ev.id
      }), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Expose non-sensitive dispatcher configuration to clients (for UI ETA)
    if (body && body.action === 'config') {
      return new Response(JSON.stringify({
        ok: true,
        maxAttempts: MAX_ATTEMPTS,
        backoffMinutes: BACKOFF_MIN,
        mode: VERIFACTU_MODE,
        fallbackEnabled: ENABLE_FALLBACK
      }), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Health summary for UI without exposing verifactu schema over PostgREST
    if (body && body.action === 'health') {
      const evTable = admin.schema('verifactu').from('events');
      const [pendingRes, lastRes, lastAccRes, lastRejRes] = await Promise.all([
        evTable.select('id', {
          count: 'exact',
          head: true
        }).eq('status', 'pending'),
        evTable.select('created_at').order('created_at', {
          ascending: false
        }).limit(1),
        evTable.select('created_at').eq('status', 'accepted').order('created_at', {
          ascending: false
        }).limit(1),
        evTable.select('created_at').eq('status', 'rejected').order('created_at', {
          ascending: false
        }).limit(1)
      ]);
      const pending = pendingRes.count || 0;
      const lastEventAt = lastRes.data && lastRes.data[0]?.created_at || null;
      const lastAcceptedAt = lastAccRes.data && lastAccRes.data[0]?.created_at || null;
      const lastRejectedAt = lastRejRes.data && lastRejRes.data[0]?.created_at || null;
      return new Response(JSON.stringify({
        ok: true,
        pending,
        lastEventAt,
        lastAcceptedAt,
        lastRejectedAt
      }), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Secure proxy: per-invoice VeriFactu metadata (requires caller to have RLS access to the invoice)
    if (body && body.action === 'meta' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      const access = await requireInvoiceAccess(invoice_id);
      if (access.error) {
        const status = access.status || 401;
        return new Response(JSON.stringify({
          ok: false,
          error: access.error
        }), {
          status,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }
      const { data: meta, error: metaErr } = await admin.schema('verifactu').from('invoice_meta').select('*').eq('invoice_id', invoice_id).maybeSingle();
      if (metaErr) return new Response(JSON.stringify({
        ok: false,
        error: metaErr.message
      }), {
        status: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
      return new Response(JSON.stringify({
        ok: true,
        meta
      }), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Secure proxy: per-invoice VeriFactu events (requires caller to have RLS access to the invoice)
    if (body && body.action === 'events' && body.invoice_id) {
      const invoice_id = String(body.invoice_id);
      const limit = Number(body.limit || 5);
      const access = await requireInvoiceAccess(invoice_id);
      if (access.error) {
        const status = access.status || 401;
        return new Response(JSON.stringify({
          ok: false,
          error: access.error
        }), {
          status,
          headers: {
            ...headers,
            'Content-Type': 'application/json'
          }
        });
      }
      const { data: events, error: evErr } = await admin.schema('verifactu').from('events').select('*').eq('invoice_id', invoice_id).order('created_at', {
        ascending: false
      }).limit(limit);
      if (evErr) return new Response(JSON.stringify({
        ok: false,
        error: evErr.message
      }), {
        status: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
      return new Response(JSON.stringify({
        ok: true,
        events: events || []
      }), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Diagnostic: verify access to verifactu schema objects & sample data
    if (body && body.action === 'diag') {
      const out = {
        ok: true
      };
      // Test events table
      const evTest = await admin.schema('verifactu').from('events').select('id,status,created_at').order('created_at', {
        ascending: false
      }).limit(3);
      out.events_ok = !evTest.error;
      out.events_error = evTest.error?.message || null;
      out.events_sample = evTest.data || [];
      // Test invoice_meta table
      const metaTest = await admin.schema('verifactu').from('invoice_meta').select('invoice_id,status,updated_at').order('updated_at', {
        ascending: false
      }).limit(3);
      out.meta_ok = !metaTest.error;
      out.meta_error = metaTest.error?.message || null;
      out.meta_sample = metaTest.data || [];
      // Count pending events (head query)
      const pendingHead = await admin.schema('verifactu').from('events').select('id', {
        count: 'exact',
        head: true
      }).eq('status', 'pending');
      out.pending_count = pendingHead.count ?? 0;
      out.pending_error = pendingHead.error?.message || null;
      // Return current mode & fallback info
      out.mode = VERIFACTU_MODE;
      out.fallbackEnabled = ENABLE_FALLBACK;
      out.maxAttempts = MAX_ATTEMPTS;
      out.backoffMinutes = BACKOFF_MIN;
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
    }
    // Pull a batch of pending events
    const { data: events, error } = await admin.schema('verifactu').from('events').select('*').eq('status', 'pending').order('created_at', {
      ascending: true
    }).limit(100);
    if (error) return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 400,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
    const due = (events || []).filter(isDue);
    const results = [];
    for (const ev of due){
      try {
        results.push(await processEvent(admin, ev));
      } catch (e) {
        // hard failure: mark for retry
        const attempts = (ev.attempts ?? 0) + 1;
        await admin.schema('verifactu').from('events').update({
          status: attempts >= MAX_ATTEMPTS ? 'rejected' : 'pending',
          attempts,
          last_error: e?.message || 'dispatch_error'
        }).eq('id', ev.id);
      }
    }
    return new Response(JSON.stringify({
      ok: true,
      polled: (events || []).length,
      processed: results.length,
      results
    }), {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: e?.message || String(e)
    }), {
      status: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      }
    });
  }
});
