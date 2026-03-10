const fs = require('fs');
const path = require('path');

const tsPath = path.join('src', 'app', 'features', 'webmail', 'components', 'message-detail', 'message-detail.component.ts');
let tsContent = fs.readFileSync(tsPath, 'utf8');

if (!tsContent.includes('saveAttachmentToClient')) {
    const importsToAdd = `
import { CustomersService } from '../../../../services/customers.service';
import { SupabaseDocumentsService } from '../../../../services/supabase-documents.service';
import { SelectClientModalComponent } from '../../../../shared/ui/select-client-modal/select-client-modal.component'; // if exists, but we'll use a local logic
import { ToastService } from '../../../../services/toast.service';
`;
    tsContent = tsContent.replace(/import { FormsModule } from '@angular\/forms';/, "import { FormsModule } from '@angular/forms';\nimport { CustomersService } from '../../../../services/customers.service';\nimport { SupabaseDocumentsService } from '../../../../services/supabase-documents.service';\nimport { ToastService } from '../../../../services/toast.service';");

    tsContent = tsContent.replace(/export class MessageDetailComponent implements OnInit \{/, 
`export class MessageDetailComponent implements OnInit {
  private docsService = inject(SupabaseDocumentsService);
  private customersService = inject(CustomersService);
  private toast = inject(ToastService);

  showClientSelector = signal(false);
  customersList = signal<any[]>([]);
  selectedAttachmentForClient = signal<any>(null);
  isSavingAttachment = signal(false);

  async openClientSelector(att: any) {
    this.selectedAttachmentForClient.set(att);
    this.showClientSelector.set(true);
    if (this.customersList().length === 0) {
      this.customersService.getCustomers().subscribe(res => {
         this.customersList.set(res);
      });
    }
  }

  cancelClientSelector() {
    this.showClientSelector.set(false);
    this.selectedAttachmentForClient.set(null);
  }

  async confirmSaveAttachmentToClient(clientId: string) {
    const att = this.selectedAttachmentForClient();
    if (!att || !att.url) {
       this.toast.error('Error', 'El adjunto no tiene URL para descargar');
       return;
    }
    
    this.isSavingAttachment.set(true);
    try {
      // 1. Download blob
      const res = await fetch(att.url);
      const blob = await res.blob();
      const file = new File([blob], att.filename, { type: att.content_type || 'application/octet-stream' });
      
      // 2. Upload to Client
      await this.docsService.uploadDocument(clientId, file);
      
      this.toast.success('Guardado', 'El adjunto se ha guardado en el cliente');
      this.cancelClientSelector();
    } catch (e: any) {
      console.error(e);
      this.toast.error('Error', 'No se pudo guardar el documento en el CRM');
    } finally {
      this.isSavingAttachment.set(true);
      this.cancelClientSelector();
      this.isSavingAttachment.set(false);
      this.selectedAttachmentForClient.set(null);
    }
  }
`);
}

fs.writeFileSync(tsPath, tsContent);

const htmlPath = path.join('src', 'app', 'features', 'webmail', 'components', 'message-detail', 'message-detail.component.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

if (!htmlContent.includes('title="Guardar en Cliente"')) {
    // Inject the button
    const btnToReplace = `<span class="text-xs text-gray-500 dark:text-gray-400"
                  >{{ att.size / 1024 | number: '1.0-0' }} KB</span
                >
              </div>`;
    const replaceWith = `<span class="text-xs text-gray-500 dark:text-gray-400"
                  >{{ att.size / 1024 | number: '1.0-0' }} KB</span
                >
              </div>
              <button 
                class="ml-2 p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors"
                title="Guardar en Cliente"
                (click)="openClientSelector(att); $event.stopPropagation()">
                <i class="fas fa-user-plus"></i>
              </button>`;
              
    htmlContent = htmlContent.replace(btnToReplace, replaceWith);
    
    // Inject the modal at the end
    htmlContent += `
    <!-- Client Selector Modal -->
    @if (showClientSelector()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
          <div class="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Guardar en Client CRM</h3>
            <p class="text-sm text-gray-500 mt-1">Selecciona el cliente para adjuntarle el archivo <strong>{{ selectedAttachmentForClient()?.filename }}</strong></p>
          </div>
          
          <div class="p-6 max-h-96 overflow-y-auto space-y-2">
            @if (customersList().length === 0) {
               <div class="text-center text-gray-500 py-4"><i class="fas fa-spinner fa-spin mr-2"></i> Cargando clientes...</div>
            } @else {
               @for (c of customersList(); track c.id) {
                 <button 
                   class="w-full text-left p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent hover:border-gray-200"
                   (click)="confirmSaveAttachmentToClient(c.id)"
                   [disabled]="isSavingAttachment()">
                   <div class="font-medium text-gray-900 dark:text-white">{{ c.nombre || c.name || c.email }} {{ c.apellidos ? c.apellidos : '' }}</div>
                   <div class="text-xs text-gray-500">{{ c.email || c.telefono }}</div>
                 </button>
               }
            }
          </div>
          <div class="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end">
            <button (click)="cancelClientSelector()" class="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
          </div>
          
          @if (isSavingAttachment()) {
            <div class="absolute inset-0 bg-white/50 dark:bg-gray-800/50 flex items-center justify-center">
              <i class="fas fa-spinner fa-spin text-2xl text-indigo-500"></i>
            </div>
          }
        </div>
      </div>
    }
    `;
}

fs.writeFileSync(htmlPath, htmlContent);
console.log("message-detail components updated.");
