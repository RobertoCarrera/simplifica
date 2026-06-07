import { Injectable, inject } from '@angular/core';
import { ContextMenuEntry, ContextMenuItem, ContextMenuSubmenu } from '../../../shared/ui/context-menu';
import { MailMessage, MailFolder } from '../../../core/interfaces/webmail.interface';
import { MailOperationService } from './mail-operation.service';
import { MailStoreService } from './mail-store.service';
import { Router } from '@angular/router';
import { ToastService } from '../../../services/toast.service';

/**
 * Builds context-menu entries for a single message.
 *
 * Centralises the list of actions so the same set appears in:
 *  - message-list (right-click on a row)
 *  - message-detail (right-click on the open message)
 *
 * All actions close the menu automatically (default behaviour of
 * ContextMenuService). The caller still gets a `closed$` event with
 * `pickedId` so it can react (e.g. reload list after delete).
 *
 * Labels use the `webmail.contextMenu.*` and `webmail.group.*` i18n
 * keys. The component template renders them via `transloco`.
 */
@Injectable({ providedIn: 'root' })
export class MailContextMenuBuilder {
  private ops = inject(MailOperationService);
  private store = inject(MailStoreService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Group label i18n key */
  private tGroup(group: 'reply' | 'mark' | 'organize'): string {
    return `webmail.group.${group}`;
  }

  /**
   * Build the entries for a message.
   * @param msg the message the user right-clicked
   * @param currentFolder the folder currently being viewed (used to
   *   decide whether to show "Not spam" or "Mark as spam", and to hide
   *   "Archive" inside Trash/Spam).
   */
  buildEntries(
    msg: MailMessage,
    currentFolder: MailFolder | null,
  ): ContextMenuEntry[] {
    const inTrash = currentFolder?.system_role === 'trash';
    const inSpam = currentFolder?.system_role === 'spam';
    const inSent = currentFolder?.system_role === 'sent';
    const inDrafts = currentFolder?.system_role === 'drafts';
    // `archive` isn't in the strict system_role union in the TS interface,
    // but the column is free-form in the DB. Cast for the comparison.
    const inArchive = (currentFolder?.system_role as string) === 'archive';

    const reload = () => {
      const accountId = this.store.currentAccount()?.id;
      if (accountId) this.store.loadFolders(accountId);
    };

    const item = (cfg: Omit<ContextMenuItem, 'label'> & { label: string }): ContextMenuEntry => ({
      type: 'item',
      item: cfg as ContextMenuItem,
    });

    return [
      // ── Reply group ──────────────────────────────────────────────
      { type: 'label', label: this.tGroup('reply') },
      item({
        id: 'reply',
        label: 'webmail.contextMenu.reply',
        icon: 'fas fa-reply',
        disabled: inTrash || inSpam || inArchive || inDrafts,
        action: () => this.openReply(msg, 'reply'),
      }),
      item({
        id: 'reply-all',
        label: 'webmail.contextMenu.replyAll',
        icon: 'fas fa-reply-all',
        disabled: inTrash || inSpam || inArchive || inDrafts,
        action: () => this.openReply(msg, 'reply-all'),
      }),
      item({
        id: 'forward',
        label: 'webmail.contextMenu.forward',
        icon: 'fas fa-share',
        disabled: inTrash || inSpam,
        action: () => this.openReply(msg, 'forward'),
      }),
      item({
        id: 'open-new-tab',
        label: 'webmail.contextMenu.openNewTab',
        icon: 'fas fa-external-link-alt',
        action: () => this.openInNewTab(msg),
      }),

      { type: 'separator' },

      // ── Mark group ───────────────────────────────────────────────
      { type: 'label', label: this.tGroup('mark') },
      item({
        id: 'toggle-read',
        label: msg.is_read ? 'webmail.contextMenu.markUnread' : 'webmail.contextMenu.markRead',
        icon: msg.is_read ? 'fas fa-envelope' : 'fas fa-envelope-open',
        action: async () => {
          await this.ops.toggleRead(msg.id, msg.is_read);
          reload();
        },
      }),
      item({
        id: 'toggle-star',
        label: msg.is_starred ? 'webmail.contextMenu.unstar' : 'webmail.contextMenu.star',
        icon: msg.is_starred ? 'far fa-star' : 'fas fa-star',
        action: async () => {
          await this.ops.toggleStar(msg.id, msg.is_starred, {
            account_id: msg.account_id,
            from: msg.from,
          });
          reload();
        },
      }),

      { type: 'separator' },

      // ── Move group ───────────────────────────────────────────────
      { type: 'label', label: this.tGroup('organize') },
      this.buildMoveToSubmenu(msg, currentFolder),
      item({
        id: 'archive',
        label: 'webmail.contextMenu.archive',
        icon: 'fas fa-archive',
        hidden: inArchive || inTrash || inSpam,
        action: async () => {
          await this.ops.archive([msg.id]);
          reload();
          this.toast.success('Archivado', 'Mensaje archivado');
        },
      }),
      item({
        id: 'mark-spam',
        label: 'webmail.contextMenu.markSpam',
        icon: 'fas fa-exclamation-triangle',
        danger: true,
        hidden: inSpam || inTrash,
        action: async () => {
          await this.ops.markAsSpam([msg.id]);
          reload();
          this.toast.success('Marcado', 'Mensaje marcado como spam');
        },
      }),
      item({
        id: 'not-spam',
        label: 'webmail.contextMenu.notSpam',
        icon: 'fas fa-shield-alt',
        hidden: !inSpam,
        action: async () => {
          await this.ops.markAsNotSpam([msg.id]);
          reload();
          this.toast.success('Movido', 'Mensaje movido a Recibidos');
        },
      }),
      item({
        id: 'report-phishing',
        label: 'webmail.contextMenu.reportPhishing',
        icon: 'fas fa-fish',
        danger: true,
        hidden: inTrash,
        action: () => this.reportPhishing(msg),
      }),

      { type: 'separator' },

      // ── Delete group ─────────────────────────────────────────────
      item({
        id: inTrash ? 'delete-permanent' : 'delete',
        label: inTrash ? 'webmail.contextMenu.deletePermanent' : 'webmail.contextMenu.delete',
        icon: 'fas fa-trash',
        danger: true,
        action: async () => {
          await this.ops.deleteMessages([msg.id]);
          reload();
          this.toast.success(
            inTrash ? 'Eliminado' : 'Movido a papelera',
            inTrash ? 'Mensaje eliminado definitivamente' : 'Mensaje movido a la papelera',
          );
        },
      }),
    ];
  }

  /**
   * Build the "Move to folder" submenu.
   * Lists all user folders + system folders (except the current one)
   * so the user can move the message with one click.
   */
  private buildMoveToSubmenu(
    msg: MailMessage,
    currentFolder: MailFolder | null,
  ): ContextMenuEntry {
    const folders = this.store.folders();
    const reload = () => {
      const accountId = this.store.currentAccount()?.id;
      if (accountId) this.store.loadFolders(accountId);
    };

    // Filter: exclude the current folder, show system + user folders
    const targetFolders = folders.filter((f) => {
      if (currentFolder && f.id === currentFolder.id) return false;
      // Only show folders for the same account
      if (f.account_id !== msg.account_id) return false;
      return true;
    });

    const childItem = (cfg: Omit<ContextMenuItem, 'label'> & { label: string }): { type: 'item'; item: ContextMenuItem } => ({
      type: 'item',
      item: cfg as ContextMenuItem,
    });

    // Icon mapping for system folders
    const folderIcon = (role?: string): string => {
      switch (role) {
        case 'inbox': return 'fas fa-inbox';
        case 'sent': return 'fas fa-paper-plane';
        case 'drafts': return 'fas fa-file-alt';
        case 'trash': return 'fas fa-trash';
        case 'spam': return 'fas fa-exclamation-triangle';
        default: return 'fas fa-folder';
      }
    };

    type ChildEntry = ContextMenuEntry & { type: 'item' | 'separator' | 'label' };
    const children: ChildEntry[] = targetFolders.map((f) =>
      childItem({
        id: `move-to-${f.id}`,
        label: f.name,
        icon: folderIcon(f.system_role),
        action: async () => {
          await this.ops.moveMessages([msg.id], f.id);
          reload();
          this.toast.success('Movido', `Mensaje movido a ${f.name}`);
        },
      }),
    );

    // If no target folders, the submenu is empty — still show it but
    // with a disabled "no folders" placeholder.
    if (children.length === 0) {
      children.push({
        type: 'item',
        item: {
          id: 'move-to-empty',
          label: 'webmail.contextMenu.noFolders',
          disabled: true,
        },
      });
    }

    const submenu: ContextMenuSubmenu = {
      id: 'move-to',
      label: 'webmail.contextMenu.moveTo',
      icon: 'fas fa-folder-open',
      children,
    };

    return { type: 'submenu', submenu };
  }

  /**
   * Open the message thread in a new browser tab.
   */
  private openInNewTab(msg: MailMessage): void {
    const url = this.router.createUrlTree(['../thread', msg.id], {
      relativeTo: this.router.routerState.root,
    });
    const fullUrl = this.router.serializeUrl(url);
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  }

  /**
   * Report a message as phishing.
   * Moves the message to spam and shows a toast.
   * Future: could trigger a Supabase Edge Function for reporting to provider.
   */
  private async reportPhishing(msg: MailMessage): Promise<void> {
    await this.ops.markAsSpam([msg.id]);
    const accountId = this.store.currentAccount()?.id;
    if (accountId) this.store.loadFolders(accountId);
    this.toast.success(
      'Reportado',
      'Mensaje reportado como phishing y movido a spam',
    );
  }

  private async openReply(msg: MailMessage, mode: 'reply' | 'reply-all' | 'forward'): Promise<void> {
    // Navigate to the thread and pass the mode as a query param so the
    // detail component can pre-open the inline reply box.
    await this.router.navigate(['../thread', msg.id], {
      queryParams: { [mode]: 1 },
      relativeTo: this.router.routerState.root,
    });
  }
}
