// @ts-nocheck
// =====================================================
// Edge Function: delete-retention-record
// =====================================================
// Safely deletes an expired record after server-side verification.
// Parameters: { table_name: string, record_id: string }
// Security: Server-side expiry check (don't trust client)
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS configuration
const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };

  if (origin) {
    if (ALLOW_ALL_ORIGINS) {
      headers["Access-Control-Allow-Origin"] = origin;
    } else if (ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
  }

  return headers;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  return ALLOW_ALL_ORIGINS || ALLOWED_ORIGINS.includes(origin);
}

// Helper: Parse UUID from various formats
function parseRecordId(input: string): string {
  // If already a valid UUID, return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    return input;
  }
  // If it's a shortened format like "#a1b2c3", we need to look it up
  // For now, assume it's already a full UUID (the frontend passes full UUID)
  return input;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Parse request body
    let body: any;
    const contentType = req.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      // Fallback: parse form data or query params
      const url = new URL(req.url);
      body = {
        table_name: url.searchParams.get("table_name"),
        record_id: url.searchParams.get("record_id"),
      };
    }

    const { table_name, record_id } = body;

    if (!table_name || !record_id) {
      return new Response(JSON.stringify({ error: "Missing required parameters: table_name, record_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Validate table_name against allowed tables
    const allowedTables = [
      'clients', 'invoices', 'quotes', 'bookings', 
      'booking_clinical_notes', 'client_clinical_notes', 
      'booking_documents', 'gdpr_consent_records', 'audit_logs'
    ];
    
    if (!allowedTables.includes(table_name)) {
      // Log unauthorized attempt
      await supabaseAdmin.from('audit_logs').insert({
        action_type: 'retention_delete_unauthorized',
        table_name: table_name,
        record_id: record_id,
        purpose: `Unauthorized table: ${table_name}`,
        created_at: new Date().toISOString(),
      });
      
      return new Response(JSON.stringify({ error: "Invalid table name" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get retention policy for this table
    const { data: policy, error: policyError } = await supabaseAdmin
      .from("retention_policies")
      .select("*")
      .eq("table_name", table_name)
      .eq("is_active", true)
      .single();

    if (policyError || !policy) {
      // No policy means no retention protection - allow deletion
      console.log(`[delete-retention-record] No retention policy for table: ${table_name}`);
    }

    // Step 1: Verify record exists
    const { data: record, error: fetchError } = await supabaseAdmin
      .from(table_name)
      .select("*")
      .eq("id", record_id)
      .single();

    if (fetchError || !record) {
      // Log failed attempt
      await supabaseAdmin.from('audit_logs').insert({
        action_type: 'retention_delete_not_found',
        table_name: table_name,
        record_id: record_id,
        purpose: `Record not found for deletion`,
        created_at: new Date().toISOString(),
      });
      
      return new Response(JSON.stringify({ success: false, error: "Record not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Step 2: Server-side check - verify record is actually expired
    if (policy) {
      const createdAtCol = policy.created_at_column || 'created_at';
      const recordCreatedAt = record[createdAtCol];
      
      if (recordCreatedAt) {
        const createdDate = new Date(recordCreatedAt);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);
        
        // If record is within retention period, BLOCK deletion
        if (createdDate > cutoffDate) {
          // Log blocked attempt
          await supabaseAdmin.from('audit_logs').insert({
            action_type: 'retention_delete_blocked',
            table_name: table_name,
            record_id: record_id,
            purpose: `Blocked: record protected by ${policy.legal_basis}`,
            old_values: {
              created_at: recordCreatedAt,
              retention_days: policy.retention_days,
              legal_basis: policy.legal_basis,
            },
            created_at: new Date().toISOString(),
          });
          
          return new Response(JSON.stringify({ 
            success: false, 
            error: "No se pudo eliminar: datos protegidos por requisito legal",
            legal_basis: policy.legal_basis,
            retention_days: policy.retention_days,
          }), {
            status: 403,
            headers: corsHeaders,
          });
        }
      }
    }

    // Step 3: Record is expired - proceed with deletion
    const { error: deleteError } = await supabaseAdmin
      .from(table_name)
      .delete()
      .eq("id", record_id);

    if (deleteError) {
      // Log failed deletion
      await supabaseAdmin.from('audit_logs').insert({
        action_type: 'retention_delete_failed',
        table_name: table_name,
        record_id: record_id,
        purpose: `Deletion failed: ${deleteError.message}`,
        created_at: new Date().toISOString(),
      });
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Failed to delete record",
        details: deleteError.message,
      }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // Step 4: Log successful deletion
    await supabaseAdmin.from('audit_logs').insert({
      action_type: 'retention_delete_success',
      table_name: table_name,
      record_id: record_id,
      purpose: `Successfully deleted expired record`,
      old_values: {
        created_at: record[policy?.created_at_column || 'created_at'],
      },
      created_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Record deleted successfully",
      deleted_id: record_id,
    }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: any) {
    console.error("[delete-retention-record] Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});