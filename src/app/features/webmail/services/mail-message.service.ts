import { Injectable, signal } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailMessage } from '../../../core/interfaces/webmail.interface';
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

  async loadMessages(folder: MailFolder, limit = 50): Promise<void> {
    const accountId = this.folderService.currentFolderId();
    if (!accountId) return;

    this.isLoading.set(true);
    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('id, account_id, folder_id, thread_id, subject, "from", "to", cc, bcc, received_at, is_read, is_starred, is_archived, snippet, metadata')
      .eq('account_id', accountId)
      .eq('folder_id', folder.id)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) console.error('Error fetching messages:', error);
    if (data) this.messages.set(data);
    this.isLoading.set(false);
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
