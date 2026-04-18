/**
 * Confirm Session Component
 *
 * Lightweight endpoint for the session-close workflow.
 * Professional lands here from the HIGH priority notification alert banner.
 * Allows confirming:
 *   - Session actually took place
 *   - Payment recorded (if cash)
 *   - Optional clinical notes
 *
 * Then triggers Phase 2: Google Review email if client has marketing_consent=true.
 */
import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, LucideIconProvider, LUCIDE_ICONS, Check, X, Clock, DollarSign, FileText, Star, ArrowLeft } from 'lucide-angular';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseBookingsService, Booking } from '../../../services/supabase-bookings.service';
import { SupabaseSessionCloseService } from '../../../services/supabase-session-close.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-confirm-session',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    LucideAngularModule,
    TranslocoPipe,
  ],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Check,
        X,
        Clock,
        DollarSign,
        FileText,
        Star,
        ArrowLeft,
      }),
    },
  ],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div class="w-full max-w-lg">

        <!-- Loading -->
        @if (isLoading()) {
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
            <div class="animate-pulse space-y-4">
              <div class="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mx-auto"></div>
              <div class="h-4 w-72 bg-gray-200 dark:bg-gray-700 rounded mx-auto"></div>
            </div>
          </div>
        }

        <!-- Error -->
        @if (error()) {
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div class="text-center mb-6">
              <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <lucide-icon name="x" class="w-8 h-8 text-red-500"></lucide-icon>
              </div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ error() }}</h2>
              <p class="text-gray-500 dark:text-gray-400 mt-2">No se pudo cargar la reserva.</p>
            </div>
            <button
              (click)="goBack()"
              class="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <lucide-icon name="arrow-left" class="w-4 h-4"></lucide-icon>
              Volver
            </button>
          </div>
        }

        <!-- Success -->
        @if (success()) {
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <div class="text-center mb-6">
              <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <lucide-icon name="check" class="w-8 h-8 text-emerald-500"></lucide-icon>
              </div>
              <h2 class="text-xl font-bold text-gray-900 dark:text-white">¡Sesión cerrada!</h2>
              <p class="text-gray-500 dark:text-gray-400 mt-2">
                @if (reviewEmailSent()) {
                  También hemos enviado un email de Google Review al cliente.
                } @else {
                  La sesión ha sido confirmada correctamente.
                }
              </p>
            </div>

            <div class="space-y-3">
              @if (reviewEmailSent()) {
                <div class="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
                  <lucide-icon name="star" class="w-5 h-5 text-blue-500 shrink-0"></lucide-icon>
                  <p class="text-sm text-blue-700 dark:text-blue-300">
                    Email de Google Review enviado a <strong>{{ booking()?.customer_email }}</strong>
                  </p>
                </div>
              }
              <button
                (click)="goBack()"
                class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
              >
                <lucide-icon name="arrow-left" class="w-4 h-4"></lucide-icon>
                Volver a la agenda
              </button>
            </div>
          </div>
        }

        <!-- Confirm Form -->
        @if (!isLoading() && !error() && !success() && booking()) {
          <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <!-- Header -->
            <div class="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-5 text-white">
              <h2 class="text-lg font-bold flex items-center gap-2">
                <lucide-icon name="clock" class="w-5 h-5"></lucide-icon>
                Cerrar Sesión
              </h2>
              <p class="text-white/80 text-sm mt-1">Confirma los detalles de la sesión transcurrida</p>
            </div>

            <!-- Booking Info -->
            <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                  <lucide-icon name="clock" class="w-5 h-5 text-blue-600 dark:text-blue-400"></lucide-icon>
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ booking()!.service?.name || 'Servicio' }}
                  </h3>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {{ formatDateTime(booking()!.start_time) }} — {{ formatTime(booking()!.end_time) }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    Cliente: {{ booking()!.customer_name }}
                  </p>
                  @if (booking()!.professional?.display_name) {
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      Profesional: {{ booking()!.professional!.display_name }}
                    </p>
                  }
                </div>
              </div>

              @if (booking()!.payment_status === 'pending' || booking()!.payment_status === 'partial') {
                <div class="mt-4 flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
                  <lucide-icon name="dollar-sign" class="w-4 h-4"></lucide-icon>
                  Pago pendiente o parcial
                </div>
              }
            </div>

            <!-- Payment Status (only for cash/on-site payment) -->
            @if (isCashPayment()) {
              <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                  <lucide-icon name="dollar-sign" class="w-4 h-4 inline mr-1"></lucide-icon>
                  Estado del pago
                </label>
                <div class="flex gap-3">
                  <button
                    (click)="setPaymentStatus('paid')"
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all"
                    [class]="paymentStatus() === 'paid'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-emerald-300'"
                  >
                    <lucide-icon name="check" class="w-5 h-5"></lucide-icon>
                    Cobrado
                  </button>
                  <button
                    (click)="setPaymentStatus('unpaid')"
                    class="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all"
                    [class]="paymentStatus() === 'unpaid'
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300'"
                  >
                    <lucide-icon name="x" class="w-5 h-5"></lucide-icon>
                    No cobrado
                  </button>
                </div>
              </div>
            }

            <!-- Clinical Notes -->
            <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700">
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                <lucide-icon name="file-text" class="w-4 h-4 inline mr-1"></lucide-icon>
                Notas clínicas (opcional)
              </label>
              <textarea
                [(ngModel)]="clinicalNotes"
                rows="3"
                placeholder="Añade observaciones sobre la sesión..."
                class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              ></textarea>
            </div>

            <!-- Actions -->
            <div class="px-6 py-5 flex gap-3">
              <button
                (click)="goBack()"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <lucide-icon name="arrow-left" class="w-4 h-4"></lucide-icon>
                Cancelar
              </button>
              <button
                (click)="confirmSession()"
                [disabled]="isConfirming()"
                class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                @if (isConfirming()) {
                  <span class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  Confirmando...
                } @else {
                  <lucide-icon name="check" class="w-4 h-4"></lucide-icon>
                  Confirmar Sesión
                }
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmSessionComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private bookingsService = inject(SupabaseBookingsService);
  private sessionCloseService = inject(SupabaseSessionCloseService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private supabase = inject(SimpleSupabaseService);

  booking = signal<Booking | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  success = signal(false);
  isConfirming = signal(false);
  reviewEmailSent = signal(false);

  paymentStatus = signal<'paid' | 'unpaid'>('paid');
  clinicalNotes = '';

  ngOnInit() {
    const bookingId = this.route.snapshot.paramMap.get('id');
    if (!bookingId) {
      this.error.set('ID de reserva no proporcionado');
      this.isLoading.set(false);
      return;
    }
    this.loadBooking(bookingId);
  }

  private async loadBooking(bookingId: string) {
    this.isLoading.set(true);
    try {
      const { data, error: err } = await this.supabase
        .getClient()
        .from('bookings')
        .select(`
          id, company_id, client_id, customer_name, customer_email, customer_phone,
          start_time, end_time, status, payment_status, payment_method, total_price,
          service:services(name, base_price),
          professional:professionals(display_name)
        `)
        .eq('id', bookingId)
        .single();

      if (err || !data) {
        this.error.set('Reserva no encontrada');
        return;
      }

      this.booking.set(data as any);
    } catch (e: any) {
      this.error.set(e?.message || 'Error al cargar la reserva');
    } finally {
      this.isLoading.set(false);
    }
  }

  isCashPayment(): boolean {
    const b = this.booking();
    if (!b) return false;
    // payment_method 'cash' or null + pending payment_status → assume cash
    const isCash = !b.payment_method || b.payment_method === 'cash';
    const needsPayment = b.payment_status === 'pending' || b.payment_status === 'partial';
    return !!(isCash && needsPayment);
  }

  setPaymentStatus(status: 'paid' | 'unpaid') {
    this.paymentStatus.set(status);
  }

  async confirmSession() {
    const b = this.booking();
    if (!b) return;

    this.isConfirming.set(true);
    try {
      // Update payment_status if cash payment and marked as paid/unpaid
      if (this.isCashPayment()) {
        await this.supabase.getClient().from('bookings').update({
          payment_status: this.paymentStatus(),
          updated_at: new Date().toISOString(),
        }).eq('id', b.id);
      }

      // Add clinical notes if provided
      if (this.clinicalNotes.trim()) {
        const existingNotes = b.notes || '';
        const updatedNotes = existingNotes
          ? `${existingNotes}\n\n[${new Date().toLocaleString()}] Nota post-sesión:\n${this.clinicalNotes}`
          : `[${new Date().toLocaleString()}] Nota post-sesión:\n${this.clinicalNotes}`;
        await this.supabase.getClient().from('bookings').update({
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        }).eq('id', b.id);
      }

      // Call confirmSession (handles Phase 2: Google Review email)
      const result = await this.sessionCloseService.confirmSession(b.id);
      this.reviewEmailSent.set(result.review_email_sent || false);
      this.success.set(true);
    } catch (err: any) {
      this.toastService.error(
        err?.message || 'Error al confirmar la sesión',
        'Error',
      );
    } finally {
      this.isConfirming.set(false);
    }
  }

  goBack() {
    this.router.navigate(['/reservas']);
  }

  formatDateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
}
