import { Component, OnInit, inject, signal, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { MailStoreService } from '../../services/mail-store.service';
import { MailMessageService } from '../../services/mail-message.service';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailMessage, MailFolder } from '../../../../core/interfaces/webmail.interface';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, FormsModule],
  templateUrl: './message-list.component.html',
  styleUrl: './message-list.component.scss',
})
export class MessageListComponent implements OnInit, AfterViewInit, OnDestroy {
  store = inject(MailStoreService);
  private messageService = inject(MailMessageService);
  private operations = inject(MailOperationService);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  messages = this.store.messages;
  loading = this.store.isLoading;

  // Search
  searchQuery = signal('');
  searchResults = signal<MailMessage[]>([]);
  isSearching = signal(false);
  private searchSubject = new Subject<string>();

  // Batch operations
  selectedIds = signal<Set<string>>(new Set());
  showBatchActions = signal(false);
  isAllSelected = signal(false);

  // Pagination
  hasMore = signal(true);
  isLoadingMore = signal(false);

  currentFolderPath = '';

  ngOnInit() {
    this.setupSearch();

    this.route.paramMap.subscribe(async params => {
      const path = params.get('folderPath') || 'inbox';
      this.currentFolderPath = path;
      this.clearSelection();
      this.hasMore.set(true);
      this.searchQuery.set('');
      this.searchResults.set([]);
      await this.loadMessagesForPath(path);
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

  private async loadMessagesForPath(path: string) {
    const folders = this.store.folders();
    const folder = folders.find(f =>
      f.path.toLowerCase() === path.toLowerCase() ||
      f.system_role === path.toLowerCase()
    );

    if (folder) {
      await this.store.loadMessages(folder);
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
      const more = await this.messageService.loadMore(folder, 50, currentCount);
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
    await this.operations.markAsRead(ids, true);
    this.clearSelection();
  }

  async batchDelete() {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;
    await this.operations.deleteMessages(ids);
    this.clearSelection();
  }

  async batchMove(targetFolderId: string) {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0 || !targetFolderId) return;
    await this.operations.moveMessages(ids, targetFolderId);
    this.clearSelection();
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }
}
