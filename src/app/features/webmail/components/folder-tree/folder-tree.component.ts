import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MailStoreService } from '../../services/mail-store.service';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss'
})
export class FolderTreeComponent {
  store = inject(MailStoreService);
  folders = this.store.folderTree;

  translateFolderName(folder: any): string {
    if (!folder.system_role) return folder.name;
    const translations: Record<string, string> = {
      'inbox': 'Bandeja de Entrada',
      'sent': 'Enviados',
      'drafts': 'Borradores',
      'trash': 'Papelera',
      'spam': 'Spam'
    };
    return translations[folder.system_role] || folder.name;
  }
}
