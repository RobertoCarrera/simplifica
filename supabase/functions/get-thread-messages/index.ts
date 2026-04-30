import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, handleCorsOptions } from 'cors';

serve(async (req) => {
  const corsRes = handleCorsOptions(req);
  if (corsRes) return corsRes;

  try {
    const { threadIds } = await req.json();

    if (!threadIds || !Array.isArray(threadIds) || threadIds.length === 0) {
      throw new Error('threadIds is required and must be a non-empty array');
    }

    // Admin client bypasses RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Recursive function to fetch a thread and discover linked threads
    async function fetchThreadRecursively(threadId: string, visited: Set<string>): Promise<any[]> {
      if (visited.has(threadId)) return [];
      visited.add(threadId);

      const { data, error } = await supabaseAdmin
        .from('mail_messages')
        .select('*, attachments:mail_attachments(*)')
        .eq('thread_id', threadId)
        .order('received_at', { ascending: true });

      if (error || !data) return [];

      // For each message, check for reply_to_thread_id and fetch linked threads
      const linkedThreadIds: string[] = [];
      for (const msg of data) {
        const replyToThread = msg.metadata?.reply_to_thread_id;
        if (replyToThread && replyToThread !== threadId && !visited.has(replyToThread)) {
          linkedThreadIds.push(replyToThread);
        }
      }

      // Recursively fetch linked threads
      let linkedMessages: any[] = [];
      for (const linkedId of linkedThreadIds) {
        const messages = await fetchThreadRecursively(linkedId, visited);
        linkedMessages.push(...messages);
      }

      return [...data, ...linkedMessages];
    }

    const allMessages: any[] = [];
    const visited = new Set<string>();

    for (const threadId of threadIds) {
      const messages = await fetchThreadRecursively(threadId, visited);
      allMessages.push(...messages);
    }

    // Sort by received_at ascending (chronological)
    allMessages.sort((a, b) =>
      new Date(a.received_at).getTime() - new Date(b.received_at).getTime()
    );

    // Deduplicate by id
    const seen = new Set<string>();
    const unique = allMessages.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return new Response(JSON.stringify({ messages: unique }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('get-thread-messages error:', error?.message);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});