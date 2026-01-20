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
    if (!messageIds.length) return;

    // 1. Get info about the first message to determine context (Account/Folder)
    const { data: messages, error: msgError } = await this.supabase
      .from('mail_messages')
      .select('account_id, folder_id')
      .in('id', messageIds)
      .limit(1);

    if (msgError) throw msgError;
    if (!messages || messages.length === 0) return;

    const accountId = messages[0].account_id;
    const currentFolderId = messages[0].folder_id;

    // 2. Find Trash folder for this account
    const { data: trashFolder, error: trashError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'trash')
      .single();

    if (trashError) {
      // If no trash folder found (rare), fall back to hard delete
      console.warn('Trash folder not found, performing hard delete.');
      const { error } = await this.supabase.from('mail_messages').delete().in('id', messageIds);
      if (error) throw error;
      return;
    }

    // 3. Logic: If already in trash, Hard Delete. Else, Move to Trash.
    if (currentFolderId === trashFolder.id) {
      // Hard Delete
      const { error } = await this.supabase
        .from('mail_messages')
        .delete()
        .in('id', messageIds);
      if (error) throw error;
    } else {
      // Soft Delete (Move to Trash)
      const { error } = await this.supabase
        .from('mail_messages')
        .update({ folder_id: trashFolder.id })
        .in('id', messageIds);
      if (error) throw error;
    }
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
