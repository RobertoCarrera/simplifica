import { Component, OnInit, inject, signal } from '@angular/core';
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

  message = this.store.selectedMessage;

  // Inline Reply State
  showReplyBox = signal(false);
  replyContent = '';
  isSending = signal(false);

  // Quoted Text State
  showQuotedText = signal(false);

  // Processed Body (Signal or Method)
  get bodyParts() {
    const msg = this.message();
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
        this.store.getMessage(id);
        this.showQuotedText.set(false); // Reset on new message
      }
    });
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
        // thread_id: msg.thread_id // FUTURE: Link to thread
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
