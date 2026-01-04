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
  // Placeholder for sending
  async sendMessage(message: Partial<MailMessage>, account?: any) {
    if (!account) throw new Error('Account required to send email');

    const payload = {
      accountId: account.id,
      fromName: account.sender_name,
      fromEmail: account.email,
      to: message.to,
      subject: message.subject,
      body: message.body_text,
      html_body: message.body_html
    };

    console.log('📧 Sending email payload:', payload);

    const { data, error } = await this.supabase.functions.invoke('send-email', {
      body: payload
    });

    if (error) {
      console.error('📧 Error invoking send-email:', error);
      try {
        // Try to parse the error response body if available
        if (error instanceof Error && 'context' in error) {
          const context = (error as any).context;
          if (context && typeof context.json === 'function') {
            const errorBody = await context.json();
            if (errorBody && errorBody.error) {
              throw new Error(errorBody.error);
            }
          }
        }
      } catch (parseError) {
        // Ignore parsing error, throw original
      }
      throw error;
    }
    return data;
  }
}
