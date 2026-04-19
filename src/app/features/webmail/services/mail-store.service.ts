import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailAccount, MailFolder, MailMessage } from '../../../core/interfaces/webmail.interface';
import { MailFolderService } from './mail-folder.service';
import { MailMessageService } from './mail-message.service';

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
export class MailStoreService {
  private supabase;
  private folderService = inject(MailFolderService);
  private messageService = inject(MailMessageService);

  // Re-expose account state (managed directly here for now)
  accounts = signal<MailAccount[]>([]);
  currentAccount = signal<MailAccount | null>(null);
  accountsLoaded = signal<boolean>(false);

  // Re-expose folder state from MailFolderService
  folders = this.folderService.folders;
  folderTree = this.folderService.folderTree;

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
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching accounts:', error);
      this.isLoading.set(false);
      this.accountsLoaded.set(true);
      return;
    }

    if (data) {
      this.accounts.set(data);
      if (data.length > 0 && !this.currentAccount()) {
        await this.selectAccount(data[0]);
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
}
