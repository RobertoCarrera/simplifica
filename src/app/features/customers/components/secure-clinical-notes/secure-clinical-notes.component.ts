import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { BookingNotesService, ClientBookingNote, ClientBookingDocument } from '../../../../services/booking-notes.service';
import { SupabaseBookingsService } from '../../../../services/supabase-bookings.service';
import { ToastService } from '../../../../services/toast.service';
import { GdprComplianceService } from '../../../../services/gdpr-compliance.service';

@Component({
  selector: 'app-secure-clinical-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, TranslocoPipe],
  template: `
    <div class="secure-notes-container">

      <!-- ============================================================
           SECTION: Add New Clinical Note
           ============================================================ -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 mb-6 relative overflow-hidden">
        <div class="absolute top-0 right-0 p-2 opacity-5">
          <i class="fas fa-lock text-9xl"></i>
        </div>

        <h3 class="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white mb-4 relative z-10">
          <div class="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <i class="fas fa-shield-alt"></i>
          </div>
          {{ 'clients.historialClinico.titulo' | transloco }}
          <span class="ml-auto text-xs font-normal px-2 py-1 bg-emerald-50 text-emerald-700 rounded border border-emerald-100 flex items-center gap-1">
            <i class="fas fa-check-circle"></i> {{ 'clients.historialClinico.encriptado' | transloco }}
          </span>
        </h3>

        <div class="relative z-10 space-y-3">
          <!-- Booking selector -->
          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              <i class="fas fa-calendar-check mr-1"></i> Asociar a una reserva
            </label>
            @if (isLoadingBookings()) {
              <div class="text-xs text-slate-400 py-2"><i class="fas fa-spinner fa-spin mr-1"></i> Cargando reservas...</div>
            } @else if (pastBookings().length === 0) {
              <p class="text-xs text-slate-400 italic">No hay reservas pasadas registradas para este cliente.</p>
            } @else {
              <select
                [value]="selectedBookingId()"
                (change)="selectedBookingId.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="">-- Seleccionar reserva --</option>
                @for (b of pastBookings(); track b.id) {
                  <option [value]="b.id">
                    {{ b.start_time | date:'dd MMM yyyy' }} &mdash; {{ b.service?.name || 'Servicio Personalizado' }}
                  </option>
                }
              </select>
            }
          </div>

          <!-- Note content -->
          <textarea
            [(ngModel)]="newNoteContent"
            rows="3"
            class="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all p-3"
            placeholder="{{ 'clients.historialClinico.placeholder' | transloco }}"
          ></textarea>

          <div class="flex justify-end">
            <button
              (click)="addNote()"
              [disabled]="!newNoteContent.trim() || !selectedBookingId() || isSaving()"
              class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i class="fas" [class.fa-spinner]="isSaving()" [class.fa-spin]="isSaving()" [class.fa-lock]="!isSaving()"></i>
              {{ isSaving() ? ('clients.historialClinico.guardando' | transloco) : ('clients.historialClinico.guardar' | transloco) }}
            </button>
          </div>
        </div>
      </div>

      <!-- ============================================================
           SECTION: Notes Timeline
           ============================================================ -->
      <div class="space-y-4">
        @if (isLoading()) {
          <div class="text-center py-10 opacity-50">
            <i class="fas fa-circle-notch fa-spin text-2xl mb-2"></i>
            <p>{{ 'clients.historialClinico.desencriptando' | transloco }}</p>
          </div>
        }

        @if (!isLoading() && notes().length === 0) {
          <div class="text-center py-10 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">
            <i class="fas fa-user-md text-3xl mb-2 text-slate-300"></i>
            <p>{{ 'clients.historialClinico.vacio' | transloco }}</p>
          </div>
        }

        <!-- Search & Filter Bar -->
        @if (!isLoading() && notes().length > 0) {
          <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-4 flex flex-col sm:flex-row gap-3">
            <div class="flex-1 relative">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                type="text"
                [value]="searchQuery()"
                (input)="searchQuery.set($any($event.target).value)"
                placeholder="Buscar en notas o servicio..."
                class="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div class="flex gap-2 items-center">
              <input
                type="date"
                [value]="dateFrom()"
                (change)="dateFrom.set($any($event.target).value)"
                class="text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-2 focus:ring-2 focus:ring-emerald-500"
                title="Desde"
              />
              <span class="text-slate-400 text-xs">&mdash;</span>
              <input
                type="date"
                [value]="dateTo()"
                (change)="dateTo.set($any($event.target).value)"
                class="text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-2 focus:ring-2 focus:ring-emerald-500"
                title="Hasta"
              />
              @if (searchQuery() || dateFrom() || dateTo()) {
                <button
                  (click)="clearFilters()"
                  class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded border border-slate-200 dark:border-slate-600"
                  title="Limpiar filtros"
                >
                  <i class="fas fa-times"></i>
                </button>
              }
            </div>
          </div>
          <p class="text-xs text-slate-400 mb-3 pl-1">
            {{ filteredNotes().length }} de {{ notes().length }} notas
          </p>
        }

        <!-- Note Items -->
        @for (note of filteredNotes(); track note.id) {
          <div class="relative pl-6 pb-6 border-l-2 border-slate-200 dark:border-slate-700 last:border-0 last:pb-0">
            <div class="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800"></div>
            <div class="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-700 group hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors">
              <!-- Note header -->
              <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {{ note.booking_start_time | date:'mediumDate' }}
                  </span>
                  <span class="text-xs text-slate-400">{{ note.booking_start_time | date:'shortTime' }}</span>
                  @if (note.service_name) {
                    <span class="text-xs px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-100 dark:border-emerald-800/30">
                      {{ note.service_name }}
                    </span>
                  }
                </div>
                <div class="text-xs text-slate-400 flex items-center gap-1">
                  <i class="fas fa-user-circle"></i> {{ note.created_by_name || ('clients.historialClinico.desconocido' | transloco) }}
                </div>
              </div>
              <!-- Content (blurred by default for privacy) -->
              <div class="relative">
                <div
                  [class.blur-sm]="!revealedNotes.has(note.id)"
                  [class.select-none]="!revealedNotes.has(note.id)"
                  class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap transition-all duration-300 text-sm"
                >
                  {{ note.content }}
                </div>
                @if (!revealedNotes.has(note.id)) {
                  <div
                    class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 cursor-pointer backdrop-blur-[2px] hover:bg-transparent transition-all"
                    (click)="toggleReveal(note.id)"
                    title="Click para revelar contenido"
                  >
                    <div class="px-3 py-1 bg-slate-900/80 text-white text-xs rounded-full flex items-center gap-1 shadow-lg backdrop-blur-md">
                      <i class="fas fa-eye"></i> Tocar para leer
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        }
      </div>

      <!-- ============================================================
           SECTION: Documents
           ============================================================ -->
      @if (!isLoading()) {
        <div class="mt-8">
          <h4 class="flex items-center gap-2 text-base font-bold text-slate-700 dark:text-slate-200 mb-4">
            <i class="fas fa-paperclip text-blue-500"></i>
            Documentos Adjuntos
            @if (documents().length > 0) {
              <span class="ml-auto text-xs font-normal text-slate-400">{{ documents().length }} documento(s)</span>
            }
          </h4>

          @if (isLoadingDocs()) {
            <div class="text-center py-6 opacity-50">
              <i class="fas fa-circle-notch fa-spin text-xl mb-2"></i>
              <p class="text-sm">Cargando documentos...</p>
            </div>
          } @else if (documents().length === 0) {
            <div class="text-center py-8 opacity-50 border-2 border-dashed border-slate-200 rounded-xl">
              <i class="fas fa-paperclip text-2xl mb-2 text-slate-300"></i>
              <p class="text-sm">Sin documentos adjuntos</p>
            </div>
          } @else {
            <div class="space-y-2">
              @for (doc of documents(); track doc.id) {
                <div class="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                  <div class="flex items-center gap-3 min-w-0">
                    <i class="fas fa-file text-slate-400 flex-shrink-0"></i>
                    <div class="min-w-0">
                      <p class="text-sm text-slate-800 dark:text-slate-200 truncate font-medium">{{ doc.file_name }}</p>
                      <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span class="text-xs text-slate-400">{{ doc.booking_start_time | date:'dd MMM yyyy' }}</span>
                        @if (doc.service_name) {
                          <span class="text-xs text-slate-400">&bull; {{ doc.service_name }}</span>
                        }
                        @if (doc.file_size) {
                          <span class="text-xs text-slate-400">&bull; {{ formatFileSize(doc.file_size) }}</span>
                        }
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2 ml-3 flex-shrink-0">
                    @if (doc.signed_url) {
                      <button
                        (click)="openViewer(doc)"
                        class="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 text-sm p-1"
                        title="Ver documento"
                      >
                        <i class="fas fa-eye"></i>
                      </button>
                      <a
                        [href]="doc.signed_url"
                        target="_blank"
                        class="text-blue-600 hover:text-blue-800 text-sm p-1"
                        title="Descargar"
                      >
                        <i class="fas fa-download"></i>
                      </a>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- ============================================================
           Inline Document Viewer Modal
           ============================================================ -->
      @if (viewerDoc()) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          (click)="closeViewer()"
        >
          <div
            class="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            (click)="$event.stopPropagation()"
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <div class="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-white truncate">
                <i class="fas fa-file text-gray-400"></i>
                {{ viewerDoc()!.file_name }}
              </div>
              <div class="flex items-center gap-2 ml-4 flex-shrink-0">
                <a
                  [href]="viewerDoc()!.signed_url"
                  target="_blank"
                  class="text-blue-600 hover:text-blue-800 text-sm px-3 py-1 border border-blue-200 rounded-lg flex items-center gap-1"
                >
                  <i class="fas fa-download"></i> Descargar
                </a>
                <button
                  (click)="closeViewer()"
                  class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                >
                  <i class="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
            <div class="flex-1 overflow-auto">
              @if (isViewerPdf()) {
                <iframe [src]="viewerSafeUrl()" class="w-full h-[75vh] border-0" title="Visor PDF"></iframe>
              } @else if (isViewerImage()) {
                <div class="flex items-center justify-center p-4">
                  <img
                    [src]="viewerDoc()!.signed_url"
                    class="max-w-full max-h-[75vh] object-contain rounded"
                    [alt]="viewerDoc()!.file_name"
                  />
                </div>
              } @else {
                <div class="flex flex-col items-center justify-center py-16 gap-4 text-gray-500">
                  <i class="fas fa-file-alt text-5xl text-gray-300"></i>
                  <p class="text-sm">Este tipo de archivo no se puede previsualizar.</p>
                  <a
                    [href]="viewerDoc()!.signed_url"
                    target="_blank"
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    <i class="fas fa-download mr-1"></i> Descargar archivo
                  </a>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .blur-sm { filter: blur(4px); }
  `],
})
export class SecureClinicalNotesComponent implements OnInit {
  @Input({ required: true }) clientId!: string;

