import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseMarketingService, Campaign, AudienceMember } from '../../../services/supabase-marketing.service';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
    selector: 'app-marketing-page',
    standalone: true,
    imports: [CommonModule, FormsModule, DatePipe],
    template: `
    <div class="max-w-7xl mx-auto p-6 space-y-6">
      
      <!-- Header -->
      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Marketing y Lealtad</h1>
          <p class="text-slate-500 text-sm">Crea campañas automatizadas para retener a tus clientes.</p>
        </div>
        <button (click)="openCreateModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 font-medium">
          <i class="fas fa-plus"></i> Nueva Campaña
        </button>
      </div>

      <!-- Campaign List -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (campaign of campaigns(); track campaign.id) {
          <div class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between h-full">
            <div>
              <div class="flex justify-between items-start mb-4">
                <span [class]="getStatusClass(campaign.status!)" class="px-2 py-1 text-xs rounded-full font-medium capitalize">
                  {{ campaign.status }}
                </span>
                <span class="text-xs text-slate-400">{{ campaign.created_at | date:'mediumDate' }}</span>
              </div>
              <h3 class="font-bold text-lg text-slate-800 dark:text-white mb-2">{{ campaign.name }}</h3>
              <p class="text-sm text-slate-500 mb-4 line-clamp-2">{{ campaign.subject || campaign.content }}</p>
              
              <!-- Audience Summary -->
              <div class="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg mb-4 text-xs text-slate-600 dark:text-slate-300">
                <div *ngIf="campaign.target_audience.inactive_days">
                  <i class="fas fa-user-clock mr-2"></i> Inactivos > {{ campaign.target_audience.inactive_days }} días
                </div>
                <div *ngIf="campaign.target_audience.birthday_month">
                  <i class="fas fa-birthday-cake mr-2"></i> Cumpleaños en {{ getMonthName(campaign.target_audience.birthday_month) }}
                </div>
              </div>
            </div>

            <div class="flex gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button *ngIf="campaign.status === 'draft'" (click)="sendCampaign(campaign)" class="flex-1 py-2 text-center text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                <i class="fas fa-paper-plane mr-1"></i> Enviar
              </button>
              <button class="flex-1 py-2 text-center text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                <i class="fas fa-edit mr-1"></i> Editar
              </button>
            </div>
          </div>
        } @empty {
          <div class="col-span-full text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-300">
            <div class="mb-4">
              <i class="fas fa-bullhorn text-4xl text-slate-300"></i>
            </div>
            <p class="text-slate-500 font-medium">No hay campañas creadas aún.</p>
            <button (click)="openCreateModal()" class="mt-4 text-indigo-600 font-medium hover:underline">Crear la primera campaña</button>
          </div>
        }
      </div>

      <!-- Create Modal -->
      <div *ngIf="showModal()" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
          <div class="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">Nueva Campaña</h2>
            <button (click)="closeModal()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
          </div>
          
          <div class="p-6 space-y-6">
            <!-- Basic Info -->
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre Interno</label>
                <input [(ngModel)]="newCampaign.name" type="text" class="w-full rounded-lg border-slate-200 text-sm" placeholder="Ej: Promo Verano">
              </div>
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Canal</label>
                <select [(ngModel)]="newCampaign.type" class="w-full rounded-lg border-slate-200 text-sm">
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            <!-- Audience Selector -->
            <div class="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <h3 class="text-sm font-bold text-slate-800 dark:text-white mb-3">Definir Audiencia</h3>
              <div class="grid grid-cols-2 gap-4">
                 <div>
                    <label class="block text-xs text-slate-500 mb-1">Días Inactivo (Mayor a)</label>
                    <input [(ngModel)]="newCampaign.target_audience.inactive_days" (change)="checkAudience()" type="number" class="w-full rounded border-slate-200 text-sm">
                 </div>
                 <div>
                    <label class="block text-xs text-slate-500 mb-1">Mes de Cumpleaños</label>
                    <select [(ngModel)]="newCampaign.target_audience.birthday_month" (change)="checkAudience()" class="w-full rounded border-slate-200 text-sm">
                      <option [ngValue]="undefined">Cualquiera</option>
                      <option [value]="1">Enero</option>
                      <option [value]="2">Febrero</option>
                      <option [value]="3">Marzo</option>
                      <!-- ... simplified for brevity -->
                    </select>
                 </div>
              </div>
              <div class="mt-3 flex justify-between items-center text-sm">
                <span class="text-slate-500">Estimación:</span>
                <span class="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                  {{ loadingAudience() ? 'Calculando...' : audienceSize() + ' clientes' }}
                </span>
              </div>
            </div>

            <!-- Content -->
            <div *ngIf="newCampaign.type === 'email'">
                <label class="block text-sm font-medium text-slate-700 mb-1">Asunto</label>
                <input [(ngModel)]="newCampaign.subject" type="text" class="w-full rounded-lg border-slate-200 text-sm mb-4">
            </div>

            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Mensaje</label>
                <textarea [(ngModel)]="newCampaign.content" rows="4" class="w-full rounded-lg border-slate-200 text-sm"></textarea>
                <p class="text-xs text-slate-400 mt-1">Usa {{ '{' + 'name' + '}' }} para personalizar con el nombre del cliente.</p>
            </div>

          </div>

          <div class="p-6 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
             <button (click)="closeModal()" class="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancelar</button>
             <button (click)="saveCampaign()" [disabled]="audienceSize() === 0" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                Guardar Campaña
             </button>
          </div>
        </div>
      </div>

    </div>
  `
})
export class MarketingPageComponent implements OnInit {
    private marketingService = inject(SupabaseMarketingService);
    private supabaseService = inject(SupabaseService);

