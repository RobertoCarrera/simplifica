import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailMessage } from '../../../core/interfaces/webmail.interface';
import { validateUploadFile } from '../../../core/utils/upload-validator';
import { MailErrorService } from './mail-error.service';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  path: string;
  url: string;
}

type ProgressCallback = (progress: UploadProgress) => void;

@Injectable({
  providedIn: 'root'
})
export class MailOperationService {
  private supabase;
  private errors = inject(MailErrorService);

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  async moveMessages(messageIds: string[], targetFolderId: string) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ folder_id: targetFolderId })
      .in('id', messageIds);

    if (error) this.errors.throw(error);
  }

  /**
   * Upload attachment with retry logic and optional progress callback.
   * Max 3 retries with exponential backoff (1s, 2s, 4s).
   */
  async uploadAttachment(
    file: File,
    onProgress?: ProgressCallback
  ): Promise<UploadResult> {
    const check = validateUploadFile(file, 25 * 1024 * 1024);
    if (!check.valid) this.errors.throw({ message: check.error } as any);

    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}_${Date.now()}.${fileExt}`;
    const filePath = `attachments/${fileName}`;

    await this.uploadWithRetry(file, filePath, onProgress);

    const { data: { publicUrl } } = this.supabase.storage
      .from('mail_attachments')
      .getPublicUrl(filePath);

    return { path: filePath, url: publicUrl };
  }

  private async uploadWithRetry(
    file: File,
    filePath: string,
    onProgress?: ProgressCallback,
    attempt = 1
  ): Promise<void> {
    const MAX_RETRIES = 3;

    try {
      const uploadPromise = this.supabase.storage
        .from('mail_attachments')
        .upload(filePath, file, {
          onUploadProgress: (progress) => {
            if (onProgress) {
              onProgress({
                loaded: progress.loaded ?? 0,
                total: progress.total ?? file.size,
                percentage: progress.total
                  ? Math.round(((progress.loaded ?? 0) / progress.total) * 100)
                  : 0,
              });
            }
          },
        });

      await uploadPromise;
    } catch (error: any) {
      const isRetryable = this.isRetryableError(error);

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
        await this.sleep(delay);
        return this.uploadWithRetry(file, filePath, onProgress, attempt + 1);
      }

      this.errors.throw(error);
    }
  }

  private isRetryableError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    const status = error.status || error.statusCode;
    return (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('fetch') ||
      status === 408 ||
      status === 429 ||
      status === 503
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveDraft(draft: Partial<MailMessage>, accountId: string): Promise<MailMessage> {
    const { data: draftsFolder, error: folderError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'drafts')
      .single();
    
    if (folderError) this.errors.throw(folderError);

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

    if (draft.id) payload.id = draft.id;

    const { data, error } = await this.supabase
      .from('mail_messages')
      .upsert(payload)
      .select()
      .single();

    if (error) this.errors.throw(error);
    return data as MailMessage;
  }

  async deleteMessages(messageIds: string[]) {
    if (!messageIds.length) return;

    const { data: messages, error: msgError } = await this.supabase
      .from('mail_messages')
      .select('account_id, folder_id')
      .in('id', messageIds)
      .limit(1);

    if (msgError) this.errors.throw(msgError);
    if (!messages || messages.length === 0) return;

    const accountId = messages[0].account_id;
    const currentFolderId = messages[0].folder_id;

    const { data: trashFolder, error: trashError } = await this.supabase
      .from('mail_folders')
      .select('id')
      .eq('account_id', accountId)
      .eq('system_role', 'trash')
      .single();

    if (trashError) {
      console.warn('Trash folder not found, performing hard delete.');
      const { error } = await this.supabase.from('mail_messages').delete().in('id', messageIds);
      if (error) this.errors.throw(error);
      return;
    }

    if (currentFolderId === trashFolder.id) {
      const { error } = await this.supabase.from('mail_messages').delete().in('id', messageIds);
      if (error) this.errors.throw(error);
    } else {
      const { error } = await this.supabase
        .from('mail_messages')
        .update({ folder_id: trashFolder.id })
        .in('id', messageIds);
      if (error) this.errors.throw(error);
    }
  }

  async markAsRead(messageIds: string[], isRead = true) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ is_read: isRead })
      .in('id', messageIds);
    if (error) this.errors.throw(error);
  }

  async toggleStar(messageId: string, currentStatus: boolean) {
    const { error } = await this.supabase
      .from('mail_messages')
      .update({ is_starred: !currentStatus })
      .eq('id', messageId);
    if (error) this.errors.throw(error);
  }

  /**
   * Send email via Edge Function.
   * Throws structured MailError via MailErrorService.
   */
  async sendMessage(message: Partial<MailMessage>, account?: any): Promise<any> {
    if (!account) this.errors.throw({ message: 'Account required to send email' } as any);

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
      metadata: message.metadata,
    };

    const { data, error } = await this.supabase.functions.invoke('send-email', {
      body: payload,
    });

    if (error) this.errors.throw(error);
    return data;
  }
}
