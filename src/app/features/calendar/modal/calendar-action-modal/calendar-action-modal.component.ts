import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CalendarActionData {
  type: 'booking' | 'block';
  startTime: Date;
  endTime: Date;
  // Block fields
  reason?: string;
  blockType?: 'time' | 'day' | 'range';
  // Booking fields
  serviceId?: string;
  clientId?: string;
  id?: string;
}

@Component({
  selector: 'app-calendar-action-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendar-action-modal.component.html',
  styleUrls: ['./calendar-action-modal.component.scss']
})
export class CalendarActionModalComponent {
  isOpen = input(false);
  initialStartDate = input<Date | null>(null);
  services = input<any[]>([]);
  clients = input<any[]>([]);
  closeModal = output<void>();
  saveAction = output<CalendarActionData>();

  activeTab = signal<'booking' | 'block'>('booking');
  // New: If set, hides the tabs and locks the mode
  forcedMode = signal<'booking' | 'block' | null>(null);

  isEditMode = signal(false);
  existingId = signal<string | null>(null);
  deleteAction = output<string>();

  // Form Data
  startTimeStr = signal<string>('');
  // Form Data

  endTimeStr = signal<string>(''); // Used internally for calculation or for block mode

  // Block Specific
  blockReason = '';
  blockType = signal<'time' | 'day' | 'range'>('time');
  blockDateStr = signal<string>('');
  blockStartDateStr = signal<string>('');
  blockEndDateStr = signal<string>('');

  clientId: string | null = null;
  serviceId: string | null = null;

  ngOnChanges() {
    if (this.isOpen()) {
      // ...
    }
  }

  openForCreate(date: Date, tab: 'booking' | 'block' = 'booking', forced: boolean = false) {
    this.isEditMode.set(false);
    this.existingId.set(null);
    this.activeTab.set(tab);

    if (forced) {
      this.forcedMode.set(tab);
    } else {
      this.forcedMode.set(null);
    }

    this.initDates(date);

    this.blockReason = '';
    this.blockType.set('time'); // Default to time range
    this.serviceId = null;
    this.clientId = null;
  }

  openForEdit(event: any, type: 'booking' | 'block') {
    this.isEditMode.set(true);
    this.existingId.set(event.id);
    this.activeTab.set(type);

    // Always force mode on edit to avoid switching type mid-edit
    this.forcedMode.set(type);

    this.startTimeStr.set(this.toDateTimeLocal(event.start));
    this.endTimeStr.set(this.toDateTimeLocal(event.end));

    // Default fallback for edit
    this.blockType.set('time');
    this.blockDateStr.set(this.toDateLocal(event.start));
    this.blockStartDateStr.set(this.toDateLocal(event.start));
    this.blockEndDateStr.set(this.toDateLocal(event.end));

    // Heuristic could go here to detect if it's a full day block (00:00 - 23:59)
    // For now we default to time range to be safe

    if (type === 'block') {
      this.blockReason = event.title;
    }
  }

  private initDates(date: Date) {
    const start = new Date(date);
    start.setSeconds(0, 0);

    const end = new Date(start);
    end.setHours(start.getHours() + 1);

    this.startTimeStr.set(this.toDateTimeLocal(start));
    this.endTimeStr.set(this.toDateTimeLocal(end));

    const dateStr = this.toDateLocal(start);
    this.blockDateStr.set(dateStr);
    this.blockStartDateStr.set(dateStr);
    this.blockEndDateStr.set(dateStr);
  }

  private toDateTimeLocal(date: Date): string {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - (offset * 60 * 1000));
    return local.toISOString().slice(0, 16);
  }

  private toDateLocal(date: Date): string {
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - (offset * 60 * 1000));
    return local.toISOString().slice(0, 10);
  }

  updateStartTime(val: string) {
    this.startTimeStr.set(val);
    if (this.activeTab() === 'booking') {
      this.updateEndTimeBasedOnService();
    } else {
      // Block logic: auto-push end time if start > end
      if (val > this.endTimeStr()) {
        const start = new Date(val);
        const end = new Date(start);
        end.setHours(start.getHours() + 1);
        this.endTimeStr.set(this.toDateTimeLocal(end));
      }
    }
  }

  updateEndTimeBasedOnService() {
    if (this.activeTab() !== 'booking') return;

    const start = new Date(this.startTimeStr());
    let durationMinutes = 60; // Default

    if (this.serviceId) {
      const service = this.services().find(s => s.id === this.serviceId);
      if (service) {
        durationMinutes = service.duration_minutes || 60;
      }
    }

    const end = new Date(start.getTime() + durationMinutes * 60000);
    this.endTimeStr.set(this.toDateTimeLocal(end));
  }


  close() {
    this.closeModal.emit();
  }

  save() {
    let start: Date;
    let end: Date;

    if (this.activeTab() === 'block') {
      const type = this.blockType();
      if (type === 'day') {
        const date = new Date(this.blockDateStr());
        start = new Date(date);
        start.setHours(0, 0, 0, 0);
        end = new Date(date);
        end.setHours(23, 59, 59, 999);
      } else if (type === 'range') {
        start = new Date(this.blockStartDateStr());
        start.setHours(0, 0, 0, 0);
        end = new Date(this.blockEndDateStr());
        end.setHours(23, 59, 59, 999);
      } else {
        // Time range (Default)
        start = new Date(this.startTimeStr());
        end = new Date(this.endTimeStr());
      }
    } else {
      // Booking
      start = new Date(this.startTimeStr());
      end = new Date(this.endTimeStr());
    }

    this.saveAction.emit({
      type: this.activeTab(),
      startTime: start,
      endTime: end,
      reason: this.activeTab() === 'block' ? (this.blockReason || 'Bloqueado') : undefined,
      blockType: this.activeTab() === 'block' ? this.blockType() : undefined,
      serviceId: this.activeTab() === 'booking' ? (this.serviceId || undefined) : undefined,
      clientId: this.activeTab() === 'booking' ? (this.clientId || undefined) : undefined,
      id: this.existingId() || undefined
    });

    this.close();
  }

  delete() {
    if (this.existingId()) {
      this.deleteAction.emit(this.existingId()!);
      this.close();
    }
  }

  setTab(tab: 'booking' | 'block') {
    this.activeTab.set(tab);
  }
}
