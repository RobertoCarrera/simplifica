import { Component, inject, OnInit, OnDestroy, Output, EventEmitter, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailStoreService } from '../../services/mail-store.service';
import { MailContactService } from '../../services/mail-contact.service';
import { ToastService } from '../../../../services/toast.service';
import { TiptapEditorComponent } from '../../../../shared/ui/tiptap-editor/tiptap-editor.component';
import { ChipAutocompleteComponent, ChipItem } from '../../../../shared/ui/chip-autocomplete/chip-autocomplete.component';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';
import { MailMessage } from '../../../../core/interfaces/webmail.interface';
import { GoogleDriveService } from '../../services/google-drive.service';
import { ConfirmModalComponent } from '../../../../shared/ui/confirm-modal/confirm-modal.component';

interface AttachmentItem {
  file: File;
  base64: string;
  storagePath?: string;
  url?: string;
  uploading?: boolean;
}

@Component({
  selector: 'app-message-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, TiptapEditorComponent, ChipAutocompleteComponent, ConfirmModalComponent],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss'
})
export class MessageComposerComponent implements OnInit, OnDestroy {
  @ViewChild(TiptapEditorComponent) editorComponent!: TiptapEditorComponent;
  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;

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
  autoSaveTimer: any;

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

  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private operations = inject(MailOperationService);
  private store = inject(MailStoreService);
  private contactsService = inject(MailContactService);
  private googleDrive = inject(GoogleDriveService);
  protected toast = inject(ToastService);

  async ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      if (params['to']) {
        this.addToRecipient(params['to']);
      }
      if (params['subject']) this.subject = params['subject'];

      if (params['draftId']) {
        this.draftId = params['draftId'];
        await this.loadDraft(this.draftId!);
      }
    });

    this.setupSearch();
    this.setupAutoSave();
  }

  setupAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = setInterval(() => {
      // Autosave only if dirty, not sending, and not currently saving
      if (this.isDirty() && !this.isSending && !this.savingDraft) {
        // console.log('Autosave triggered');
        this.saveDraft(true);
      }
    }, 3000); // 3 seconds
  }

  ngOnDestroy() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
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
    // Simple parse if comma separated
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
      // Populate fields
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
        console.error('Error saving draft:', error);
      }
    } finally {
      this.savingDraft = false;
    }
  }

  async discardDraft() {
    this.isDiscarding = true; // Set flag immediately
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer); // Stop timer

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
        this.setupAutoSave();
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

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
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
      console.error('Error uploading image', error);
      this.toast.error('Error', 'Fallo al subir la imagen al servidor.');
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
      if (file.size > 25 * 1024 * 1024) { // 25MB limit
        this.toast.warning('Archivo muy grande', `El archivo ${file.name} supera el máximo de 25MB.`);
        continue;
      }

      const attachment: AttachmentItem = {
        file: file,
        base64: '',
        uploading: true
      };
      this.attachments.push(attachment);

      // Read Base64 (for sending)
      const reader = new FileReader();
      reader.onload = (e: any) => {
        attachment.base64 = e.target.result.split(',')[1];
      };
      reader.readAsDataURL(file);

      // Upload to Storage (for persistence)
      try {
        const { path, url } = await this.operations.uploadAttachment(file);
        attachment.storagePath = path;
        attachment.url = url;
      } catch (error) {
        console.error('Upload failed', error);
        this.toast.error('Error', `Fallo al subir ${file.name}`);
      } finally {
        attachment.uploading = false;
      }
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  async openGoogleDrivePicker() {
    try {
      this.toast.info('Autenticando', 'Cargando Google Drive...');
      
      // 1. Load the script early
      await this.googleDrive.loadPickerScript();
      
      // 2. Fetch fresh token from Supabase Edge Function
      const token = await this.googleDrive.getAccessToken();
      
      // 3. Open picker
      this.googleDrive.openPicker(token, async (doc) => {
          // Callback when a file is selected
          this.toast.info('Descargando', `Obteniendo ${doc.name}...`);
          
          try {
              // 4. Download file bytes using the token
              const file = await this.googleDrive.downloadFile(doc.id, token, doc.name, doc.mimeType);
              
              // 5. Build fake FileList to reuse existing attachment flow
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              
              // Process via existing method
              this.processFiles(dataTransfer.files);
              
          } catch (err: any) {
              console.error('Error downloading drive file', err);
              this.toast.error('Error', err.message || 'No se pudo adjuntar el archivo de Drive');
          }
      });
      
    } catch (err: any) {
      console.error(err);
      this.toast.error('Error de Conexión', err.message || 'Fallo al conectar con Google Drive. Asegúrate de tenerlo conectado en Configuración.');
    }
  }

  async send() {
    if (this.toRecipients.length === 0 || !this.subject) return;

    const account = this.store.currentAccount();
    if (!account) {
      this.toast.error('Error', 'No hay cuenta de correo seleccionada.');
      return;
    }

    // Check if any uploads are pending
    if (this.attachments.some(a => a.uploading)) {
      this.toast.warning('Subida en curso', 'Por favor espera a que se suban los archivos adjuntos.');
      return;
    }

    this.isSending = true;

    try {
      const payload: any = {
        to: this.toRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        cc: this.ccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        bcc: this.bccRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        subject: this.subject,
        body_text: this.body,
        body_html: this.body,
        attachments: this.attachments.map(a => ({
          filename: a.file.name,
          content: a.base64,
          contentType: a.file.type,
          size: a.file.size,
          storage_path: a.storagePath // Send the storage path for backend to link
        })),
        metadata: { 
          scheduled_at: this.scheduledAt
        }
      };

      await this.operations.sendMessage(payload, account);

      if (this.scheduledAt) {
        this.toast.success('Programado', 'Mensaje programado correctamente.');
      } else {
        this.toast.success('Enviado', 'Mensaje en camino.');
      }
      this.close.emit(); // Emit close instead of navigating directly
    } catch (e: any) {
      console.error(e);
      this.toast.error('Error', 'Error al enviar: ' + (e.message || e));
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
    this.close.emit();
  }
}
