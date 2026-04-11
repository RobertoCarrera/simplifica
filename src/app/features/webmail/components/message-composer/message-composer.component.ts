import { Component, inject, OnInit, OnDestroy, Output, EventEmitter, ViewChild, ViewChildren, QueryList, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Router, ActivatedRoute } from '@angular/router';
import { interval, Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil, filter } from 'rxjs';
import { MailOperationService, UploadProgress } from '../../services/mail-operation.service';
import { MailStoreService } from '../../services/mail-store.service';
import { MailContactService } from '../../services/mail-contact.service';
import { MailErrorService } from '../../services/mail-error.service';
import { OfflineQueueService } from '../../services/offline-queue.service';
import { ToastService } from '../../../../services/toast.service';
import { TiptapEditorComponent } from '../../../../shared/ui/tiptap-editor/tiptap-editor.component';
import { ChipAutocompleteComponent, ChipItem } from '../../../../shared/ui/chip-autocomplete/chip-autocomplete.component';
import { MailMessage } from '../../../../core/interfaces/webmail.interface';
import { GoogleDriveService } from '../../services/google-drive.service';
import { ConfirmModalComponent } from '../../../../shared/ui/confirm-modal/confirm-modal.component';
import { validateUploadFile } from '../../../../core/utils/upload-validator';

export interface AttachmentItem {
  file: File;
  base64?: string;
  storagePath?: string;
  url?: string;
  uploading?: boolean;
  progress?: number;
  error?: string;
}

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, TiptapEditorComponent, ChipAutocompleteComponent, ConfirmModalComponent, TranslocoPipe],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss'
})
export class MessageComposerComponent implements OnInit, OnDestroy {
  @ViewChild(TiptapEditorComponent) editorComponent!: TiptapEditorComponent;
  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;
  @ViewChildren(ChipAutocompleteComponent) chipComponents!: QueryList<ChipAutocompleteComponent>;

  @Output() minimize = new EventEmitter<void>();
  @Output() maximize = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  toRecipients: ChipItem[] = [];
  ccRecipients: ChipItem[] = [];
  bccRecipients: ChipItem[] = [];
  subject = '';
  body = '';
  draftId: string | null = null;
  savingDraft = false;

  // UI State
  isDragOver = false;
  showCc = false;
  showBcc = false;
  showScheduleMenu = false;
  showCustomScheduleDate = false;

  customDateStr = '';
  customTimeStr = '09:00';
  minDateStr = new Date().toISOString().split('T')[0];

  // Features
  showEmojiPicker = false;
  commonEmojis = ['👍', '😊', '🎉', '❌', '✅', '❤️', '🔥', '🤔', '👀', '📧'];

  // Search State
  searchResults: ChipItem[] = [];
  searchLoading = false;
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // Autosave — proper RxJS instead of setInterval + NgZone
  private autoSave$ = new Subject<void>();

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private operations = inject(MailOperationService);
  private store = inject(MailStoreService);
  private contactsService = inject(MailContactService);
  private googleDrive = inject(GoogleDriveService);
  private errors = inject(MailErrorService);
  private offlineQueue = inject(OfflineQueueService);
  private cdr = inject(ChangeDetectorRef);
  protected toast = inject(ToastService);

  async ngOnInit() {
    const state = typeof window !== 'undefined' ? window.history.state : null;
    if (state) {
      if (state.to) this.addToRecipient(state.to);
      if (state.subject) this.subject = state.subject;
      if (state.body) this.body = state.body;
    }
    this.route.queryParams.subscribe(async params => {
      if (params['to']) this.addToRecipient(params['to']);
      if (params['subject']) this.subject = params['subject'];
      if (params['body']) this.body = params['body'];
      if (params['draftId']) {
        this.draftId = params['draftId'];
        await this.loadDraft(this.draftId!);
      }
    });

    this.setupSearch();
    this.setupAutoSave();

    // React to online/offline changes
    window.addEventListener('online', () => this.toast.info('Conexión restaurada', 'Procesando mensajes pendientes...'));
  }

