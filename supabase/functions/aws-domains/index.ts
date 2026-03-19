import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import { Route53DomainsClient, ListDomainsCommand } from "npm:@aws-sdk/client-route-53-domains";
import { Route53Client, ListHostedZonesCommand } from "npm:@aws-sdk/client-route-53";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { checkRateLimit, getRateLimitHeaders } from "../_shared/rate-limiter.ts";
import { getClientIP } from "../_shared/security.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const optionsResponse = handleCorsOptions(req);
  if (optionsResponse) return optionsResponse;

  // Rate limiting: 30 req/min per IP (admin-only AWS operations)
  const ip = getClientIP(req);
  const rl = checkRateLimit(`aws-domains:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', ...getRateLimitHeaders(rl) },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify JWT via Supabase Auth (signature-verified, not manual decode)
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseService = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userId = user.id;
    const { data: isSuperAdmin, error: rpcError } = await supabaseService
      .rpc('is_super_admin_by_id', { p_user_id: userId });
    if (rpcError) {
      console.error('[aws-domains] RPC error:', rpcError.message);
    }
    console.log(`[aws-domains] user=${userId} isSuperAdmin=${isSuperAdmin}`);

    if (!isSuperAdmin) {
      return new Response(JSON.stringify({
        domains: [],
        message: 'Acceso restringido a Super Administradores.'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. AWS credentials
    const ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID')?.trim();
    const SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY')?.trim();

    if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
      throw new Error('AWS Credentials missing');
    }

    const creds = { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY };
    const REGION = 'us-east-1';

    // 4. Fetch Registered Domains
    let registeredDomains: any[] = [];
    try {
      const domainsClient = new Route53DomainsClient({ region: REGION, credentials: creds });
      const domainsData = await domainsClient.send(new ListDomainsCommand({ MaxItems: 100 }));
      registeredDomains = domainsData.Domains || [];
      console.log(`[aws-domains] Found ${registeredDomains.length} registered domains.`);
    } catch (err: any) {
      console.warn(`[aws-domains] Skip ListDomains: ${err.message}`);
    }

    // 5. Fetch Hosted Zones
    let hostedZones: any[] = [];
    try {
      const r53Client = new Route53Client({ region: REGION, credentials: creds });
      const zonesData = await r53Client.send(new ListHostedZonesCommand({ MaxItems: 100 }));
      hostedZones = zonesData.HostedZones || [];
      console.log(`[aws-domains] Found ${hostedZones.length} hosted zones.`);
    } catch (err: any) {
      console.warn(`[aws-domains] Skip ListHostedZones: ${err.message}`);
    }

    // 6. Merge
    const domainNames = new Set<string>();
    registeredDomains.forEach((d) => { if (d.DomainName) domainNames.add(d.DomainName.toLowerCase()); });
    hostedZones.forEach((z) => {
      if (z.Name) {
        let name = z.Name.toLowerCase();
        if (name.endsWith('.')) name = name.slice(0, -1);
        domainNames.add(name);
      }
    });

    const domains = Array.from(domainNames).map((name) => ({ DomainName: name, Source: 'aws' }));

    return new Response(JSON.stringify({ domains }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error(`[aws-domains] Fatal Error:`, error.message);
    return new Response(JSON.stringify({ error: 'AWS_API_ERROR', message: 'Failed to fetch domains' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
