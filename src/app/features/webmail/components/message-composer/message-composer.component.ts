import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailStoreService } from '../../services/mail-store.service';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss'
})
export class MessageComposerComponent implements OnInit {
  to = '';
  subject = '';
  body = '';
  draftId: string | null = null;
  savingDraft = false;
  autoSaveTimer: any;

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private operations = inject(MailOperationService);
  private store = inject(MailStoreService);

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      if (params['to']) this.to = params['to'];
      if (params['subject']) this.subject = params['subject'];

      // Load Draft if ID present
      if (params['draftId']) {
        this.draftId = params['draftId'];
        await this.loadDraft(this.draftId!);
      }
    });

    // Auto-save setup (simple interval for now, ideally debounce on change)
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty() && !this.isSending) {
        this.saveDraft(true);
      }
    }, 10000); // Check every 10s
  }

  ngOnDestroy() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
  }

  isDirty(): boolean {
    return !!(this.to || this.subject || this.body);
  }

  async loadDraft(id: string) {
    const msg = await this.store.getMessage(id);
    if (msg) {
      // Populate fields
      this.to = msg.to?.map((t: any) => t.email).join(', ') || '';
      this.subject = msg.subject || '';
      this.body = msg.body_html || msg.body_text || '';
      // TODO: Handle attachments if we decide to re-hydrate them (complex due to File object)
    }
  }

  async saveDraft(silent = false) {
    if (!this.store.currentAccount()) return;
    if (!this.isDirty()) return;

    this.savingDraft = true;
    try {
      const id = await this.operations.saveDraft({
        id: this.draftId || undefined,
        to: this.to ? [{ email: this.to, name: '' }] : [],
        subject: this.subject,
        body_text: this.body, // Assuming text editor for now
        body_html: this.body
      }, this.store.currentAccount()!.id);

      this.draftId = id;
      if (!silent) console.log('Draft saved');
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      this.savingDraft = false;
    }
  }

  attachments: { file: File, base64: string }[] = [];
  isSending = false;

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Validation: Max 4MB
        if (file.size > 4 * 1024 * 1024) {
          alert(`El archivo ${file.name} es demasiado grande. Máximo 4MB.`);
          continue;
        }

        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.attachments.push({
            file: file,
            base64: e.target.result.split(',')[1] // remove data:image/png;base64, prefix
          });
        };
        reader.readAsDataURL(file);
      }
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  async send() {
    if (!this.to || !this.subject) return;

    const account = this.store.currentAccount();
    if (!account) {
      alert('No hay cuenta de correo seleccionada.');
      return;
    }

    this.isSending = true;

    try {
      const payload: any = {
        to: [{ name: '', email: this.to }], // Parse proper name/email later if needed
        subject: this.subject,
        body_text: this.body,
        attachments: this.attachments.map(a => ({
          filename: a.file.name,
          content: a.base64,
          contentType: a.file.type
        }))
      };

      await this.operations.sendMessage(payload, account);

      this.router.navigate(['webmail/inbox']);
    } catch (e: any) {
      console.error(e);
      alert('Error al enviar: ' + (e.message || e));
    } finally {
      this.isSending = false;
    }
  }

  cancel() {
    this.router.navigate(['webmail/inbox']);
  }
}
