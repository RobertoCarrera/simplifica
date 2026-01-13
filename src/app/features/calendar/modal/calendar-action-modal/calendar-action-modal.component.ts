import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseCouponsService, Coupon } from '../../../../services/supabase-coupons.service';
import { Service } from '../../../../services/supabase-services.service';
import { SupabaseBookingsService } from '../../../../services/supabase-bookings.service';

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
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly';
    endDate: Date;
  };
  totalPrice?: number;
  depositPaid?: number;
  paymentStatus?: 'pending' | 'partial' | 'paid' | 'refunded';
  couponId?: string;
  discountAmount?: number;
  status?: 'confirmed' | 'pending' | 'cancelled';
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
  services = input<Service[]>([]);
  clients = input<any[]>([]);
  closeModal = output<void>();
  saveAction = output<CalendarActionData>();

  activeTab = signal<'booking' | 'block'>('booking');
  // New: If set, hides the tabs and locks the mode
  forcedMode = signal<'booking' | 'block' | null>(null);

  isEditMode = signal(false);
  existingId = signal<string | null>(null);
  deleteAction = output<string>();

  // Booking Status Tracking
  bookingStatus = signal<'confirmed' | 'pending' | 'cancelled'>('confirmed');


  // Dependencies
  private couponsService = inject(SupabaseCouponsService);
  private bookingsService = inject(SupabaseBookingsService);

  // Coupon Data
  couponCode = signal('');
  appliedCoupon = signal<Coupon | null>(null);
  couponMessage = signal<{ text: string, type: 'success' | 'error' } | null>(null);

  // Form Data
  startTimeStr = signal<string>('');
  endTimeStr = signal<string>(''); // Used internally for calculation or for block mode

  // Block Specific
  blockReason = '';
  blockType = signal<'time' | 'day' | 'range'>('time');
  blockDateStr = signal<string>('');
  blockStartDateStr = signal<string>('');
  blockEndDateStr = signal<string>('');

  // Recurrence
  recurrenceType = signal<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  recurrenceEndDateStr = signal<string>('');

  clientId: string | null = null;
  serviceId: string | null = null;

  ngOnChanges() {
    if (this.isOpen()) {
      // Logic handled in open methods usually, but could be reactive here
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
    this.recurrenceType.set('none');
    this.recurrenceEndDateStr.set('');
    this.clientId = null;

    // Reset Coupon
    this.couponCode.set('');
    this.appliedCoupon.set(null);
    this.couponMessage.set(null);

    this.bookingStatus.set('confirmed'); // Default for new, will be overriden by validation if needed
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

    if (type === 'block') {
      this.blockReason = event.title;
    }

    // Set booking fields if available
    if (type === 'booking') {
      this.serviceId = event.extendedProps?.service_id || null;
      this.clientId = event.extendedProps?.client_id || null;
      this.bookingStatus.set(event.extendedProps?.status || 'confirmed');
      // Restore recurrence logic if complex recurrence parsing is needed
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

  // Dynamic Pricing
  computedPrice = signal<number | null>(null);

  // Deposits
  computedDeposit = signal<number | null>(null);
  depositPaidInput = signal<number>(0);

  hasDepositRequirement = signal<boolean>(false);

  // Advanced Scheduling
  computedBuffer = signal<number | null>(null);

  updateStartTime(val: string) {
    this.startTimeStr.set(val);
    if (this.activeTab() === 'booking') {
      this.updateEndTimeBasedOnService();
      this.recalculatePrice();
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
        this.computedBuffer.set(service.buffer_minutes || 0);
      } else {
        this.computedBuffer.set(null);
      }
    } else {
      this.computedBuffer.set(null);
    }

    const end = new Date(start.getTime() + durationMinutes * 60000);
    this.endTimeStr.set(this.toDateTimeLocal(end));

    // Trigger price recalc
    this.recalculatePrice();
  }

  private recalculatePrice() {
    if (!this.serviceId || !this.startTimeStr()) {
      this.computedPrice.set(null);
      return;
    }

    const service = this.services().find(s => s.id === this.serviceId);
    if (!service) {
      this.computedPrice.set(null);
      return;
    }

    const start = new Date(this.startTimeStr());
    let price = service.display_price || service.base_price || 0;

    // Apply Variations
    if (service.price_variations && Array.isArray(service.price_variations)) {
      for (const variation of service.price_variations) {
        let applies = false;

        // Check Day of Week
        if (variation.conditions?.days_of_week) {
          const day = start.getDay(); // 0=Sun
          if (variation.conditions.days_of_week.includes(day)) {
            applies = true;
          }
        }

        // Check Time Range (Simple text comparison approx)
        if (variation.conditions?.time_start && variation.conditions?.time_end) {
          const timeStr = start.toTimeString().slice(0, 5); // "HH:MM"
          if (timeStr >= variation.conditions.time_start && timeStr <= variation.conditions.time_end) {
            applies = true;
          }
        }

        if (applies) {
          if (variation.adjustment_type === 'percent') {
            price += (price * (variation.amount / 100));
          } else if (variation.adjustment_type === 'fixed') {
            price += variation.amount;
          }
        }
      }
    }

    // Calculate Deposit
    this.computedDeposit.set(null);

    // Apply Coupon to Price (before deposit usually)
    let finalPrice = price;
    const coupon = this.appliedCoupon();

    if (coupon) {
      if (coupon.discount_type === 'percent') {
        finalPrice = price - (price * (coupon.discount_value / 100));
      } else {
        finalPrice = price - coupon.discount_value;
      }
    }

    if (finalPrice < 0) finalPrice = 0;
    this.computedPrice.set(finalPrice);


    if (service.deposit_type && service.deposit_type !== 'none') {
      let deposit = 0;
      if (service.deposit_type === 'fixed') {
        deposit = service.deposit_amount || 0;
      } else if (service.deposit_type === 'percent') {
        deposit = finalPrice * ((service.deposit_amount || 0) / 100);
      } else if (service.deposit_type === 'full') {
        deposit = finalPrice;
      }

      this.computedDeposit.set(deposit);
      this.hasDepositRequirement.set(true);
      this.depositPaidInput.set(deposit);
    } else {
      this.computedDeposit.set(null);
      this.hasDepositRequirement.set(false);
      this.depositPaidInput.set(0);
    }
  }

  async validateCoupon() {
    const code = this.couponCode();
    if (!code) return;

    const service = this.services().find(s => s.id === this.serviceId);
    if (!service || !service.company_id) {
      this.couponMessage.set({ text: 'Selecciona un servicio primero', type: 'error' });
      return;
    }

    const result = await this.couponsService.validateCoupon(code, service.company_id);
    if (result.valid && result.coupon) {
      this.appliedCoupon.set(result.coupon);
      this.couponMessage.set({ text: 'Cupón aplicado: ' + code, type: 'success' });
      this.recalculatePrice();
    } else {
      this.appliedCoupon.set(null);
      this.couponMessage.set({ text: result.message || 'Cupón inválido', type: 'error' });
      this.recalculatePrice();
    }
  }

  removeCoupon() {
    this.appliedCoupon.set(null);
    this.couponCode.set('');
    this.couponMessage.set(null);
    this.recalculatePrice();
  }


  close() {
    this.closeModal.emit();
  }

  approveBooking() {
    this.save('confirmed');
  }

  rejectBooking() {
    const confirmReject = confirm('¿Estás seguro de rechazar esta reserva? Se marcará como cancelada.');
    if (confirmReject) {
      this.save('cancelled');
    }
  }

  async save(forceStatus?: 'confirmed' | 'pending' | 'cancelled') {
    let start: Date;
    let end: Date;
    // Default to current status if editing, or confirmed if creating (unless forced)
    let bookingStatus: 'confirmed' | 'pending' | 'cancelled' = forceStatus || this.bookingStatus();
    let service: Service | undefined;

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

      if (this.serviceId) {
        service = this.services().find(s => s.id === this.serviceId);
        if (service) {
          const now = new Date();
          const diffMinutes = (start.getTime() - now.getTime()) / 60000;
          const diffDays = diffMinutes / (60 * 24);

          // Min Notice Validation
          if (service.min_notice_minutes && diffMinutes < service.min_notice_minutes) {
            const confirmOverride = confirm(
              `⚠️ Aviso de Antelación Mínima\n\nEste servicio requiere ${service.min_notice_minutes} min de antelación.` +
              `\nEstás intentando agendar con solo ${Math.floor(diffMinutes)} min.` +
              `\n\n¿Deseas continuar de todos modos?`
            );
            if (!confirmOverride) return;
          }

          // Max Lead Time Validation
          if (service.max_lead_days && diffDays > service.max_lead_days) {
            const confirmOverride = confirm(
              `⚠️ Aviso de Antelación Máxima\n\nEste servicio no permite reservas con más de ${service.max_lead_days} días de antelación.` +
              `\nEstás intentando agendar para dentro de ${Math.floor(diffDays)} días.` +
              `\n\n¿Deseas continuar de todos modos?`
            );
            if (!confirmOverride) return;
          }

          // Capacity Validation (Async)
          if (service.max_capacity && service.max_capacity > 1) {
            try {
              const currentCount = await this.bookingsService.checkServiceCapacity(service.id, start, end);
              if (currentCount >= service.max_capacity) {
                const confirmFull = confirm(
                  `⚠️ Cupo Completo\n\nEste servicio tiene una capacidad máxima de ${service.max_capacity}.` +
                  `\nYa hay ${currentCount} reservas confirmadas para este horario.` +
                  `\n\n¿Deseas sobre-agendar (Overbook)?`
                );
                if (!confirmFull) return;
              }
            } catch (err) {
              console.error('Error checking capacity:', err);
            }
          }

          // Approval Workflow
          // Only apply if we are NOT forcing a status (e.g. approving).
          if (!forceStatus && service.requires_confirmation) {
            bookingStatus = 'pending';

            const confirmPending = confirm(
              `ℹ️ Aprobación Requerida\n\nEste servicio requiere aprobación manual.` +
              `\nLa reserva se creará en estado 'Pendiente'.` +
              `\n\n¿Continuar?`
            );
            if (!confirmPending) return;
          }
        }
      }
    }

    // Emit
    this.saveAction.emit({
      type: this.activeTab(),
      startTime: start,
      endTime: end,
      reason: this.activeTab() === 'block' ? (this.blockReason || 'Bloqueado') : undefined,
      blockType: this.activeTab() === 'block' ? this.blockType() : undefined,
      // Booking specific
      serviceId: this.activeTab() === 'booking' ? (this.serviceId || undefined) : undefined,
      clientId: this.activeTab() === 'booking' ? (this.clientId || undefined) : undefined,
      id: this.existingId() || undefined,
      recurrence: (this.activeTab() === 'booking' && this.recurrenceType() !== 'none') ? {
        type: this.recurrenceType() as 'daily' | 'weekly' | 'monthly',
        endDate: new Date(this.recurrenceEndDateStr())
      } : undefined,
      totalPrice: this.activeTab() === 'booking' ? (this.computedPrice() ?? undefined) : undefined,

      depositPaid: (this.activeTab() === 'booking' && this.hasDepositRequirement()) ? this.depositPaidInput() : undefined,

      paymentStatus: (this.activeTab() === 'booking' && this.hasDepositRequirement())
        ? (this.depositPaidInput() >= (this.computedDeposit() || 0) ? 'paid' : (this.depositPaidInput() > 0 ? 'partial' : 'pending'))
        : 'pending',

      couponId: (this.activeTab() === 'booking' && this.appliedCoupon()) ? this.appliedCoupon()!.id : undefined,
      discountAmount: (this.activeTab() === 'booking' && this.appliedCoupon()) ? this.appliedCoupon()!.discount_value : undefined,

      status: bookingStatus
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
