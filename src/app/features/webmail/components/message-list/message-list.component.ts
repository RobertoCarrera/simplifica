import { Component, OnInit, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolder, MailMessage } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
  // ⚡ Bolt Optimization: Use OnPush strategy to minimize unnecessary change detection cycles.
  changeDetection: ChangeDetectionStrategy.OnPush
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
        // Re-attempt load if we have folders but maybe didn't find the folder previously
        // Or just blindly reliable validation inside loadMessagesForPath
        this.loadMessagesForPath(this.currentFolderPath);
      }
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.loadMessagesForPath(path);
    });
  }

  private loadMessagesForPath(path: string) {
    // Find folder by path (case insensitive match on system role or path)
    // We assume store.folders is populated. If not, we might need to wait.

    // Simple helper assuming flat list is sufficient to find by path
    const folders = this.store.folders();
    let folder = folders.find(f => f.path.toLowerCase() === path.toLowerCase() || f.system_role === path.toLowerCase());

    if (folder) {
      this.store.loadMessages(folder);
    } else {
      // Retry if folders empty? handled by effect in service ideally?
      // For now, if no folders, we can't load messages.
      // If store auto-loads folders, we should react to that.
      if (folders.length === 0) {
        // Just triggered on load?
      }
    }
  }

  // ⚡ Bolt Optimization: trackBy function for *ngFor to optimize DOM updates
  trackByMessage(index: number, message: MailMessage): string {
    return message.id;
  }
}
