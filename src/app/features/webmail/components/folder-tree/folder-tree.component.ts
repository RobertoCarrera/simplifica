import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { CdkDropList, CdkDrag, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolderService } from '../../services/mail-folder.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailDragStateService } from '../../services/mail-drag-state.service';
import { ToastService } from '../../../../services/toast.service';
import { MailErrorService } from '../../services/mail-error.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';
import { FolderCreateDialogComponent } from '../folder-create-dialog/folder-create-dialog.component';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, RouterModule, FolderCreateDialogComponent, CdkDropList, CdkDrag, CdkDropListGroup],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss',
})
export class FolderTreeComponent {
  store = inject(MailStoreService);
  private folderService = inject(MailFolderService);
  private operations = inject(MailOperationService);
  private dragState = inject(MailDragStateService);
  private toast = inject(ToastService);
  private errors = inject(MailErrorService);
  private transloco = inject(TranslocoService);

  folders = this.store.folderTree;
  smartFoldersEnabled = this.folderService.smartFoldersEnabled;
  isDragging = this.dragState.isDragging;

  // Dialog state
  showCreateDialog = signal(false);
  editTarget = signal<MailFolder | null>(null);

  // Context menu state
  contextMenu = signal<{ x: number; y: number; folder: MailFolder } | null>(null);

  // Drag-over highlight state: which folder is currently being hovered
  dropHoverFolderId = signal<string | null>(null);

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

  // ── Drag & drop: folders as drop targets ─────────────────────

  /** Handle messages dropped onto a folder */
  async onFolderDrop(folder: MailFolder): Promise<void> {
    this.dropHoverFolderId.set(null);
    const ids = this.dragState.draggedMessageIds();
    if (!ids.length) return;

    try {
      await this.operations.moveMessages(ids, folder.id);
      this.toast.success(
        'Mensajes movidos',
        `${ids.length} mensaje${ids.length > 1 ? 's' : ''} movido${ids.length > 1 ? 's' : ''} a "${folder.name}"`
      );
      // Reload folders to update unread counts
      const accountId = this.store.currentAccount()?.id;
      if (accountId) await this.folderService.loadFolders(accountId);
    } catch (error) {
      const err = this.errors.parse(error);
      this.toast.error('Error', err.userMessage);
    } finally {
      this.dragState.clearDrag();
    }
  }

  onFolderDragEnter(folder: MailFolder): void {
    this.dropHoverFolderId.set(folder.id);
  }

  onFolderDragLeave(folder: MailFolder): void {
    if (this.dropHoverFolderId() === folder.id) {
      this.dropHoverFolderId.set(null);
    }
  }

  // ── Keyboard navigation for folder tree ─────────────────────

  /**
   * Handle keyboard navigation within the folder tree.
   * ArrowUp/ArrowDown: move focus between folders.
   * Enter/Space: activate (navigate to) the folder.
   */
  onFolderKeydown(event: KeyboardEvent, folder: MailFolder): void {
    const items = this.getVisibleFolderElements();
    const currentIndex = items.findIndex(el => el.dataset['folderId'] === folder.id);
    if (currentIndex === -1) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.focusFolderItem(items, currentIndex + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.focusFolderItem(items, currentIndex - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        // Navigate to the folder via router
        this.navigateToFolder(folder);
        break;
      case 'Home':
        event.preventDefault();
        this.focusFolderItem(items, 0);
        break;
      case 'End':
        event.preventDefault();
        this.focusFolderItem(items, items.length - 1);
        break;
    }
  }

  /** Get all folder anchor elements in render order */
  private getVisibleFolderElements(): HTMLElement[] {
    const list = document.querySelector('.folder-list');
    if (!list) return [];
    return Array.from(list.querySelectorAll<HTMLElement>('a[role="treeitem"]'));
  }

  private focusFolderItem(items: HTMLElement[], index: number): void {
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    items[clamped]?.focus();
  }

  // The routerLink already handles navigation — this is for keyboard activation
  private navigateToFolder(folder: MailFolder): void {
    const anchor = document.querySelector<HTMLAnchorElement>(
      `a[data-folder-id="${folder.id}"]`
    );
    anchor?.click();
  }
}
