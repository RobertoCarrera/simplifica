import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SupabaseDocumentsService,
  ClientDocument,
} from '../../../../../services/supabase-documents.service';
import { ToastService } from '../../../../../services/toast.service';
import { SupabaseNotificationsService } from '../../../../../services/supabase-notifications.service';
import { AuditLoggerService } from '../../../../../services/audit-logger.service';
import { ContractCreationDialogComponent } from '../contract-creation-dialog/contract-creation-dialog.component';
import { ContractsService, Contract } from '../../../../../core/services/contracts.service';
import { ConfirmModalComponent } from '../../../../../shared/ui/confirm-modal/confirm-modal.component';
import { ViewChild } from '@angular/core';

@Component({
  selector: 'app-client-documents',
  standalone: true,
  imports: [CommonModule, ContractCreationDialogComponent, FormsModule, ConfirmModalComponent],
  template: `
    <app-confirm-modal #confirmModal></app-confirm-modal>
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">Documentos</h3>
        <div class="flex gap-3">
          <button
            (click)="showCreateContract.set(true)"
            class="px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
          >
            <i class="fas fa-file-signature"></i>
            Crear Documento
          </button>

          <div class="relative">
            <input
              type="file"
              id="fileUpload"
              class="hidden"
              (change)="handleFileUpload($event)"
              [disabled]="isUploading()"
            />
            <label
              for="fileUpload"
              [class.opacity-50]="isUploading()"
              [class.cursor-not-allowed]="isUploading()"
              class="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              <i
                class="fas fa-upload"
                [class.fa-spinner]="isUploading()"
                [class.fa-spin]="isUploading()"
              ></i>
              {{ isUploading() ? 'Subiendo...' : 'Subir Documento' }}
            </label>
          </div>
        </div>
      </div>

      
      <div class="flex gap-2">
        <button (click)="showCreateFolderModal.set(true)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
          <i class="fas fa-folder-plus"></i> Crear Carpeta
        </button>
      </div>
      <!-- Modal para crear carpeta -->
      @if (showCreateFolderModal()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div class="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm p-6 relative animate-fade-in-up">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">Nueva Carpeta</h3>
            <form (ngSubmit)="confirmCreateFolder()" autocomplete="off">
              <input type="text" [(ngModel)]="newFolderName" name="folderName" placeholder="Nombre de la nueva carpeta" autofocus
                class="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div class="flex justify-end gap-2">
                <button type="button" (click)="cancelCreateFolder()" class="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" [disabled]="isUploading() || !newFolderName.trim()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2">
                  <i class="fas fa-check"></i> Crear
                </button>
              </div>
            </form>
            @if (isUploading()) {
              <div class="absolute inset-0 bg-white/60 dark:bg-slate-800/60 flex items-center justify-center rounded-xl">
                <i class="fas fa-spinner fa-spin text-2xl text-blue-500"></i>
              </div>
            }
          </div>
        </div>
      }
      <!-- Files Grid -->
      <div
        class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[200px]"
      >
        @if (isLoading()) {
          <div class="p-8 flex justify-center">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }

        

        @if (!isLoading()) {
          @if (documents().length === 0) {
            <div class="p-12 text-center text-gray-500 dark:text-gray-400">
              <i class="fas fa-folder-open text-4xl mb-3 opacity-50"></i>
              <p>No hay documentos subidos.</p>
            </div>
          }
          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            @if (currentPath() !== '') {
              <div (click)="goUpFolder()" class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-4 cursor-pointer">
                <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-xl">
                  <i class="fas fa-level-up-alt text-gray-500"></i>
                </div>
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">.. Volver</h4>
              </div>
            }
            @for (doc of filteredDocuments; track doc) {
              <div
                class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group"
              >
                <div class="flex items-center gap-4 cursor-pointer" (click)="doc.file_type === 'folder' ? openFolder(doc) : null">
                  <div
                    class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-xl"
                  >
                    <i [class]="doc.file_type === 'folder' ? 'fas fa-folder text-yellow-500' : getFileIcon(doc.file_type)"></i>
                  </div>
                  <div>
                    <h4
                      class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-md"
                    >
                      {{ doc.name }}
                    </h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400 flex gap-3">
                      <span>{{ doc.created_at | date: 'shortDate' }}</span>
                      <span>{{ formatSize(doc.size) }}</span>
                    </p>
                  </div>
                </div>
                <div
                  class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <!-- only files can be downloaded -->
                  @if (doc.file_type !== 'folder') {
                  <button (click)="download(doc)"
                    class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                    title="Descargar"
                  >
                    <i class="fas fa-download"></i>
                  </button>
                  }
                  <button (click)="delete(doc)"
                    class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
      
      
      <!-- Contracts List -->
      <div class="mt-8">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">Documentos Generados</h3>
        </div>

        @if (isLoadingContracts()) {
          <div class="p-8 flex justify-center">
             <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }

        @if (!isLoadingContracts() && contracts().length === 0) {
          <div class="p-12 text-center text-gray-500 dark:text-gray-400">
            <i class="fas fa-file-contract text-4xl mb-3 opacity-50"></i>
            <p>No hay documentos generados para este cliente.</p>
          </div>
        }

        @if (!isLoadingContracts() && contracts().length > 0) {
          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            @for (contract of contracts(); track contract) {
              <div class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <i class="fas fa-file-signature text-blue-500"></i>
                  </div>
                  <div>
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ contract.title }}
                    </h4>
                    <div class="text-xs text-gray-500 flex gap-3 mt-1">
                      <span>{{ contract.created_at | date: 'shortDate' }}</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium" 
                            [ngClass]="{
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300': contract.status === 'draft',
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300': contract.status === 'sent',
                              'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300': contract.status === 'signed'
                            }">
                        {{ contract.status | uppercase }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button (click)="shareContract(contract)" class="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Compartir en el Portal (Solicitar Firma)">
                    <i class="fas fa-share-nodes"></i>
                  </button>
                  <button (click)="sendContractToWebmail(contract)" class="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors" title="Enviar por Correo">
                    <i class="fas fa-envelope"></i>
                  </button>
                  <button (click)="editContract(contract)" class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors" title="Editar">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button (click)="deleteContractAction(contract)" class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>

    @if (showCreateContract()) {
      <app-contract-creation-dialog
        [contractToEdit]="contractToEdit()"
        [clientId]="clientId"
        [companyId]="companyId"
        [clientName]="clientName"
        [clientEmail]="clientEmail"
        (close)="showCreateContract.set(false); contractToEdit.set(null)"
        (created)="onContractCreated()"
      ></app-contract-creation-dialog>
    }
  `,
})
export class ClientDocumentsComponent implements OnInit {
  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @Input({ required: true }) clientId!: string;
  @Input({ required: true }) companyId!: string;
  @Input() clientName: string = '';
  @Input() clientEmail: string = '';

