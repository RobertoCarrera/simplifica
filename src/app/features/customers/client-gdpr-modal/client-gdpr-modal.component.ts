import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientGdprPanelComponent } from '../../../features/clients/components/client-gdpr-panel.component';

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
      class="modal-overlay"
      (click)="onOverlayClick($event)">
      
      <div 
        class="modal-container"
        (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <i class="fas fa-shield-alt text-2xl text-blue-600"></i>
            <div>
              <h2 class="modal-title">Gestión GDPR</h2>
              <p class="modal-subtitle">{{ clientName }}</p>
            </div>
          </div>
          <button 
            (click)="close()"
            class="close-button"
            title="Cerrar">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Content -->
        <div class="modal-body">
          <app-client-gdpr-panel
            [clientId]="clientId"
            [clientEmail]="clientEmail"
            [clientName]="clientName">
          </app-client-gdpr-panel>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button 
            (click)="close()"
            class="btn btn-secondary">
            Cerrar
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .modal-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      max-width: 900px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .modal-subtitle {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0.25rem 0 0 0;
    }

    .close-button {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #6b7280;
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .close-button:hover {
      background-color: #f3f4f6;
      color: #111827;
    }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-secondary {
      background-color: #f3f4f6;
      color: #374151;
    }

    .btn-secondary:hover {
      background-color: #e5e7eb;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .modal-container {
        max-width: 100%;
        max-height: 100vh;
        border-radius: 0;
      }

      .modal-body {
        padding: 1rem;
      }
    }
  `]
})
export class ClientGdprModalComponent implements OnInit {
  @Input() isOpen: boolean = false;
  @Input() clientId!: string;
  @Input() clientEmail!: string;
  @Input() clientName!: string;

  @Output() closeModal = new EventEmitter<void>();

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
