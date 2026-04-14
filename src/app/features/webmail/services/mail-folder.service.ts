import { Injectable, signal, computed } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailFolder } from '../../../core/interfaces/webmail.interface';

@Injectable({ providedIn: 'root' })
export class MailFolderService {
  private supabase;

  folders = signal<MailFolder[]>([]);
  folderTree = computed(() => this.buildFolderTree(this.folders()));
  currentFolderId = signal<string | null>(null);

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  async loadFolders(accountId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('mail_folders')
      .select('*')
      .eq('account_id', accountId)
      .order('type', { ascending: true })
      .order('name');

    if (error) {
      console.error('Error fetching folders:', error);
      return;
    }
    if (data) this.folders.set(data);
  }

  selectFolder(folderId: string): void {
    this.currentFolderId.set(folderId);
  }

  get currentFolder(): MailFolder | null {
    const id = this.currentFolderId();
    if (!id) return null;
    return this.folders().find(f => f.id === id) ?? null;
  }

  private buildFolderTree(folders: MailFolder[]): MailFolder[] {
    const map = new Map<string, MailFolder>();
    const roots: MailFolder[] = [];

    folders.forEach(f => map.set(f.id, { ...f, children: [] }));
    folders.forEach(f => {
      if (f.parent_id && map.has(f.parent_id)) {
        map.get(f.parent_id)!.children!.push(map.get(f.id)!);
      } else {
        roots.push(map.get(f.id)!);
      }
    });

    const systemOrder: Record<string, number> = {
      'inbox': 1, 'sent': 2, 'drafts': 3, 'spam': 4, 'trash': 5
    };

    roots.sort((a, b) => {
      const orderA = a.system_role ? (systemOrder[a.system_role] || 99) : 100;
      const orderB = b.system_role ? (systemOrder[b.system_role] || 99) : 100;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return roots;
  }
}
