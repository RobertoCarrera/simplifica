import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ContractsService, Contract } from '../../../../core/services/contracts.service';
import { AuthService } from '../../../../services/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-client-contracts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Mis Contratos</h2>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading()" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading() && contracts().length === 0" class="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
        <div class="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-file-contract text-2xl text-gray-400"></i>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">No tienes contratos</h3>
        <p class="text-gray-500 dark:text-gray-400">Aquí aparecerán los contratos pendientes de firma.</p>
      </div>

      <!-- Contracts List -->
      <div *ngIf="!loading() && contracts().length > 0" class="grid gap-4">
        <div *ngFor="let contract of contracts()" 
             class="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                   [ngClass]="{
                     'bg-blue-100 text-blue-600': contract.status === 'sent' || contract.status === 'draft',
                     'bg-green-100 text-green-600': contract.status === 'signed',
                     'bg-red-100 text-red-600': contract.status === 'rejected'
                   }">
                <i class="fas text-xl" 
                   [ngClass]="{
                     'fa-file-signature': contract.status === 'sent' || contract.status === 'draft',
                     'fa-check-circle': contract.status === 'signed',
                     'fa-times-circle': contract.status === 'rejected'
                   }"></i>
              </div>
              
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white text-lg">{{ contract.title }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Creado el {{ contract.created_at | date:'mediumDate' }}
                </p>
                
                <div class="flex items-center gap-2 mt-2">
                  <span class="px-2.5 py-0.5 rounded-full text-xs font-medium"
                        [ngClass]="{
                          'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': contract.status === 'sent',
                          'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300': contract.status === 'draft',
                          'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': contract.status === 'signed',
                          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': contract.status === 'rejected'
                        }">
                    {{ getStatusLabel(contract.status) }}
                  </span>
                  
                  <span *ngIf="contract.signed_at" class="text-xs text-gray-500">
                    Firmado el {{ contract.signed_at | date:'medium' }}
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button *ngIf="contract.status === 'sent'" 
                      (click)="signContract(contract)"
                      class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                <i class="fas fa-pen"></i>
                Firmar ahora
              </button>
              
              <button *ngIf="contract.status === 'signed'" 
                      (click)="downloadContract(contract)"
                      class="px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-gray-200 dark:border-slate-600">
                <i class="fas fa-download"></i>
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ClientContractsComponent {
  private contractsService = inject(ContractsService);
  private authService = inject(AuthService);

  loading = signal(true);
  contracts = signal<Contract[]>([]);

  constructor() {
    this.loadContracts();
  }

  async loadContracts() {
    try {
      this.loading.set(true);
      const user = await firstValueFrom(this.authService.currentUser$);

      // Need to find client_id from user. 
      // Assumption: The logged in user in client portal context IS linked to a client record
      // or we have a way to get client_id.
      // For now, let's try to get it from auth metadata or query.
      // In this app structure, usually there's a mapping.
      // Let's assume we can get it or query clients by auth_user_id.
      const { data: clientData } = await this.contractsService['supabase']
        .from('clients')
        .select('id')
        .eq('auth_user_id', user?.id)
        .single();

      if (clientData) {
        this.contractsService.getClientContracts(clientData.id).subscribe({
          next: (data: Contract[]) => {
            this.contracts.set(data);
            this.loading.set(false);
          },
          error: (err: any) => {
            console.error('Error loading contracts', err);
            this.loading.set(false);
          }
        });
      } else {
        this.loading.set(false);
      }
    } catch (error) {
      console.error('Error in loadContracts', error);
      this.loading.set(false);
    }
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'draft': 'Borrador',
      'sent': 'Pendiente',
      'signed': 'Firmado',
      'rejected': 'Rechazado'
    };
    return labels[status] || status;
  }

  signContract(contract: Contract) {
    // TODO: Open dialog
    console.log('Open sign dialog for', contract);
  }

  async downloadContract(contract: Contract) {
    if (!contract.signed_pdf_url) return;

    // Get signed URL
    const url = await this.contractsService.getContractPdfUrl(contract.signed_pdf_url);
    if (url) {
      window.open(url, '_blank');
    }
  }
}
