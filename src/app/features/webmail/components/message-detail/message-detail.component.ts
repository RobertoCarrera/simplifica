import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { MailStoreService } from '../../services/mail-store.service';
import { MailMessage } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './message-detail.component.html',
  styleUrl: './message-detail.component.scss'
})
export class MessageDetailComponent implements OnInit {
  private store = inject(MailStoreService);
  private route = inject(ActivatedRoute);

  message = this.store.selectedMessage;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('threadId');
      if (id) {
        this.store.getMessage(id);
      }
    });
  }

  reply() {
    // Navigate to composer with reply context
    console.log('Reply to', this.message()?.id);
  }
}
