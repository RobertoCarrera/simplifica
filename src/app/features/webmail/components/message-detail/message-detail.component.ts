import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToastService } from '../../../../services/toast.service';
import { MailStoreService } from '../../services/mail-store.service';
import { MailMessage } from '../../../../core/interfaces/webmail.interface';
import { MailOperationService } from '../../services/mail-operation.service';
import { SafeHtmlPipe } from '../../../../core/pipes/safe-html.pipe';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { MailErrorService } from '../../services/mail-error.service';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SafeHtmlPipe, TranslocoPipe],
  templateUrl: './message-detail.component.html',
  styleUrl: './message-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageDetailComponent implements OnInit {
  private toast = inject(ToastService);
  private supabase = inject(SupabaseClientService);
  private errors = inject(MailErrorService);

  public store = inject(MailStoreService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private operations = inject(MailOperationService);

  message = this.store.selectedMessage;
  threadMessages = signal<any[]>([]);

  isSentByMe(msg: any): boolean {
    const account = this.store.currentAccount();
    if (!account || !msg?.from?.email) return false;
    return msg.from.email.toLowerCase() === account.email.toLowerCase();
  }

  // Inline Reply State
  showReplyBox = signal(false);
  replyContent = '';
  isSending = signal(false);

  // Quoted Text State
  showQuotedText = signal<Set<string>>(new Set());

  toggleQuotedText(msgId: string) {
    const current = new Set(this.showQuotedText());
    if (current.has(msgId)) current.delete(msgId);
    else current.add(msgId);
    this.showQuotedText.set(current);
  }

  isQuotedTextShown(msgId: string) {
    return this.showQuotedText().has(msgId);
  }

  get lastMessage() {
    const thread = this.threadMessages();
    return thread.length > 0 ? thread[thread.length - 1] : this.message();
  }

  // Processed Body (Signal or Method)
  getBodyParts(msg: any) {
    if (!msg) return { main: '', quoted: '' };

    const body = msg.body_html || msg.body_text || '';

    // Simple Heuristic for Outlook/Spanish headers
    // Looks for "De: ... Enviado: ... Para: ..." block
    // Or "From: ... Sent: ... To: ..."
    // This is brittle but works for the user's specific case shown in screenshots.
    // Regex explanation:
    // (?:<hr[^>]*>\s*)? -> Optional HR
    // (?:De|From):\s+.* -> "De: Name"
    // (?:<br>\s*|\n\s*) -> Newline
    // (?:Enviado|Sent): -> "Enviado: Date"

    const quoteRegex = /(?:<hr[^>]*>\s*)?(?:<div>\s*)?(?:<b>)?(?:De|From):(?:<\/b>)?\s+.*(?:<br>|\n)\s*(?:<b>)?(?:Enviado|Sent|Date):(?:<\/b>)?/i;

    const match = body.match(quoteRegex);

    if (match && match.index !== undefined && match.index > 0) {
      return {
        main: body.substring(0, match.index),
        quoted: body.substring(match.index)
      };
    }

    return { main: body, quoted: '' };
  }

  getSenderName(from: any): string {
    if (!from) return '(Sin remitente)';
    const text = from.name || from.email || '(Sin remitente)';
    return text.replace(/["<>]/g, '').trim();
  }

  getSenderInitial(from: any): string {
    if (!from || (!from.name && !from.email)) return '?';
    const name = this.getSenderName(from);
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  getFileIcon(mimeType: string): string {
    if (!mimeType) return 'fas fa-file text-gray-400';
    if (mimeType.startsWith('image/')) return 'fas fa-file-image text-blue-500';
    if (mimeType.includes('pdf')) return 'fas fa-file-pdf text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document') || mimeType.includes('officedocument.word'))
      return 'fas fa-file-word text-blue-600';
    if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType.includes('officedocument.spreadsheet'))
      return 'fas fa-file-excel text-green-600';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint') || mimeType.includes('officedocument.presentation'))
      return 'fas fa-file-powerpoint text-orange-500';
    if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed'))
      return 'fas fa-file-archive text-yellow-600';
    if (mimeType.includes('audio')) return 'fas fa-file-audio text-purple-500';
    if (mimeType.includes('video')) return 'fas fa-file-video text-red-600';
    if (mimeType.includes('text/')) return 'fas fa-file-alt text-gray-600';
    return 'fas fa-file text-gray-400';
  }

  getFileColor(mimeType: string): string {
    if (!mimeType) return 'text-gray-400';
    if (mimeType.startsWith('image/')) return 'text-blue-500';
    if (mimeType.includes('pdf')) return 'text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'text-green-600';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-500';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'text-yellow-600';
    return 'text-gray-400';
  }

  ngOnInit() {
    this.route.paramMap.subscribe(async params => {
      const id = params.get('threadId');
      if (id) {
        const msg = await this.store.getMessage(id);
        this.showQuotedText.set(new Set()); // Reset on new message

        if (!msg && id) {
          // ID is a thread_id itself — use the recursive edge function to fetch
          // all linked threads (bypasses RLS)
          const fetched = await this.store.getThreadMessagesLinked([id]);
          this.threadMessages.set(fetched);

          // Mark all unread messages in the thread as read if we are viewing them
          const unreadIds = fetched.filter((m: any) => !m.is_read).map((m: any) => m.id);
          if (unreadIds.length > 0) {
            this.store.markAsRead(unreadIds);
          }
        } else if (msg) {
          if (msg.thread_id) {
            // Check if this message has a reply_to_thread_id (linked thread from cross-account reply)
            const replyToThreadId = msg.metadata?.reply_to_thread_id;

            if (replyToThreadId && replyToThreadId !== msg.thread_id) {
              // Fetch messages from BOTH threads and merge chronologically
              const linkedThreadIds = [msg.thread_id, replyToThreadId];
              console.log('[message-detail] Linked threads detected:', msg.thread_id, '<->', replyToThreadId);
              console.log('[message-detail] Calling getThreadMessagesLinked with:', linkedThreadIds);
              this.threadMessages.set(await this.store.getThreadMessagesLinked(linkedThreadIds));
              const t = this.threadMessages();
              console.log('[message-detail] getThreadMessagesLinked returned', t.length, 'messages:', t.map(m => m.id.slice(0,8) + ':' + m.thread_id?.slice(0,8)));
            } else {
              this.threadMessages.set(await this.store.getThreadMessages(msg.thread_id));
              const t = this.threadMessages();
              console.log('[message-detail] getThreadMessages returned', t.length, 'messages');
            }

            const thread = this.threadMessages();

            // Mark all unread messages in the thread as read if we are viewing them
            const unreadIds = thread.filter((m: any) => !m.is_read).map((m: any) => m.id);
            if (unreadIds.length > 0) {
              this.store.markAsRead(unreadIds);
            }
          } else {
            this.threadMessages.set([msg]);
            if (!msg.is_read) {
              this.store.markAsRead([id]);
            }
          }
        }
      }
    });
  }

  goBack() {
    this.location.back();
  }

  isDraft(): boolean {
    const msg = this.message();
    if (!msg) return false;
    const draftsFolder = this.store.folders().find(f => f.system_role === 'drafts');
    return draftsFolder ? msg.folder_id === draftsFolder.id : false;
  }

  resumeDraft() {
    const msg = this.message();
    if (!msg) return;
    this.router.navigate(['../../composer'], { 
      relativeTo: this.route, 
      queryParams: { draftId: msg.id } 
    });
  }

  reply() {
    // Show inline reply box
    this.showReplyBox.set(true);
    // Optional: Scroll to bottom?
    setTimeout(() => {
      const el = document.getElementById('reply-box');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  discardReply() {
    this.replyContent = '';
    this.showReplyBox.set(false);
  }

  async sendReply() {
    const thread = this.threadMessages();
    const msg = thread.length > 0 ? thread[thread.length - 1] : this.message();
    if (!msg || !this.replyContent.trim()) return;

    this.isSending.set(true);
    try {
      const account = this.store.currentAccount();
      if (!account) throw new Error('No account context');

      let subject = msg.subject || '';
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = 'Re: ' + subject;
      }

      // Include original CC recipients in reply (reply-all behavior)
      const ccRecipients = Array.isArray(msg.cc)
        ? msg.cc.filter((r: any) => r.email && r.email !== account.email)
        : [];

      const replyToEmail = msg.metadata?.reply_to || msg.from?.email;

      await this.operations.sendMessage({
        to: replyToEmail ? [{ name: msg.from?.name || '', email: replyToEmail }] : [],
        cc: ccRecipients,
        subject: subject,
        body_text: this.replyContent,
        thread_id: msg.thread_id
      }, account);

      // Success
      this.toast.success('¡Enviada!', 'Tu respuesta ha sido enviada correctamente.');
      this.discardReply();
      // Reload thread to show new message (handle linked threads too)
      if (msg.thread_id) {
        const linkedIds = msg.metadata?.linked_thread_ids || (msg.metadata?.linked_thread_id ? [msg.metadata.linked_thread_id] : []);
        if (msg.metadata?.reply_to_thread_id && !linkedIds.includes(msg.metadata.reply_to_thread_id)) {
          linkedIds.push(msg.metadata.reply_to_thread_id);
        }
        const allThreadIds = [msg.thread_id, ...linkedIds].filter(tid => tid && tid !== msg.thread_id);
        const uniqueIds = [...new Set(allThreadIds)];

        let updatedThread: any[];
        if (uniqueIds.length > 1) {
          updatedThread = await this.store.getThreadMessagesLinked(uniqueIds);
        } else {
          updatedThread = await this.store.getThreadMessages(msg.thread_id);
        }
        this.threadMessages.set(updatedThread);
      }
    } catch (error) {
      const err = this.errors.parse(error);
      console.error('Error sending reply:', err.message);
      this.toast.error('Error', err.userMessage);
    } finally {
      this.isSending.set(false);
    }
  }

  async delete() {
    const msg = this.message();
    if (!msg) return;

    try {
      await this.operations.deleteMessages([msg.id]);
      this.location.back();
    } catch (error) {
      const err = this.errors.parse(error);
      console.error('Error deleting message:', err.message);
      this.toast.error('Error', err.userMessage);
    }
  }
}
