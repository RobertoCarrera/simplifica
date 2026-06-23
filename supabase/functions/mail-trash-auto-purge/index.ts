/**
 * Edge Function: mail-trash-auto-purge
 *
 * Scheduled (daily via pg_cron): permanently deletes email messages that have
 * been sitting in the Trash folder for more than 60 days.
 *
 * Security: service_role required (internal cron endpoint).
 * Idempotent: safe to run multiple times.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSecurityHeaders } from '../_shared/security.ts';


const TRASH_RETENTION_DAYS = 60;

serve(async (req: Request) => {
  // Internal auth: accept apikey header (cron v2) OR Bearer service_role (legacy)
  const apikeyHeader = req.headers.get('apikey') ?? '';
  const authHeader   = req.headers.get('Authorization') ?? '';
  const bearerToken  = (authHeader.match(/^Bearer\s+(.+)$/i) || [])[1] ?? '';

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const VALID_KEYS = new Set<string>([serviceRoleKey]);
  for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')     ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);
  for (const v of Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))) if (typeof v === 'string') VALID_KEYS.add(v);

  const authed = (apikeyHeader && VALID_KEYS.has(apikeyHeader)) || bearerToken === serviceRoleKey;
  if (!authed) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

  // 1. Find all Trash folders
  const { data: trashFolders, error: folderError } = await supabase
    .from('mail_folders')
    .select('id, account_id')
    .eq('system_role', 'trash');

  if (folderError) {
    console.error('Error fetching trash folders:', folderError);
    return new Response(JSON.stringify({ error: folderError.message }), {
      status: 500,
      headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  if (!trashFolders || trashFolders.length === 0) {
    return new Response(JSON.stringify({ purged: 0, message: 'No trash folders found' }), {
      status: 200,
      headers: withSecurityHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  const trashFolderIds = trashFolders.map((f) => f.id);
  let totalPurged = 0;

  // 2. Delete messages in trash folders older than cutoff
  for (const folderId of trashFolderIds) {
    // First, get the count for logging
    const { count } = await supabase
      .from('mail_messages')
      .select('id', { count: 'exact', head: true })
      .eq('folder_id', folderId)
      .lt('updated_at', cutoff.toISOString());

    if (count && count > 0) {
      const { error: deleteError } = await supabase
        .from('mail_messages')
        .delete()
        .eq('folder_id', folderId)
        .lt('updated_at', cutoff.toISOString());

      if (deleteError) {
        console.error(`Error purging trash folder ${folderId}:`, deleteError);
      } else {
        console.log(`Purged ${count} messages from trash folder ${folderId}`);
        totalPurged += count;
      }
    }
  }

  return new Response(
    JSON.stringify({
      purged: totalPurged,
      trash_folders_checked: trashFolders.length,
      cutoff: cutoff.toISOString(),
    }),
    { status: 200, headers: withSecurityHeaders({ 'Content-Type': 'application/json' }) }
  );
});
