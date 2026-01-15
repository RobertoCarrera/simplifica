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

  async moveThreads(threadIds: string[], targetFolderId: string) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ folder_id: targetFolderId })
      .in('thread_id', threadIds);

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
      html_body: message.body_html,
      attachments: (message as any).attachments, // Pass attachments
      trackingId: (message as any).trackingId, // Pass tracking ID
      threadId: (message as any).thread_id // Pass thread ID
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

  async saveDraft(message: Partial<MailMessage>, accountId: string): Promise<string> {
    // 1. Find Drafts folder
    const { data: draftsFolder, error: folderError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'drafts')
      .single();

    if (folderError || !draftsFolder) throw new Error('Drafts folder not found');

    // 2. Prepare Payload
    const payload: any = {
      account_id: accountId,
      folder_id: draftsFolder.id,
      to: message.to || [],
      subject: message.subject || '',
      body_text: message.body_text || '',
      body_html: message.body_html || '',
      snippet: (message.body_text || '').substring(0, 100),
      is_read: true,
      updated_at: new Date().toISOString()
    };

    // If ID exists, it's an update
    if (message.id) {
      const { data, error } = await this.supabase
        .from('mail_messages')
        .update(payload)
        .eq('id', message.id)
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } else {
      // New Draft
      const { data, error } = await this.supabase
        .from('mail_messages')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data.id;
    }
  }

  // THREADS SUPPORT
  async getThreads(folderName: string, accountId: string, limit = 20, offset = 0) {
    const { data, error } = await this.supabase
      .rpc('f_mail_get_threads', {
        p_account_id: accountId,
        p_folder_name: folderName,
        p_limit: limit,
        p_offset: offset
      });

    if (error) throw error;
    return data || [];
  }

  async getThreadMessages(threadId: string): Promise<MailMessage[]> {
    const { data, error } = await this.supabase
      .rpc('f_mail_get_thread_messages', {
        p_thread_id: threadId
      });

    if (error) throw error;
    return data || [];
  }
  // BULK THREAD OPERATIONS
  async bulkMarkReadThreads(threadIds: string[], isRead: boolean) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ is_read: isRead })
      .in('thread_id', threadIds);

    if (error) throw error;
  }

  async bulkTrashThreads(threadIds: string[], currentFolderSystemRole: string, accountId: string) {
    // 1. Find Trash folder for this account
    const { data: trashFolder, error: trashError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'trash')
      .single();

    if (trashError || !trashFolder) throw new Error('Trash folder not found');

    if (currentFolderSystemRole === 'trash') {
      // HARD DELETE
      // first delete messages
      const { error: msgError } = await this.supabase
        .from('mail_messages')
        .delete()
        .in('thread_id', threadIds);

      if (msgError) throw msgError;

      // then delete threads
      const { error: threadError } = await this.supabase
        .from('mail_threads')
        .delete()
        .in('id', threadIds);

      if (threadError) throw threadError;

    } else {
      // MOVE TO TRASH
      const { error } = await this.supabase
        .from('mail_messages')
        .update({ folder_id: trashFolder.id })
        .in('thread_id', threadIds);

      if (error) throw error;
    }
  }

  async createFolder(name: string, accountId: string, parentId?: string | null): Promise<void> {
    // Generate simple slug for path. In a real app, might want to ensure uniqueness or hierarchy.
    // For now, we assume top level or simple hierarchy.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const path = parentId ? `${parentId}/${slug}` : slug;

    // Should check if path exists or let DB constraints handle it? 
    // We'll trust the UI/DB for now.

    // Check if path is taken by system folder (optional safety)
    if (['inbox', 'sent', 'drafts', 'trash', 'spam'].includes(slug)) {
      throw new Error('El nombre de la carpeta está reservado.');
    }

    const { error } = await this.supabase
      .from('mail_folders')
      .insert({
        account_id: accountId,
        name: name,
        path: path, // Note: This might collide, ideally we'd uniqueify it
        type: 'user',
        parent_id: parentId || null
      });

    if (error) throw error;
  }
}

