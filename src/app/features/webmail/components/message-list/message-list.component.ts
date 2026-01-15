import { Component, OnInit, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss'
})
export class MessageListComponent implements OnInit {
  private store = inject(MailStoreService);
  private route = inject(ActivatedRoute);

  messages = this.store.messages;
  loading = this.store.isLoading;

  currentFolderPath = '';

  constructor() {
    effect(() => {
      const folders = this.store.folders();
      if (folders.length > 0 && this.currentFolderPath) {
        this.loadMessagesForPath(this.currentFolderPath);
      }
    });
  }

  private _router = inject(Router);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.loadMessagesForPath(path);
    });
  }

  isDraftsOrSent(): boolean {
    return ['drafts', 'sent'].includes(this.currentFolderPath.toLowerCase());
  }

  onMessageClick(msg: any) {
    if (this.currentFolderPath.toLowerCase() === 'drafts') {
      // Open Composer in Draft Mode
      this._router.navigate(['webmail/composer'], { queryParams: { draftId: msg.id } });
    } else {
      // View Thread
      this._router.navigate(['../thread', msg.id], { relativeTo: this.route });
    }
  }

  private loadMessagesForPath(path: string) {
    const folders = this.store.folders();
    let folder = folders.find(f => f.path.toLowerCase() === path.toLowerCase() || f.system_role === path.toLowerCase());

    if (folder) {
      this.store.loadMessages(folder);
    }
  }
}
