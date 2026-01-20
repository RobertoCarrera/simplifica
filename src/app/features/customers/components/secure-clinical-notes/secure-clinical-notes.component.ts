import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClinicalNotesService, ClinicalNote } from '../../../../services/clinical-notes.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
    selector: 'app-secure-clinical-notes',
    standalone: true,
    imports: [CommonModule, FormsModule, DatePipe],
    template: `
    <div class="secure-notes-container">
      <!-- Header / Add Note -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6 relative overflow-hidden">
        <div class="absolute top-0 right-0 p-2 opacity-5">
           <i class="fas fa-lock text-9xl"></i>
        </div>

        <h3 class="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white mb-4 relative z-10">
          <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
             <i class="fas fa-shield-alt"></i>
          </div>
          Notas Clínicas Seguras
          <span class="ml-auto text-xs font-normal px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 flex items-center gap-1">
            <i class="fas fa-check-circle"></i> Encriptado AES-256
          </span>
        </h3>

        <div class="relative z-10">
          <textarea 
            [(ngModel)]="newNoteContent" 
            rows="3" 
            class="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all p-3"
            placeholder="Escribe una nueva nota clínica (se encriptará automáticamente)..."></textarea>
          
          <div class="flex justify-end mt-2">
            <button 
              (click)="addNote()" 
              [disabled]="!newNoteContent.trim() || isSaving()"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <i class="fas" [class.fa-spinner]="isSaving()" [class.fa-spin]="isSaving()" [class.fa-lock]="!isSaving()"></i>
              {{ isSaving() ? 'Encriptando y Guardando...' : 'Guardar Nota Segura' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Timeline -->
      <div class="space-y-4">
        <div *ngIf="isLoading()" class="text-center py-10 opacity-50">
             <i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i>
             <p>Desencriptando historial...</p>
        </div>

        <div *ngIf="!isLoading() && notes().length === 0" class="text-center py-10 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">
            <i class="fas fa-user-md text-3xl mb-2 text-slate-300"></i>
            <p>No hay notas clínicas registradas.</p>
        </div>

        <!-- Note Item -->
        <div *ngFor="let note of notes()" class="relative pl-6 pb-6 border-l-2 border-slate-200 dark:border-slate-700 last:border-0 last:pb-0">
           <!-- Bullet -->
           <div class="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800"></div>
           
           <div class="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-700 group hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors">
              <div class="flex items-center justify-between mb-2">
                 <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">{{ note.created_at | date:'mediumDate' }}</span>
                    <span class="text-xs text-slate-400">{{ note.created_at | date:'shortTime' }}</span>
                 </div>
                 <div class="text-xs text-slate-400 flex items-center gap-1">
                    <i class="fas fa-user-circle"></i> {{ note.created_by_name || 'Desconocido' }}
                 </div>
              </div>

              <!-- Content (Blurred by default for privacy) -->
              <div class="relative">
                 <div 
                   [class.blur-sm]="!revealedNotes.has(note.id)" 
                   [class.select-none]="!revealedNotes.has(note.id)"
                   class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap transition-all duration-300">
                   {{ note.content }}
                 </div>
                 
                 <!-- Unblur overlay -->
                 <div 
                   *ngIf="!revealedNotes.has(note.id)"
                   class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 cursor-pointer backdrop-blur-[2px] hover:bg-transparent transition-all"
                   (click)="toggleReveal(note.id)"
                   title="Click para revelar contenido">
                    <div class="px-3 py-1 bg-slate-900/80 text-white text-xs rounded-full flex items-center gap-1 shadow-lg backdrop-blur-md">
                       <i class="fas fa-eye"></i> Tocar para leer
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .blur-sm { filter: blur(4px); }
  `]
})
export class SecureClinicalNotesComponent implements OnInit {
    @Input({ required: true }) clientId!: string;

    private notesService = inject(ClinicalNotesService);
    private toastService = inject(ToastService);

    notes = signal<ClinicalNote[]>([]);
    isLoading = signal(true);
    isSaving = signal(false);
    newNoteContent = '';

    revealedNotes = new Set<string>();

    ngOnInit() {
        this.loadNotes();
    }

    loadNotes() {
        this.isLoading.set(true);
        this.notesService.getNotes(this.clientId).subscribe({
            next: (data) => {
                this.notes.set(data);
                this.isLoading.set(false);
            },
            error: (err) => {
                this.toastService.error('Error al cargar notas clínicas', 'Error de desencriptado');
                this.isLoading.set(false);
            }
        });
    }

    addNote() {
        const content = this.newNoteContent.trim();
        if (!content) return;

        this.isSaving.set(true);
        this.notesService.createNote(this.clientId, content).subscribe({
            next: () => {
                this.toastService.success('Nota guardada y encriptada correctamente', 'Seguridad');
                this.newNoteContent = '';
                this.isSaving.set(false);
                this.loadNotes(); // Reload timeline
            },
            error: (err) => {
                this.toastService.error('Error al guardar la nota', 'Error');
                this.isSaving.set(false);
            }
        });
    }

    toggleReveal(id: string) {
        if (this.revealedNotes.has(id)) {
            this.revealedNotes.delete(id);
        } else {
            this.revealedNotes.add(id);
        }
    }
}
