import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface MoreMenuItem {
  id: string;
  label: string;
  icon: string; // fontawesome class suffix
  route?: string;
  badge?: number;
  queryParams?: Record<string, any>; // optional query params for navigation
  devOnly?: boolean; // hide this item for non-dev/non-admin users
  roleOnly?: 'ownerAdmin' | 'adminOnly'; // restrict visibility to certain roles
}

@Component({
  selector: 'app-more-menu-sheet',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-label="Menú adicional">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="close.emit()" aria-hidden="true"></div>
      <div class="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#1e293b] rounded-t-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col animate-slideUp">
        <div class="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Más opciones</h2>
          <button (click)="close.emit()" aria-label="Cerrar" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="px-3 pb-6 overflow-y-auto flex-1">
          <div class="grid grid-cols-3 gap-2">
            <a *ngFor="let it of items" [routerLink]="it.route" [queryParams]="it.queryParams" (click)="close.emit()" class="menu-btn" [attr.aria-label]="it.label">
              <span class="relative">
                <i [class]="'fas fa-' + it.icon"></i>
                <span *ngIf="it.badge && it.badge > 0" class="badge">{{ it.badge }}</span>
              </span>
              <span>{{ it.label }}</span>
            </a>
          </div>
        </div>
        <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
          <button (click)="close.emit()" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Cerrar</button>
        </div>
        <div *ngIf="debugRole || debugModules" class="px-4 pb-4 text-[11px] text-gray-600 dark:text-gray-400">
          <div><strong>Debug</strong></div>
          <div>role: {{ debugRole || 'unknown' }}</div>
          <div>modules: {{ debugModules ? (debugModules.join(', ')) : 'loading' }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .menu-btn { @apply flex flex-col items-center justify-center gap-1 p-3 rounded-xl text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors; min-height: 64px; }
    .menu-btn i { @apply text-base; }
    .badge { @apply absolute -top-1 -right-2 bg-red-500 text-white text-[10px] leading-none px-1 py-0.5 rounded-full min-w-[18px] text-center font-semibold; }
    @keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }
    .animate-slideUp { animation: slideUp .25s ease-out; }
  `]
})
export class MoreMenuSheetComponent {
  @Input() items: MoreMenuItem[] = [];
  @Input() debugRole?: string | null;
  @Input() debugModules?: string[] | null;
  @Output() close = new EventEmitter<void>();
}
