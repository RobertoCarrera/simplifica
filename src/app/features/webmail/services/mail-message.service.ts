import { Injectable, signal } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailMessage, MailFolder } from '../../../core/interfaces/webmail.interface';
import { MailFolderService } from './mail-folder.service';

@Injectable({ providedIn: 'root' })
export class MailMessageService {
  private supabase;

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
    const accountId = this.folderService.currentFolderId();
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
        // Append for pagination
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

    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('id, account_id, folder_id, thread_id, subject, "from", "to", cc, bcc, received_at, is_read, is_starred, is_archived, snippet, metadata')
      .eq('account_id', accountId)
      .or(`subject.ilike.%${query}%,snippet.ilike.%${query}%,body_text.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.error('Error searching messages:', error);
      return [];
    }
    return data || [];
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
}
