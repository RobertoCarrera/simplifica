import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseDocumentsService, ClientDocument } from '../../../../../services/supabase-documents.service';
import { ToastService } from '../../../../../services/toast.service';

@Component({
    selector: 'app-client-documents',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-center">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Documentos</h3>
            <div class="relative">
                <input type="file" id="fileUpload" class="hidden" (change)="handleFileUpload($event)" [disabled]="isUploading()">
                <label for="fileUpload" 
                    [class.opacity-50]="isUploading()"
                    [class.cursor-not-allowed]="isUploading()"
                    class="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors">
                    <i class="fas fa-upload" [class.fa-spinner]="isUploading()" [class.fa-spin]="isUploading()"></i> 
                    {{ isUploading() ? 'Subiendo...' : 'Subir Documento' }}
                </label>
            </div>
        </div>

        <!-- Files Grid -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[200px]">
            
            <div *ngIf="isLoading()" class="p-8 flex justify-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>

            <div *ngIf="!isLoading() && documents().length === 0" class="p-12 text-center text-gray-500 dark:text-gray-400">
                <i class="fas fa-folder-open text-4xl mb-3 opacity-50"></i>
                <p>No hay documentos subidos.</p>
            </div>

            <div *ngIf="!isLoading() && documents().length > 0" class="divide-y divide-gray-100 dark:divide-slate-700">
                <div *ngFor="let doc of documents()" class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-xl">
                            <i [class]="getFileIcon(doc.file_type)"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[200px] sm:max-w-md">{{ doc.name }}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400 flex gap-3">
                                <span>{{ doc.created_at | date:'shortDate' }}</span>
                                <span>{{ formatSize(doc.size) }}</span>
                            </p>
                        </div>
                    </div>

                    <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button (click)="download(doc)" class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors" title="Descargar">
                            <i class="fas fa-download"></i>
                        </button>
                        <button (click)="delete(doc)" class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>

                </div>
            </div>
        </div>
    </div>
  `
})
export class ClientDocumentsComponent implements OnInit {
    @Input({ required: true }) clientId!: string;

    docsService = inject(SupabaseDocumentsService);
    toast = inject(ToastService);

    documents = signal<ClientDocument[]>([]);
    isLoading = signal(false);
    isUploading = signal(false);

    ngOnInit() {
        this.loadDocuments();
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
            }
        });
    }

    async handleFileUpload(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        // Limit size (e.g., 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.toast.error('Error', 'El archivo es demasiado grande (Máx 10MB)');
            return;
        }

        this.isUploading.set(true);
        try {
            await this.docsService.uploadDocument(this.clientId, file);
            this.toast.success('Éxito', 'Documento subido correctamente');
            this.loadDocuments();
        } catch (e) {
            console.error(e);
            this.toast.error('Error', 'No se pudo subir el archivo');
        } finally {
            this.isUploading.set(false);
            event.target.value = ''; // Reset input
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
        if (!confirm(`¿Eliminar ${doc.name}?`)) return;

        try {
            await this.docsService.deleteDocument(doc.id, doc.file_path);
            this.toast.success('Eliminado', 'Documento eliminado');
            this.documents.update(prev => prev.filter(d => d.id !== doc.id));
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
}
