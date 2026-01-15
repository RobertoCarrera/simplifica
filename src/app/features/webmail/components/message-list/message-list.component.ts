import { Component, OnInit, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MailStoreService } from '../../services/mail-store.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss'
})
export class MessageListComponent implements OnInit {
  store = inject(MailStoreService);
  operations = inject(MailOperationService);
  private _router = inject(Router);
  private route = inject(ActivatedRoute);

  messages = this.store.messages;
  loading = this.store.isLoading;

  currentFolderPath = '';

  // Selection Logic
  selectedThreadIds = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      const folders = this.store.folders();
      if (folders.length > 0 && this.currentFolderPath) {
        this.loadMessagesForPath(this.currentFolderPath);
      }
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.loadMessagesForPath(path);
      // Clear selection on route change
      this.selectedThreadIds.set(new Set());
    });
  }

  isDraftsOrSent(): boolean {
    return ['drafts', 'sent'].includes(this.currentFolderPath.toLowerCase());
  }

  onMessageClick(msg: any) {
    if (this.currentFolderPath.toLowerCase() === 'drafts') {
      this._router.navigate(['../thread', msg.thread_id], { relativeTo: this.route });
    } else {
      this._router.navigate(['../thread', msg.thread_id], { relativeTo: this.route });
    }
  }

  // --- Selection Methods ---

  toggleSelection(event: Event, threadId: string) {
    event.stopPropagation(); // Prevent row click
    const current = new Set(this.selectedThreadIds());
    if (current.has(threadId)) {
      current.delete(threadId);
    } else {
      current.add(threadId);
    }
    this.selectedThreadIds.set(current);
  }

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    if (checked) {
      const allIds = this.store.threads().map(t => t.thread_id);
      this.selectedThreadIds.set(new Set(allIds));
    } else {
      this.selectedThreadIds.set(new Set());
    }
  }

  isSelected(threadId: string): boolean {
    return this.selectedThreadIds().has(threadId);
  }

  allSelected(): boolean {
    const threads = this.store.threads();
    return threads.length > 0 && this.selectedThreadIds().size === threads.length;
  }

  get selectionCount(): number {
    return this.selectedThreadIds().size;
  }

  // --- Bulk Actions ---

  async deleteSelected() {
    const ids = Array.from(this.selectedThreadIds());
    if (ids.length === 0) return;

    if (confirm(`¿Estás seguro de eliminar ${ids.length} conversacion(es)?`)) {
      try {
        const account = this.store.currentAccount();
        if (!account) return;

        const folders = this.store.folders();
        const folder = folders.find(f => f.path.toLowerCase() === this.currentFolderPath.toLowerCase() || f.system_role === this.currentFolderPath.toLowerCase());
        const systemRole = folder ? folder.system_role : 'user';

        this.loading.set(true);
        await this.operations.bulkTrashThreads(ids, systemRole || 'user', account.id);

        this.selectedThreadIds.set(new Set());
        if (folder) this.store.loadMessages(folder);

      } catch (err) {
        console.error('Error deleting threads:', err);
        alert('Hubo un error al eliminar los mensajes.');
      } finally {
        this.loading.set(false);
      }
    }
  }

  async markSelectedRead(read: boolean) {
    const ids = Array.from(this.selectedThreadIds());
    if (ids.length === 0) return;

    try {
      await this.operations.bulkMarkReadThreads(ids, read);

      const folders = this.store.folders();
      const folder = folders.find(f => f.path.toLowerCase() === this.currentFolderPath.toLowerCase() || f.system_role === this.currentFolderPath.toLowerCase());

      this.selectedThreadIds.set(new Set());
      if (folder) this.store.loadMessages(folder);

    } catch (err) {
      console.error('Error marking threads:', err);
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
