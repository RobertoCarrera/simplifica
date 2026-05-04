import { Component, Input, OnInit, inject, signal, computed, effect, untracked } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { BookingNotesService, ClientBookingNote, ClientBookingDocument } from '../../../../services/booking-notes.service';
import { SupabaseBookingsService } from '../../../../services/supabase-bookings.service';
import { ToastService } from '../../../../services/toast.service';
import { GdprComplianceService } from '../../../../services/gdpr-compliance.service';

type TimelineEntry =
  | { kind: 'note'; note: ClientBookingNote }
  | { kind: 'doc'; doc: ClientBookingDocument };

@Component({
  selector: 'app-secure-clinical-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, TranslocoPipe],
  template: `
    <div class="secure-notes-container">

      <!-- UNIFIED: Add Note + Document -->
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
          <!-- Shared booking selector -->
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
                [value]="sharedBookingId()"
                (change)="sharedBookingId.set($any($event.target).value)"
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

          <!-- Tab switcher -->
          <div class="flex gap-2 border-b border-slate-200 dark:border-slate-700">
            <button
              (click)="inputMode.set('note')"
              class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              [class.border-emerald-500]="inputMode() === 'note'"
              [class.text-emerald-600]="inputMode() === 'note'"
              [class.dark:text-emerald-400]="inputMode() === 'note'"
              [class.text-slate-500]="inputMode() !== 'note'"
              [class.border-transparent]="inputMode() !== 'note'"
            >
              <i class="fas fa-sticky-note mr-1"></i> Nota clínica
            </button>
            <button
              (click)="inputMode.set('doc')"
              class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
              [class.border-blue-500]="inputMode() === 'doc'"
              [class.text-blue-600]="inputMode() === 'doc'"
              [class.dark:text-blue-400]="inputMode() === 'doc'"
              [class.text-slate-500]="inputMode() !== 'doc'"
              [class.border-transparent]="inputMode() !== 'doc'"
            >
              <i class="fas fa-paperclip mr-1"></i> Documento
            </button>
          </div>

          <!-- Note input -->
          @if (inputMode() === 'note') {
            <textarea
              [(ngModel)]="newNoteContent"
              rows="3"
              class="w-full rounded-lg border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all p-3"
              placeholder="{{ 'clients.historialClinico.placeholder' | transloco }}"
            ></textarea>
          }

          <!-- Document input -->
          @if (inputMode() === 'doc') {
            <div class="flex items-center gap-3">
              <label class="flex-1 cursor-pointer">
                <input
                  type="file"
                  [disabled]="!sharedBookingId() || isUploading()"
                  (change)="onFileSelected($event)"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx"
                  class="hidden"
                  #fileInput
                />
                <div
                  (click)="fileInput.click()"
                  class="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                  [class.opacity-50]="!sharedBookingId()"
                  [class.cursor-not-allowed]="!sharedBookingId()"
                >
                  <i class="fas fa-paperclip"></i>
                  {{ selectedFile() ? selectedFile()!.name : 'Seleccionar archivo...' }}
                  @if (selectedFile()) {
                    <span class="text-xs text-slate-400">({{ formatFileSize(selectedFile()!.size) }})</span>
                  }
                </div>
              </label>
            </div>
          }

          <!-- Submit -->
          <div class="flex justify-end">
            @if (inputMode() === 'note') {
              <button
                (click)="addNote()"
                [disabled]="!newNoteContent.trim() || !sharedBookingId() || isSaving()"
                class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i class="fas" [class.fa-spinner]="isSaving()" [class.fa-spin]="isSaving()" [class.fa-lock]="!isSaving()"></i>
                {{ isSaving() ? ('clients.historialClinico.guardando' | transloco) : ('clients.historialClinico.guardar' | transloco) }}
              </button>
            } @else {
              <button
                (click)="uploadSelectedFile()"
                [disabled]="!selectedFile() || !sharedBookingId() || isUploading()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i class="fas" [class.fa-spinner]="isUploading()" [class.fa-spin]="isUploading()" [class.fa-cloud-upload-alt]="!isUploading()"></i>
                {{ isUploading() ? 'Subiendo...' : 'Subir documento' }}
              </button>
            }
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
            {{ combinedTimeline().length }} registro(s)
          </p>
        }

        <!-- Timeline Items -->
        @for (item of combinedTimeline(); track item.kind === 'note' ? item.note.id : item.doc.id) {
          @if (item.kind === 'note') {
            <div class="relative pl-6 pb-6 border-l-2 border-slate-200 dark:border-slate-700 last:border-0 last:pb-0">
              <div class="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800"></div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-700 group hover:border-emerald-200 dark:hover:border-emerald-900/30 transition-colors">
                <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {{ item.note.booking_start_time | date:'mediumDate' }}
                    </span>
                    <span class="text-xs text-slate-400">{{ item.note.booking_start_time | date:'shortTime' }}</span>
                    @if (item.note.service_name) {
                      <span class="text-xs px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded border border-emerald-100 dark:border-emerald-800/30">
                        {{ item.note.service_name }}
                      </span>
                    }
                  </div>
                  <div class="text-xs text-slate-400 flex items-center gap-1">
                    <i class="fas fa-user-circle"></i> {{ item.note.created_by_name || ('clients.historialClinico.desconocido' | transloco) }}
                  </div>
                </div>
                <div class="relative">
                  <div
                    [class.blur-sm]="!revealedNotes.has(item.note.id)"
                    [class.select-none]="!revealedNotes.has(item.note.id)"
                    class="text-slate-700 dark:text-slate-300 whitespace-pre-wrap transition-all duration-300 text-sm"
                  >
                    {{ item.note.content }}
                  </div>
                  @if (!revealedNotes.has(item.note.id)) {
                    <div
                      class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 cursor-pointer backdrop-blur-[2px] hover:bg-transparent transition-all"
                      (click)="toggleReveal(item.note.id)"
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
          } @else {
            <div class="relative pl-6 pb-6 border-l-2 border-blue-200 dark:border-blue-700 last:border-0 last:pb-0">
              <div class="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-blue-200 dark:bg-blue-700 border-2 border-white dark:border-slate-800"></div>
              <div class="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-100 dark:border-slate-700 group hover:border-blue-200 dark:hover:border-blue-900/30 transition-colors">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {{ item.doc.booking_start_time | date:'mediumDate' }}
                    </span>
                    <span class="text-xs text-slate-400">{{ item.doc.booking_start_time | date:'shortTime' }}</span>
                    @if (item.doc.service_name) {
                      <span class="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded border border-blue-100 dark:border-blue-900/30">
                        {{ item.doc.service_name }}
                      </span>
                    }
                    <span class="text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                      <i class="fas fa-paperclip mr-1"></i> Documento
                    </span>
                  </div>
                  <div class="flex gap-2 ml-3 flex-shrink-0">
                    @if (item.doc.signed_url) {
                      <button (click)="openViewer(item.doc)" class="text-emerald-600 hover:text-emerald-800 text-sm p-1" title="Ver">
                        <i class="fas fa-eye"></i>
                      </button>
                      <a [href]="item.doc.signed_url" target="_blank" class="text-blue-600 hover:text-blue-800 text-sm p-1" title="Descargar">
                        <i class="fas fa-download"></i>
                      </a>
                    }
                    <button (click)="deleteDocument(item.doc)" class="text-red-500 hover:text-red-700 text-sm p-1" title="Eliminar">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <p class="text-sm text-slate-700 dark:text-slate-300 mt-1 flex items-center gap-2">
                  <i class="fas fa-file text-slate-400"></i>
                  {{ item.doc.file_name }}
                  @if (item.doc.file_size) {
                    <span class="text-xs text-slate-400">({{ formatFileSize(item.doc.file_size) }})</span>
                  }
                </p>
              </div>
            </div>
          }
        }
      </div>

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

  // Booking selector (shared between note and doc)
  pastBookings = signal<{ id: string; start_time: string; service?: { name: string } }[]>([]);
  isLoadingBookings = signal(false);
  sharedBookingId = signal('');
  inputMode = signal<'note' | 'doc'>('note');
  private fileInputEl: HTMLInputElement | null = null;

  // Upload signals
  selectedFile = signal<File | null>(null);
  isUploading = signal(false);

  // Filters
  searchQuery = signal('');
  dateFrom = signal('');
  dateTo = signal('');

  // Tracks whether we've loaded the full dataset (no limit) vs. the default last-5 slice
  private allDataLoaded = signal(false);

  private readonly hasActiveFilter = computed(() =>
    !!this.searchQuery() || !!this.dateFrom() || !!this.dateTo()
  );

  constructor() {
    // When filter becomes active and we only have the last-5 slice → silently fetch all records
    // (no spinners — preserves DOM and input focus).
    // When filters are cleared and we had the full dataset → silently go back to last 5.
    effect(() => {
      const isFiltered = this.hasActiveFilter();
      const allLoaded = this.allDataLoaded();

      if (isFiltered && !allLoaded) {
        untracked(() => this.reloadNotesAndDocsSilently(null));
      } else if (!isFiltered && allLoaded) {
        untracked(() => {
          this.allDataLoaded.set(false);
          this.reloadNotesAndDocsSilently(5);
        });
      }
    });
  }

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

  combinedTimeline = computed<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [
      ...this.notes().map(n => ({ kind: 'note' as const, note: n })),
      ...this.documents().map(d => ({ kind: 'doc' as const, doc: d })),
    ];
    return items.sort((a, b) => {
      const dateA = a.kind === 'note' ? a.note.booking_start_time : a.doc.booking_start_time;
      const dateB = b.kind === 'note' ? b.note.booking_start_time : b.doc.booking_start_time;
      return dateB.localeCompare(dateA);
    });
  });

  // Inline viewer
  viewerDoc = signal<ClientBookingDocument | null>(null);
  viewerSafeUrl = signal<SafeResourceUrl | null>(null);

  ngOnInit() {
    this.loadAll();
  }

  async loadAll(limit: number | null = 5) {
    this.isLoading.set(true);
    this.isLoadingDocs.set(true);
    this.isLoadingBookings.set(true);

    try {
      const [notes, docs, bookings] = await Promise.all([
        firstValueFrom(this.bookingNotesService.getNotesForClient(this.clientId, limit)),
        firstValueFrom(this.bookingNotesService.getDocumentsForClient(this.clientId, limit)),
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

      if (limit === null) {
        this.allDataLoaded.set(true);
      }

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

  /** Fetches notes + docs without touching any loading signals.
   *  Used by the filter effect so the DOM is never destroyed and
   *  the search input never loses focus. */
  private async reloadNotesAndDocsSilently(limit: number | null) {
    try {
      const [notes, docs] = await Promise.all([
        firstValueFrom(this.bookingNotesService.getNotesForClient(this.clientId, limit)),
        firstValueFrom(this.bookingNotesService.getDocumentsForClient(this.clientId, limit)),
      ]);
      this.notes.set(notes);
      this.documents.set(docs);
      if (limit === null) {
        this.allDataLoaded.set(true);
      }
    } catch (err) {
      this.toastService.error('Error al cargar el historial clínico', 'Error');
    }
  }

  async addNote() {
    const content = this.newNoteContent.trim();
    const bookingId = this.sharedBookingId();
    if (!content || !bookingId) return;

    this.isSaving.set(true);
    try {
      await firstValueFrom(this.bookingNotesService.createNote(bookingId, content));
      this.toastService.success('Nota guardada y encriptada correctamente', 'Seguridad');
      this.newNoteContent = '';
      this.sharedBookingId.set('');
      this.inputMode.set('note');
      await this.loadAll(this.allDataLoaded() ? null : 5);
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

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fileInputEl = input;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
    }
  }

  async uploadSelectedFile() {
    const file = this.selectedFile();
    const bookingId = this.sharedBookingId();
    if (!file || !bookingId) return;

    this.isUploading.set(true);
    try {
      await firstValueFrom(
        this.bookingNotesService.uploadDocument(bookingId, this.clientId, file)
      );
      this.toastService.success('Documento subido correctamente', 'Éxito');
      this.selectedFile.set(null);
      this.sharedBookingId.set('');
      this.inputMode.set('note');
      const docs = await firstValueFrom(
        this.bookingNotesService.getDocumentsForClient(this.clientId, null)
      );
      this.documents.set(docs);
    } catch (err) {
      this.toastService.error('Error al subir el documento', 'Error');
    } finally {
      this.isUploading.set(false);
      if (this.fileInputEl) {
        this.fileInputEl.value = '';
        this.fileInputEl = null;
      }
    }
  }

  async deleteDocument(doc: ClientBookingDocument) {
    if (!confirm(`¿Eliminar "${doc.file_name}"?`)) return;
    try {
      await firstValueFrom(this.bookingNotesService.deleteDocument(doc.id));
      this.toastService.success('Documento eliminado', 'Eliminado');
      this.documents.set(this.documents().filter(d => d.id !== doc.id));
    } catch (err) {
      this.toastService.error('Error al eliminar el documento', 'Error');
    }
  }
}
