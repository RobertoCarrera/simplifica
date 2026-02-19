import { Component, Input, OnInit, inject, signal, ChangeDetectionStrategy, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, firstValueFrom } from 'rxjs';
import { SupabaseInvoicesService } from '../../../../../services/supabase-invoices.service';
import { SupabaseQuotesService } from '../../../../../services/supabase-quotes.service';
import { Invoice, InvoiceStatus, CreateInvoiceDTO, PaymentMethod } from '../../../../../models/invoice.model';
import { Quote, QuoteStatus, CreateQuoteDTO } from '../../../../../models/quote.model';
import { ToastService } from '../../../../../services/toast.service';
import { Router } from '@angular/router';
import { SkeletonComponent } from '../../../../../shared/ui/skeleton/skeleton.component';
import { SupabaseModulesService } from '../../../../../services/supabase-modules.service';

@Component({
    selector: 'app-client-billing',
    standalone: true,
    imports: [CommonModule, SkeletonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="space-y-6">
        <!-- Header & Tabs -->
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            
            <!-- Type Toggle -->
            <div class="inline-flex rounded-lg p-1 bg-gray-100 dark:bg-slate-700" *ngIf="isFacturasEnabled() && isPresupuestosEnabled()">
                <button (click)="activeTab.set('invoices')"
                    [class.bg-white]="activeTab() === 'invoices'"
                    [class.dark:bg-slate-600]="activeTab() === 'invoices'"
                    [class.text-blue-600]="activeTab() === 'invoices'"
                    [class.dark:text-blue-400]="activeTab() === 'invoices'"
                    [class.shadow-sm]="activeTab() === 'invoices'"
                    class="px-4 py-2 text-sm font-medium rounded-md transition-all text-gray-700 dark:text-gray-300">
                    Facturas
                </button>
                <button (click)="activeTab.set('quotes')"
                    [class.bg-white]="activeTab() === 'quotes'"
                    [class.dark:bg-slate-600]="activeTab() === 'quotes'"
                    [class.text-purple-600]="activeTab() === 'quotes'"
                    [class.dark:text-purple-400]="activeTab() === 'quotes'"
                    [class.shadow-sm]="activeTab() === 'quotes'"
                    class="px-4 py-2 text-sm font-medium rounded-md transition-all text-gray-700 dark:text-gray-300">
                    Presupuestos
                </button>
            </div>
            <div *ngIf="!isFacturasEnabled() || !isPresupuestosEnabled()" class="flex items-center">
                 <h3 class="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {{ activeTab() === 'invoices' ? 'Facturación' : 'Presupuestos' }}
                 </h3>
            </div>

            <!-- Action -->
            <button (click)="createDocument()" 
                [disabled]="isCreating()"
                [class.bg-blue-600]="activeTab() === 'invoices'"
                [class.hover:bg-blue-700]="activeTab() === 'invoices'"
                [class.bg-purple-600]="activeTab() === 'quotes'"
                [class.hover:bg-purple-700]="activeTab() === 'quotes'"
                class="px-4 py-2 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <i class="fas" [class.fa-plus]="!isCreating()" [class.fa-spinner]="isCreating()" [class.fa-spin]="isCreating()"></i> 
                {{ isCreating() ? 'Creando...' : (activeTab() === 'invoices' ? 'Nueva Factura' : 'Nuevo Presupuesto') }}
            </button>
        </div>

        <!-- Content Area -->
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden min-h-[300px]">
             
             <!-- Loading -->
             <div *ngIf="isLoading()" class="p-6">
                <app-skeleton type="list" [count]="5" height="4rem"></app-skeleton>
             </div>

             <!-- Empty State -->
             <div *ngIf="!isLoading() && ((activeTab() === 'invoices' && invoices().length === 0) || (activeTab() === 'quotes' && quotes().length === 0))" 
                  class="p-12 text-center text-gray-500 dark:text-gray-400">
                <i class="fas fa-file-invoice text-4xl mb-4 opacity-50"></i>
                <p>No hay {{ activeTab() === 'invoices' ? 'facturas' : 'presupuestos' }} registrados.</p>
             </div>

             <!-- Invoices List -->
             <div *ngIf="!isLoading() && activeTab() === 'invoices' && invoices().length > 0" class="divide-y divide-gray-100 dark:divide-slate-700">
                <div *ngFor="let invoice of invoices()" class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-file-invoice-dollar"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-gray-900 dark:text-white">{{ invoice.full_invoice_number || invoice.invoice_number }}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ invoice.invoice_date | date:'mediumDate' }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-6 sm:ml-auto">
                        <div class="text-right">
                            <span class="block text-sm font-bold text-gray-900 dark:text-white">{{ invoice.total | currency:'EUR' }}</span>
                            <span class="px-2 py-0.5 rounded text-xs font-medium" [ngClass]="getInvoiceStatusClass(invoice.status)">
                                {{ getInvoiceStatusLabel(invoice.status) }}
                            </span>
                        </div>
                        
                        <div class="flex gap-2">
                             <button (click)="viewInvoice(invoice)" class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium mr-2">
                                Ver
                             </button>
                             <button (click)="downloadInvoice(invoice)" title="Descargar PDF" class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                <i class="fas fa-download"></i>
                             </button>
                        </div>
                    </div>
                </div>
             </div>

             <!-- Quotes List -->
             <div *ngIf="!isLoading() && activeTab() === 'quotes' && quotes().length > 0" class="divide-y divide-gray-100 dark:divide-slate-700">
                <div *ngFor="let quote of quotes()" class="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-file-contract"></i>
                        </div>
                        <div>
                            <h4 class="text-sm font-bold text-gray-900 dark:text-white">{{ quote.full_quote_number || 'Borrador' }}</h4>
                            <p class="text-xs text-gray-500 dark:text-gray-400">{{ quote.quote_date | date:'mediumDate' }}</p>
                        </div>
                    </div>
                    
                    <div class="flex items-center gap-6 sm:ml-auto">
                        <div class="text-right">
                            <span class="block text-sm font-bold text-gray-900 dark:text-white">{{ quote.total_amount | currency:'EUR' }}</span>
                            <span class="px-2 py-0.5 rounded text-xs font-medium" [ngClass]="getQuoteStatusClass(quote.status)">
                                {{ getQuoteStatusLabel(quote.status) }}
                            </span>
                        </div>
                        
                         <div class="flex gap-2">
                             <button (click)="viewQuote(quote)" class="text-xs font-medium text-purple-600 hover:underline">Ver</button>
                        </div>
                    </div>
                </div>
             </div>

        </div>
    </div>
  `
})
export class ClientBillingComponent implements OnInit {
    @Input({ required: true }) clientId!: string;

    invoicesService = inject(SupabaseInvoicesService);
    quotesService = inject(SupabaseQuotesService);
    toast = inject(ToastService);
    router = inject(Router);
    modulesService = inject(SupabaseModulesService);
 
    isFacturasEnabled = computed(() => {
        const mods = this.modulesService.modulesSignal();
        if (!mods) return false;
        return mods.some(m => m.key === 'moduloFacturas' && m.enabled);
    });

    isPresupuestosEnabled = computed(() => {
        const mods = this.modulesService.modulesSignal();
        if (!mods) return false;
        return mods.some(m => m.key === 'moduloPresupuestos' && m.enabled);
    });

    activeTab = signal<'invoices' | 'quotes'>('invoices');
    isLoading = signal(true); // Start true

    constructor() {
        effect(() => {
            const factEnabled = this.isFacturasEnabled();
            const presEnabled = this.isPresupuestosEnabled();
            
            // Adjust activeTab if current one is disabled
            if (this.activeTab() === 'invoices' && !factEnabled && presEnabled) {
                this.activeTab.set('quotes');
            } else if (this.activeTab() === 'quotes' && !presEnabled && factEnabled) {
                this.activeTab.set('invoices');
            }
        }, { allowSignalWrites: true });
    }
    isCreating = signal(false);

    invoices = signal<Invoice[]>([]);
    quotes = signal<Quote[]>([]);

    ngOnInit() {
        this.loadData();
    }

    async loadData() {
        this.isLoading.set(true);
        const startTime = Date.now();
        try {
            // Parallel fetch using forkJoin/firstValueFrom
            const [invoices, quotesResponse] = await firstValueFrom(
                forkJoin([
                    this.invoicesService.getInvoices({ client_id: this.clientId }),
                    this.quotesService.getQuotes({ client_id: this.clientId })
                ])
            );

            this.invoices.set(invoices);
            this.quotes.set(quotesResponse.data);

        } catch (e) {
            console.error('Error loading billing data', e);
            this.toast.error('Error', 'No se pudieron cargar los datos de facturación.');
        } finally {
            const elapsed = Date.now() - startTime;
            const minTime = 500; // Minimum 500ms skeleton
            if (elapsed < minTime) {
                setTimeout(() => this.isLoading.set(false), minTime - elapsed);
            } else {
                this.isLoading.set(false);
            }
        }
    }

    createDocument() {
        this.isCreating.set(true);
        const today = new Date().toISOString().split('T')[0];

        if (this.activeTab() === 'invoices') {
            const dto: CreateInvoiceDTO = {
                client_id: this.clientId,
                invoice_date: today,
                items: [],
                payment_method: PaymentMethod.BANK_TRANSFER, // Default
                notes: ''
            };

            this.invoicesService.createInvoice(dto).subscribe({
                next: (inv) => {
                    this.isCreating.set(false);
                    this.toast.success('Factura creada', 'Se ha generado el borrador de factura');
                    this.router.navigate(['/facturas', inv.id]);
                },
                error: (e) => {
                    this.isCreating.set(false);
                    console.error(e);
                    this.toast.error('Error', 'No se pudo crear la factura');
                }
            });
        } else {
            const dto: CreateQuoteDTO = {
                client_id: this.clientId,
                quote_date: today,
                items: [],
                title: 'Nuevo Presupuesto',
                notes: ''
            };

            this.quotesService.createQuote(dto).subscribe({
                next: (quote) => {
                    this.isCreating.set(false);
                    this.toast.success('Presupuesto creado', 'Se ha generado el borrador de presupuesto');
                    this.router.navigate(['/presupuestos', quote.id]);
                },
                error: (e) => {
                    this.isCreating.set(false);
                    console.error(e);
                    this.toast.error('Error', 'No se pudo crear el presupuesto');
                }
            });
        }
    }

    downloadInvoice(invoice: Invoice) {
        this.toast.info('Descargando...', 'Generando PDF');
        this.invoicesService.getInvoicePdfUrl(invoice.id).subscribe({
            next: (url) => {
                window.open(url, '_blank');
            },
            error: () => this.toast.error('Error', 'No se pudo descargar el PDF')
        });
    }

    viewQuote(quote: Quote) {
        this.router.navigate(['/presupuestos', quote.id]);
    }

    viewInvoice(invoice: Invoice) {
        this.router.navigate(['/facturas', invoice.id]);
    }

    // Helpers
    getInvoiceStatusClass(status: InvoiceStatus) {
        switch (status) {
            case InvoiceStatus.PAID: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case InvoiceStatus.ISSUED:
            case InvoiceStatus.SENT: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            case InvoiceStatus.OVERDUE: return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            case InvoiceStatus.DRAFT: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
            case InvoiceStatus.APPROVED: return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    getInvoiceStatusLabel(status: InvoiceStatus) {
        const map: any = {
            [InvoiceStatus.PAID]: 'Pagada',
            [InvoiceStatus.SENT]: 'Enviada',
            [InvoiceStatus.DRAFT]: 'Borrador',
            [InvoiceStatus.OVERDUE]: 'Vencida',
            [InvoiceStatus.APPROVED]: 'Aprobada',
        };
        return map[status] || status;
    }

    getQuoteStatusClass(status: QuoteStatus) {
        switch (status) {
            case QuoteStatus.ACCEPTED: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case QuoteStatus.SENT: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            case QuoteStatus.REJECTED: return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            default: return 'bg-purple-50 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
        }
    }

    getQuoteStatusLabel(status: QuoteStatus) {
        return status;
    }
}
