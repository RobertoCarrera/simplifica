// @ts-nocheck
// =====================================================
// Edge Function: retention-summary
// =====================================================
// Returns aggregated retention summary per category.
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS configuration
const ALLOW_ALL_ORIGINS = Deno.env.get("ALLOW_ALL_ORIGINS") === "true";
const ALLOWED_ORIGINS = Deno.env.get("ALLOWED_ORIGINS")?.split(",") || [];

function getCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
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

    // Get retention policies from DB
    const { data: policies, error: policiesError } = await supabaseAdmin
      .from("retention_policies")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true });

    if (policiesError) {
      console.error("[retention-summary] Error fetching policies:", policiesError.message);
      return new Response(JSON.stringify({ error: "Failed to load retention policies" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // For each policy, calculate counts
    const summary = await Promise.all(
      (policies || []).map(async (policy) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);
        const cutoffISO = cutoffDate.toISOString();

        // Total count
        const { count: total } = await supabaseAdmin
          .from(policy.table_name)
          .select("*", { count: "exact", head: true });

        // Protected count (created_at > cutoff = within retention period)
        const { count: protectedCount } = await supabaseAdmin
          .from(policy.table_name)
          .select("*", { count: "exact", head: true })
          .gt(policy.created_at_column, cutoffISO);

        // Expired count = total - protected
        const expiredCount = (total || 0) - (protectedCount || 0);

        return {
          category: policy.category,
          table_name: policy.table_name,
          retention_days: policy.retention_days,
          legal_basis: policy.legal_basis,
          description: policy.description,
          total: total || 0,
          protected_count: protectedCount || 0,
          expired_count: Math.max(0, expiredCount),
        };
      })
    );

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: any) {
    console.error("[retention-summary] Unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});