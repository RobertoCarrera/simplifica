
import { Component, OnInit, inject, signal, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingAvailabilityComponent } from '../../../availability/booking-availability.component';
import { LucideAngularModule } from 'lucide-angular';
import { SupabaseBookingsService } from '../../../../../../../services/supabase-bookings.service';
import { ToastService } from '../../../../../../../services/toast.service';

@Component({
  selector: 'app-professional-schedule-modal',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, BookingAvailabilityComponent],
  template: `
    <div class="modal-overlay" (click)="close.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <h2>Horario de {{ professionalName() }}</h2>
          <button class="close-btn" (click)="close.emit()">
            <lucide-icon name="x" [size]="20"></lucide-icon>
          </button>
        </header>

        <div class="modal-body">
            <app-booking-availability [targetUserId]="professionalId()"></app-booking-availability>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(4px);
    }

    .modal-content {
      background: var(--bg-card);
      border-radius: 1rem;
      width: 90%;
      max-width: 800px; /* Wider for schedule */
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border-color);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }

    .modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;

      h2 {
        font-size: 1.25rem;
        font-weight: 600;
        margin: 0;
      }
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.5rem;
      border-radius: 0.5rem;
      transition: all 0.2s;

      &:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
    }
  `]
})
export class ProfessionalScheduleModalComponent {
  professionalId = input.required<string>();
  professionalName = input.required<string>();
  close = output<void>();
}
