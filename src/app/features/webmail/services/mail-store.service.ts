import { Injectable, computed, signal } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailAccount, MailFolder, MailMessage } from '../../../core/interfaces/webmail.interface';
import { from, tap } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MailStoreService {
  private supabase;

  // State Signals
  accounts = signal<MailAccount[]>([]);
  currentAccount = signal<MailAccount | null>(null);

  folders = signal<MailFolder[]>([]); // Flat list
  folderTree = computed(() => this.buildFolderTree(this.folders()));
  currentFolder = signal<MailFolder | null>(null);

  messages = signal<MailMessage[]>([]);
  threads = signal<any[]>([]); // MailThread[] but avoiding circular dependency issues if any
  selectedMessage = signal<MailMessage | null>(null);

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

    if (error) console.error('Error fetching accounts:', error);

    if (data) {
      this.accounts.set(data);
      if (data.length > 0 && !this.currentAccount()) {
        this.selectAccount(data[0]);
      }
    }
    this.isLoading.set(false);
  }

  selectAccount(account: MailAccount) {
    this.currentAccount.set(account);
    this.loadFolders(account.id);
  }

  // --- Folder Logic ---
  async loadFolders(accountId: string) {
    const { data, error } = await this.supabase
      .from('mail_folders')
      .select('*')
      .eq('account_id', accountId)
      .order('type', { ascending: true }) // System first
      .order('name');

    if (error) console.error('Error fetching folders:', error);
    if (data) this.folders.set(data);
  }

  private buildFolderTree(folders: MailFolder[]): MailFolder[] {
    // Simple tree builder
    const map = new Map<string, MailFolder>();
    const roots: MailFolder[] = [];

    // Copy and map
    folders.forEach(f => {
      map.set(f.id, { ...f, children: [] });
    });

    // Link children
    folders.forEach(f => {
      if (f.parent_id && map.has(f.parent_id)) {
        map.get(f.parent_id)!.children!.push(map.get(f.id)!);
      } else {
        roots.push(map.get(f.id)!);
      }
    });

    // Sort system folders logic could go here
    return roots;
  }

  // --- Message/Thread Logic ---
  async loadThreads(folder: MailFolder, searchQuery: string = '') {
    if (!this.currentAccount()) return;

    this.currentFolder.set(folder); // Track current folder

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .rpc('f_mail_get_threads', {
          p_account_id: this.currentAccount()!.id,
          p_folder_id: folder.id,
          p_limit: 20,
          p_offset: 0,
          p_search: searchQuery || null
        });

      if (error) throw error;
      this.threads.set(data || []);
    } catch (e) {
      console.error('Error fetching threads:', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async refreshCurrentFolder() {
    const folder = this.currentFolder();
    if (folder) {
      await this.loadThreads(folder);
    }
  }

  // kept for backward compatibility if needed, using threads now
  async loadMessages(folder: MailFolder) {
    this.loadThreads(folder);
  }

  async getMessage(id: string) {
    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('*, attachments:mail_attachments(*)')
      .eq('id', id)
      .single();

    if (data) this.selectedMessage.set(data);
    return data;
  }
}
