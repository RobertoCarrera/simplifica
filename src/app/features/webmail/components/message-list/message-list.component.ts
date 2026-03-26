import { Component, OnInit, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageListComponent implements OnInit {
  private store = inject(MailStoreService);
  private route = inject(ActivatedRoute);

  messages = this.store.messages;
  loading = this.store.isLoading;

  currentFolderPath = '';
  private lastLoadedFolder = '';

  constructor() {
    // React when folders arrive (they load async after accounts)
    effect(() => {
      const folders = this.store.folders();
      if (folders.length > 0 && this.currentFolderPath && this.lastLoadedFolder !== this.currentFolderPath) {
        this.loadMessagesForPath(this.currentFolderPath);
      }
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.lastLoadedFolder = ''; // Reset so it can load for the new path
      this.loadMessagesForPath(path);
    });
  }

  private loadMessagesForPath(path: string) {
    const folders = this.store.folders();
    const folder = folders.find(f => f.path.toLowerCase() === path.toLowerCase() || f.system_role === path.toLowerCase());

    if (folder) {
      this.lastLoadedFolder = path;
      this.store.loadMessages(folder);
    }
  }
}
