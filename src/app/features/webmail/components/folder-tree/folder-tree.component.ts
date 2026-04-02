import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { MailStoreService } from '../../services/mail-store.service';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  store = inject(MailStoreService);
  private transloco = inject(TranslocoService);
  folders = this.store.folderTree;

  translateFolderName(folder: any): string {
    if (!folder.system_role) return folder.name;
    const keyMap: Record<string, string> = {
      inbox: 'webmail.inbox',
      sent: 'webmail.sent',
      drafts: 'webmail.drafts',
      trash: 'webmail.trash',
      spam: 'webmail.spam',
    };
    const key = keyMap[folder.system_role];
    return key ? this.transloco.translate(key) : folder.name;
  }
}
