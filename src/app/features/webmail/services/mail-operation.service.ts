import { Injectable } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailMessage } from '../../../core/interfaces/webmail.interface';

@Injectable({
  providedIn: 'root'
})
export class MailOperationService {
  private supabase;

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  async moveMessages(messageIds: string[], targetFolderId: string) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ folder_id: targetFolderId })
      .in('id', messageIds);

    if (error) throw error;
  }

  async deleteMessages(messageIds: string[]) {
    // Soft delete: Move to trash? Or hard delete?
    // Usually move to trash first. Assuming 'trash' logic is handled by UI calling moveMessages to Trash folder.
    // Here implies hard delete or specific flag.
    const { error } = await this.supabase
      .from('mail_messages')
      .delete()
      .in('id', messageIds);

    if (error) throw error;
  }

  async markAsRead(messageIds: string[], isRead: boolean = true) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ is_read: isRead })
      .in('id', messageIds);

    if (error) throw error;
  }

  async toggleStar(messageId: string, currentStatus: boolean) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ is_starred: !currentStatus })
      .eq('id', messageId);

    if (error) throw error;
  }

  // Placeholder for sending
  async sendMessage(message: Partial<MailMessage>) {
    // This would call an Edge Function 'send-email'
    console.log('Sending message via SES...', message);
    // const { error } = await this.supabase.functions.invoke('send-email', { body: message });
    // if (error) throw error;
  }
}
