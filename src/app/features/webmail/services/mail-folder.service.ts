import { Injectable, signal, computed, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { MailFolder, SenderFrequency, AutoFileResult, SmartFolderStats } from '../../../core/interfaces/webmail.interface';
import { MailErrorService } from './mail-error.service';

@Injectable({ providedIn: 'root' })
export class MailFolderService {
  private supabase;
  private errors = inject(MailErrorService);

  folders = signal<MailFolder[]>([]);
  folderTree = computed(() => this.buildFolderTree(this.folders()));
  currentFolderId = signal<string | null>(null);
  smartFoldersEnabled = signal<boolean>(false);

  constructor(private supabaseClient: SupabaseClientService) {
    this.supabase = this.supabaseClient.instance;
  }

  async loadFolders(accountId: string): Promise<void> {
    // Use the SECURITY DEFINER RPC that returns folders WITH message counts.
    // The direct table SELECT (*) on mail_folders does NOT include unread_count
    // or total_count — those columns don't exist on the table and are only
    // computed by get_folder_with_counts via COUNT + FILTER aggregates.
    const { data, error } = await this.supabase
      .rpc('get_folder_with_counts', { p_account_id: accountId });

    if (error) {
      console.error('Error fetching folders:', error);
      return;
    }
    if (data) this.folders.set(data as MailFolder[]);
  }

  // ── Folder CRUD ──────────────────────────────────────────────────────

  /** Create a new user folder. Path is auto-generated: parent_path/name or /name */
  async createFolder(accountId: string, name: string, parentId?: string | null): Promise<MailFolder | null> {
    // Determine path: if parent, use parent's path + / + name; else /name
    let path = `/${name}`;
    if (parentId) {
      const parent = this.folders().find(f => f.id === parentId);
      if (parent) {
        path = `${parent.path}/${name}`;
      }
    }

    const { data, error } = await this.supabase
      .from('mail_folders')
      .insert({
        account_id: accountId,
        parent_id: parentId || null,
        name,
        path,
        type: 'user',
      })
      .select()
      .single();

    if (error) {
      this.errors.throw(error);
      return null;
    }

    // Reload folders to refresh tree
    await this.loadFolders(accountId);
    return data as MailFolder;
  }

  /** Rename a user folder (updates name and path for this folder and all children) */
  async renameFolder(folderId: string, newName: string): Promise<boolean> {
    const folder = this.folders().find(f => f.id === folderId);
    if (!folder || folder.type === 'system') {
      console.warn('Cannot rename system folder:', folder?.system_role);
      return false;
    }

    const oldPath = folder.path;
    const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;

    const { error } = await this.supabase
      .from('mail_folders')
      .update({ name: newName, path: newPath })
      .eq('id', folderId);

    if (error) {
      this.errors.throw(error);
      return false;
    }

    // Update paths for all children
    const children = this.folders().filter(f =>
      f.path.startsWith(oldPath + '/')
    );
    for (const child of children) {
      const childNewPath = child.path.replace(oldPath, newPath);
      await this.supabase
        .from('mail_folders')
        .update({ path: childNewPath })
        .eq('id', child.id);
    }

    // Reload
    const accountId = folder.account_id;
    await this.loadFolders(accountId);
    return true;
  }

  /** Delete a user folder. Emails inside are moved to the account's inbox. */
  async deleteFolder(folderId: string): Promise<boolean> {
    const folder = this.folders().find(f => f.id === folderId);
    if (!folder || folder.type === 'system') {
      console.warn('Cannot delete system folder:', folder?.system_role);
      return false;
    }

    const accountId = folder.account_id;

    // Find inbox to move messages into
    const inbox = this.folders().find(f =>
      f.account_id === accountId && f.system_role === 'inbox'
    );

    // Move all messages in this folder (and subfolders) to inbox
    const targetIds = this.getFolderAndDescendantIds(folderId);
    if (inbox && targetIds.length > 0) {
      await this.supabase
        .from('mail_messages')
        .update({ folder_id: inbox.id })
        .in('folder_id', targetIds);
    }

    // Delete subfolders first (cascade handles this if FK is set, but explicit is safer)
    const children = this.folders().filter(f => f.parent_id === folderId);
    for (const child of children) {
      await this.supabase.from('mail_folders').delete().eq('id', child.id);
    }

    // Delete the folder itself
    const { error } = await this.supabase
      .from('mail_folders')
      .delete()
      .eq('id', folderId);

    if (error) {
      this.errors.throw(error);
      return false;
    }

    await this.loadFolders(accountId);
    return true;
  }

  /** Find or create a folder by sender name */
  async findOrCreateSenderFolder(accountId: string, senderName: string): Promise<MailFolder | null> {
    const cleanName = this.sanitizeFolderName(senderName);
    const path = `/${cleanName}`;

    // Check if folder already exists
    const existing = this.folders().find(f => f.path === path && f.account_id === accountId);
    if (existing) return existing;

    return this.createFolder(accountId, cleanName, null);
  }

  /**
   * Look up a system folder by its `system_role` (e.g. 'inbox', 'spam',
   * 'trash', 'sent', 'archive', 'drafts'). Tries the in-memory cache
   * first, then falls back to a direct Supabase query if the cache is
   * cold (e.g. when called from a service that hasn't loaded folders).
   */
  async findSystemFolder(accountId: string, role: string): Promise<MailFolder | null> {
    const fromCache = this.folders().find(f => f.account_id === accountId && f.system_role === role);
    if (fromCache) return fromCache;

    const { data, error } = await this.supabase
      .from('mail_folders')
      .select('*')
      .eq('account_id', accountId)
      .eq('system_role', role)
      .maybeSingle();

    if (error) {
      this.errors.throw(error);
      return null;
    }
    return (data as MailFolder) ?? null;
  }

  // ── Smart organization ────────────────────────────────────────────────

  async loadSmartFoldersSetting(accountId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('mail_accounts')
      .select('smart_folder_enabled')
      .eq('id', accountId)
      .single();

    if (!error && data) {
      this.smartFoldersEnabled.set(data.smart_folder_enabled ?? false);
    }
  }

  async toggleSmartFolders(accountId: string, enabled: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('mail_accounts')
      .update({ smart_folder_enabled: enabled })
      .eq('id', accountId);

    if (error) {
      this.errors.throw(error);
      return;
    }
    this.smartFoldersEnabled.set(enabled);
  }

  /**
   * Get sender frequency in inbox — shows which senders have multiple emails
   * and could be auto-organized into folders.
   */
  async getSenderFrequency(accountId: string, minOccurrences = 2): Promise<SenderFrequency[]> {
    const { data, error } = await this.supabase
      .rpc('get_sender_frequency_rpc', {
        p_account_id: accountId,
        p_min_occurrences: minOccurrences,
      });

    if (error) {
      console.warn('get_sender_frequency_rpc failed:', error);
      return [];
    }
    return (data || []) as SenderFrequency[];
  }

  /**
   * Batch-organize inbox: for every sender with ≥ minOccurrences emails,
   * create a folder and move all their emails there.
   * @param dryRun — if true, returns preview without making changes
   */
  async batchOrganizeInbox(
    accountId: string,
    minOccurrences = 2,
    dryRun = false,
  ): Promise<AutoFileResult[]> {
    const { data, error } = await this.supabase
      .rpc('auto_file_repeat_sender_rpc', {
        p_account_id: accountId,
        p_min_occurrences: minOccurrences,
        p_dry_run: dryRun,
      });

    if (error) {
      console.warn('auto_file_repeat_sender_rpc failed:', error);
      return [];
    }
    return (data || []) as AutoFileResult[];
  }

  /**
   * Get smart folder stats — dashboard view of organization potential.
   */
  async getSmartStats(accountId: string): Promise<SmartFolderStats | null> {
    const { data, error } = await this.supabase
      .rpc('get_smart_folder_stats_rpc', { p_account_id: accountId });

    if (error) {
      console.warn('get_smart_folder_stats_rpc failed:', error);
      return null;
    }
    return data as SmartFolderStats;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private getFolderAndDescendantIds(folderId: string): string[] {
    const ids: string[] = [folderId];
    const children = this.folders().filter(f => f.parent_id === folderId);
    for (const child of children) {
      ids.push(...this.getFolderAndDescendantIds(child.id));
    }
    return ids;
  }

  private sanitizeFolderName(name: string): string {
    // Remove special chars, limit length, replace spaces with underscores
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 50) || 'Sin_nombre';
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
