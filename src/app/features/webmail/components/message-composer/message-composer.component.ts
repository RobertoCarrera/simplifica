import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MailOperationService } from '../../services/mail-operation.service';

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss'
})
export class MessageComposerComponent {
  to = '';
  subject = '';
  body = '';

  private router = inject(Router);
  private operations = inject(MailOperationService);

  async send() {
    if (!this.to || !this.subject) return;

    try {
      await this.operations.sendMessage({
        to: [{ name: '', email: this.to }], // Parse proper name/email later
        subject: this.subject,
        body_text: this.body
      });
      alert('Mensaje enviado (simulado)');
      this.router.navigate(['webmail/inbox']);
    } catch (e) {
      console.error(e);
      alert('Error al enviar');
    }
  }

  cancel() {
    this.router.navigate(['webmail/inbox']);
  }
}
