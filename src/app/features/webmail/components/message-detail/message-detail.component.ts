import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common'; // Import Location
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailMessage } from '../../../../core/interfaces/webmail.interface';
import { MailOperationService } from '../../services/mail-operation.service';
import { SafeHtmlPipe } from '../../../../core/pipes/safe-html.pipe';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, SafeHtmlPipe],
  templateUrl: './message-detail.component.html',
  styleUrl: './message-detail.component.scss'
})
export class MessageDetailComponent implements OnInit {
  public store = inject(MailStoreService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private operations = inject(MailOperationService);

  // State for Thread
  threadMessages = signal<MailMessage[]>([]);
  loadingThread = signal(false);

  // Computed: Get the LATEST message for the main display logic (subject, etc)
  latestMessage = computed(() => {
    const thread = this.threadMessages();
    return thread.length > 0 ? thread[thread.length - 1] : null;
  });

  // Replaces 'message' signal
  message = this.latestMessage;

  // Inline Reply State
  showReplyBox = signal(false);
  replyContent = '';
  isSending = signal(false);

  // Quoted Text State
  showQuotedText = signal(false);

  // Processed Body (Signal or Method) - Now handles specific message
  getBodyParts(msg: MailMessage) {
    if (!msg) return { main: '', quoted: '' };

    const body = msg.body_html || msg.body_text || '';

    // Logic for separating quoted text...
    // Reuse existing regex logic
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

  // Helper alias for template if needed
  get bodyParts() {
    // Fallback for single message view compatibility if we used property access
    return this.getBodyParts(this.message()!);
  }

  getSenderName(from: any): string {
    if (!from) return '';
    const text = from.name || from.email || '';
    return text.replace(/["<>]/g, '').trim();
  }

  isMe(from: any): boolean {
    const account = this.store.currentAccount();
    if (!account || !from || !from.email) return false;
    return from.email.toLowerCase() === account.email.toLowerCase();
  }

  getSenderInitial(from: any): string {
    const name = this.getSenderName(from);
    return name.charAt(0).toUpperCase();
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('threadId');
      if (id) {
        this.loadThread(id);
      }
    });
  }

  async loadThread(threadId: string) {
    this.loadingThread.set(true);
    try {
      // If we navigated via "Thread ID", we fetch all messages with that thread_id
      // Note: If the route pass MESSAGE ID, we might need to resolve thread_id first.
      // BUT: Our router link passes `msg.id` as `threadId` path param currently in MessageList.
      // Wait. `MessageList` passes `msg.id`.
      // If the item in MessageList is a THREAD, it passes `thread.thread_id`.
      // If it was a message, it passed message id.
      // The new MessageList passes `thread.thread_id`.
      // So `id` here is indeed a THREAD ID.

      const messages = await this.operations.getThreadMessages(threadId);
      this.threadMessages.set(messages);
      this.showQuotedText.set(false);

      // Scroll to bottom
      setTimeout(() => {
        const container = document.querySelector('.detail-container'); // Need to target scroll container
        if (container) container.scrollTop = container.scrollHeight;
      }, 100);

    } catch (e) {
      console.error('Error loading thread', e);
    } finally {
      this.loadingThread.set(false);
    }
  }

  goBack() {
    this.location.back();
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
    const msg = this.message();
    if (!msg || !this.replyContent.trim()) return;

    this.isSending.set(true);
    try {
      const account = this.store.currentAccount();
      if (!account) throw new Error('No account context');

      let subject = msg.subject || '';
      if (!subject.toLowerCase().startsWith('re:')) {
        subject = 'Re: ' + subject;
      }

      const toAddress = msg.from && msg.from.email ? [{ name: msg.from.name || '', email: msg.from.email }] : [];

      await this.operations.sendMessage({
        to: toAddress,
        subject: subject,
        body_text: this.replyContent,
        thread_id: msg.thread_id
      }, account);

      // Success
      alert('Respuesta enviada');
      this.discardReply();
      // TODO: Refresh thread messages if we showed them
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Error al enviar respuesta');
    } finally {
      this.isSending.set(false);
    }
  }

  async delete() {
    if (!confirm('¿Estás seguro de que quieres eliminar este correo?')) return;

    const msg = this.message();
    if (msg) {
      try {
        await this.operations.deleteMessages([msg.id]);
        // Optimistic UI or wait for store update?
        // Store should update if it listens to real changes, or we might need to refresh folder.
        // For now, just go back.
        this.location.back();
      } catch (error) {
        console.error('Error deleting message:', error);
        alert('Error al eliminar el mensaje.');
      }
    }
  }
}
