import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolderService } from '../../services/mail-folder.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { ToastService } from '../../../../services/toast.service';
import { MailErrorService } from '../../services/mail-error.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';
import { FolderCreateDialogComponent } from '../folder-create-dialog/folder-create-dialog.component';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, RouterModule, FolderCreateDialogComponent],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  store = inject(MailStoreService);
  private folderService = inject(MailFolderService);
  private operations = inject(MailOperationService);
  private toast = inject(ToastService);
  private errors = inject(MailErrorService);
  private transloco = inject(TranslocoService);

  folders = this.store.folderTree;
  smartFoldersEnabled = this.folderService.smartFoldersEnabled;

  // Dialog state
  showCreateDialog = signal(false);
  editTarget = signal<MailFolder | null>(null);

  // Context menu state
  contextMenu = signal<{ x: number; y: number; folder: MailFolder } | null>(null);

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

  /** Returns the route segment for a folder. System folders use their role name,
   *  user folders use the path without the leading slash. */
  folderRoute(folder: MailFolder): string {
    if (folder.system_role) return folder.system_role;
    return folder.path.replace(/^\//, '');
  }

  // ── Folder creation ──────────────────────────────────────────

  openCreateDialog() {
    this.editTarget.set(null);
    this.showCreateDialog.set(true);
  }

  closeCreateDialog() {
    this.showCreateDialog.set(false);
    this.editTarget.set(null);
  }

  // ── Context menu ─────────────────────────────────────────────

  onContextMenu(event: MouseEvent, folder: MailFolder) {
    // Only user folders get context menu
    if (folder.type !== 'user') return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.set({ x: event.clientX, y: event.clientY, folder });
    // Close menu on any click outside
    setTimeout(() => {
      const closeMenu = () => {
        this.contextMenu.set(null);
        document.removeEventListener('click', closeMenu);
      };
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  renameFolder(folder: MailFolder) {
    this.contextMenu.set(null);
    this.editTarget.set(folder);
    this.showCreateDialog.set(true);
  }

  async deleteFolder(folder: MailFolder) {
    this.contextMenu.set(null);
    const confirmed = confirm(`¿Eliminar la carpeta "${folder.name}"? Los correos se moverán a la bandeja de entrada.`);
    if (!confirmed) return;

    try {
      const ok = await this.folderService.deleteFolder(folder.id);
      if (ok) {
        this.toast.success('Carpeta eliminada', `"${folder.name}" eliminada correctamente`);
      }
    } catch (error) {
      const err = this.errors.parse(error);
      this.toast.error('Error', err.userMessage);
    }
  }

  // ── Smart folders toggle ─────────────────────────────────────

  async toggleSmartFolders() {
    const account = this.store.currentAccount();
    if (!account) return;
    const newValue = !this.smartFoldersEnabled();
    await this.folderService.toggleSmartFolders(account.id, newValue);
    this.toast.success(
      newValue ? 'Organización inteligente activada' : 'Organización inteligente desactivada',
      newValue
        ? 'Al marcar un correo con estrella se creará una carpeta para su remitente'
        : 'Modo manual: tú decides dónde va cada correo'
    );
  }
}
