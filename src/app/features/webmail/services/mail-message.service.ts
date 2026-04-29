import { Injectable, signal, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { RuntimeConfigService } from '../../../services/runtime-config.service';
import { MailMessage, MailFolder } from '../../../core/interfaces/webmail.interface';
import { MailFolderService } from './mail-folder.service';

@Injectable({ providedIn: 'root' })
export class MailMessageService {
  private supabase;
  private runtimeConfig = inject(RuntimeConfigService);

  messages = signal<MailMessage[]>([]);
  selectedMessage = signal<MailMessage | null>(null);
  isLoading = signal<boolean>(false);

  constructor(
    private supabaseClient: SupabaseClientService,
    private folderService: MailFolderService
  ) {
    this.supabase = this.supabaseClient.instance;
  }

  async loadMessages(folder: MailFolder, limit = 50, offset = 0): Promise<MailMessage[] | void> {
    const accountId = folder.account_id;
    if (!accountId) return;

    if (offset === 0) this.isLoading.set(true);

    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('id, account_id, folder_id, thread_id, subject, "from", "to", cc, bcc, received_at, is_read, is_starred, is_archived, snippet, metadata')
      .eq('account_id', accountId)
      .eq('folder_id', folder.id)
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) console.error('Error fetching messages:', error);
    if (data) {
      if (offset === 0) {
        this.messages.set(data);
      } else {
        const existing = this.messages();
        const newIds = new Set(existing.map(m => m.id));
        const unique = data.filter(m => !newIds.has(m.id));
        this.messages.set([...existing, ...unique]);
      }
    }

    if (offset === 0) this.isLoading.set(false);
    return data || [];
  }

  async loadMore(folder: MailFolder, limit = 50, offset = 0): Promise<MailMessage[] | void> {
    return this.loadMessages(folder, limit, offset);
  }

  async searchMessages(query: string, accountId: string): Promise<MailMessage[]> {
    if (!query.trim()) return [];

    const safeQuery = query.replace(/[\\%_().,"]/g, '');
    if (!safeQuery.trim()) return [];

    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('id, account_id, folder_id, thread_id, subject, "from", "to", cc, bcc, received_at, is_read, is_starred, is_archived, snippet, metadata')
      .eq('account_id', accountId)
      .or(`subject.ilike.%${safeQuery}%,snippet.ilike.%${safeQuery}%,body_text.ilike.%${safeQuery}%`)
      .limit(20);

    if (error) {
      console.error('Error searching messages:', error);
      return [];
    }
    return data || [];
  }

  async getThreadMessages(threadId: string): Promise<MailMessage[]> {
    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('*, attachments:mail_attachments(*)')
      .eq('thread_id', threadId)
      .order('received_at', { ascending: true });

    if (error) {
      console.error('Error fetching thread messages:', error);
      return [];
    }
    return data || [];
  }

  /** Fetch messages from multiple threads recursively, bypassing RLS via edge function */
  async getThreadMessagesLinked(threadIds: string[]): Promise<MailMessage[]> {
    if (!threadIds || threadIds.length === 0) return [];

    const baseUrl = this.runtimeConfig.get().supabase.url;
    const session = await this.supabaseClient.instance.auth.getSession();
    const token = session.data.session?.access_token;

    const visited = new Set<string>();
    const result: MailMessage[] = [];

    async function fetchOne(tid: string): Promise<void> {
      if (visited.has(tid)) return;
      visited.add(tid);

      const resp = await fetch(`${baseUrl}/functions/v1/get-thread-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ threadIds: [tid] }),
      });

      if (!resp.ok) { console.error('fetch thread failed:', resp.status); return; }
      const data = await resp.json();
      const msgs: MailMessage[] = data.messages || [];

      for (const m of msgs) {
        if (!result.find(r => r.id === m.id)) result.push(m);
        const linked = m.metadata?.reply_to_thread_id;
        if (linked && linked !== tid && !visited.has(linked)) {
          await fetchOne(linked);
        }
      }
    }

    for (const id of threadIds) await fetchOne(id);

    // Sort chronologically (newest first)
    result.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    return result;
  }

  async getMessage(id: string): Promise<MailMessage | null> {
    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('*, attachments:mail_attachments(*)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching message:', error);
      return null;
    }
    if (data) this.selectedMessage.set(data);
    return data;
  }

  clearSelection(): void {
    this.selectedMessage.set(null);
  }

  markLocallyAsRead(ids: string[], isRead = true): void {
    const idSet = new Set(ids);
    this.messages.update(msgs =>
      msgs.map(m => idSet.has(m.id) ? { ...m, is_read: isRead } : m)
    );
    const sel = this.selectedMessage();
    if (sel && idSet.has(sel.id)) {
      this.selectedMessage.set({ ...sel, is_read: isRead });
    }
  }
}
