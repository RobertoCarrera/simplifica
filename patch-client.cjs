const fs = require('fs');
const path = require('path');

const p = path.join('src', 'app', 'features', 'customers', 'profile', 'components', 'client-documents', 'client-documents.component.ts');
let content = fs.readFileSync(p, 'utf8');

const startMarker = '<!-- Contracts List -->';
const firstIndex = content.indexOf(startMarker);

if (firstIndex !== -1) {
  const endMarker = '</div>\n    </div>\n\n    @if (showCreateContract()) {';
  const endIndex = content.lastIndexOf('</div>\n    </div>\n\n    @if (showCreateContract()) {');
  
  if (endIndex !== -1) {
    const newUI = `
      <!-- Contracts List -->
      <div class="mt-8">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-gray-900 dark:text-white">Contratos y Generados</h3>
        </div>
        
        @if (isLoadingContracts()) {
          <div class="p-8 flex justify-center">
             <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        }
        
        @if (!isLoadingContracts() && contracts().length === 0) {
          <div class="p-12 text-center text-gray-500 dark:text-gray-400">
            <i class="fas fa-file-contract text-4xl mb-3 opacity-50"></i>
            <p>No hay contratos generados para este cliente.</p>
          </div>
        }
        
        @if (!isLoadingContracts() && contracts().length > 0) {
          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            @for (contract of contracts(); track contract) {
              <div class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between group">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                    <i class="fas fa-file-signature text-blue-500"></i>
                  </div>
                  <div>
                    <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                      {{ contract.title }}
                    </h4>
                    <div class="text-xs text-gray-500 flex gap-3 mt-1">
                      <span>{{ contract.created_at | date: 'shortDate' }}</span>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium" 
                            [ngClass]="{
                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300': contract.status === 'draft',
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300': contract.status === 'sent',
                              'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300': contract.status === 'signed'
                            }">
                        {{ contract.status | uppercase }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button (click)="sendContractToWebmail(contract)" class="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Enviar por Webmail">
                    <i class="fas fa-paper-plane"></i>
                  </button>
                  <button (click)="editContract(contract)" class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors" title="Editar">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button (click)="deleteContractAction(contract)" class="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            }
          </div>
        }
      `;
      content = content.substring(0, firstIndex) + newUI + content.substring(endIndex);
  }
}

// Add Router
if (!content.includes('router = inject(')) {
  content = content.replace("toast = inject(ToastService);", "toast = inject(ToastService);\n  router = inject(import('@angular/router').Router);");
}

let functionsToAdd = `
  sendContractToWebmail(contract: Contract) {
    this.router.navigate(['/webmail/composer'], {
      state: {
        to: this.clientEmail,
        subject: contract.title,
        body: contract.content_html
      }
    });
  }

  editContract(contract: Contract) {
    this.contractToEdit.set(contract);
    this.showCreateContract.set(true);
  }

  async deleteContractAction(contract: Contract) {
    if (!confirm('¿Eliminar el contrato generado "' + contract.title + '"?')) return;
    
    this.contractsService.deleteContract(contract.id).subscribe({
      next: () => {
        this.contracts.update(prev => prev.filter(c => c.id !== contract.id));
        this.toast.success('Eliminado', 'Contrato eliminado');
      },
      error: () => {
        this.toast.error('Error', 'No se pudo eliminar el contrato');
      }
    });
  }
`;

if (!content.includes('deleteContractAction')) {
  content = content.replace(/}\s*$/, functionsToAdd + '\n}');
}

if (!content.includes('contractToEdit = signal<Contract | null>(null);')) {
  // Wait we can just add it nicely
  content = content.replace('showCreateContract = signal(false);', 'showCreateContract = signal(false);\n  contractToEdit = signal<Contract | null>(null);');
}

// Modify the app-contract-creation-dialog inputs
content = content.replace('<app-contract-creation-dialog', '<app-contract-creation-dialog\n        [contractToEdit]="contractToEdit()"');
// wait, the regex to replace `(close)="showCreateContract.set(false)"` might be split in multiple lines
content = content.replace('(close)="showCreateContract.set(false)"', '(close)="showCreateContract.set(false); contractToEdit.set(null)"');

fs.writeFileSync(p, content);
console.log('client docs patched');
