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

  async uploadAttachment(file: File): Promise<{ path: string, url: string }> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}_${Date.now()}.${fileExt}`;
    const filePath = `attachments/${fileName}`;

    const { error } = await this.supabase.storage
      .from('mail_attachments')
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = this.supabase.storage
      .from('mail_attachments')
      .getPublicUrl(filePath);

    return { path: filePath, url: publicUrl };
  }

  async saveDraft(draft: Partial<MailMessage>, accountId: string): Promise<MailMessage> {
    const { data: draftsFolder, error: folderError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'drafts')
      .single();
    
    if (folderError) throw folderError;

    const payload: any = {
      account_id: accountId,
      folder_id: draftsFolder.id,
      subject: draft.subject,
      body_text: draft.body_text,
      body_html: draft.body_html,
      to: draft.to || [],
      cc: draft.cc || [],
      bcc: draft.bcc || [],
      is_read: true,
      is_starred: false,
    };

    if (draft.id) {
        payload.id = draft.id;
    }

    const { data, error } = await this.supabase
        .from('mail_messages')
        .upsert(payload)
        .select()
        .single();

    if(error) throw error;
    return data as MailMessage;
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
  async sendMessage(message: Partial<MailMessage>, account?: any) {
    if (!account) throw new Error('Account required to send email');

    const payload = {
      accountId: account.id,
      fromName: account.sender_name,
      fromEmail: account.email,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      body: message.body_text,
      html_body: message.body_html,
      attachments: message.attachments,
      metadata: message.metadata
    };

    console.log('📧 Sending email');

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
