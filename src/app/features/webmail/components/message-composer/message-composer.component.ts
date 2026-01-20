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

  async send() {
    if (!this.to || !this.subject) return;

    const account = this.store.currentAccount();
    if (!account) {
      alert('No hay cuenta de correo seleccionada.');
      return;
    }

    try {
      await this.operations.sendMessage({
        to: [{ name: '', email: this.to }], // Parse proper name/email later if needed
        subject: this.subject,
        body_text: this.body
      }, account);

      this.router.navigate(['webmail/inbox']);
    } catch (e: any) {
      console.error(e);
      alert('Error al enviar: ' + (e.message || e));
    }
  }

  cancel() {
    this.router.navigate(['webmail/inbox']);
  }
}
