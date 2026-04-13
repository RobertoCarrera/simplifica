/**
 * Edge Function: company-email-settings
 * CRUD for company email settings (which account handles which email type)
 *
 * Endpoints:
 *   GET  /             - List all email settings for the authenticated user's company
 *   PATCH /:emailType  - Update which account handles this email type
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { checkRateLimit, getRateLimitHeaders } from '../_shared/rate-limiter.ts';
import { getClientIP, isValidUUID } from '../_shared/security.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

const EMAIL_TYPES = [
  'booking_confirmation',
  'invoice',
  'quote',
  'consent',
  'invite',
  'waitlist',
  'inactive_notice',
  'generic',
] as const;

type EmailType = typeof EMAIL_TYPES[number];

interface EmailSetting {
  id: string;
  company_id: string;
  email_type: EmailType;
  email_account_id: string | null;
  is_active: boolean;
  fallback_account_id: string | null;
  custom_subject_template: string | null;
  custom_body_template: string | null;
  updated_at: string;
}

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthUser(req: Request, supabaseAdmin: ReturnType<typeof createClient>) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Missing Authorization header');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error('Unauthorized: invalid or expired token');
  return user;
}

async function getUserCompanyRole(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  companyId: string,
): Promise<'owner' | 'admin' | 'member' | null> {
  const { data } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single();
  return data?.role as 'owner' | 'admin' | 'member' | null;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function jsonSuccess(status: number, data: unknown, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as Request), 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, error: string, corsHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...getCorsHeaders({ headers: corsHeaders } as Request), 'Content-Type': 'application/json' },
  });
}

function sanitizeString(value: unknown, maxLength = 10000): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength).trim();
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  // Rate limiting: 30 req/min per IP
  const ip = getClientIP(req);
  const rl = await checkRateLimit(`company-email-settings:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(rl),
      },
    });
  }

  // Service role client for token verification
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ANON client for RLS-protected data access
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  );

  try {
    const user = await getAuthUser(req, supabaseAdmin);
    const userId = user.id;

    // Parse URL path for emailType
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const emailTypeParam = pathParts[pathParts.length - 1];

    const method = req.method;

    // ── GET /company-email-settings ──────────────────────────────────────────
    if (method === 'GET') {
      // Get user's companies
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('company_id')
        .eq('user_id', userId);

      const companyIds = memberData?.map(m => m.company_id) ?? [];
      if (companyIds.length === 0) {
        return jsonSuccess(200, []);
      }

      // Use first company (multi-company users use first)
      const companyId = companyIds[0];

      // Get settings with account details
      const { data: settings, error } = await supabaseClient
        .from('company_email_settings')
        .select(`
          *,
          email_account:email_account_id(id, email, display_name, is_verified, is_active),
          fallback_account:fallback_account_id(id, email, display_name, is_verified, is_active)
        `)
        .eq('company_id', companyId)
        .order('email_type', { ascending: true });

      if (error) throw error;

      // Get available email accounts for reference
      const { data: accounts } = await supabaseClient
        .from('company_email_accounts')
        .select('id, email, display_name, is_verified, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      return jsonSuccess(200, {
        settings: settings ?? [],
        available_accounts: accounts ?? [],
        allowed_email_types: EMAIL_TYPES,
      });
    }

    // ── PATCH /company-email-settings/:emailType ─────────────────────────────
    if (method === 'PATCH' && emailTypeParam) {
      const emailType = emailTypeParam as EmailType;

      // Validate email type
      if (!EMAIL_TYPES.includes(emailType)) {
        return jsonError(400, `Tipo de email inválido. Valores permitidos: ${EMAIL_TYPES.join(', ')}`);
      }

      const body = await req.json();
      const { email_account_id, fallback_account_id, custom_subject_template, custom_body_template, is_active } = body;

      // Get the current setting to find company_id
      const { data: currentSetting } = await supabaseClient
        .from('company_email_settings')
        .select('company_id')
        .eq('email_type', emailType)
        .single();

      // Get user's company
      const { data: memberData } = await supabaseClient
        .from('company_members')
        .select('company_id, role')
        .eq('user_id', userId);

      const companyIds = memberData?.map(m => m.company_id) ?? [];
      if (companyIds.length === 0) {
        return jsonError(403, 'No tienes acceso a ninguna empresa');
      }

      const companyId = companyIds[0];
      const role = memberData?.find(m => m.company_id === companyId)?.role;

      if (role !== 'owner' && role !== 'admin') {
        return jsonError(403, 'Solo owners y admins pueden modificar la configuración de email');
      }

      // If there's no existing setting, create it
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (email_account_id !== undefined) {
        if (email_account_id !== null && !isValidUUID(email_account_id)) {
          return jsonError(400, 'ID de cuenta de email inválido');
        }
        updateData.email_account_id = email_account_id;
      }

      if (fallback_account_id !== undefined) {
        if (fallback_account_id !== null && !isValidUUID(fallback_account_id)) {
          return jsonError(400, 'ID de cuenta fallback inválido');
        }
        updateData.fallback_account_id = fallback_account_id;
      }

      if (custom_subject_template !== undefined) {
        updateData.custom_subject_template = sanitizeString(custom_subject_template, 500);
      }

      if (custom_body_template !== undefined) {
        updateData.custom_body_template = sanitizeString(custom_body_template, 10000);
      }

      if (is_active !== undefined) {
        updateData.is_active = Boolean(is_active);
      }

      // Try to update, if no rows affected create
      const { data: setting, error } = await supabaseClient
        .from('company_email_settings')
        .update(updateData)
        .eq('company_id', companyId)
        .eq('email_type', emailType)
        .select(`
          *,
          email_account:email_account_id(id, email, display_name, is_verified, is_active),
          fallback_account:fallback_account_id(id, email, display_name, is_verified, is_active)
        `)
        .single();

      if (error) throw error;

      // If no setting existed, create it
      if (!setting) {
        const { data: newSetting, error: createError } = await supabaseClient
          .from('company_email_settings')
          .insert({
            company_id: companyId,
            email_type: emailType,
            email_account_id: email_account_id ?? null,
            fallback_account_id: fallback_account_id ?? null,
            custom_subject_template: custom_subject_template ? sanitizeString(custom_subject_template, 500) : null,
            custom_body_template: custom_body_template ? sanitizeString(custom_body_template, 10000) : null,
            is_active: is_active ?? true,
          })
          .select(`
            *,
            email_account:email_account_id(id, email, display_name, is_verified, is_active),
            fallback_account:fallback_account_id(id, email, display_name, is_verified, is_active)
          `)
          .single();

        if (createError) throw createError;
        return jsonSuccess(200, newSetting);
      }

      return jsonSuccess(200, setting);
    }

    return jsonError(404, 'Ruta no encontrada');
  } catch (error: any) {
    console.error('[company-email-settings] Error:', error?.message, error?.stack);
    return jsonError(error.status || 500, error.message || 'Error interno del servidor');
  }
});
