import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientGdprPanelComponent } from '../components/client-gdpr-panel/client-gdpr-panel.component';

/**
 * Modal para gestionar GDPR de un cliente específico
 * Usado desde el CRM por los usuarios para gestionar datos de sus clientes
 */
@Component({
  selector: 'app-client-gdpr-modal',
  standalone: true,
  imports: [CommonModule, ClientGdprPanelComponent],
  template: `
    <div 
      *ngIf="isOpen" 
      class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      (click)="onOverlayClick($event)">
      
      <div 
        class="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-slide-up overflow-hidden"
        (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <div class="flex items-center gap-3">
            <i class="fas fa-shield-alt text-2xl text-blue-600 dark:text-blue-500"></i>
            <div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white m-0">Gestión GDPR</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1 m-0">{{ clientName }}</p>
            </div>
          </div>
          <button 
            (click)="close()"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
            title="Cerrar">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-slate-900/50">
          <app-client-gdpr-panel
            [clientId]="clientId"
            [clientEmail]="clientEmail"
            [clientName]="clientName"
            [readOnly]="true"
            [showHeader]="false"
            (dataChanged)="dataModified.emit()"
            (closeModal)="close()">
          </app-client-gdpr-panel>
        </div>

        <!-- Footer -->
        <div class="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-slate-900 flex justify-end">
          <button 
            (click)="close()"
            class="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors">
            Cerrar
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .animate-fade-in { animation: fadeIn 0.2s ease-out; }
    .animate-slide-up { animation: slideUp 0.3s ease-out; }
  `]
})
export class ClientGdprModalComponent implements OnInit {
  @Input() isOpen: boolean = false;
  @Input() clientId!: string;
  @Input() clientEmail!: string;
  @Input() clientName!: string;

  @Output() closeModal = new EventEmitter<void>();
  @Output() dataModified = new EventEmitter<void>();

  ngOnInit(): void {
    // Prevent body scroll when modal is open
    if (this.isOpen) {
      document.body.style.overflow = 'hidden';
    }
  }

  ngOnDestroy(): void {
    // Restore body scroll
    document.body.style.overflow = '';
  }

  onOverlayClick(event: MouseEvent): void {
    // Close only if clicking directly on overlay (not on modal content)
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  close(): void {
    document.body.style.overflow = '';
    this.closeModal.emit();
  }
}
