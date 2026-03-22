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

  messages = signal<MailMessage[]>([]);
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

    if (error) {
      console.error('Error fetching accounts:', error);
      this.isLoading.set(false);
      return;
    }

    if (data) {
      this.accounts.set(data);
      if (data.length > 0 && !this.currentAccount()) {
        // Chain into selectAccount which loads folders — isLoading stays true
        await this.selectAccount(data[0]);
        return;
      }
    }
    this.isLoading.set(false);
  }

  async selectAccount(account: MailAccount) {
    this.currentAccount.set(account);
    await this.loadFolders(account.id);
  }

  // --- Folder Logic ---
  async loadFolders(accountId: string) {
    this.isLoading.set(true);
    const { data, error } = await this.supabase
      .from('mail_folders')
      .select('*')
      .eq('account_id', accountId)
      .order('type', { ascending: true })
      .order('name');

    if (error) console.error('Error fetching folders:', error);
    if (data) this.folders.set(data);
    this.isLoading.set(false);
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

    // Sort system folders logic
    const systemOrder: Record<string, number> = {
      'inbox': 1,
      'sent': 2,
      'drafts': 3,
      'spam': 4,
      'trash': 5
    };

    roots.sort((a, b) => {
      const orderA = a.system_role ? (systemOrder[a.system_role] || 99) : 100;
      const orderB = b.system_role ? (systemOrder[b.system_role] || 99) : 100;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });

    return roots;
  }

  // --- Message Logic ---
  async loadMessages(folder: MailFolder, limit = 50) {
    if (!this.currentAccount()) return;

    this.isLoading.set(true);
    // Only fetch columns needed for the list view — exclude heavy body_html/body_text
    const { data, error } = await this.supabase
      .from('mail_messages')
      .select('id, account_id, folder_id, thread_id, subject, "from", "to", cc, bcc, received_at, is_read, is_starred, is_archived, snippet, metadata')
      .eq('account_id', this.currentAccount()!.id)
      .eq('folder_id', folder.id)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (error) console.error('Error fetching messages:', error);
    if (data) this.messages.set(data);

    this.isLoading.set(false);
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
