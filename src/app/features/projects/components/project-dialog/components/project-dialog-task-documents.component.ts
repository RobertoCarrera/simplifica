import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../../../core/services/projects.service';
import { ProjectTaskDocument } from '../../../../models/project';

@Component({
  selector: 'app-project-dialog-task-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.Default,
  styles: [`
    .doc-row {
      transition: background-color 0.15s ease;
    }
    .doc-row:hover {
      background-color: rgb(249 250 251);
    }
    .dark .doc-row:hover {
      background-color: rgb(31 41 55);
    }
    .modal-overlay {
      background-color: rgba(0, 0, 0, 0.5);
    }
  `],
  template: `
    <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <div class="flex justify-between items-center mb-2">
        <label class="text-[10px] font-semibold text-gray-400 uppercase tracking-wider"
          >Documentos asociados ({{ documents.length }})</label
        >
      </div>

      <!-- Document list -->
      @if (documents.length > 0) {
        <div class="space-y-1.5 mb-2">
          @for (doc of documents; track doc.id) {
            <div class="doc-row flex items-center space-x-2 p-1.5 rounded-md text-xs">
              <!-- Document type icon -->
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0"
                [ngClass]="doc.document_type === 'budget'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'"
              >
                {{ doc.document_type === 'budget' ? 'P' : 'F' }}
              </span>

              <!-- Document info -->
              <span class="flex-1 text-gray-600 dark:text-gray-300 truncate">
                {{ formatDocumentLabel(doc) }}
              </span>

              <!-- Remove button -->
              @if (canEdit) {
                <button
                  (click)="onRemove(doc)"
                  class="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Desasociar documento"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              }
            </div>
          }
        </div>
      }

      <!-- Associate buttons -->
      @if (canEdit) {
        <div class="flex space-x-1">
          <button
            (click)="showBudgetPicker = true; loadAvailableQuotes()"
            class="flex items-center space-x-1 text-[10px] text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 transition-colors py-1 px-1.5 rounded border border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Presupuesto</span>
          </button>
          <button
            (click)="showInvoicePicker = true; loadAvailableInvoices()"
            class="flex items-center space-x-1 text-[10px] text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors py-1 px-1.5 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Factura</span>
          </button>
        </div>
      }
    </div>

    <!-- Budget Picker Modal -->
    @if (showBudgetPicker) {
      <div class="modal-overlay fixed inset-0 z-50 flex items-center justify-center" (click)="showBudgetPicker = false">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-4 max-h-[70vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">Asociar Presupuesto</h3>
            <button (click)="showBudgetPicker = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          @if (availableQuotes.length === 0) {
            <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
              No hay presupuestos disponibles para este proyecto.
            </p>
          }

          <div class="space-y-1">
            @for (quote of availableQuotes; track quote.id) {
              @if (!isAlreadyAssociated(quote.id, 'budget')) {
                <button
                  (click)="associateBudget(quote.id)"
                  class="w-full text-left flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div class="flex items-center space-x-2 min-w-0">
                    <span class="text-xs font-mono text-purple-600 dark:text-purple-400 flex-shrink-0">
                      {{ quote.full_quote_number || 'P-' + quote.id?.substring(0, 8) }}
                    </span>
                    <span class="text-xs text-gray-600 dark:text-gray-300 truncate">{{ quote.title }}</span>
                  </div>
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                    {{ quote.total_amount | number:'1.2-2' }} €
                  </span>
                </button>
              }
            }
          </div>
        </div>
      </div>
    }

    <!-- Invoice Picker Modal -->
    @if (showInvoicePicker) {
      <div class="modal-overlay fixed inset-0 z-50 flex items-center justify-center" (click)="showInvoicePicker = false">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-4 max-h-[70vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex justify-between items-center mb-3">
            <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">Asociar Factura</h3>
            <button (click)="showInvoicePicker = false" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          @if (availableInvoices.length === 0) {
            <p class="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
              No hay facturas disponibles para este proyecto.
            </p>
          }

          <div class="space-y-1">
            @for (invoice of availableInvoices; track invoice.id) {
              @if (!isAlreadyAssociated(invoice.id, 'invoice')) {
                <button
                  (click)="associateInvoice(invoice.id)"
                  class="w-full text-left flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div class="flex items-center space-x-2 min-w-0">
                    <span class="text-xs font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">
                      {{ formatInvoiceNumber(invoice) }}
                    </span>
                    <span class="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {{ invoice.invoice_date | date:'dd/MM/yy' }}
                    </span>
                  </div>
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                    {{ invoice.total | number:'1.2-2' }} €
                  </span>
                </button>
              }
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ProjectDialogTaskDocumentsComponent implements OnInit {
  @Input() taskId!: string;
  @Input() projectId!: string;
  @Input() canEdit = false;
  @Input() documents: ProjectTaskDocument[] = [];

  @Output() documentAssociated = new EventEmitter<void>();
  @Output() documentRemoved = new EventEmitter<void>();

  private projectsService = inject(ProjectsService);

  showBudgetPicker = false;
  showInvoicePicker = false;
  availableQuotes: any[] = [];
  availableInvoices: any[] = [];
  loading = false;

  ngOnInit() {
    // Documents are passed via @Input, no need to load
  }

  async loadAvailableQuotes() {
    try {
      this.availableQuotes = await this.projectsService.getAvailableQuotesForTask(this.projectId);
    } catch (err) {
      console.error('Error loading available quotes:', err);
    }
  }

  async loadAvailableInvoices() {
    try {
      this.availableInvoices = await this.projectsService.getAvailableInvoicesForTask(this.projectId);
    } catch (err) {
      console.error('Error loading available invoices:', err);
    }
  }

  async associateBudget(quoteId: string) {
    try {
      await this.projectsService.associateTaskDocument(this.taskId, quoteId, 'budget');
      this.showBudgetPicker = false;
      this.documentAssociated.emit();
    } catch (err) {
      console.error('Error associating budget:', err);
    }
  }

  async associateInvoice(invoiceId: string) {
    try {
      await this.projectsService.associateTaskDocument(this.taskId, invoiceId, 'invoice');
      this.showInvoicePicker = false;
      this.documentAssociated.emit();
    } catch (err) {
      console.error('Error associating invoice:', err);
    }
  }

  async onRemove(doc: ProjectTaskDocument) {
    try {
      await this.projectsService.removeTaskDocument(doc.document_id, doc.document_type, this.taskId);
      this.documentRemoved.emit();
    } catch (err) {
      console.error('Error removing document:', err);
    }
  }

  isAlreadyAssociated(documentId: string, documentType: string): boolean {
    return this.documents.some(
      d => d.document_id === documentId && d.document_type === documentType
    );
  }

  formatDocumentLabel(doc: ProjectTaskDocument): string {
    if (doc.document) {
      if (doc.document_type === 'budget') {
        return doc.document.full_quote_number
          ? `${doc.document.full_quote_number} - ${doc.document.title || ''}`
          : doc.document.title || 'Presupuesto';
      } else {
        const num = doc.document.full_invoice_number ||
          (doc.document.invoice_series && doc.document.invoice_number
            ? `${doc.document.invoice_series}-${doc.document.invoice_number}`
            : '');
        return num || 'Factura';
      }
    }
    // Fallback without populated document
    return doc.document_type === 'budget' ? 'Presupuesto' : 'Factura';
  }

  formatInvoiceNumber(invoice: any): string {
    if (invoice.full_invoice_number) return invoice.full_invoice_number;
    if (invoice.invoice_series && invoice.invoice_number)
      return `${invoice.invoice_series}-${invoice.invoice_number}`;
    return invoice.id?.substring(0, 8) || '';
  }
}
