import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { Customer } from '../../../models/customer';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';
import { SecureClinicalNotesComponent } from '../components/secure-clinical-notes/secure-clinical-notes.component';
import { ClientBookingsComponent } from './components/client-bookings/client-bookings.component';
import { ClientBillingComponent } from './components/client-billing/client-billing.component';
import { ClientDocumentsComponent } from './components/client-documents/client-documents.component';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-client-profile',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        TagManagerComponent,
        SecureClinicalNotesComponent,
        ClientBookingsComponent,
        ClientBillingComponent,
        ClientDocumentsComponent
    ],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <!-- Loading State -->
      <div *ngIf="isLoading()" class="h-full flex items-center justify-center">
         <div class="flex flex-col items-center gap-4">
            <i class="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
            <p class="text-slate-500">Cargando perfil...</p>
         </div>
      </div>

      <div *ngIf="!isLoading() && customer()" class="flex-1 flex flex-col overflow-hidden">
         
         <!-- Main Scrollable Area -->
         <main class="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 scroll-smooth relative">
             
             <!-- Client Info (Scrolls away) -->
             <div class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6">
                 <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                     <div class="flex items-center gap-4">
                         <!-- Avatar -->
                         <div class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
                              [style.background]="getAvatarGradient(customer()!)">
                             {{ getInitials(customer()!) }}
                         </div>
                         
                         <div>
                             <h1 class="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                 {{ getDisplayName(customer()!) }}
                                 <span *ngIf="customer()!.client_type === 'business'" class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Empresa</span>
                             </h1>
                             <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                 <span *ngIf="customer()!.email" class="flex items-center gap-1">
                                     <i class="fas fa-envelope"></i> {{ customer()!.email }}
                                 </span>
                                 <span *ngIf="customer()!.phone" class="flex items-center gap-1">
                                     <i class="fas fa-phone"></i> {{ customer()!.phone }}
                                 </span>
                             </div>
                         </div>
                     </div>

                     <!-- Actions / Tags -->
                     <div class="flex flex-col items-end gap-3">
                         <app-tag-manager [entityId]="customer()!.id" entityType="clients"></app-tag-manager>
                     </div>
                 </div>
             </div>

             <!-- Sticky Tabs Navigation -->
             <div class="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 shadow-sm overflow-x-auto no-scrollbar">
                 <div class="flex items-center gap-6">
                     <button 
                        (click)="setActiveTab('ficha')"
                        class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                        [class.border-blue-500]="activeTab() === 'ficha'"
                        [class.text-blue-600]="activeTab() === 'ficha'"
                        [class.dark:text-blue-400]="activeTab() === 'ficha'"
                        [class.border-transparent]="activeTab() !== 'ficha'"
                        [class.text-slate-500]="activeTab() !== 'ficha'">
                        <i class="fas fa-id-card mr-2"></i> Ficha Técnica
                     </button>

                     <button 
                        (click)="setActiveTab('clinical')"
                        class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                        [class.border-emerald-500]="activeTab() === 'clinical'"
                        [class.text-emerald-600]="activeTab() === 'clinical'"
                        [class.dark:text-emerald-400]="activeTab() === 'clinical'"
                        [class.border-transparent]="activeTab() !== 'clinical'"
                        [class.text-slate-500]="activeTab() !== 'clinical'">
                        <i class="fas fa-notes-medical mr-2"></i> Historial Clínico
                     </button>

                     <button 
                        (click)="setActiveTab('agenda')"
                        class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                        [class.border-purple-500]="activeTab() === 'agenda'"
                        [class.text-purple-600]="activeTab() === 'agenda'"
                        [class.dark:text-purple-400]="activeTab() === 'agenda'"
                        [class.border-transparent]="activeTab() !== 'agenda'"
                        [class.text-slate-500]="activeTab() !== 'agenda'">
                        <i class="fas fa-calendar-alt mr-2"></i> Agenda
                     </button>

                     <button 
                        (click)="setActiveTab('billing')"
                        class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                        [class.border-amber-500]="activeTab() === 'billing'"
                        [class.text-amber-600]="activeTab() === 'billing'"
                        [class.dark:text-amber-400]="activeTab() === 'billing'"
                        [class.border-transparent]="activeTab() !== 'billing'"
                        [class.text-slate-500]="activeTab() !== 'billing'">
                        <i class="fas fa-file-invoice-dollar mr-2"></i> Facturación
                     </button>

                     <button 
                        (click)="setActiveTab('documents')"
                        class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                        [class.border-cyan-500]="activeTab() === 'documents'"
                        [class.text-cyan-600]="activeTab() === 'documents'"
                        [class.dark:text-cyan-400]="activeTab() === 'documents'"
                        [class.border-transparent]="activeTab() !== 'documents'"
                        [class.text-slate-500]="activeTab() !== 'documents'">
                        <i class="fas fa-folder mr-2"></i> Documentos
                     </button>
                 </div>
             </div>

             <!-- Tab Content -->
             <div class="p-6 max-w-7xl mx-auto pb-20">
                 
                 <!-- Tab: Ficha -->
                 <div *ngIf="activeTab() === 'ficha'" class="animate-fade-in space-y-6">
                     <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         <!-- Basic Info Card -->
                         <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700">
                             <h3 class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                                 <i class="fas fa-user-circle text-blue-500"></i> Información Personal
                             </h3>
                             <dl class="space-y-4">
                                 <div>
                                     <dt class="text-xs text-slate-400 uppercase font-semibold">DNI / NIF</dt>
                                     <dd class="text-slate-700 dark:text-slate-300 font-medium">{{ customer()!.dni || customer()!.cif_nif || '-' }}</dd>
                                 </div>
                                 <div *ngIf="customer()!.address">
                                     <dt class="text-xs text-slate-400 uppercase font-semibold">Dirección</dt>
                                     <dd class="text-slate-700 dark:text-slate-300">{{ customer()!.address }}</dd>
                                 </div>
                                  <div>
                                     <dt class="text-xs text-slate-400 uppercase font-semibold">Notas Internas</dt>
                                     <dd class="text-slate-600 dark:text-slate-400 text-sm italic">{{ customer()!.notes || 'Sin notas' }}</dd>
                                 </div>
                             </dl>
                         </div>
                         
                         <!-- Stats or Other Info could go here -->
                     </div>
                 </div>

                 <!-- Tab: Clinical Notes -->
                 <div *ngIf="activeTab() === 'clinical'" class="animate-fade-in max-w-5xl mx-auto">
                     <app-secure-clinical-notes [clientId]="customer()!.id"></app-secure-clinical-notes>
                 </div>

                 <!-- Tab: Agenda -->
                 <div *ngIf="activeTab() === 'agenda'" class="animate-fade-in max-w-5xl mx-auto">
                     <app-client-bookings [clientId]="customer()!.id" [clientData]="customer()"></app-client-bookings>
                 </div>

                 <!-- Tab: Billing -->
                 <div *ngIf="activeTab() === 'billing'" class="animate-fade-in max-w-5xl mx-auto">
                     <app-client-billing [clientId]="customer()!.id"></app-client-billing>
                 </div>

                  <!-- Tab: Documents -->
                 <div *ngIf="activeTab() === 'documents'" class="animate-fade-in max-w-5xl mx-auto">
                     <app-client-documents [clientId]="customer()!.id"></app-client-documents>
                 </div>
                 
             </div>
         </main>
      </div>
    </div>
  `,
    styles: [`
    .animate-fade-in { animation: fadeIn 0.3s ease-in-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `]
})
export class ClientProfileComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private customersService = inject(SupabaseCustomersService);
    private toastService = inject(ToastService);

    customer = signal<Customer | null>(null);
    isLoading = signal(true);
    activeTab = signal<'ficha' | 'clinical' | 'agenda' | 'billing' | 'documents'>('ficha');

    ngOnInit() {
        this.route.params.subscribe(params => {
            const id = params['id'];
            if (id) this.loadCustomer(id);
        });

        // Preserve tab on reload via query params? (Optional enhancement)
    }

    loadCustomer(id: string) {
        this.isLoading.set(true);
        this.customersService.getCustomer(id).subscribe({
            next: (c) => {
                this.customer.set(c);
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.toastService.error('Error al cargar perfil', 'Cliente no encontrado');
                this.isLoading.set(false);
            }
        });
    }

    setActiveTab(tab: 'ficha' | 'clinical' | 'agenda' | 'billing' | 'documents') {
        this.activeTab.set(tab);
    }

    // Helpers
    getDisplayName(c: Customer): string {
        return c.client_type === 'business'
            ? (c.business_name || c.name)
            : `${c.name} ${c.apellidos}`.trim();
    }

    getInitials(c: Customer): string {
        const name = this.getDisplayName(c);
        return name.substring(0, 2).toUpperCase();
    }

    getAvatarGradient(c: Customer): string {
        const name = c.name + (c.apellidos || '');
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash % 360);
        return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 50%))`;
    }
}