  private bookingNotesService = inject(BookingNotesService);
  private bookingsService = inject(SupabaseBookingsService);
  private toastService = inject(ToastService);
  private gdprService = inject(GdprComplianceService);
  private sanitizer = inject(DomSanitizer);

  // Notes (from booking_clinical_notes)
  notes = signal<ClientBookingNote[]>([]);
  isLoading = signal(true);
  isSaving = signal(false);
  newNoteContent = '';

  // Documents
  documents = signal<ClientBookingDocument[]>([]);
  isLoadingDocs = signal(false);

  // Booking selector (for note creation)
  pastBookings = signal<{ id: string; start_time: string; service?: { name: string } }[]>([]);
  isLoadingBookings = signal(false);
  selectedBookingId = signal('');

  // Filters
  searchQuery = signal('');
  dateFrom = signal('');
  dateTo = signal('');

  filteredNotes = computed(() => {
    let result = this.notes();
    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      result = result.filter(n =>
        n.content.toLowerCase().includes(q) ||
        (n.service_name?.toLowerCase().includes(q) ?? false)
      );
    }
    if (this.dateFrom()) {
      result = result.filter(n => n.booking_start_time >= this.dateFrom());
    }
    if (this.dateTo()) {
      const toEnd = this.dateTo() + 'T23:59:59';
      result = result.filter(n => n.booking_start_time <= toEnd);
    }
    return result;
  });

  revealedNotes = new Set<string>();

  // Inline viewer
  viewerDoc = signal<ClientBookingDocument | null>(null);
  viewerSafeUrl = signal<SafeResourceUrl | null>(null);

  ngOnInit() {
    this.loadAll();
  }

  async loadAll() {
    this.isLoading.set(true);
    this.isLoadingDocs.set(true);
    this.isLoadingBookings.set(true);

    try {
      const [notes, docs, bookings] = await Promise.all([
        firstValueFrom(this.bookingNotesService.getNotesForClient(this.clientId)),
        firstValueFrom(this.bookingNotesService.getDocumentsForClient(this.clientId)),
        this.bookingsService.getBookings({
          clientId: this.clientId,
          before: new Date().toISOString(),
          ascending: false,
          limit: 100,
          columns: 'id,start_time,service:services(name)',
        }).then(({ data }) => data || []),
      ]);

      this.notes.set(notes);
      this.documents.set(docs);
      this.pastBookings.set(bookings as any[]);

      this.gdprService.logGdprEvent(
        'ACCESS',
        'clinical_notes',
        this.clientId,
        undefined,
        'User accessed clinical notes timeline (Historial Clínico)',
      );
    } catch (err) {
      this.toastService.error('Error al cargar el historial clínico', 'Error');
    } finally {
      this.isLoading.set(false);
      this.isLoadingDocs.set(false);
      this.isLoadingBookings.set(false);
    }
  }

  async addNote() {
    const content = this.newNoteContent.trim();
    const bookingId = this.selectedBookingId();
    if (!content || !bookingId) return;

    this.isSaving.set(true);
    try {
      await firstValueFrom(this.bookingNotesService.createNote(bookingId, content));
      this.toastService.success('Nota guardada y encriptada correctamente', 'Seguridad');
      this.newNoteContent = '';
      this.selectedBookingId.set('');
      await this.loadAll();
    } catch (err) {
      this.toastService.error('Error al guardar la nota', 'Error');
    } finally {
      this.isSaving.set(false);
    }
  }

  clearFilters() {
    this.searchQuery.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
  }

  toggleReveal(id: string) {
    if (this.revealedNotes.has(id)) {
      this.revealedNotes.delete(id);
    } else {
      this.revealedNotes.add(id);
    }
  }

  openViewer(doc: ClientBookingDocument) {
    if (doc.signed_url) {
      this.viewerSafeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(doc.signed_url));
    }
    this.viewerDoc.set(doc);
  }

  closeViewer() {
    this.viewerDoc.set(null);
    this.viewerSafeUrl.set(null);
  }

  isViewerPdf(): boolean {
    const doc = this.viewerDoc();
    if (!doc) return false;
    return doc.file_type === 'application/pdf' || doc.file_name.toLowerCase().endsWith('.pdf');
  }

  isViewerImage(): boolean {
    const doc = this.viewerDoc();
    if (!doc) return false;
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageTypes.includes(doc.file_type ?? '') || imageExts.some(ext => doc.file_name.toLowerCase().endsWith(ext));
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