  docsService = inject(SupabaseDocumentsService);
  contractsService = inject(ContractsService);
  toast = inject(ToastService);
  notifications = inject(SupabaseNotificationsService);
  auditLogger = inject(AuditLoggerService);
  router = inject(Router);

  documents = signal<ClientDocument[]>([]);
  currentPath = signal("");
  contracts = signal<Contract[]>([]);
  isLoading = signal(false);
  isLoadingContracts = signal(false);
  isUploading = signal(false);
  showCreateContract = signal(false);
  contractToEdit = signal<Contract | null>(null);

  ngOnInit() {
    this.loadDocuments();
    this.loadContracts();
  }

  loadDocuments() {
    this.isLoading.set(true);
    this.docsService.getDocuments(this.clientId).subscribe({
      next: (docs) => {
        this.documents.set(docs);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      },
    });
  }

    loadContracts() {
    this.isLoadingContracts.set(true);
    this.contractsService.getClientContracts(this.clientId).subscribe({
      next: (data) => {
        this.contracts.set(data);
        this.isLoadingContracts.set(false);
      },
      error: () => {
        this.isLoadingContracts.set(false);
      }
    });
  }

  private static readonly ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ]);

  private static readonly BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.sh', '.app', '.dll',
    '.scr', '.pif', '.vbs', '.js', '.ws', '.wsf', '.ps1',
  ]);

  async handleFileUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      this.toast.error('Error', 'El archivo es demasiado grande (Máx 10MB)');
      return;
    }

    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (ClientDocumentsComponent.BLOCKED_EXTENSIONS.has(ext)) {
      this.toast.error('Error', 'Tipo de archivo no permitido');
      return;
    }

    if (file.type && !ClientDocumentsComponent.ALLOWED_MIME_TYPES.has(file.type)) {
      this.toast.error('Error', 'Tipo de archivo no permitido');
      return;
    }

    this.isUploading.set(true);
    try {
      if (this.docsService.uploadDocumentInFolder) {
         await this.docsService.uploadDocumentInFolder(this.clientId, file, this.currentPath());
      } else {
         await this.docsService.uploadDocument(this.clientId, file);
      }
      this.toast.success('Éxito', 'Documento subido correctamente');
      this.loadDocuments();
    } catch (e) {
      console.error(e);
      this.toast.error('Error', 'No se pudo subir el archivo');
    } finally {
      this.isUploading.set(false);
      event.target.value = ''; 
    }
  }

  async download(doc: ClientDocument) {
    try {
      const url = await this.docsService.getDownloadUrl(doc.file_path);
      window.open(url, '_blank');
    } catch (e) {
      this.toast.error('Error', 'No se pudo generar el enlace de descarga');
    }
  }

  async delete(doc: ClientDocument) {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Documento',
      message: `¿Estás seguro de que deseas eliminar el documento "${doc.name}"? Esta acción no se puede deshacer.`,
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;

    try {
      await this.docsService.deleteDocument(doc.id, doc.file_path);
      this.toast.success('Eliminado', 'Documento eliminado');
      this.documents.update((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      console.error(e);
      this.toast.error('Error', 'No se pudo eliminar el documento');
    }
  }

  // Helpers
  formatSize(bytes?: number): string {
    if (!bytes) return '0 B';
    const k = 1024;
    const packages = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + packages[i];
  }

  getFileIcon(type?: string): string {
    if (!type) return 'fas fa-file';
    if (type.includes('pdf')) return 'fas fa-file-pdf text-red-500';
    if (type.includes('image')) return 'fas fa-file-image text-purple-500';
    if (type.includes('word') || type.includes('document')) return 'fas fa-file-word text-blue-500';
    if (type.includes('excel') || type.includes('sheet')) return 'fas fa-file-excel text-green-500';
    return 'fas fa-file text-gray-400';
  }

  
  // FOLDERS Logic
  get filteredDocuments() {
    return this.documents().filter(d => (d.folder_path || '') === this.currentPath());
  }

  showCreateFolderModal = signal(false);
  newFolderName = '';

  async confirmCreateFolder() {
    const folderName = this.newFolderName.trim();
    if (!folderName) return;
    try {
      this.isUploading.set(true);
      await this.docsService.createFolder(this.clientId, folderName, this.currentPath());
      this.toast.success('Éxito', 'Carpeta creada');
      this.loadDocuments();
      this.cancelCreateFolder();
    } catch (e) {
      this.toast.error('Error', 'No se pudo crear la carpeta');
    } finally {
      this.isUploading.set(false);
    }
  }

  cancelCreateFolder() {
    this.showCreateFolderModal.set(false);
    this.newFolderName = '';
  }

  openFolder(folder: ClientDocument) {
    this.currentPath.set(folder.file_path);
  }

  goUpFolder() {
    const parts = this.currentPath().split('/');
    parts.pop();
    this.currentPath.set(parts.join('/'));
  }

  onContractCreated() {
    this.loadContracts();
  }

  
  async shareContract(contract: Contract) {
    if (contract.status !== 'draft') {
      this.toast.info('Info', 'El documento ya ha sido compartido o firmado.');
      return;
    }
    
    const confirmed = await this.confirmModal.open({
      title: 'Compartir Documento',
      message: '¿Deseas hacer visible este documento en el portal del cliente para su revisión y firma?',
      icon: 'fas fa-share-nodes',
      iconColor: 'blue',
      confirmText: 'Compartir',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;
    
    this.contractsService.updateContract(contract.id, { status: 'sent' }).subscribe({
      next: () => {
        this.toast.success('Compartido', 'El documento ahora es visible para el cliente.');
        this.auditLogger.logAction('share_document', 'contracts', contract.id, { client_id: this.clientId });
        this.notifications.sendNotification(
          this.clientId,
          'Nuevo Documento',
          'Tienes un nuevo documento pendiente de revisión y firma.',
          'document',
          contract.id,
          true
        );
        this.loadContracts();
      },
      error: () => this.toast.error('Error', 'No se pudo compartir el documento')
    });
  }

  
  sendContractToWebmail(contract: Contract) {
    this.router.navigate(['/webmail/composer'], {
      state: {
        to: this.clientEmail,
        subject: contract.title,
        body: contract.content_html
      }
    });
  }

  editContract(contract: Contract) {
    this.contractToEdit.set(contract);
    this.showCreateContract.set(true);
  }

  async deleteContractAction(contract: Contract) {
    const confirmed = await this.confirmModal.open({
      title: 'Eliminar Documento',
      message: `¿Estás seguro de que quieres eliminar el documento generado "${contract.title}"?`,
      icon: 'fas fa-trash-alt',
      iconColor: 'red',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
    if (!confirmed) return;

    this.contractsService.deleteContract(contract.id).subscribe({
      next: () => {
        this.contracts.update(prev => prev.filter(c => c.id !== contract.id));
        this.toast.success('Eliminado', 'Documento eliminado');
      },
      error: () => {
        this.toast.error('Error', 'No se pudo eliminar el documento');
      }
    });
  }

}
