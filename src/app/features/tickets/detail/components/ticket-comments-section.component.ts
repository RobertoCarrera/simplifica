import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import DOMPurify from 'dompurify';

// TipTap imports
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  client_id?: string;
  comment: string;
  created_at: string;
  is_internal: boolean;
  parent_id?: string | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  user?: {
    name: string;
    surname?: string;
    email: string;
  };
  client?: {
    name: string;
    email: string;
  };
  children?: TicketComment[];
  showReplyEditor?: boolean;
  isEditing?: boolean;
  editContent?: string;
}

@Component({
  selector: 'app-ticket-comments-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tab-content-animate">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Comentarios
      </h3>
      <!-- Add Comment Form -->
      <div class="mb-6">
        <!-- TipTap Editor -->
        <div class="relative">
          <div
            #editorElement
            id="editorElement"
            class="tiptap-editor w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-text prose prose-sm max-w-none focus:outline-none"
          ></div>
        </div>
        <div class="mt-2 flex justify-between items-center">
          <!-- Internal comment checkbox - ADMIN ONLY -->
          @if (!isClient) {
            <label
              class="flex items-center text-sm text-gray-600 dark:text-gray-400"
            >
              <input
                type="checkbox"
                [checked]="isInternalComment"
                (change)="onInternalCheckboxChange($event)"
                class="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              Comentario interno (no visible para el cliente)
            </label>
          }
          @if (isClient) {
            <div></div>
          }
          <!-- Spacer for flexbox -->
          <div class="flex items-center gap-2 sm:gap-3">
            <!-- File attachment button -->
            <input
              #commentFileInput
              type="file"
              (change)="onCommentFileSelect($event)"
              class="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
            <button
              (click)="commentFileInput.click()"
              class="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              title="Adjuntar archivo"
            >
              <i class="fas fa-paperclip"></i>
              <span class="hidden sm:inline ml-1">Adjuntar</span>
            </button>
            <div class="flex items-center shadow-sm rounded-lg relative">
              <button
                (click)="addCommentEvent.emit()"
                class="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <i class="fas fa-comment"></i>
                <span class="hidden sm:inline ml-2">Enviar</span>
              </button>
              @if (!isClient && activeCommentsCount > 0) {
                <button
                  class="inline-flex items-center justify-center px-2 py-2 border border-transparent text-sm font-medium rounded-r-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-l-none border-l border-blue-700"
                  (click)="toggleSmartSendDropdown()"
                >
                  <i class="fas fa-chevron-down"></i>
                </button>
              }
              @if (showSmartSendDropdown) {
                <div
                  class="fixed inset-0 z-40"
                  (click)="showSmartSendDropdown = false"
                ></div>
              }
              @if (showSmartSendDropdown) {
                <div
                  class="absolute bottom-full right-0 mb-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                >
                  <!-- Send & Solve -->
                  @if (solvedStage) {
                    <button
                      (click)="toggleSmartSendEvent.emit(solvedStage.id)"
                      class="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-3 transition-colors"
                    >
                      <div
                        class="w-8 h-8 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex items-center justify-center shrink-0"
                      >
                        <i class="fas fa-check text-xs"></i>
                      </div>
                      <div>
                        <div
                          class="text-sm font-medium text-gray-900 dark:text-gray-100"
                        >
                          Enviar y Solucionar
                        </div>
                        <div
                          class="text-[10px] text-gray-500 uppercase tracking-wide"
                        >
                          Cambiar a {{ solvedStage.name }}
                        </div>
                      </div>
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      <!-- Comments List -->
      @if (activeCommentsCount === 0) {
        <div class="text-center py-12 text-gray-500 dark:text-gray-400">
          <i class="fas fa-comments text-5xl mb-4 opacity-50"></i>
          <p class="text-lg">No hay comentarios aún</p>
        </div>
      }
      @if (activeCommentsCount > 0) {
        <div class="space-y-4">
          <!-- Recursive Template for Comments -->
          <ng-template #commentNode let-comment="comment" let-level="level">
            <div
              class="mb-4 relative transition-all duration-300"
              [style.margin-left.px]="level * 24"
              [class.pl-6]="level > 0"
            >
              <!-- Thread connector lines (only for depth > 0) -->
              @if (level > 0) {
                <div
                  class="absolute left-0 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700 -ml-3 rounded-full"
                ></div>
              }
              @if (level > 0) {
                <div
                  class="absolute left-0 top-8 w-6 h-[2px] bg-gray-200 dark:bg-gray-700 -ml-3 rounded-r-full"
                ></div>
              }
              <!-- Comment Body -->
              @if (!comment.deleted_at || (!isClient && showDeletedComments)) {
                <div
                  [ngClass]="{
                    'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/50':
                      comment.is_internal,
                    'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 shadow-sm':
                      !comment.is_internal && !comment.client_id,
                    'bg-blue-50/40 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/30':
                      !comment.is_internal && comment.client_id,
                  }"
                  [class.opacity-60]="comment.deleted_at"
                  class="rounded-2xl p-4 border relative group overflow-hidden transition-shadow"
                >
                  <!-- Accent Bars -->
                  @if (comment.is_internal) {
                    <div
                      class="absolute left-0 top-0 bottom-0 w-1 bg-amber-400/80"
                    ></div>
                  }
                  @if (!comment.is_internal && comment.client_id) {
                    <div
                      class="absolute left-0 top-0 bottom-0 w-1 bg-blue-400/80"
                    ></div>
                  }
                  <!-- Header -->
                  <div class="flex justify-between items-start mb-3 pl-2">
                    <div class="flex items-center gap-3">
                      <!-- Avatar -->
                      <div
                        class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm shrink-0 border border-white/20"
                        [ngClass]="{
                          'bg-amber-100 text-amber-900 dark:bg-amber-800 dark:text-amber-100':
                            comment.is_internal,
                          'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300':
                            !comment.is_internal && !comment.client_id,
                          'bg-blue-100 text-blue-900 dark:bg-blue-800 dark:text-blue-100':
                            !comment.is_internal && comment.client_id,
                        }"
                      >
                        {{ getAuthorInitials(comment) }}
                      </div>
                      <div class="flex flex-col">
                        <div class="flex items-center gap-2">
                          <span
                            class="font-bold text-sm text-gray-900 dark:text-white"
                          >
                            {{ getCommentAuthorName(comment) }}
                          </span>
                          @if (comment.is_internal) {
                            <span
                              class="px-1.5 py-0.5 text-[8px] bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded border border-amber-200 dark:border-amber-700/50 uppercase font-bold tracking-wider"
                            >
                              Interno
                            </span>
                          }
                          @if (comment.client_id && !isClient) {
                            <span
                              class="px-1.5 py-0.5 text-[8px] bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-700/50 uppercase font-bold tracking-wider"
                            >
                              Cliente
                            </span>
                          }
                          @if (comment.deleted_at) {
                            <span
                              class="px-1.5 py-0.5 text-[8px] bg-red-100 text-red-700 rounded uppercase font-bold"
                            >
                              Eliminado
                            </span>
                          }
                        </div>
                        <div
                          class="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400"
                        >
                          <span>{{ formatDate(comment.created_at) }}</span>
                          @if (comment.edited_at) {
                            <span
                              class="italic"
                              title="{{ formatDate(comment.edited_at) }}"
                              >• Editado</span
                            >
                          }
                        </div>
                      </div>
                    </div>
                    <!-- Actions -->
                    <div class="flex items-center gap-1">
                      @if (!isClient) {
                        <button
                          (click)="visibilityChangeEvent.emit({ comment }); $event.stopPropagation()"
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"
                          [title]="comment.is_internal ? 'Hacer público' : 'Hacer interno'"
                          [attr.aria-label]="comment.is_internal ? 'Hacer público' : 'Hacer interno'"
                        >
                          <i
                            class="fas"
                            [class.fa-eye-slash]="comment.is_internal"
                            [class.fa-eye]="!comment.is_internal"
                            aria-hidden="true"
                          ></i>
                        </button>
                      }
                      <button
                        (click)="toggleReply(comment)"
                        class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"
                        title="Responder"
                        aria-label="Responder"
                      >
                        <i class="fas fa-reply text-xs" aria-hidden="true"></i>
                      </button>
                      @if (!comment.deleted_at) {
                        <button
                          (click)="editEvent.emit(comment)"
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-orange-600 transition-colors"
                          title="Editar"
                          aria-label="Editar comentario"
                        >
                          <i
                            class="fas fa-pencil-alt text-xs"
                            aria-hidden="true"
                          ></i>
                        </button>
                        @if (!isClient) {
                          <button
                            (click)="deleteEvent.emit(comment)"
                            class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"
                            title="Eliminar"
                            aria-label="Eliminar comentario"
                          >
                            <i class="fas fa-trash text-xs" aria-hidden="true"></i>
                          </button>
                        }
                      }
                      @if (comment.deleted_at && !isClient) {
                        <button
                          (click)="restoreEvent.emit(comment)"
                          class="w-7 h-7 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-green-100 text-green-600 transition-colors"
                          title="Restaurar"
                          aria-label="Restaurar comentario"
                        >
                          <i class="fas fa-undo text-xs" aria-hidden="true"></i>
                        </button>
                      }
                    </div>
                  </div>
                  <!-- Content -->
                  @if (!comment.isEditing) {
                    <div
                      class="pl-11 prose prose-sm max-w-none text-gray-900 dark:text-gray-100 leading-relaxed text-[13.5px] font-normal"
                      [innerHTML]="getProcessedContent(comment.comment)"
                    ></div>
                  }
                  <!-- Edit Mode -->
                  @if (comment.isEditing) {
                    <div class="mt-3 pl-11">
                      <textarea
                        [(ngModel)]="comment.editContent"
                        class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800/80 focus:ring-2 focus:ring-blue-500 min-h-[100px] text-sm shadow-inner"
                        rows="3"
                      ></textarea>
                      <div class="flex justify-end gap-2 mt-3">
                        <button
                          (click)="toggleEdit(comment)"
                          class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  }
                  <!-- Reply Editor -->
                  @if (comment.showReplyEditor) {
                    <div
                      class="mt-4 pt-4 ml-11 border-t border-gray-100 dark:border-gray-700/50"
                    >
                      <div class="flex gap-3">
                        <div
                          class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0"
                        >
                          <i class="fas fa-reply text-gray-400 text-xs"></i>
                        </div>
                        <div class="flex-1">
                          <textarea
                            [id]="'reply-input-' + comment.id"
                            #replyInput
                            class="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800/50 focus:ring-2 focus:ring-blue-500 min-h-[80px] text-sm shadow-inner"
                            placeholder="Escribe tu respuesta..."
                          ></textarea>
                          <div class="flex justify-end gap-2 mt-2">
                            <button
                              (click)="toggleReply(comment)"
                              class="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              (click)="onReplyTo(comment, replyInput.value)"
                              class="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <i class="fas fa-paper-plane text-[10px]"></i>
                              Responder
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
            <!-- Recursively render children -->
            @if (comment.children && comment.children.length > 0) {
              <div>
                @for (child of comment.children; track child) {
                  <ng-container
                    *ngTemplateOutlet="commentNode; context: { comment: child, level: level + 1 }"
                  ></ng-container>
                }
              </div>
            }
          </ng-template>
          <!-- Main List Loop -->
          <div class="space-y-4">
            @if (!isClient) {
              <div class="flex justify-end mb-2">
                <label
                  class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    [checked]="showDeletedComments"
                    (change)="toggleDeletedCommentsChange.emit()"
                    class="rounded border-gray-300"
                  />
                  Mostrar eliminados
                </label>
              </div>
            }
            @for (comment of comments; track comment) {
              <ng-container
                *ngTemplateOutlet="commentNode; context: { comment: comment, level: 0 }"
              ></ng-container>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class TicketCommentsSectionComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorElement') editorElement!: ElementRef;

  @Input() ticket: any = null;
  @Input() comments: TicketComment[] = [];
  @Input() activeCommentsCount: number = 0;
  @Input() isClient: boolean = false;
  @Input() isInternalComment: boolean = false;
  @Input() showDeletedComments: boolean = false;
  @Input() allStages: any[] = [];
  @Input() staffUsers: any[] = [];

  @Output() addCommentEvent = new EventEmitter<void>();
  @Output() internalCommentChange = new EventEmitter<boolean>();
  @Output() replyEvent = new EventEmitter<{ parent: TicketComment; content: string }>();
  @Output() editEvent = new EventEmitter<TicketComment>();
  @Output() deleteEvent = new EventEmitter<TicketComment>();
  @Output() visibilityChangeEvent = new EventEmitter<{ comment: TicketComment }>();
  @Output() restoreEvent = new EventEmitter<TicketComment>();
  @Output() fileSelectEvent = new EventEmitter<Event>();
  @Output() toggleSmartSendEvent = new EventEmitter<string | undefined>();
  @Output() contentChange = new EventEmitter<string>();
  @Output() focusEditorEvent = new EventEmitter<void>();
  @Output() toggleDeletedCommentsChange = new EventEmitter<void>();

  editor: Editor | null = null;
  showSmartSendDropdown = false;

  get solvedStage() {
    return this.allStages.find(
      (s) => s.workflow_category === 'final' || s.stage_category === 'completed',
    );
  }

  ngAfterViewInit() {
    this.initializeEditor();
  }

  ngOnDestroy() {
    if (this.editor) {
      this.editor.destroy();
    }
  }

  initializeEditor() {
    if (!this.editorElement?.nativeElement) return;

    if (this.editor) {
      this.editor.destroy();
    }

    this.editor = new Editor({
      element: this.editorElement.nativeElement,
      extensions: [
        StarterKit.configure({
          link: false,
        }),
        Image.configure({
          inline: true,
          HTMLAttributes: {
            class: 'max-w-full rounded-lg',
          },
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'text-blue-600 underline',
          },
        }),
        Placeholder.configure({
          placeholder: 'Escribe tu comentario aquí...',
        }),
      ],
      content: '',
      onUpdate: ({ editor }) => {
        this.contentChange.emit(editor.getHTML());
      },
    });
  }

  focusEditor() {
    this.editor?.commands.focus();
    this.focusEditorEvent.emit();
  }

  hasEditorContent(): boolean {
    if (!this.editor) return false;
    const html = this.editor.getHTML().trim();
    const text = this.editor.getText().trim();
    return !!text || /<img\b/i.test(html);
  }

  toggleSmartSendDropdown() {
    this.showSmartSendDropdown = !this.showSmartSendDropdown;
  }

  onInternalCheckboxChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.internalCommentChange.emit(checked);
  }

  onCommentFileSelect(event: Event) {
    this.fileSelectEvent.emit(event);
  }

  onReplyTo(parentComment: TicketComment, content: string) {
    this.replyEvent.emit({ parent: parentComment, content });
  }

  toggleReply(comment: TicketComment) {
    comment.showReplyEditor = !comment.showReplyEditor;
    if (!comment.showReplyEditor) {
      comment.editContent = '';
    }
  }

  toggleEdit(comment: TicketComment) {
    comment.isEditing = !comment.isEditing;
    if (comment.isEditing) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = (DOMPurify as any).sanitize(comment.comment || '');
      comment.editContent = tempDiv.textContent || tempDiv.innerText || '';
    }
  }

  getAuthorInitials(comment: TicketComment): string {
    const name = this.getCommentAuthorName(comment);
    if (!name) return '?';
    if (name === 'Usuario' || name === 'Cliente') return name.substring(0, 2).toUpperCase();
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  getCommentAuthorName(comment: TicketComment): string {
    if (comment.user?.name) {
      const surname = comment.user.surname || '';
      return surname ? `${comment.user.name} ${surname.charAt(0)}.` : comment.user.name;
    }
    if (comment.user?.surname) return comment.user.surname;
    if (comment.client) return this.getClientFullName(comment.client);
    return comment.client_id
      ? 'Cliente'
      : comment.user?.email
        ? comment.user.email.split('@')[0]
        : 'Usuario';
  }

  private getClientFullName(client: { name?: string; email?: string }): string {
    const rawName = client.name;
    return rawName || client.email || '';
  }

  getVisibilityIcon(isInternal: boolean, clientId?: string): string {
    return isInternal ? 'fa-eye-slash' : 'fa-eye';
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getProcessedContent(htmlContent: string): string {
    if (!htmlContent) return '';
    return (DOMPurify as any).sanitize(htmlContent);
  }
}
