import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MailStoreService } from '../../services/mail-store.service';
import { MailOperationService } from '../../services/mail-operation.service';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './folder-tree.component.html',
  styleUrl: './folder-tree.component.scss'
})
export class FolderTreeComponent {
  store = inject(MailStoreService);
  private operations = inject(MailOperationService);

  folders = this.store.folderTree;

  isCreating = signal(false);
  newFolderName = signal('');
  isLoading = signal(false);

  startCreating() {
    this.newFolderName.set('');
    this.isCreating.set(true);
  }

  cancelCreating() {
    this.isCreating.set(false);
    this.newFolderName.set('');
  }

  async confirmCreate() {
    if (!this.newFolderName().trim()) return;

    const account = this.store.currentAccount();
    if (!account) return;

    this.isLoading.set(true);
    try {
      await this.operations.createFolder(this.newFolderName(), account.id);
      this.store.loadFolders(account.id); // Reload folders
      this.cancelCreating();
    } catch (err) {
      console.error('Error creating folder:', err);
      alert('Error al crear la carpeta. Es posible que el nombre ya exista.');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- Drag & Drop ---
  dragOverFolderId = signal<string | null>(null);

  onDragOver(event: DragEvent, folder: any) {
    event.preventDefault(); // Necessary to allow dropping
    this.dragOverFolderId.set(folder.id);
  }

  onDragLeave(event: DragEvent) {
    // Logic to clear highlight? 
    // Usually need rigorous checking if leaving to child or outside.
    // For simplicity, we might just rely on another dragover clearing it or drop clearing it.
  }

  async onDrop(event: DragEvent, folder: any) {
    event.preventDefault();
    this.dragOverFolderId.set(null);

    if (!event.dataTransfer) return;

    const data = event.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const payload = JSON.parse(data);
      if (payload.threadIds && Array.isArray(payload.threadIds)) {
        await this.operations.moveThreads(payload.threadIds, folder.id);

        // Reload current folder messages if we are viewing one of updated threads?
        // Simplest is to reload messages of current view if needed, but that's handled by MessageList.
        // We should update the UNREAD counts or total counts of folders.
        const account = this.store.currentAccount();
        if (account) this.store.loadFolders(account.id);

        // Potentially refresh message list if we moved OUT of current folder
        // MailStoreService doesn't expose a "reloadCurrent" easily.
        // But the UI will update eventually or manual refresh.
      }
    } catch (e) {
      console.error('Error processing drop:', e);
    }
  }
}
