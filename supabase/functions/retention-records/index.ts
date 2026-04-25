// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CATEGORY_CONFIG: Record<string, { table: string; idCol: string; createdAtCol: string; linkTable?: string; linkCol?: string; linkNameCol?: string; entityType: string }> = {
  customers: { table: 'clients', idCol: 'id', createdAtCol: 'created_at', entityType: 'Cliente' },
  invoices: { table: 'invoices', idCol: 'id', createdAtCol: 'created_at', linkTable: 'clients', linkCol: 'client_id', linkNameCol: 'name', entityType: 'Factura' },
  quotes: { table: 'quotes', idCol: 'id', createdAtCol: 'created_at', linkTable: 'clients', linkCol: 'client_id', linkNameCol: 'name', entityType: 'Presupuesto' },
  bookings: { table: 'bookings', idCol: 'id', createdAtCol: 'created_at', linkTable: 'clients', linkCol: 'customer_email', linkNameCol: 'name', entityType: 'Cita' },
  clinical_notes: { table: 'booking_clinical_notes', idCol: 'id', createdAtCol: 'created_at', linkTable: 'bookings', linkCol: 'booking_id', linkNameCol: 'id', entityType: 'Nota clínica' },
  client_notes: { table: 'client_clinical_notes', idCol: 'id', createdAtCol: 'created_at', linkTable: 'clients', linkCol: 'client_id', linkNameCol: 'name', entityType: 'Nota clínica' },
  documents: { table: 'booking_documents', idCol: 'id', createdAtCol: 'created_at', linkTable: 'bookings', linkCol: 'booking_id', linkNameCol: 'id', entityType: 'Documento' },
  consents: { table: 'gdpr_consent_records', idCol: 'id', createdAtCol: 'created_at', linkTable: 'clients', linkCol: 'subject_id', linkNameCol: 'name', entityType: 'Consentimiento' },
  audit_logs: { table: 'audit_logs', idCol: 'id', createdAtCol: 'created_at', entityType: 'Log' },
};

function getCorsHeaders(origin: string | null): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Origin": origin || "*",
  };
}

function anonymizeName(name: string | null): string {
  if (!name) return 'Unknown';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0) + '.';
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

function shortenId(id: string): string {
  return '#' + id.replace(/-/g, '').substring(0, 6);
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const url = new URL(req.url);
    let category = url.searchParams.get("category");
    let filter = url.searchParams.get("filter") || "all";
    let page = parseInt(url.searchParams.get("page") || "1", 10);
    let limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100);

    if (req.method === "POST" && !category) {
      try {
        const body = await req.json();
        category = body.category;
        filter = body.filter || "all";
        page = parseInt(body.page || "1", 10);
        limit = Math.min(parseInt(body.limit || "50", 10), 100);
      } catch (e) {}
    }

    if (!category) return new Response(JSON.stringify({ error: "Missing required parameter: category" }), { status: 400, headers: corsHeaders });

    const { data: policy } = await supabaseAdmin.from("retention_policies").select("*").eq("category", category).eq("is_active", true).single();
    if (!policy) return new Response(JSON.stringify({ error: "Invalid or unknown category" }), { status: 400, headers: corsHeaders });

    const config = CATEGORY_CONFIG[category];
    if (!config) return new Response(JSON.stringify({ error: "Category configuration not found" }), { status: 500, headers: corsHeaders });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);

    let query = supabaseAdmin.from(config.table).select("*", { count: "exact" });
    if (filter === "protected") query = query.gt(config.createdAtCol, cutoffDate.toISOString());
    else if (filter === "expired") query = query.lt(config.createdAtCol, cutoffDate.toISOString());

    const offset = (page - 1) * limit;
    const { data: records, count } = await query.order(config.createdAtCol, { ascending: false }).range(offset, offset + limit - 1);

    const transformedRecords = (records || []).map((record: any) => {
      const createdAt = new Date(record[config.createdAtCol]);
      const ageDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const expiresAt = new Date(createdAt.getTime() + policy.retention_days * 24 * 60 * 60 * 1000);
      const isProtected = createdAt > cutoffDate;
      return {
        id: shortenId(record[config.idCol]),
        uuid: record[config.idCol],
        created_at: createdAt.toISOString(),
        age_days: ageDays,
        expires_at: expiresAt.toISOString(),
        status: isProtected ? 'protected' : 'expired',
        linked_entity: config.entityType + ' ' + shortenId(record[config.idCol]),
      };
    });

    return new Response(JSON.stringify({ records: transformedRecords, total: count || 0, page, limit }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: corsHeaders });
  }
});