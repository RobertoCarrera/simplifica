import { Component, computed, inject, signal, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, X, Award, History, Plus, Minus, TrendingUp, TrendingDown, Gift } from 'lucide-angular';
import { SupabaseLoyaltyService, LoyaltyPointTransaction } from '../../../services/supabase-loyalty.service';
import { SupabasePermissionsService } from '../../../services/supabase-permissions.service';
import { ToastService } from '../../../services/toast.service';
import { Customer } from '../../../models/customer';

@Component({
    selector: 'app-loyalty-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule],
    providers: [{ provide: LUCIDE_ICONS, useValue: new LucideIconProvider({ X, Award, History, Plus, Minus, TrendingUp, TrendingDown, Gift }) }],
    template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" (click)="close()">
      <div class="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-lg">
                <lucide-icon name="award" class="w-5 h-5"></lucide-icon>
            </div>
            <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">Puntos de Fidelidad</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ customer?.name }} {{ customer?.apellidos }}</p>
            </div>
          </div>
          <button (click)="close()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <lucide-icon name="x" class="w-5 h-5"></lucide-icon>
          </button>
        </div>

        <!-- Balance -->
        <div class="p-6 text-center bg-gradient-to-b from-yellow-50/50 to-transparent dark:from-yellow-900/10">
            <div class="text-4xl font-black text-gray-900 dark:text-white mb-1 transition-all" [class.scale-110]="animatingBalance()">
                {{ balance() }}
            </div>
            <div class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Puntos Disponibles</div>
        </div>

        <!-- Actions -->
        <div class="px-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            <div class="grid grid-cols-2 gap-3">
                <button (click)="openAdd(true)" class="flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30 rounded-lg font-medium transition-colors">
                    <lucide-icon name="plus" class="w-4 h-4"></lucide-icon>
                    Sumar Puntos
                </button>
                <button (click)="openAdd(false)" class="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30 rounded-lg font-medium transition-colors">
                    <lucide-icon name="minus" class="w-4 h-4"></lucide-icon>
                    Canjear/Restar
                </button>
            </div>
        </div>

        <!-- Manual Form (Inline) -->
        @if (showForm()) {
            <div class="p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 animate-in slide-in-from-top-2">
                <div class="space-y-3">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="text-sm font-bold" [ngClass]="isAdding() ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                            {{ isAdding() ? 'Sumar Puntos' : 'Restar Puntos' }}
                        </h4>
                        <button (click)="showForm.set(false)" class="text-xs text-gray-500 hover:underline">Cancelar</button>
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Cantidad</label>
                        <input type="number" [(ngModel)]="amount" min="1" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 outline-none" [ngClass]="isAdding() ? 'focus:ring-green-500' : 'focus:ring-red-500'" autoFocus>
                    </div>

                    <div>
                        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Motivo</label>
                        <input type="text" [(ngModel)]="reason" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 outline-none" [ngClass]="isAdding() ? 'focus:ring-green-500' : 'focus:ring-red-500'" placeholder="Ej: Bono regalo, Canje por servicio...">
                    </div>

                    <button (click)="submitTransaction()" [disabled]="!amount || amount <= 0 || loading()" class="w-full py-2 px-4 rounded-lg font-bold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors" [ngClass]="isAdding() ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'">
                        @if (loading()) {
                            <span class="inline-block animate-spin mr-2">...</span>
                        }
                        Confirmar
                    </button>
                </div>
            </div>
        }

        <!-- History -->
        <div class="flex-1 overflow-y-auto max-h-[300px] p-0">
            <div class="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                Historial recientes
            </div>
            
            @if (history().length === 0) {
                <div class="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <lucide-icon name="history" class="w-8 h-8 mx-auto mb-2 opacity-30"></lucide-icon>
                    <p>No hay movimientos registrados</p>
                </div>
            } @else {
                <div class="divide-y divide-gray-100 dark:divide-gray-800">
                    @for (item of history(); track item.id) {
                        <div class="px-6 py-3 flex justify-between items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                            <div class="flex items-center gap-3">
                                <div class="p-1.5 rounded-full" [ngClass]="item.points > 0 ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'">
                                    <lucide-icon [name]="item.points > 0 ? 'trending-up' : 'trending-down'" class="w-4 h-4"></lucide-icon>
                                </div>
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">{{ item.reason || (item.points > 0 ? 'Ajuste manual' : 'Canje') }}</p>
                                    <p class="text-xs text-gray-500">{{ formatDate(item.created_at) }} • {{ item.source }}</p>
                                </div>
                            </div>
                            <div class="font-bold font-mono" [ngClass]="item.points > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
                                {{ item.points > 0 ? '+' : '' }}{{ item.points }}
                            </div>
                        </div>
                    }
                </div>
            }
        </div>

      </div>
    </div>
  `,
    styles: [`
    :host { display: contents; }
  `]
})
export class LoyaltyModalComponent implements OnInit {
    @Input() customer: Customer | null = null;
    @Output() closed = new EventEmitter<void>();

    private loyaltyService = inject(SupabaseLoyaltyService);
    private permissionsService = inject(SupabasePermissionsService);
    private toastService = inject(ToastService);

    balance = signal(0);
    history = signal<LoyaltyPointTransaction[]>([]);
    animatingBalance = signal(false);

    // Form state
    showForm = signal(false);
    isAdding = signal(true);
    amount: number | null = null;
    reason: string = '';

    loading = signal(false);

    ngOnInit() {
        if (this.customer?.id) {
            this.refresh();
        }
    }

    async refresh() {
        if (!this.customer?.id) return;
        try {
            const [bal, hist] = await Promise.all([
                this.loyaltyService.getPointsBalance(this.customer.id),
                this.loyaltyService.getHistory(this.customer.id)
            ]);
            this.balance.set(bal);
            this.history.set(hist);
        } catch (e) {
            console.error('Error fetching loyalty data', e);
        }
    }

    close() {
        this.closed.emit();
    }

    openAdd(isAdd: boolean) {
        this.isAdding.set(isAdd);
        this.amount = null;
        this.reason = '';
        this.showForm.set(true);
    }

    async submitTransaction() {
        if (!this.customer?.id || !this.amount) return;

        try {
            this.loading.set(true);
            const companyId = this.permissionsService.companyId;
            if (!companyId) throw new Error('Company ID not found');

            const finalPoints = this.isAdding() ? this.amount : -this.amount;

            await this.loyaltyService.addPoints({
                company_id: companyId,
                customer_id: this.customer.id,
                points: finalPoints,
                source: 'manual',
                reason: this.reason || (this.isAdding() ? 'Ajuste manual' : 'Canje de puntos')
            });

            this.toastService.success('Puntos actualizados', 'La operación se ha realizado correctamente.');
            this.showForm.set(false);

            // Animate and refresh
            this.animatingBalance.set(true);
            setTimeout(() => this.animatingBalance.set(false), 300);
            await this.refresh();

        } catch (error) {
            console.error(error);
            this.toastService.error('Error', 'Error al actualizar puntos');
        } finally {
            this.loading.set(false);
        }
    }

    formatDate(dateStr: string): string {
        return new Date(dateStr).toLocaleDateString();
    }
}
