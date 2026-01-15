import { Component, OnInit, inject, signal, effect, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';
import { ConfirmModalComponent } from '../../../../shared/ui/confirm-modal/confirm-modal.component';


@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ConfirmModalComponent],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss'
})
export class MessageListComponent implements OnInit {
  public store = inject(MailStoreService);
  private operations = inject(MailOperationService);
  private _router = inject(Router);
  public route = inject(ActivatedRoute);

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;

  messages = this.store.messages;
  loading = this.store.isLoading;

  currentFolderPath = '';

  // Selection Logic
  selectedThreadIds = signal<Set<string>>(new Set());
  lastSelectedId: string | null = null; // Track last clicked for Shift+Select

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
      this.searchTerm.set(''); // Reset search
      this.loadMessagesForPath(path);
      // Clear selection on route change
      this.selectedThreadIds.set(new Set());
      this.lastSelectedId = null;
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

  toggleSelection(event: any, threadId: string) {
    event.stopPropagation();

    const threads = this.store.threads();
    const currentSet = new Set(this.selectedThreadIds());

    // Shift + Click Range Selection
    if (event.shiftKey && this.lastSelectedId && threads.some(t => t.thread_id === this.lastSelectedId)) {
      const lastIndex = threads.findIndex(t => t.thread_id === this.lastSelectedId);
      const currentIndex = threads.findIndex(t => t.thread_id === threadId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        // Select everything in range
        for (let i = start; i <= end; i++) {
          currentSet.add(threads[i].thread_id);
        }
      }
    } else {
      // Normal Click
      if (currentSet.has(threadId)) {
        currentSet.delete(threadId);
        this.lastSelectedId = null; // Reset last selected on deselect? Or keep?
      } else {
        currentSet.add(threadId);
        this.lastSelectedId = threadId;
      }
    }

    this.selectedThreadIds.set(currentSet);
  }

  onDragStart(event: DragEvent, thread: any) { // thread is MailThread-like
    // Check if dragging a selected item
    const isSelected = this.selectedThreadIds().has(thread.thread_id);

    let idsToMove: string[] = [];

    if (isSelected) {
      // Drag all selected
      idsToMove = Array.from(this.selectedThreadIds());
    } else {
      // Drag only this one
      idsToMove = [thread.thread_id];
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify({ threadIds: idsToMove }));
      event.dataTransfer.setData('text/plain', idsToMove.join(',')); // Fallback
    }
  }

  toggleSelectAll(event: any) {
    const checked = event.target.checked;
    if (checked) {
      const allIds = this.store.threads().map(t => t.thread_id);
      this.selectedThreadIds.set(new Set(allIds));
    } else {
      this.selectedThreadIds.set(new Set());
      this.lastSelectedId = null;
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

    // Use Custom Modal
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar conversaciones',
      message: `¿Estás seguro de eliminar ${ids.length} conversacion(es)?`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      icon: 'fas fa-trash-alt',
      iconColor: 'red'
    });

    if (confirmed) {
      try {
        const account = this.store.currentAccount();
        if (!account) return;

        const folders = this.store.folders();
        const folder = folders.find(f => f.path.toLowerCase() === this.currentFolderPath.toLowerCase() || f.system_role === this.currentFolderPath.toLowerCase());
        const systemRole = folder ? folder.system_role : 'user';

        this.loading.set(true);
        await this.operations.bulkTrashThreads(ids, systemRole || 'user', account.id);

        this.selectedThreadIds.set(new Set());
        this.lastSelectedId = null;
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
      this.lastSelectedId = null;
      if (folder) this.store.loadMessages(folder);

    } catch (err) {
      console.error('Error marking threads:', err);
    }
  }

  searchTerm = signal('');

  onSearch(query: string) {
    this.searchTerm.set(query);
    const folders = this.store.folders();
    const folder = folders.find(f => f.path.toLowerCase() === this.currentFolderPath.toLowerCase() || f.system_role === this.currentFolderPath.toLowerCase());

    if (folder) {
      this.store.loadThreads(folder, query);
    }
  }

  private loadMessagesForPath(path: string) {
    const folders = this.store.folders();
    let folder = folders.find(f => f.path.toLowerCase() === path.toLowerCase() || f.system_role === path.toLowerCase());

    if (folder) {
      // Reset search on folder change unless we want to persist (usually reset)
      // If we are calling this from route change, we should reset search
      // But if we are calling this from effect... 
      // Effect dependency is just store.folders().
      // Let's reset search in ngOnInit route sub.
      this.store.loadThreads(folder, this.searchTerm());
    }
  }
}
