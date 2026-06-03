/**
 * Edge Function: mail-folders
 *
 * Backend API for mail folder management.
 * Provides CRUD, move, suggest, and smart-folders toggle with transactional integrity.
 *
 * Endpoints:
 *   GET    /folders?account_id=<uuid>     — list folders with counts
 *   POST   /folders                       — create folder
 *   PATCH  /folders/:id                   — rename folder
 *   DELETE /folders/:id                   — delete folder (moves emails to inbox)
 *   POST   /folders/move                  — move messages to folder
 *   POST   /folders/suggest               — suggest folders for an email
 *   POST   /folders/classify              — full classification (engine)
 *   POST   /folders/auto-file             — auto-create folder + move similar
 *   PATCH  /smart-folders                 — toggle smart organization
 *
 * Auth: Bearer JWT required (user token — RLS + SECURITY DEFINER RPCs gate access).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  createDefaultEngine,
  buildEmailFeatures,
  sanitizeFolderName,
  type ClassificationResult,
  type FolderSuggestion,
  type SimilarEmailMatch,
} from './classification-engine.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ── Helpers ──────────────────────────────────────────────────────────────

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function errorResponse(message: string, status = 400, details?: unknown): Response {
  return json({ error: message, details }, status);
}

type FolderError = { message: string; code?: string; details?: string; hint?: string };

function parsePgError(err: unknown): FolderError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as Record<string, unknown>;
    return {
      message: String(e.message || 'Database error'),
      code: String(e.code || ''),
      details: String(e.details || ''),
      hint: String(e.hint || ''),
    };
  }
  return { message: 'Unknown error' };
}

// ── Input validation ─────────────────────────────────────────────────────

function validateUUID(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw { status: 400, message: `Invalid ${field}: must be a valid UUID` };
  }
  return value;
}

function validateFolderName(name: unknown): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw { status: 400, message: 'Folder name is required and cannot be empty' };
  }
  if (name.trim().length > 255) {
    throw { status: 400, message: 'Folder name exceeds 255 characters' };
  }
  if (/[/\\]/.test(name.trim())) {
    throw { status: 400, message: 'Folder name cannot contain path separators (/ or \\)' };
  }
  return name.trim();
}

function validateMessageIds(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw { status: 400, message: 'message_ids must be a non-empty array' };
  }
  if (ids.length > 500) {
    throw { status: 400, message: 'Batch size exceeds 500 messages' };
  }
  return ids.map((id, i) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw { status: 400, message: `message_ids[${i}] is not a valid UUID` };
    }
    return id;
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────

function extractToken(req: Request): string {
  const auth = req.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    throw { status: 401, message: 'Missing or invalid Authorization header' };
  }
  return auth.slice(7);
}

// ── Route helpers ─────────────────────────────────────────────────────────

function extractFolderId(url: URL): string | null {
  // Match /folders/<uuid> or trailing segments
  const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  // segments: ['folders', '<uuid>'] or ['folders', 'move'] etc.
  if (segments.length === 2 && segments[0] === 'folders' && /^[0-9a-f]{8}-/i.test(segments[1])) {
    return segments[1];
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCorsOptions(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const token = extractToken(req);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify token and set user context
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorResponse('Unauthorized — invalid or expired token', 401);
    }

    // The authenticated client (for RLS-gated PostgREST calls)
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // ── Routing ─────────────────────────────────────────────────────────
    const pathParts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');

    // --- GET /folders?account_id=<uuid> ---
    if (method === 'GET' && pathParts[0] === 'folders' && pathParts.length === 1) {
      const accountId = url.searchParams.get('account_id');
      validateUUID(accountId, 'account_id');

      const { data, error } = await client.rpc('get_folder_with_counts', {
        p_account_id: accountId,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 500, parsed);
      }

      return json({ folders: data }, 200, corsHeaders);
    }

    // --- POST /folders ---
    if (method === 'POST' && pathParts[0] === 'folders' && pathParts.length === 1) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const accountId = validateUUID(body.account_id, 'account_id');
      const name = validateFolderName(body.name);
      const parentId = body.parent_id ? validateUUID(body.parent_id, 'parent_id') : null;

      const { data, error } = await client.rpc('create_mail_folder_rpc', {
        p_account_id: accountId,
        p_name: name,
        p_parent_id: parentId,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, error.code === '23505' ? 409 : 400, parsed);
      }

      return json(data, 201, corsHeaders);
    }

    // --- PATCH /folders/:id ---
    const folderId = extractFolderId(url);
    if (method === 'PATCH' && folderId) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const newName = validateFolderName(body.name);

      const { data, error } = await client.rpc('rename_mail_folder_rpc', {
        p_folder_id: folderId,
        p_new_name: newName,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 400, parsed);
      }

      return json(data, 200, corsHeaders);
    }

    // --- DELETE /folders/:id ---
    if (method === 'DELETE' && folderId) {
      const { data, error } = await client.rpc('delete_mail_folder_rpc', {
        p_folder_id: folderId,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 400, parsed);
      }

      return json(data, 200, corsHeaders);
    }

    // --- POST /folders/move ---
    if (method === 'POST' && pathParts[0] === 'folders' && pathParts[1] === 'move') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const messageIds = validateMessageIds(body.message_ids);
      const targetFolderId = validateUUID(body.target_folder_id, 'target_folder_id');

      const { data, error } = await client.rpc('move_mail_messages', {
        p_message_ids: messageIds,
        p_target_folder_id: targetFolderId,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 400, parsed);
      }

      return json(data, 200, corsHeaders);
    }

    // --- POST /folders/suggest ---
    if (method === 'POST' && pathParts[0] === 'folders' && pathParts[1] === 'suggest') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const accountId = validateUUID(body.account_id, 'account_id');
      const senderEmail = typeof body.sender_email === 'string' ? body.sender_email : null;
      const subject = typeof body.subject === 'string' ? body.subject : null;

      const { data, error } = await client.rpc('suggest_folders_rpc', {
        p_account_id: accountId,
        p_sender_email: senderEmail,
        p_subject: subject,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 500, parsed);
      }

      return json({ suggestions: data }, 200, corsHeaders);
    }

    // --- PATCH /smart-folders ---
    if (method === 'PATCH' && pathParts[0] === 'smart-folders') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const accountId = validateUUID(body.account_id, 'account_id');
      if (typeof body.enabled !== 'boolean') {
        return errorResponse('enabled must be a boolean', 400);
      }

      const { data, error } = await client.rpc('toggle_smart_folders_rpc', {
        p_account_id: accountId,
        p_enabled: body.enabled,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 400, parsed);
      }

      return json(data, 200, corsHeaders);
    }

    // --- POST /folders/classify ---
    // Full classification: runs all rules, returns suggestions + similar emails
    if (method === 'POST' && pathParts[0] === 'folders' && pathParts[1] === 'classify') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const accountId = validateUUID(body.account_id, 'account_id');
      const messageId = body.message_id ? validateUUID(body.message_id, 'message_id') : undefined;

      // Fetch the trigger email
      let emailQuery = client.from('mail_messages').select('*').eq('account_id', accountId);
      if (messageId) {
        emailQuery = emailQuery.eq('id', messageId);
      } else if (body.sender_email || body.subject) {
        // Allow classification by sender+subject without a specific message
        const features = buildEmailFeatures({
          from: {
            name: typeof body.sender_name === 'string' ? body.sender_name : undefined,
            email: typeof body.sender_email === 'string' ? body.sender_email : undefined,
          },
          subject: typeof body.subject === 'string' ? body.subject : '',
          is_starred: body.is_starred === true,
          labels: Array.isArray(body.labels) ? body.labels as string[] : undefined,
        });

        // Fetch existing folders
        const { data: folders } = await client.rpc('get_folder_with_counts', {
          p_account_id: accountId,
        });

        const folderCandidates = (folders || [])
          .filter((f: any) => f.type === 'user' && !f.parent_id)
          .map((f: any) => ({ name: f.name, path: f.path }));

        // Fetch candidate emails (from inbox)
        const { data: candidates } = await client
          .from('mail_messages')
          .select('id, from, subject, is_starred')
          .eq('account_id', accountId)
          .neq('id', '00000000-0000-0000-0000-000000000000')
          .limit(200);

        const candidateFeatures = (candidates || []).map((c: any) =>
          buildEmailFeatures(c),
        );

        const engine = createDefaultEngine();
        const result = engine.classify(features, folderCandidates, candidateFeatures);

        // Annotate suggestions with existing folder IDs
        const existingFolderMap = new Map<string, string>();
        for (const f of folders || []) {
          existingFolderMap.set(f.path.toLowerCase(), f.id);
        }
        const annotatedSuggestions = result.suggestions.map((s) => ({
          ...s,
          existingFolderId: existingFolderMap.get(s.folderPath.toLowerCase()) || undefined,
        }));

        return json(
          {
            suggestions: annotatedSuggestions,
            similar_emails: result.similarEmails,
          },
          200,
          corsHeaders,
        );
      } else {
        return errorResponse('Provide message_id or sender_email+subject for classification', 400);
      }

      if (messageId) {
        const { data: message, error: msgError } = await emailQuery.single();
        if (msgError || !message) {
          return errorResponse('Message not found', 404);
        }

        const features = buildEmailFeatures(message);

        // Fetch existing folders
        const { data: folders } = await client.rpc('get_folder_with_counts', {
          p_account_id: accountId,
        });

        const folderCandidates = (folders || [])
          .filter((f: any) => f.type === 'user' && !f.parent_id)
          .map((f: any) => ({ name: f.name, path: f.path }));

        // Fetch candidate emails for similarity (from inbox only)
        const { data: inboxFolder } = await client
          .from('mail_folders')
          .select('id')
          .eq('account_id', accountId)
          .eq('system_role', 'inbox')
          .single();

        let candidateFeatures: ReturnType<typeof buildEmailFeatures>[] = [];
        if (inboxFolder) {
          const { data: candidates } = await client
            .from('mail_messages')
            .select('id, from, subject, is_starred')
            .eq('account_id', accountId)
            .eq('folder_id', inboxFolder.id)
            .neq('id', messageId)
            .limit(200);

          candidateFeatures = (candidates || []).map((c: any) =>
            buildEmailFeatures(c),
          );
        }

        // Run classification
        const engine = createDefaultEngine();
        const result = engine.classify(features, folderCandidates, candidateFeatures);

        // Annotate suggestions with existing folder IDs
        const existingFolderMap = new Map<string, string>();
        for (const f of folders || []) {
          existingFolderMap.set(f.path.toLowerCase(), f.id);
        }
        const annotatedSuggestions = result.suggestions.map((s) => ({
          ...s,
          existingFolderId: existingFolderMap.get(s.folderPath.toLowerCase()) || undefined,
        }));

        return json(
          {
            trigger_email_id: messageId,
            suggestions: annotatedSuggestions,
            similar_emails: result.similarEmails,
          },
          200,
          corsHeaders,
        );
      }
    }

    // --- POST /folders/auto-file ---
    // Auto-file: create folder (if needed) + move trigger email + optionally move similar
    if (method === 'POST' && pathParts[0] === 'folders' && pathParts[1] === 'auto-file') {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400);
      }

      const messageId = validateUUID(body.message_id, 'message_id');
      const folderName = typeof body.folder_name === 'string' && body.folder_name.trim()
        ? sanitizeFolderName(body.folder_name)
        : undefined;
      const moveSimilar = body.move_similar === true;
      const similarThreshold = typeof body.similar_threshold === 'number'
        ? body.similar_threshold
        : 0.5;

      const { data, error } = await client.rpc('auto_file_starred_rpc', {
        p_message_id: messageId,
        p_folder_name: folderName || null,
        p_move_similar: moveSimilar,
        p_similar_threshold: similarThreshold,
      });

      if (error) {
        const parsed = parsePgError(error);
        return errorResponse(parsed.message, 400, parsed);
      }

      return json(data, 200, corsHeaders);
    }

    // ── 404 fallback ─────────────────────────────────────────────────────
    return errorResponse(`Not found: ${method} ${url.pathname}`, 404);

  } catch (err: unknown) {
    // Structured throws from our validators
    if (err && typeof err === 'object' && 'status' in err && 'message' in err) {
      const e = err as { status: number; message: string };
      return errorResponse(e.message, e.status);
    }

    console.error('Unhandled error:', err);
    return errorResponse('Internal server error', 500);
  }
});