    campaigns = signal<Campaign[]>([]);

    // Modal State
    showModal = signal(false);
    newCampaign: Campaign = this.getEmptyCampaign();

    // Audience State
    audienceSize = signal(0);
    loadingAudience = signal(false);

    ngOnInit() {
        this.loadCampaigns();
    }

    async loadCampaigns() {
        const companyId = this.supabaseService.currentCompanyId;
        if (!companyId) return;
        try {
            const data = await this.marketingService.getCampaigns(companyId);
            this.campaigns.set(data);
        } catch (e) {
            console.error(e);
        }
    }

    getEmptyCampaign(): Campaign {
        return {
            name: '',
            type: 'email',
            content: '',
            target_audience: { inactive_days: 30 }
        };
    }

    openCreateModal() {
        this.newCampaign = this.getEmptyCampaign();
        this.checkAudience();
        this.showModal.set(true);
    }

    closeModal() {
        this.showModal.set(false);
    }

    async checkAudience() {
        const companyId = this.supabaseService.currentCompanyId;
        if (!companyId) return;

        this.loadingAudience.set(true);
        try {
            // Clean criteria
            const criteria: any = {};
            if (this.newCampaign.target_audience.inactive_days) criteria.inactive_days = this.newCampaign.target_audience.inactive_days;
            if (this.newCampaign.target_audience.birthday_month) criteria.birthday_month = this.newCampaign.target_audience.birthday_month;

            const result = await this.marketingService.getEstimatedAudience(companyId, criteria);
            this.audienceSize.set(result.length);
        } catch (e) {
            console.error(e);
        } finally {
            this.loadingAudience.set(false);
        }
    }

    async saveCampaign() {
        const companyId = this.supabaseService.currentCompanyId;
        if (!companyId) return;

        try {
            this.newCampaign.company_id = companyId;
            await this.marketingService.createCampaign(this.newCampaign);
            this.closeModal();
            this.loadCampaigns();
        } catch (e) {
            console.error(e);
            alert('Error al guardar campaña');
        }
    }

    async sendCampaign(campaign: Campaign) {
        if (!confirm('¿Estás seguro de enviar esta campaña ahora?')) return;
        try {
            await this.marketingService.sendCampaign(campaign.id!);
            this.loadCampaigns();
            alert('Campaña enviada con éxito (simulado)');
        } catch (e) {
            console.error(e);
        }
    }

    getStatusClass(status: string) {
        switch (status) {
            case 'sent': return 'bg-emerald-100 text-emerald-700';
            case 'scheduled': return 'bg-blue-100 text-blue-700';
            default: return 'bg-slate-100 text-slate-600';
        }
    }

    getMonthName(month: number) {
        const date = new Date();
        date.setMonth(month - 1);
        return date.toLocaleDateString('es-ES', { month: 'long' });
    }
}
