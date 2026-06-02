import { Component, inject, signal, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MailFolderService } from '../../services/mail-folder.service';
import { MailStoreService } from '../../services/mail-store.service';
import { MailFolder } from '../../../../core/interfaces/webmail.interface';
import { ToastService } from '../../../../services/toast.service';
import { MailErrorService } from '../../services/mail-error.service';

@Component({
  selector: 'app-folder-create-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Backdrop -->
    <div class="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-20" (click)="close.emit()">
      <!-- Dialog -->
      <div
        class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden transform transition-all"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ editMode() ? 'Renombrar carpeta' : 'Nueva carpeta' }}
          </h3>
        </div>

        <!-- Body -->
        <div class="px-5 py-4 space-y-4">
          <!-- Folder name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Nombre
            </label>
            <input
              type="text"
              [(ngModel)]="folderName"
              (keydown.enter)="submit()"
              placeholder="ej: Proyectos, Facturas..."
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              autofocus
            />
          </div>

          <!-- Parent folder (only for creation, not rename) -->
          @if (!editMode()) {
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Carpeta padre (opcional)
            </label>
            <select
              [(ngModel)]="parentFolderId"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option [ngValue]="null">— Ninguna (raíz) —</option>
              @for (folder of userFolders(); track folder.id) {
                <option [ngValue]="folder.id">{{ folder.path }}</option>
              }
            </select>
          </div>
          }
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            (click)="close.emit()"
          >
            Cancelar
          </button>
          <button
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            (click)="submit()"
            [disabled]="!folderName.trim() || saving()"
          >
            @if (saving()) {
              <i class="fas fa-spinner fa-spin mr-1"></i>
            }
            {{ editMode() ? 'Renombrar' : 'Crear' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class FolderCreateDialogComponent implements OnInit {
  private folderService = inject(MailFolderService);
  private store = inject(MailStoreService);
  private toast = inject(ToastService);
  private errors = inject(MailErrorService);

  @Input() editFolder: MailFolder | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<MailFolder>();

  folderName = '';
  parentFolderId: string | null = null;
  saving = signal(false);
  editMode = signal(false);

  userFolders = signal<MailFolder[]>([]);

  ngOnInit() {
    if (this.editFolder) {
      this.editMode.set(true);
      this.folderName = this.editFolder.name;
    }
    // Collect user-created folders (excluding system folders) for parent selection
    const userFolders = this.store.folders().filter(f => f.type === 'user');
    this.userFolders.set(userFolders);
  }

  async submit() {
    const name = this.folderName.trim();
    if (!name) return;

    const account = this.store.currentAccount();
    if (!account) {
      this.toast.error('Error', 'No hay cuenta seleccionada');
      return;
    }

    this.saving.set(true);
    try {
      if (this.editMode() && this.editFolder) {
        // Rename
        const ok = await this.folderService.renameFolder(this.editFolder.id, name);
        if (ok) {
          this.toast.success('Carpeta renombrada', `"${name}" actualizada correctamente`);
          this.close.emit();
        }
      } else {
        // Create
        const folder = await this.folderService.createFolder(account.id, name, this.parentFolderId);
        if (folder) {
          this.toast.success('Carpeta creada', `"${name}" creada correctamente`);
          this.created.emit(folder);
          this.close.emit();
        }
      }
    } catch (error) {
      const err = this.errors.parse(error);
      this.toast.error('Error', err.userMessage);
    } finally {
      this.saving.set(false);
    }
  }
}
