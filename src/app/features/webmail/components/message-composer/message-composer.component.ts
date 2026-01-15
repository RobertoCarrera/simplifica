import { Component, inject, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MailOperationService } from '../../services/mail-operation.service';
import { MailStoreService } from '../../services/mail-store.service';
import { MailContactService } from '../../services/mail-contact.service';
import { TiptapEditorComponent } from '../../../../shared/ui/tiptap-editor/tiptap-editor.component';
import { ChipAutocompleteComponent, ChipItem } from '../../../../shared/ui/chip-autocomplete/chip-autocomplete.component';
import { Subject, debounceTime, distinctUntilChanged, switchMap, takeUntil } from 'rxjs';

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
  imports: [CommonModule, FormsModule, TiptapEditorComponent, ChipAutocompleteComponent],
  templateUrl: './message-composer.component.html',
  styleUrl: './message-composer.component.scss'
})
export class MessageComposerComponent implements OnInit, OnDestroy {
  @Output() minimize = new EventEmitter<void>();
  @Output() maximize = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  toRecipients: ChipItem[] = [];
  subject = '';
  body = '';
  draftId: string | null = null;
  savingDraft = false;
  autoSaveTimer: any;

  // UI State
  isDragOver = false;
  showCc = false;
  showBcc = false;

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

    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty() && !this.isSending) {
        this.saveDraft(true);
      }
    }, 10000);
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
    return !!(this.toRecipients.length > 0 || this.subject || this.body);
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

  async saveDraft(silent = false) {
    if (!this.store.currentAccount()) return;
    if (!this.isDirty()) return;

    this.savingDraft = true;
    try {
      const id = await this.operations.saveDraft({
        id: this.draftId || undefined,
        to: this.toRecipients.map(r => ({ email: r.value, name: r.label === r.value ? '' : r.label })),
        subject: this.subject,
        body_text: this.body,
        body_html: this.body
      }, this.store.currentAccount()!.id);

      this.draftId = id;
      if (!silent) console.log('Draft saved');
    } catch (error) {
      console.error('Error saving draft:', error);
    } finally {
      this.savingDraft = false;
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
        alert(`El archivo ${file.name} es demasiado grande. Máximo 25MB.`);
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
        alert(`Error al subir ${file.name}`);
        // Remove? Or keep as local only? 
        // If upload fails, maybe we can't save it to sent items properly, but sending might still work via base64.
      } finally {
        attachment.uploading = false;
      }
    }
  }

  removeAttachment(index: number) {
    this.attachments.splice(index, 1);
  }

  async send() {
    if (this.toRecipients.length === 0 || !this.subject) return;

    const account = this.store.currentAccount();
    if (!account) {
      alert('No hay cuenta de correo seleccionada.');
      return;
    }

    // Check if any uploads are pending
    if (this.attachments.some(a => a.uploading)) {
      alert('Por favor espera a que se suban los archivos adjuntos.');
      return;
    }

    this.isSending = true;

    try {
      const payload: any = {
        to: this.toRecipients.map(r => ({ name: r.label === r.value ? '' : r.label, email: r.value })),
        subject: this.subject,
        body_text: this.body,
        attachments: this.attachments.map(a => ({
          filename: a.file.name,
          content: a.base64,
          contentType: a.file.type,
          size: a.file.size,
          storage_path: a.storagePath // Send the storage path for backend to link
        }))
      };

      await this.operations.sendMessage(payload, account);

      this.close.emit(); // Emit close instead of navigating directly
    } catch (e: any) {
      console.error(e);
      alert('Error al enviar: ' + (e.message || e));
    } finally {
      this.isSending = false;
    }
  }

  cancel() {
    this.close.emit();
  }
}
