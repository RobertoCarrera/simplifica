import { Component, OnInit, inject, signal, OnDestroy, AfterViewInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { CdkDrag } from '@angular/cdk/drag-drop';
import { MailStoreService } from '../../services/mail-store.service';
import { MailMessageService } from '../../services/mail-message.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailDragStateService } from '../../services/mail-drag-state.service';
import { MailMessage, MailFolder } from '../../../../core/interfaces/webmail.interface';
import { RelativeDatePipe } from '../../../../core/pipes/relative-date.pipe';

type MailFilter = 'all' | 'unread' | 'read' | 'starred';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, FormsModule, RelativeDatePipe, CdkDrag],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
})
export class MessageListComponent implements OnInit, AfterViewInit, OnDestroy {
  store = inject(MailStoreService);

  constructor() {
    // Retry loading messages once accounts+folders are ready.
    effect(() => {
      if (this.store.accountsLoaded() && this.currentFolderPath) {
        this.loadMessagesForPath(this.currentFolderPath);
      }
    });
  }
  private messageService = inject(MailMessageService);
  private operations = inject(MailOperationService);
  private dragState = inject(MailDragStateService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  messages = this.store.messages;
  loading = this.store.isLoading;

  // Search
  searchQuery = signal('');
  searchResults = signal<MailMessage[]>([]);
  isSearching = signal(false);
  private searchSubject = new Subject<string>();

  // Filters — server-side, affects loadMessages query
  currentFilter = signal<MailFilter>('all');

  // Batch operations
  selectedIds = signal<Set<string>>(new Set());
  showBatchActions = signal(false);
  isAllSelected = signal(false);

  // Pagination
  hasMore = signal(true);
  isLoadingMore = signal(false);

  currentFolderPath = '';

  // Trash-specific
  isTrashFolder = signal(false);

  ngOnInit() {
    this.setupSearch();

    this.route.paramMap.subscribe(params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.isTrashFolder.set(path.toLowerCase() === 'trash');
      this.clearSelection();
      this.hasMore.set(true);
      this.searchQuery.set('');
      this.searchResults.set([]);
      this.loadMessagesForPath(path);
    });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const sentinel = document.getElementById('scroll-sentinel');
      if (sentinel) {
        const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting && this.hasMore() && !this.isLoadingMore()) {
            this.loadMore();
          }
        }, { threshold: 0.1 });
        observer.observe(sentinel);
      }
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch() {
    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(async (query) => {
      if (!query.trim()) {
        this.searchResults.set([]);
        this.isSearching.set(false);
        return;
      }

      this.isSearching.set(true);
      const accountId = this.store.currentAccount()?.id;
      if (!accountId) {
        this.isSearching.set(false);
        return;
      }

      const results = await this.messageService.searchMessages(query, accountId);
      this.searchResults.set(results);
      this.isSearching.set(false);
    });
  }

  onSearchInput(value: string) {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  // --- Filters ---

  setFilter(filter: MailFilter) {
    if (this.currentFilter() === filter) return;
    this.currentFilter.set(filter);
    this.clearSelection();
    this.hasMore.set(true);
    this.loadMessagesForPath(this.currentFolderPath);
  }

  /** Resolve filter to the service-layer value (undefined = no filter = all) */
  private resolveFilter(): 'unread' | 'read' | 'starred' | undefined {
    const f = this.currentFilter();
    return f === 'all' ? undefined : f;
  }

  // --- Message Loading ---

  async loadMessagesForPath(path: string) {
    const folders = this.store.folders();
    const folder = folders.find(f => {
      const normalizedPath = f.path.replace(/^\//, '');
      return normalizedPath.toLowerCase() === path.toLowerCase() ||
        f.system_role === path.toLowerCase();
    });

    if (folder) {
      await this.store.loadMessages(folder, 50, this.resolveFilter());
    }
  }

  private async loadMore() {
    if (this.isLoadingMore() || !this.hasMore()) return;
    this.isLoadingMore.set(true);

    const folders = this.store.folders();
    const folder = folders.find(f =>
      f.path.toLowerCase() === this.currentFolderPath.toLowerCase() ||
      f.system_role === this.currentFolderPath.toLowerCase()
    );

    if (folder) {
      const currentCount = this.messages().length;
      const more = await this.messageService.loadMore(folder, 50, currentCount, this.resolveFilter());
      if (!more || (Array.isArray(more) && more.length < 50)) {
        this.hasMore.set(false);
      }
    }

    this.isLoadingMore.set(false);
  }

  // --- Batch Operations ---
  toggleSelect(id: string) {
    const set = new Set(this.selectedIds());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.selectedIds.set(set);
    this.showBatchActions.set(set.size > 0);
    this.updateAllSelected();
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.clearSelection();
    } else {
      const allIds = new Set(this.messages().map(m => m.id));
      this.selectedIds.set(allIds);
      this.showBatchActions.set(true);
      this.isAllSelected.set(true);
    }
  }

  private clearSelection() {
    this.selectedIds.set(new Set());
    this.showBatchActions.set(false);
    this.isAllSelected.set(false);
  }

  private updateAllSelected() {
    const msgs = this.messages();
    const sel = this.selectedIds();
    this.isAllSelected.set(msgs.length > 0 && msgs.every(m => sel.has(m.id)));
  }

  async batchMarkRead() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    await this.store.markAsRead(ids, true);
    this.clearSelection();
  }

  async batchDelete() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    // When in trash, confirm permanent deletion
    if (this.isTrashFolder()) {
      const confirmed = confirm(
        `¿Eliminar definitivamente ${ids.length} mensaje${ids.length > 1 ? 's' : ''}? Esta acción no se puede deshacer.`
      );
      if (!confirmed) return;
    }

    await this.operations.deleteMessages(ids);
    this.clearSelection();
    // Reload to reflect changes
    this.loadMessagesForPath(this.currentFolderPath);
  }

  async batchMove(targetFolderId: string) {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0 || !targetFolderId) return;
    await this.operations.moveMessages(ids, targetFolderId);
    this.clearSelection();
  }

  /** Permanently delete all messages currently in the Trash folder. */
  async emptyTrash() {
    const ids = this.messages().map(m => m.id);
    if (ids.length === 0) return;

    const confirmed = confirm(
      `¿Vaciar la papelera? Se eliminarán permanentemente ${ids.length} mensaje${ids.length > 1 ? 's' : ''}.`
    );
    if (!confirmed) return;

    await this.operations.deleteMessages(ids);
    this.clearSelection();
    // Reload to show empty trash
    this.loadMessagesForPath(this.currentFolderPath);
  }

  /** Permanently delete a single message (skip trash — wipe it). */
  async permanentlyDelete(id: string) {
    await this.operations.deleteMessages([id]);
    this.loadMessagesForPath(this.currentFolderPath);
  }

  async toggleStar(msg: MailMessage) {
    // Optimistic local update
    msg.is_starred = !msg.is_starred;
    this.messages.set([...this.messages()]);
    await this.operations.toggleStar(msg.id, !msg.is_starred, {
      account_id: msg.account_id,
      from: msg.from,
    });
    // Reload folder counts (sidebar badges)
    const accountId = this.store.currentAccount()?.id;
    if (accountId) this.store.loadFolders(accountId);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  // ── Drag & drop: message items as drag sources ──────────────

  /** Store drag data when user starts dragging a message */
  onDragStart(msg: MailMessage): void {
    // If message is part of current selection, drag all selected
    if (this.selectedIds().has(msg.id) && this.selectedIds().size > 1) {
      this.dragState.setDragData(Array.from(this.selectedIds()));
    } else {
      // Only this message
      this.dragState.setDragData([msg.id]);
    }
  }
}
