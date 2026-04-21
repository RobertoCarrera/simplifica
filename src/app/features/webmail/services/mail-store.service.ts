import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailAccount, MailFolder, MailMessage } from '../../../core/interfaces/webmail.interface';
import { MailFolderService } from './mail-folder.service';
import { MailMessageService } from './mail-message.service';
import { MailOperationService } from './mail-operation.service';
import { AuthService } from '../../../services/auth.service';

/**
 * MailStoreService — Fachada que coordina los servicios de mail.
 * Mantiene backward compatibility con los componentes existentes que esperan
 * signals como `accounts`, `currentAccount`, `folders`, `folderTree`, `messages`, etc.
 * 
 * Los servicios específicos (folder, message) se usan internamente.
 */
@Injectable({
  providedIn: 'root'
})
export class MailStoreService implements OnDestroy {
  private supabase;
  private folderService = inject(MailFolderService);
  private messageService = inject(MailMessageService);
  private operationService = inject(MailOperationService);
  private authService = inject(AuthService);
  private realtimeChannel: ReturnType<typeof this.supabase.channel> | null = null;

  // Re-expose account state (managed directly here for now)
  accounts = signal<MailAccount[]>([]);
  currentAccount = signal<MailAccount | null>(null);
  accountsLoaded = signal<boolean>(false);

  // Re-expose folder state from MailFolderService
  folders = this.folderService.folders;
  folderTree = this.folderService.folderTree;

  // Total unread mail count across all currently loaded folders (updates reactively)
  totalUnreadMail = computed(() =>
    this.folderService.folders().reduce((sum, f) => sum + (f.unread_count ?? 0), 0)
  );

  // Re-expose message state from MailMessageService
  messages = this.messageService.messages;
  selectedMessage = this.messageService.selectedMessage;
  isLoading = signal<boolean>(false);

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  // --- Account Logic ---
  async loadAccounts() {
    this.isLoading.set(true);
    const { data, error } = await this.supabase
      .from('mail_accounts')
      .select('*, owner:users(id, name, surname)')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching accounts:', error);
      this.isLoading.set(false);
      this.accountsLoaded.set(true);
      return;
    }

    if (data) {
      // Own accounts first, team accounts sorted alphabetically after
      const currentUserId = this.authService.userProfileSignal()?.id;
      const sorted = [...data].sort((a, b) => {
        const aOwn = a.user_id === currentUserId ? 0 : 1;
        const bOwn = b.user_id === currentUserId ? 0 : 1;
        return aOwn - bOwn;
      });
      this.accounts.set(sorted);
      if (sorted.length > 0 && !this.currentAccount()) {
        await this.selectAccount(sorted[0]);
        this.isLoading.set(false);
        this.accountsLoaded.set(true);
        return;
      }
    }
    this.isLoading.set(false);
    this.accountsLoaded.set(true);
  }

  async selectAccount(account: MailAccount) {
    this.currentAccount.set(account);
    await this.folderService.loadFolders(account.id);
    this.subscribeToNewMessages(account.id);
  }

  private subscribeToNewMessages(accountId: string): void {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
    }
    this.realtimeChannel = this.supabase
      .channel(`mail_messages:${accountId}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'mail_messages', filter: `account_id=eq.${accountId}` },
        (payload: any) => {
          const newFolderId = payload.new?.folder_id;
          const currentMessages = this.messages();
          const alreadyLoaded = currentMessages.some(m => m.id === payload.new?.id);
          if (alreadyLoaded) return;

          // Reload folders to update unread counts (DB trigger keeps them accurate)
          this.folderService.loadFolders(accountId);

          // If the INSERT is for the currently displayed folder, reload it
          const matchingFolder = this.folders().find(f => f.id === newFolderId);
          if (matchingFolder) {
            this.messageService.loadMessages(matchingFolder, 50);
          }
        }
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
    }
  }

  // --- Folder Logic ---
  async loadFolders(accountId: string) {
    await this.folderService.loadFolders(accountId);
  }

  // --- Message Logic ---
  async loadMessages(folder: MailFolder, limit = 50) {
    await this.messageService.loadMessages(folder, limit);
  }

  async getMessage(id: string) {
    return this.messageService.getMessage(id);
  }

  /**
   * Mark messages as read/unread.
   * Optimistic local update first → DB write → folder reload (updates sidebar badge).
   */
  async markAsRead(messageIds: string[], isRead = true): Promise<void> {
    if (!messageIds.length) return;
    this.messageService.markLocallyAsRead(messageIds, isRead);
    await this.operationService.markAsRead(messageIds, isRead);
    const accountId = this.currentAccount()?.id;
    if (accountId) this.folderService.loadFolders(accountId);
  }
}
