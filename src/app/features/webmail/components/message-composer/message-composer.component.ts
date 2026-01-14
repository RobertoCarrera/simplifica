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

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private operations = inject(MailOperationService);
  private store = inject(MailStoreService);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['to']) this.to = params['to'];
      if (params['subject']) this.subject = params['subject'];
      // if (params['replyTo']) ... handle threading context if needed
    });
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