  setupAutoSave() {
    this.autoSave$.pipe(
      filter(() => this.isDirty() && !this.isSending && !this.savingDraft),
      debounceTime(500),
      takeUntil(this.destroy$)
    ).subscribe(() => this.saveDraft(true));

    // Trigger autosave check every 3 seconds
    interval(3000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => this.autoSave$.next());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setupSearch() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        this.searchLoading = true;
        return this.contactsService.searchContacts(term);
      }),
      takeUntil(this.destroy$)
    ).subscribe(results => {
      this.searchResults = results;
      this.searchLoading = false;
    });
  }

  onSearch(term: string) {
    this.searchSubject.next(term);
  }

  addToRecipient(email: string) {
    const emails = email.split(',').map(e => e.trim()).filter(e => e);
    emails.forEach(e => {
      if (!this.toRecipients.some(r => r.value === e)) {
        this.toRecipients.push({ label: e, value: e, type: 'contact' });
      }
    });
  }

  isDirty(): boolean {
    return !!(this.toRecipients.length > 0 || this.ccRecipients.length > 0 || this.bccRecipients.length > 0 || this.subject || this.body);
  }

  async loadDraft(id: string) {
    const msg = await this.store.getMessage(id);
    if (msg) {
      if (msg.to && Array.isArray(msg.to)) {
        this.toRecipients = msg.to.map((t: any) => ({
          label: t.name || t.email,
          value: t.email,
          subLabel: t.email,
          type: 'contact'
        }));
      }
      this.subject = msg.subject || '';
      this.body = msg.body_html || msg.body_text || '';
    }
  }

  isDiscarding = false;

  async saveDraft(silent = false) {
    if (!this.store.currentAccount()) return;
    if (this.isDiscarding) return;
    if (!this.isDirty()) return;

    this.savingDraft = true;
    try {
      const draftPayload: Partial<MailMessage> = {
        id: this.draftId || undefined,
        subject: this.subject,
        body_html: this.body,
        body_text: this.body,
        to: this.toRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        cc: this.ccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        bcc: this.bccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
      };

      const saved = await this.operations.saveDraft(draftPayload, this.store.currentAccount()!.id);
      this.draftId = saved.id;

      if (!silent) {
        this.toast.success('Borrador Guardado', 'El borrador se ha guardado correctamente.');
      }
    } catch (error) {
      if (!this.isDiscarding) {
        const err = this.errors.parse(error);
        console.error('Error saving draft:', err.message);
      }
    } finally {
      this.savingDraft = false;
    }
  }

  async discardDraft() {
    this.isDiscarding = true;

    if (this.draftId) {
      const confirmed = await this.confirmModal.open({
        title: 'Descartar borrador',
        message: '¿Estás seguro de que quieres descartar este borrador? Se eliminará permanentemente.',
        icon: 'fas fa-trash-alt',
        iconColor: 'red',
        confirmText: 'Descartar',
        cancelText: 'Cancelar',
        preventCloseOnBackdrop: true
      });
      if (confirmed) {
        try {
          await this.operations.deleteMessages([this.draftId]);
          this.close.emit();
        } catch (error) {
          console.error('Error deleting draft:', error);
          this.toast.error('Error', 'Error al descartar el borrador. Revisa la consola.');
          this.isDiscarding = false;
        }
      } else {
        this.isDiscarding = false;
      }
    } else {
      this.close.emit();
    }
  }

  insertLink() {
    this.editorComponent.addLink();
  }

  async onImageSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toast.warning('Imagen muy grande', `La imagen supera el máximo de 5MB.`);
      event.target.value = '';
      return;
    }

    try {
      this.toast.info('Subiendo...', 'Preparando imagen...');
      const { url } = await this.operations.uploadAttachment(file);
      this.editorComponent.addImage(url);
      this.toast.success('Insertada', 'La imagen se ha insertado en el texto.');
    } catch (error) {
      const err = this.errors.parse(error);
      console.error('Error uploading image:', err.message);
      this.toast.error('Error', err.userMessage);
    } finally {
      event.target.value = '';
    }
  }

  attachments: AttachmentItem[] = [];
  isSending = false;

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFiles(files);
    }
  }

  onFileSelected(event: any) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.processFiles(files);
    }
  }

  async processFiles(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const check = validateUploadFile(file, 25 * 1024 * 1024);
      if (!check.valid) {
        this.toast.warning('Archivo no permitido', check.error!);
        continue;
      }

      const attachment: AttachmentItem = { file, uploading: true, progress: 0 };
      this.attachments.push(attachment);

      // Upload with progress tracking
      try {
        const { url, path } = await this.operations.uploadAttachment(file, (prog) => {
          attachment.progress = prog.percentage;
          this.cdr.markForCheck();
        });
        attachment.url = url;
        attachment.storagePath = path;
      } catch (error) {
        const err = this.errors.parse(error);
        attachment.error = err.userMessage;
        this.toast.error('Error', `Fallo al subir ${file.name}: ${err.userMessage}`);
      } finally {
        attachment.uploading = false;
        attachment.progress = undefined;
      }
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  async openGoogleDrivePicker() {
    try {
      this.toast.info('Autenticando', 'Cargando Google Drive...');

      await this.googleDrive.loadPickerScript();
      const token = await this.googleDrive.getAccessToken();

      this.googleDrive.openPicker(token, async (doc) => {
        this.toast.info('Descargando', `Obteniendo ${doc.name}...`);
        try {
          const file = await this.googleDrive.downloadFile(doc.id, doc.name, doc.mimeType);
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          this.processFiles(dataTransfer.files);
        } catch (err: any) {
          console.error('Error downloading drive file', err);
          this.toast.error('Error', err.message || 'No se pudo adjuntar el archivo de Drive');
        }
      });
    } catch (err: any) {
      console.error(err);
      this.toast.error('Error de Conexión', err.message || 'Fallo al conectar con Google Drive.');
    }
  }

  async send() {
    this.chipComponents?.forEach(c => c.commitPending());

    if (this.toRecipients.length === 0) {
      this.toast.warning('Destinatario requerido', 'Añade al menos un destinatario antes de enviar.');
      return;
    }
    if (!this.subject) {
      this.toast.warning('Asunto requerido', 'Escribe un asunto antes de enviar.');
      return;
    }

    const account = this.store.currentAccount();
    if (!account) {
      this.toast.error('Error', 'No hay cuenta de correo seleccionada.');
      return;
    }

    if (this.attachments.some(a => a.uploading)) {
      this.toast.warning('Subida en curso', 'Por favor espera a que se suban los archivos adjuntos.');
      return;
    }

    this.isSending = true;
    try {
      const payload = {
        to: this.toRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        cc: this.ccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        bcc: this.bccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        subject: this.subject,
        body_text: this.editorComponent?.editor?.getText() || this.body,
        body_html: this.body,
        attachments: this.attachments.map(a => ({
          filename: a.file.name,
          content: a.base64,
          contentType: a.file.type || 'application/octet-stream',
          size: a.file.size,
          storage_path: a.storagePath,
        })),
        metadata: { scheduled_at: this.scheduledAt },
      };

      // Check if online
      if (!this.offlineQueue.isOnline()) {
        await this.offlineQueue.enqueue(payload, account.id);
        this.toast.info('Mensaje en cola', 'Estás sin conexión. El mensaje se enviará cuando recuperes conexión.');
        this.router.navigate(['..'], { relativeTo: this.route });
        return;
      }

      await this.operations.sendMessage(payload, account);

      if (this.scheduledAt) {
        this.toast.success('Programado', 'Mensaje programado correctamente.');
      } else {
        this.toast.success('Enviado', 'Mensaje en camino.');
      }
      this.router.navigate(['..'], { relativeTo: this.route });
    } catch (e: any) {
      const err = this.errors.parse(e);
      console.error('Send error:', err.message);
      this.toast.error('Error al enviar', err.userMessage);
    } finally {
      this.isSending = false;
    }
  }

  toggleScheduleMenu() {
    this.showScheduleMenu = !this.showScheduleMenu;
  }

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  insertEmoji(emoji: string) {
    const component = this.editorComponent;
    if (component && component.editor) {
      component.editor.commands.insertContent(emoji);
    }
    this.showEmojiPicker = false;
  }

  scheduledAt: string | null = null;
  scheduleSend(option: string) {
    this.showScheduleMenu = false;
    const now = new Date();
    if (option === 'tomorrow') {
      now.setDate(now.getDate() + 1);
      now.setHours(8, 0, 0, 0);
      this.scheduledAt = now.toISOString();
      this.toast.info('Programado', `Envío programado para mañana a las 8:00 AM`);
    } else if (option === 'afternoon') {
      now.setHours(13, 0, 0, 0);
      if (now < new Date()) now.setDate(now.getDate() + 1);
      this.scheduledAt = now.toISOString();
      this.toast.info('Programado', `Envío programado para la 1:00 PM`);
    } else if (option === 'monday') {
      now.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7 || 7);
      now.setHours(8, 0, 0, 0);
      this.scheduledAt = now.toISOString();
      this.toast.info('Programado', `Envío programado para el lunes a las 8:00 AM`);
    } else if (option === 'custom-confirmed') {
      this.scheduledAt = new Date(this.customDateStr + 'T' + this.customTimeStr).toISOString();
      this.toast.info('Programado', `Envío programado para fecha personalizada`);
    }
  }

  confirmCustomSchedule() {
    if (!this.customDateStr || !this.customTimeStr) return;
    this.scheduleSend('custom-confirmed');
    this.showCustomScheduleDate = false;
  }

  cancel() {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  getFileIcon(mimeType: string): string {
    if (!mimeType) return 'fas fa-file';
    if (mimeType.startsWith('image/')) return 'fas fa-file-image';
    if (mimeType.includes('pdf')) return 'fas fa-file-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fas fa-file-word';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'fas fa-file-excel';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'fas fa-file-powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'fas fa-file-archive';
    if (mimeType.includes('audio')) return 'fas fa-file-audio';
    if (mimeType.includes('video')) return 'fas fa-file-video';
    if (mimeType.startsWith('text/')) return 'fas fa-file-alt';
    return 'fas fa-file';
  }

  getFileColor(mimeType: string): string {
    if (!mimeType) return 'text-gray-400';
    if (mimeType.startsWith('image/')) return 'text-blue-500';
    if (mimeType.includes('pdf')) return 'text-red-500';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'text-green-600';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-500';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'text-yellow-600';
    return 'text-gray-500';
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
