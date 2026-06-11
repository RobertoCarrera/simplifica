import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
  effect,
  signal,
  computed,
  OnInit,
  OnChanges,
  DestroyRef,
  ChangeDetectorRef,
} from "@angular/core";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { Observable } from "rxjs";
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  FormControl,
} from "@angular/forms";
import { SimpleSupabaseService } from "../../../services/simple-supabase.service";
import { ToastService } from "../../../services/toast.service";
import { SupabaseSettingsService } from "../../../services/supabase-settings.service";
import { SupabaseCustomersService } from "../../../services/supabase-customers.service";
import { SupabaseBookingsService, SourceKey } from "../../../services/supabase-bookings.service";
import { SupabaseWaitlistService } from "../../../services/supabase-waitlist.service";
import { AuthService } from "../../../services/auth.service";
import { WaitlistButtonComponent } from "../waitlist-button/waitlist-button.component";
import { CustomSelectComponent, SelectOption } from "../../ui/custom-select/custom-select.component";
import { PaymentMethodDialogComponent, PaymentMethodChoice } from "./payment-method-dialog.component";
import { firstValueFrom, take } from "rxjs";

@Component({
  selector: "app-event-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, WaitlistButtonComponent, CustomSelectComponent, PaymentMethodDialogComponent],
  template: `
    <div
      class="evf-overlay"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div class="evf-overlay-center">
        <!-- Backdrop -->
        <div
          class="evf-backdrop"
          aria-hidden="true"
          (click)="closeModal()"
        ></div>

        <!-- Modal Panel -->
        <div class="evf-panel">
          <!-- Modal Header -->
          <div class="evf-header">
            <div class="evf-header-content">
              <div class="evf-header-icon">
                <i class="fas" [class.fa-calendar-plus]="!eventToEdit" [class.fa-edit]="!!eventToEdit"></i>
              </div>
              <div>
                <h3 class="evf-header-title" id="modal-title">
                  {{ eventToEdit ? "Editar Cita" : "Nueva Reserva" }}
                </h3>
                <p class="evf-header-subtitle">
                  {{
                    eventToEdit
                      ? "Modifica los detalles de la cita seleccionada."
                      : "Completa los datos para agendar una nueva reserva."
                  }}
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="close.emit()"
              class="evf-btn-close"
              aria-label="Cerrar"
            >
              <i class="fas fa-times"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="evf-body">
            <form [formGroup]="form" class="evf-form">
              <!-- Section 1: Service & Session Type -->
              <section class="evf-section">
                <h4 class="evf-section-title">
                  <span class="evf-section-badge">1</span>
                  Servicio y Modalidad
                </h4>

                <div class="evf-field">
                  <label for="service" class="evf-label">
                    <i class="fas fa-tag"></i> Servicio
                  </label>
                  <app-custom-select
                    [value]="resolvedServiceValue()"
                    (valueChange)="onServiceChange($event)"
                    [options]="serviceOptions()"
                    placeholder="Selecciona un servicio..."
                    [searchable]="true"
                    [clearable]="true"
                    searchPlaceholder="Buscar servicio..."
                    emptySearchText="No se encontraron servicios"
                  ></app-custom-select>
                </div>

                <div class="evf-field">
                  <label class="evf-label">
                    <i class="fas fa-laptop"></i> Tipo de sesión
                  </label>
                  <div class="evf-toggle-group">
                    <button type="button"
                      class="evf-toggle-btn"
                      [class.evf-toggle-active]="form.get('session_type')?.value === 'presencial'"
                      (click)="form.patchValue({session_type: 'presencial', blockRoom: false})">
                      <i class="fas fa-building"></i> Presencial
                    </button>
                    <button type="button"
                      class="evf-toggle-btn"
                      [class.evf-toggle-active]="form.get('session_type')?.value === 'online'"
                      (click)="form.patchValue({session_type: 'online', blockRoom: false})">
                      <i class="fas fa-video"></i> Online
                    </button>
                  </div>
                  @if (form.get('session_type')?.value === 'online') {
                    <div class="evf-field-hint evf-field-hint-info">
                      <i class="fas fa-info-circle"></i>
                      Se generará un enlace de Google Meet automáticamente.
                    </div>
                    <label class="evf-checkbox-label">
                      <input type="checkbox" formControlName="blockRoom" class="evf-checkbox">
                      <span>Bloquear sala</span>
                      <span class="evf-checkbox-hint">(si la sesión es desde el centro)</span>
                    </label>
                  }
                </div>
              </section>

              <!-- Section 2: Date & Time -->
              <section class="evf-section">
                <h4 class="evf-section-title">
                  <span class="evf-section-badge">2</span>
                  Fecha y Hora
                </h4>

                <div class="evf-field-row">
                  <div class="evf-field">
                    <label for="date" class="evf-label">
                      <i class="fas fa-calendar"></i> Fecha
                    </label>
                    <input
                      type="date"
                      id="date"
                      formControlName="date"
                      class="evf-input"
                    />
                  </div>

                  <div class="evf-field">
                    <label for="time" class="evf-label">
                      <i class="fas fa-clock"></i> Hora de inicio
                      @if (selectedEndFormatted()) {
                        <span class="evf-end-time">&rarr; {{ selectedEndFormatted() }}</span>
                      }
                    </label>
                    <app-custom-select
                      [value]="form.get('time')?.value"
                      (valueChange)="onTimeChange($event)"
                      [options]="timeOptions()"
                      placeholder="Selecciona hora..."
                      [searchable]="false"
                      [clearable]="true"
                      [disabled]="!form.get('date')?.value"
                    ></app-custom-select>
                  </div>
                </div>
              </section>

              <!-- Section 3: Client -->
              @if (!isClient()) {
                <section class="evf-section">
                  <h4 class="evf-section-title">
                    <span class="evf-section-badge">3</span>
                    Cliente
                  </h4>

                  <div class="evf-field">
                    <label class="evf-label">
                      <i class="fas fa-user"></i> Buscar cliente
                    </label>

                    <input
                      type="text"
                      [formControl]="clientSearchControl"
                      (focus)="showClientList.set(true)"
                      placeholder="Escribe nombre o email del cliente..."
                      class="evf-input"
                    />

                    @if (form.get("client")?.value; as selectedClient) {
                      <div class="evf-client-badge">
                        <div class="flex items-center gap-2.5">
                          <div class="evf-client-avatar">
                            {{ $any(selectedClient).name?.charAt(0) || "C" }}
                          </div>
                          <span class="evf-client-name">
                            {{ $any(selectedClient).displayName }}
                          </span>
                        </div>
                        <button type="button" class="evf-client-remove" (click)="clearClient()">
                          <i class="fas fa-times"></i>
                        </button>
                      </div>
                    }

                    @if (showClientList()) {
                      <div class="evf-client-dropdown">
                        @if (filteredClientsResult.length === 0) {
                          <div class="evf-client-empty">
                            <i class="fas fa-search mb-1 opacity-40"></i>
                            <span>No se encontraron clientes.</span>
                          </div>
                        }
                        @for (client of filteredClientsResult; track client.id) {
                          <div
                            (click)="selectClient(client)"
                            class="evf-client-item"
                          >
                            <div class="flex flex-col">
                              <span class="evf-client-item-name"
                                >{{ client.name }} {{ client.surname }}</span
                              >
                              <span class="evf-client-item-email"
                                >{{ client.email }}</span
                              >
                            </div>
                          </div>
                        }

                        @if (canInviteUnregistered()) {
                          <div
                            (click)="
                              selectClient({
                                id: 'new',
                                email: clientSearchTerm(),
                                name: (clientSearchTerm() || '').split('@')[0],
                                isNew: true,
                                displayName: clientSearchTerm(),
                              })
                            "
                            class="evf-client-item evf-client-invite"
                          >
                            <div class="flex items-center gap-2">
                              <i class="fas fa-user-plus text-base"></i>
                              <div class="flex flex-col">
                                <span class="evf-client-item-name"
                                  >Invitar a {{ clientSearchTerm() }}</span
                                >
                                <span class="evf-client-item-email"
                                  >Se creará como nuevo cliente</span
                                >
                              </div>
                            </div>
                          </div>
                        }
                      </div>
                    }

                    @if (showClientList()) {
                      <div
                        (click)="showClientList.set(false)"
                        class="fixed inset-0 z-40 bg-transparent cursor-default"
                      ></div>
                    }
                  </div>
                </section>
              }

              <!-- Section 4: Resource -->
              @if (filteredResourcesByService().length > 0) {
                <section class="evf-section">
                  <h4 class="evf-section-title">
                    <span class="evf-section-badge">4</span>
                    Recurso
                  </h4>

                  <label class="evf-checkbox-label">
                    <input
                      type="checkbox"
                      formControlName="chooseResourceManually"
                      class="evf-checkbox"
                    />
                    <span>Elegir recurso manualmente</span>
                  </label>

                  @if (form.get('chooseResourceManually')?.value) {
                    <app-custom-select
                      [value]="resolvedResourceValue()"
                      (valueChange)="onResourceChange($event)"
                      [options]="resourceOptions()"
                      placeholder="Selecciona recurso..."
                      [searchable]="true"
                      [clearable]="true"
                      searchPlaceholder="Buscar recurso..."
                      emptySearchText="No se encontraron recursos"
                    ></app-custom-select>

                    @if (
                      freeResources().length === 0 &&
                      availableResources.length > 0 &&
                      form.get("start")?.value
                    ) {
                      <div class="evf-info-box evf-info-box-warning mt-3">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>No hay recursos libres en este horario.</span>
                        @if (nextAvailableSuggestion()) {
                          <span class="evf-info-box-strong"
                            >Sugerencia: {{ nextAvailableSuggestion() }}</span
                          >
                        }
                      </div>
                    }
                  } @else {
                    <div class="evf-info-box evf-info-box-info mt-3">
                      <i class="fas fa-magic"></i>
                      <span>Se asignará automáticamente un recurso libre.</span>
                      @if (freeResources().length > 0) {
                        <span class="evf-info-box-strong">{{ freeResources().length }} disponible(s)</span>
                      } @else {
                        <span class="evf-info-box-strong evf-info-box-danger">Ninguno libre en el horario seleccionado</span>
                      }
                    </div>
                  }
                </section>
              }

              <!-- Section 5: Notes -->
              <section class="evf-section">
                <h4 class="evf-section-title">
                  <span class="evf-section-badge">5</span>
                  Notas
                </h4>

                <div class="evf-field">
                  <label for="description" class="evf-label">
                    <i class="fas fa-align-left"></i> Descripción
                  </label>
                  <textarea
                    id="description"
                    formControlName="description"
                    rows="3"
                    placeholder="Añade detalles adicionales sobre la reserva..."
                    class="evf-textarea"
                  ></textarea>
                </div>
              </section>
            </form>
          </div>

          <!-- Waitlist CTA -->
          @if (slotFull() && waitlistEligible()) {
            <div class="evf-waitlist">
              <div class="evf-waitlist-card">
                <p class="evf-waitlist-text">
                  <i class="fas fa-users"></i>
                  Este horario está completo ({{ currentBookingCount() }}/{{
                    selectedServiceMaxCapacity()
                  }}
                  plazas).
                </p>
                <app-waitlist-button
                  [serviceId]="selectedService()?.id || ''"
                  [companyId]="currentCompanyId()"
                  [startTime]="selectedStart() || ''"
                  [endTime]="selectedEnd() || ''"
                  [enableWaitlist]="selectedService()?.enable_waitlist ?? false"
                  [activeModeEnabled]="
                    selectedService()?.active_mode_enabled ?? true
                  "
                  (joined)="onWaitlistJoined()"
                ></app-waitlist-button>
              </div>
            </div>
          }

          <!-- Footer Action Bar -->
          <div class="evf-footer">
            <div class="evf-footer-meta">
              <span class="evf-footer-meta-label">Cita</span>
              <span class="evf-footer-meta-value">
                {{ serviceName }}
              </span>
              @if (isAlreadyPaid()) {
                <span class="evf-footer-paid-badge" [attr.title]="'Pagado con ' + currentPaymentMethodLabel()">
                  <i class="fas fa-check-circle"></i>
                  Pagado · {{ currentPaymentMethodLabel() }}
                </span>
              }
            </div>

            <div class="evf-footer-actions">
              <button
                type="button"
                (click)="closeModal()"
                class="evf-btn-secondary"
              >
                <i class="fas fa-times sm:hidden"></i>
                <span class="hidden sm:inline">Cancelar</span>
              </button>

              @if (!slotFull()) {
                @if (!eventToEdit) {
                  <button
                    type="button"
                    [disabled]="!canSubmit() || loading"
                    (click)="onSubmitAndMarkAsPaid()"
                    class="evf-btn-paid"
                    title="Crear la reserva y marcarla como pagada, eligiendo el método"
                  >
                    <i class="fas fa-coins text-sm"></i>
                    <span>Crear y marcar como pagado</span>
                  </button>
                }

                <div class="evf-submit-wrap" [class.evf-submit-wrap--blocked]="!canSubmit() && !loading && !checkingCapacity()">
                  <button
                    type="button"
                    [disabled]="!canSubmit()"
                    (click)="onSubmit()"
                    class="evf-btn-primary evf-btn-primary--main"
                    (mouseenter)="submitTooltipOpen.set(true)"
                    (mouseleave)="submitTooltipOpen.set(false)"
                    (focus)="submitTooltipOpen.set(true)"
                    (blur)="submitTooltipOpen.set(false)"
                    [attr.aria-describedby]="!canSubmit() ? 'evf-submit-tooltip' : null"
                  >
                    <i
                      class="fas text-sm"
                      [class.fa-save]="!loading"
                      [class.fa-spinner]="loading"
                      [class.fa-spin]="loading"
                      [class.fa-exclamation-triangle]="!canSubmit() && !loading && !checkingCapacity()"
                    ></i>
                    <span>{{
                      loading ? "Guardando..." : eventToEdit ? "Guardar Cambios" : "Crear Reserva"
                    }}</span>
                  </button>
                  @if (!canSubmit() && submitTooltipOpen()) {
                    <div
                      id="evf-submit-tooltip"
                      class="evf-submit-tooltip"
                      role="tooltip"
                    >
                      <div class="evf-submit-tooltip-title">
                        <i class="fas fa-info-circle"></i>
                        {{ submitBlockReason()?.title }}
                      </div>
                      @if (submitBlockReason()?.details?.length) {
                        <ul class="evf-submit-tooltip-list">
                          @for (d of submitBlockReason()?.details ?? []; track d) {
                            <li>{{ d }}</li>
                          }
                        </ul>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment method dialog — opens when "Crear y marcar como pagado" is clicked.
         Emits the chosen method upward; the parent then re-runs onSubmit
         with that method passed in. -->
    <app-payment-method-dialog
      (selected)="onPaymentMethodChosen($event)"
      (cancelled)="paymentMethodDialogRef?.close()"
      #paymentMethodDialogRef
    ></app-payment-method-dialog>

  `,
  styles: [`
    /* ================================================================
       EVENT FORM — Design System v2
       Modern, airy, harmonious. 8px grid rhythm. Indigo accent.
       Full dark mode support. Responsive mobile-first.
       ================================================================ */

    /* ---- CSS Custom Properties (design tokens) ---- */
    :host {
      --evf-radius-sm: 0.5rem;
      --evf-radius-md: 0.75rem;
      --evf-radius-lg: 1rem;
      --evf-radius-xl: 1.25rem;
      --evf-transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      --evf-transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ===== Overlay & backdrop ===== */
    .evf-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      overflow-y: auto;
    }
    .evf-overlay-center {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    @media (min-width: 640px) {
      .evf-overlay-center {
        padding: 1.5rem;
      }
    }
    .evf-backdrop {
      position: fixed;
      inset: 0;
      background: rgb(15 23 42 / 0.45);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      cursor: pointer;
      animation: evfFadeIn 0.25s ease-out;
    }
    @keyframes evfFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* ===== Modal panel ===== */
    .evf-panel {
      position: relative;
      background: white;
      border-radius: var(--evf-radius-xl);
      text-align: left;
      overflow: hidden;
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 0.04),
        0 4px 6px -1px rgb(0 0 0 / 0.04),
        0 20px 40px -8px rgb(0 0 0 / 0.1),
        0 80px 80px -20px rgb(0 0 0 / 0.06);
      transform-origin: center center;
      transition: transform var(--evf-transition), opacity var(--evf-transition);
      animation: evfSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex;
      flex-direction: column;
      max-width: 34rem;
      width: 100%;
      height: 90vh;
    }
    @keyframes evfSlideUp {
      from {
        opacity: 0;
        transform: translateY(24px) scale(0.97);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    @media (min-width: 640px) {
      .evf-panel {
        height: auto;
        max-height: 90vh;
        margin: 2rem 0;
      }
    }

    /* ---- Dark mode panel ---- */
    :host-context(.dark) .evf-panel,
    .dark .evf-panel {
      background: rgb(15 23 42);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 0.06),
        0 4px 6px -1px rgb(0 0 0 / 0.2),
        0 20px 40px -8px rgb(0 0 0 / 0.4),
        0 80px 80px -20px rgb(0 0 0 / 0.2);
    }

    /* ================================================================
       HEADER
       ================================================================ */
    .evf-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid rgb(241 245 249);
      flex-shrink: 0;
      gap: 1rem;
    }
    :host-context(.dark) .evf-header,
    .dark .evf-header {
      border-bottom-color: rgb(30 41 59);
    }
    .evf-header-content {
      display: flex;
      align-items: flex-start;
      gap: 0.875rem;
      min-width: 0;
    }
    .evf-header-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: var(--evf-radius-md);
      background: linear-gradient(135deg, rgb(238 242 255), rgb(224 231 255));
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: rgb(79 70 229);
      font-size: 1.125rem;
    }
    :host-context(.dark) .evf-header-icon,
    .dark .evf-header-icon {
      background: linear-gradient(135deg, rgb(30 27 75), rgb(49 46 129));
      color: rgb(165 180 252);
    }
    .evf-header-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: rgb(15 23 42);
      line-height: 1.3;
      letter-spacing: -0.015em;
    }
    :host-context(.dark) .evf-header-title,
    .dark .evf-header-title {
      color: rgb(248 250 252);
    }
    .evf-header-subtitle {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
      color: rgb(100 116 139);
      line-height: 1.4;
    }
    :host-context(.dark) .evf-header-subtitle,
    .dark .evf-header-subtitle {
      color: rgb(148 163 184);
    }

    /* ---- Close button ---- */
    .evf-btn-close {
      width: 2.25rem;
      height: 2.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--evf-radius-md);
      border: 1px solid transparent;
      background: rgb(241 245 249);
      color: rgb(100 116 139);
      cursor: pointer;
      transition: all var(--evf-transition-fast);
      flex-shrink: 0;
      font-size: 0.875rem;
    }
    .evf-btn-close:hover {
      background: rgb(254 242 242);
      color: rgb(239 68 68);
      border-color: rgb(254 226 226);
    }
    .evf-btn-close:active {
      transform: scale(0.94);
    }
    :host-context(.dark) .evf-btn-close,
    .dark .evf-btn-close {
      background: rgb(30 41 59);
      color: rgb(148 163 184);
    }
    :host-context(.dark) .evf-btn-close:hover,
    .dark .evf-btn-close:hover {
      background: rgb(69 26 26);
      color: rgb(252 165 165);
      border-color: rgb(127 29 29);
    }

    /* ================================================================
       BODY
       ================================================================ */
    .evf-body {
      padding: 1.25rem 1.5rem;
      flex: 1;
      overflow-y: auto;
      /* Footer is in-flow (not fixed), so the body just needs normal
         bottom padding. The flex layout pins the footer at the
         panel's bottom and the body's flex:1 + overflow-y: auto
         handles any extra content. */
      padding-bottom: 1.25rem;
    }
    .evf-body::-webkit-scrollbar {
      width: 4px;
    }
    .evf-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .evf-body::-webkit-scrollbar-thumb {
      background: rgb(203 213 225);
      border-radius: 9999px;
    }
    :host-context(.dark) .evf-body::-webkit-scrollbar-thumb,
    .dark .evf-body::-webkit-scrollbar-thumb {
      background: rgb(51 65 85);
    }

    .evf-form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* ================================================================
       SECTION
       ================================================================ */
    .evf-section {
      background: rgb(248 250 252);
      border: 1px solid rgb(241 245 249);
      border-radius: var(--evf-radius-lg);
      padding: 1.25rem;
      transition: border-color var(--evf-transition), box-shadow var(--evf-transition);
    }
    .evf-section:focus-within {
      border-color: rgb(199 210 254);
      box-shadow: 0 0 0 3px rgb(99 102 241 / 0.06);
    }
    :host-context(.dark) .evf-section,
    .dark .evf-section {
      background: rgb(17 24 39);
      border-color: rgb(30 41 59);
    }
    :host-context(.dark) .evf-section:focus-within,
    .dark .evf-section:focus-within {
      border-color: rgb(55 48 163);
      box-shadow: 0 0 0 3px rgb(99 102 241 / 0.1);
    }

    /* ---- Section title ---- */
    .evf-section-title {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgb(71 85 105);
      margin-bottom: 1rem;
      line-height: 1;
    }
    :host-context(.dark) .evf-section-title,
    .dark .evf-section-title {
      color: rgb(148 163 184);
    }
    .evf-section-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.375rem;
      height: 1.375rem;
      border-radius: 9999px;
      background: rgb(79 70 229);
      color: white;
      font-size: 0.625rem;
      font-weight: 700;
      flex-shrink: 0;
    }
    :host-context(.dark) .evf-section-badge,
    .dark .evf-section-badge {
      background: rgb(99 102 241);
    }

    /* ================================================================
       FIELDS
       ================================================================ */
    .evf-field {
      margin-bottom: 0.875rem;
      /* Anchor for absolutely-positioned children like .evf-client-dropdown
         so the dropdown renders right under the input instead of falling
         to the bottom of the modal panel. */
      position: relative;
    }
    .evf-field:last-child {
      margin-bottom: 0;
    }
    .evf-field-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.875rem;
    }
    @media (min-width: 640px) {
      .evf-field-row {
        grid-template-columns: 1fr 1fr;
      }
    }

    /* ---- Labels ---- */
    .evf-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgb(51 65 85);
      margin-bottom: 0.375rem;
      line-height: 1.5;
      letter-spacing: -0.01em;
    }
    :host-context(.dark) .evf-label,
    .dark .evf-label {
      color: rgb(203 213 225);
    }
    .evf-label i {
      font-size: 0.75rem;
      color: rgb(99 102 241);
      width: 1rem;
      text-align: center;
      flex-shrink: 0;
    }
    :host-context(.dark) .evf-label i,
    .dark .evf-label i {
      color: rgb(129 140 248);
    }

    /* ---- End time indicator ---- */
    .evf-end-time {
      font-size: 0.6875rem;
      font-weight: 500;
      color: rgb(79 70 229);
      margin-left: auto;
      white-space: nowrap;
    }
    :host-context(.dark) .evf-end-time,
    .dark .evf-end-time {
      color: rgb(129 140 248);
    }

    /* ---- Field hint ---- */
    .evf-field-hint {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      display: flex;
      align-items: flex-start;
      gap: 0.375rem;
      line-height: 1.5;
      padding: 0.5rem 0.625rem;
      border-radius: var(--evf-radius-sm);
    }
    .evf-field-hint-info {
      background: rgb(238 242 255);
      color: rgb(67 56 202);
    }
    :host-context(.dark) .evf-field-hint-info,
    .dark .evf-field-hint-info {
      background: rgb(30 27 75);
      color: rgb(165 180 252);
    }

    /* ---- Checkbox label ---- */
    .evf-checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.625rem;
      cursor: pointer;
      user-select: none;
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgb(51 65 85);
    }
    :host-context(.dark) .evf-checkbox-label,
    .dark .evf-checkbox-label {
      color: rgb(203 213 225);
    }
    .evf-checkbox-hint {
      font-size: 0.6875rem;
      color: rgb(148 163 184);
      font-weight: 400;
    }
    :host-context(.dark) .evf-checkbox-hint,
    .dark .evf-checkbox-hint {
      color: rgb(100 116 139);
    }

    /* ================================================================
       INPUTS, SELECTS, TEXTAREA
       ================================================================ */
    .evf-input,
    .evf-select {
      display: block;
      width: 100%;
      border-radius: var(--evf-radius-md);
      border: 1.5px solid rgb(226 232 240);
      background: white;
      padding: 0.5625rem 0.75rem;
      font-size: 0.875rem;
      font-family: inherit;
      color: rgb(15 23 42);
      transition: border-color var(--evf-transition-fast),
                  box-shadow var(--evf-transition-fast),
                  background-color var(--evf-transition-fast);
      outline: none;
      line-height: 1.5;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.02);
    }
    .evf-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.625rem center;
      padding-right: 2.25rem;
      cursor: pointer;
    }
    .evf-input:hover:not(:disabled):not(:focus),
    .evf-select:hover:not(:disabled):not(:focus) {
      border-color: rgb(203 213 225);
      background: rgb(250 250 250);
    }
    .evf-input:focus,
    .evf-select:focus {
      border-color: rgb(99 102 241);
      box-shadow:
        0 0 0 3px rgb(99 102 241 / 0.1),
        0 1px 3px rgb(0 0 0 / 0.04);
      background: white;
    }
    .evf-input:disabled,
    .evf-select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: rgb(248 250 252);
      border-color: rgb(226 232 240);
      color: rgb(148 163 184);
    }
    .evf-input::placeholder {
      color: rgb(148 163 184);
    }
    .evf-select option {
      color: rgb(15 23 42);
      background: white;
    }

    /* Dark mode inputs */
    :host-context(.dark) .evf-input,
    :host-context(.dark) .evf-select,
    .dark .evf-input,
    .dark .evf-select {
      background: rgb(15 23 42);
      border-color: rgb(51 65 85);
      color: rgb(241 245 249);
      box-shadow: none;
    }
    :host-context(.dark) .evf-input:hover:not(:disabled):not(:focus),
    :host-context(.dark) .evf-select:hover:not(:disabled):not(:focus),
    .dark .evf-input:hover:not(:disabled):not(:focus),
    .dark .evf-select:hover:not(:disabled):not(:focus) {
      border-color: rgb(71 85 105);
      background: rgb(17 24 39);
    }
    :host-context(.dark) .evf-input:focus,
    :host-context(.dark) .evf-select:focus,
    .dark .evf-input:focus,
    .dark .evf-select:focus {
      border-color: rgb(129 140 248);
      box-shadow: 0 0 0 3px rgb(129 140 248 / 0.15);
      background: rgb(15 23 42);
    }
    :host-context(.dark) .evf-input:disabled,
    :host-context(.dark) .evf-select:disabled,
    .dark .evf-input:disabled,
    .dark .evf-select:disabled {
      background: rgb(2 6 23);
      border-color: rgb(30 41 59);
      color: rgb(71 85 105);
    }
    :host-context(.dark) .evf-input::placeholder,
    .dark .evf-input::placeholder {
      color: rgb(71 85 105);
    }
    :host-context(.dark) .evf-select option,
    .dark .evf-select option {
      background: rgb(15 23 42);
      color: rgb(241 245 249);
    }

    /* ---- Textarea ---- */
    .evf-textarea {
      display: block;
      width: 100%;
      border-radius: var(--evf-radius-md);
      border: 1.5px solid rgb(226 232 240);
      background: white;
      padding: 0.625rem 0.75rem;
      font-size: 0.875rem;
      font-family: inherit;
      color: rgb(15 23 42);
      transition: border-color var(--evf-transition-fast),
                  box-shadow var(--evf-transition-fast);
      outline: none;
      resize: vertical;
      min-height: 5rem;
      line-height: 1.5;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.02);
    }
    .evf-textarea:hover:not(:disabled):not(:focus) {
      border-color: rgb(203 213 225);
      background: rgb(250 250 250);
    }
    .evf-textarea:focus {
      border-color: rgb(99 102 241);
      box-shadow:
        0 0 0 3px rgb(99 102 241 / 0.1),
        0 1px 3px rgb(0 0 0 / 0.04);
      background: white;
    }
    .evf-textarea::placeholder {
      color: rgb(148 163 184);
    }
    :host-context(.dark) .evf-textarea,
    .dark .evf-textarea {
      background: rgb(15 23 42);
      border-color: rgb(51 65 85);
      color: rgb(241 245 249);
      box-shadow: none;
    }
    :host-context(.dark) .evf-textarea:hover:not(:disabled):not(:focus),
    .dark .evf-textarea:hover:not(:disabled):not(:focus) {
      border-color: rgb(71 85 105);
      background: rgb(17 24 39);
    }
    :host-context(.dark) .evf-textarea:focus,
    .dark .evf-textarea:focus {
      border-color: rgb(129 140 248);
      box-shadow: 0 0 0 3px rgb(129 140 248 / 0.15);
      background: rgb(15 23 42);
    }
    :host-context(.dark) .evf-textarea::placeholder,
    .dark .evf-textarea::placeholder {
      color: rgb(71 85 105);
    }

    /* ================================================================
       TOGGLE GROUP (Session type)
       ================================================================ */
    .evf-toggle-group {
      display: flex;
      border-radius: var(--evf-radius-md);
      overflow: hidden;
      border: 1.5px solid rgb(226 232 240);
      background: rgb(248 250 252);
      padding: 0.25rem;
      gap: 0.125rem;
    }
    :host-context(.dark) .evf-toggle-group,
    .dark .evf-toggle-group {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42);
    }
    .evf-toggle-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4375rem;
      padding: 0.5rem 0.75rem;
      font-size: 0.8125rem;
      font-weight: 500;
      font-family: inherit;
      border: none;
      cursor: pointer;
      transition: all var(--evf-transition-fast);
      color: rgb(100 116 139);
      background: transparent;
      outline: none;
      border-radius: calc(var(--evf-radius-md) - 0.25rem);
    }
    :host-context(.dark) .evf-toggle-btn,
    .dark .evf-toggle-btn {
      color: rgb(148 163 184);
    }
    .evf-toggle-btn:hover:not(.evf-toggle-active) {
      background: rgb(241 245 249);
      color: rgb(51 65 85);
    }
    :host-context(.dark) .evf-toggle-btn:hover:not(.evf-toggle-active),
    .dark .evf-toggle-btn:hover:not(.evf-toggle-active) {
      background: rgb(30 41 59);
      color: rgb(226 232 240);
    }
    .evf-toggle-active {
      background: rgb(79 70 229);
      color: white;
      font-weight: 600;
      box-shadow:
        0 1px 3px rgb(79 70 229 / 0.3),
        0 1px 2px rgb(0 0 0 / 0.06);
    }
    .evf-toggle-active:hover {
      background: rgb(67 56 202);
      box-shadow:
        0 2px 6px rgb(79 70 229 / 0.4),
        0 1px 2px rgb(0 0 0 / 0.08);
    }

    /* ---- Checkbox ---- */
    .evf-checkbox {
      width: 1.0625rem;
      height: 1.0625rem;
      border-radius: 0.3125rem;
      border: 1.5px solid rgb(203 213 225);
      accent-color: rgb(79 70 229);
      cursor: pointer;
      transition: all var(--evf-transition-fast);
      flex-shrink: 0;
    }
    .evf-checkbox:hover {
      border-color: rgb(99 102 241);
    }
    .evf-checkbox:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgb(99 102 241 / 0.2);
    }
    :host-context(.dark) .evf-checkbox,
    .dark .evf-checkbox {
      border-color: rgb(71 85 105);
      background: rgb(30 41 59);
    }
    :host-context(.dark) .evf-checkbox:hover,
    .dark .evf-checkbox:hover {
      border-color: rgb(129 140 248);
    }

    /* ================================================================
       INFO BOXES
       ================================================================ */
    .evf-info-box {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.375rem 0.5rem;
      padding: 0.5625rem 0.75rem;
      border-radius: var(--evf-radius-sm);
      font-size: 0.75rem;
      line-height: 1.5;
    }
    .evf-info-box-info {
      background: rgb(248 250 252);
      border: 1px solid rgb(226 232 240);
      color: rgb(100 116 139);
    }
    :host-context(.dark) .evf-info-box-info,
    .dark .evf-info-box-info {
      background: rgb(17 24 39);
      border-color: rgb(51 65 85);
      color: rgb(148 163 184);
    }
    .evf-info-box-warning {
      background: rgb(255 251 235);
      border: 1px solid rgb(253 230 138);
      color: rgb(146 64 14);
    }
    :host-context(.dark) .evf-info-box-warning,
    .dark .evf-info-box-warning {
      background: rgb(30 18 0);
      border-color: rgb(113 63 18);
      color: rgb(253 224 71);
    }
    .evf-info-box-strong {
      font-weight: 600;
      color: inherit;
      width: 100%;
    }
    .evf-info-box-danger {
      color: rgb(239 68 68) !important;
    }
    :host-context(.dark) .evf-info-box-danger,
    .dark .evf-info-box-danger {
      color: rgb(252 165 165) !important;
    }

    /* ================================================================
       BUTTONS
       ================================================================ */
    .evf-btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.375rem;
      padding: 0.5rem 1rem;
      font-size: 0.8125rem;
      font-weight: 500;
      font-family: inherit;
      border-radius: var(--evf-radius-md);
      border: 1.5px solid rgb(226 232 240);
      background: white;
      color: rgb(71 85 105);
      cursor: pointer;
      transition: all var(--evf-transition-fast);
      white-space: nowrap;
    }
    .evf-btn-secondary:hover {
      background: rgb(248 250 252);
      border-color: rgb(203 213 225);
      color: rgb(30 41 59);
    }
    .evf-btn-secondary:active {
      transform: scale(0.97);
      background: rgb(241 245 249);
    }
    :host-context(.dark) .evf-btn-secondary,
    .dark .evf-btn-secondary {
      background: rgb(30 41 59);
      border-color: rgb(51 65 85);
      color: rgb(148 163 184);
    }
    :host-context(.dark) .evf-btn-secondary:hover,
    .dark .evf-btn-secondary:hover {
      background: rgb(51 65 85);
      border-color: rgb(71 85 105);
      color: rgb(226 232 240);
    }
    :host-context(.dark) .evf-btn-secondary:active,
    .dark .evf-btn-secondary:active {
      background: rgb(55 65 81);
    }

    .evf-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.5625rem 1.375rem;
      font-size: 0.875rem;
      font-weight: 600;
      font-family: inherit;
      border-radius: var(--evf-radius-md);
      border: none;
      background: linear-gradient(135deg, rgb(99 102 241) 0%, rgb(79 70 229) 100%);
      color: white;
      cursor: pointer;
      transition: all var(--evf-transition-fast);
      box-shadow:
        0 1px 3px rgb(79 70 229 / 0.2),
        0 4px 12px rgb(79 70 229 / 0.15),
        0 0 0 1px rgb(79 70 229 / 0.05);
      letter-spacing: -0.01em;
      white-space: nowrap;
      position: relative;
      overflow: hidden;
    }
    .evf-btn-primary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgb(255 255 255 / 0.1), transparent);
      opacity: 0;
      transition: opacity var(--evf-transition-fast);
    }
    .evf-btn-primary:hover:not(:disabled)::before {
      opacity: 1;
    }
    .evf-btn-primary:hover:not(:disabled) {
      background: linear-gradient(135deg, rgb(79 70 229) 0%, rgb(67 56 202) 100%);
      box-shadow:
        0 2px 6px rgb(79 70 229 / 0.3),
        0 8px 20px rgb(79 70 229 / 0.2),
        0 0 0 1px rgb(79 70 229 / 0.1);
      transform: translateY(-1px);
    }
    .evf-btn-primary:active:not(:disabled) {
      transform: translateY(0) scale(0.98);
      box-shadow:
        0 1px 2px rgb(79 70 229 / 0.15);
    }
    .evf-btn-primary:disabled {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
      background: rgb(148 163 184);
    }
    :host-context(.dark) .evf-btn-primary:disabled,
    .dark .evf-btn-primary:disabled {
      background: rgb(51 65 85);
    }

    /* ---- "Crear y marcar como pagado" — secondary CTA with green tint ---- */
    .evf-btn-paid {
      background: rgb(22 163 74); /* green-600 */
      color: white;
    }
    .evf-btn-paid:hover:not(:disabled) {
      background: rgb(21 128 61); /* green-700 */
    }
    .evf-btn-paid:disabled {
      background: rgb(134 239 172); /* green-300 (faded) */
      cursor: not-allowed;
    }
    :host-context(.dark) .evf-btn-paid:disabled,
    .dark .evf-btn-paid:disabled {
      background: rgb(20 83 45); /* green-900 (faded on dark) */
    }

    /* ---- Submit-button wrapper + disabled-blocked tooltip ---- */
    .evf-submit-wrap {
      position: relative;
      display: inline-flex;
    }
    .evf-submit-tooltip {
      position: absolute;
      bottom: calc(100% + 0.5rem);
      right: 0;
      z-index: 100;
      min-width: 220px;
      max-width: 320px;
      padding: 0.625rem 0.75rem 0.75rem;
      background: rgb(15 23 42);
      color: rgb(248 250 252);
      border-radius: 0.625rem;
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 0.05),
        0 10px 25px -5px rgb(0 0 0 / 0.25),
        0 8px 10px -6px rgb(0 0 0 / 0.15);
      font-size: 0.8125rem;
      line-height: 1.45;
      animation: evfTooltipIn 0.15s ease-out;
      pointer-events: none;
    }
    .evf-submit-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      right: 1.25rem;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid rgb(15 23 42);
    }
    :host-context(.dark) .evf-submit-tooltip,
    .dark .evf-submit-tooltip {
      background: rgb(248 250 252);
      color: rgb(15 23 42);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 0.1),
        0 10px 25px -5px rgb(0 0 0 / 0.5);
    }
    :host-context(.dark) .evf-submit-tooltip::after,
    .dark .evf-submit-tooltip::after {
      border-top-color: rgb(248 250 252);
    }
    .evf-submit-tooltip-title {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    .evf-submit-tooltip-title i {
      color: rgb(251 191 36);
      font-size: 0.75rem;
    }
    .evf-submit-tooltip-list {
      margin: 0;
      padding-left: 1.125rem;
      list-style: disc;
    }
    .evf-submit-tooltip-list li {
      margin-top: 0.125rem;
      opacity: 0.9;
    }
    .evf-submit-tooltip-list li:first-child {
      margin-top: 0;
    }
    @keyframes evfTooltipIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ================================================================
       CLIENT SEARCH & DROPDOWN
       ================================================================ */
    .evf-client-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: rgb(238 242 255);
      border: 1px solid rgb(199 210 254);
      border-radius: var(--evf-radius-sm);
      transition: border-color var(--evf-transition-fast);
    }
    :host-context(.dark) .evf-client-badge,
    .dark .evf-client-badge {
      background: rgb(30 27 75);
      border-color: rgb(55 48 163);
    }
    .evf-client-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgb(15 23 42);
    }
    :host-context(.dark) .evf-client-name,
    .dark .evf-client-name {
      color: rgb(226 232 240);
    }
    .evf-client-avatar {
      width: 2rem;
      height: 2rem;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: rgb(79 70 229);
      background: rgb(224 231 255);
      flex-shrink: 0;
    }
    :host-context(.dark) .evf-client-avatar,
    .dark .evf-client-avatar {
      color: rgb(165 180 252);
      background: rgb(49 46 129);
    }
    .evf-client-remove {
      background: none;
      border: none;
      color: rgb(148 163 184);
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 0.3125rem;
      transition: all var(--evf-transition-fast);
      font-size: 0.75rem;
    }
    .evf-client-remove:hover {
      color: rgb(239 68 68);
      background: rgb(254 242 242);
    }
    :host-context(.dark) .evf-client-remove:hover,
    .dark .evf-client-remove:hover {
      background: rgb(69 26 26);
    }

    /* ---- Dropdown ---- */
    .evf-client-dropdown {
      position: absolute;
      left: 0;
      right: 0;
      z-index: 10000;
      margin-top: 0.25rem;
      width: 100%;
      max-height: 16rem;
      overflow-y: auto;
      background: white;
      border-radius: var(--evf-radius-md);
      box-shadow:
        0 0 0 1px rgb(0 0 0 / 0.04),
        0 12px 32px -8px rgb(0 0 0 / 0.12),
        0 4px 8px -4px rgb(0 0 0 / 0.04);
      animation: evfFadeIn 0.12s ease-out;
    }
    :host-context(.dark) .evf-client-dropdown,
    .dark .evf-client-dropdown {
      background: rgb(15 23 42);
      box-shadow:
        0 0 0 1px rgb(255 255 255 / 0.05),
        0 12px 32px -8px rgb(0 0 0 / 0.5);
    }
    .evf-client-item {
      padding: 0.625rem 0.875rem;
      cursor: pointer;
      transition: background-color 0.1s ease;
      border-bottom: 1px solid rgb(241 245 249);
    }
    :host-context(.dark) .evf-client-item,
    .dark .evf-client-item {
      border-bottom-color: rgb(30 41 59);
    }
    .evf-client-item:last-child {
      border-bottom: none;
    }
    .evf-client-item:hover {
      background: rgb(238 242 255);
    }
    :host-context(.dark) .evf-client-item:hover,
    .dark .evf-client-item:hover {
      background: rgb(30 27 75);
    }
    .evf-client-item-name {
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgb(15 23 42);
    }
    :host-context(.dark) .evf-client-item-name,
    .dark .evf-client-item-name {
      color: rgb(241 245 249);
    }
    .evf-client-item-email {
      font-size: 0.6875rem;
      color: rgb(148 163 184);
      margin-top: 0.0625rem;
    }
    :host-context(.dark) .evf-client-item-email,
    .dark .evf-client-item-email {
      color: rgb(100 116 139);
    }
    .evf-client-item.evf-client-invite {
      color: rgb(5 150 105);
      border-top: 1px solid rgb(209 250 229);
      background: rgb(240 253 244);
    }
    :host-context(.dark) .evf-client-item.evf-client-invite,
    .dark .evf-client-item.evf-client-invite {
      color: rgb(52 211 153);
      border-top-color: rgb(6 78 59);
      background: rgb(5 46 22);
    }
    .evf-client-item.evf-client-invite:hover {
      background: rgb(220 252 231);
    }
    :host-context(.dark) .evf-client-item.evf-client-invite:hover,
    .dark .evf-client-item.evf-client-invite:hover {
      background: rgb(6 78 32);
    }
    .evf-client-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 1.5rem 1rem;
      color: rgb(148 163 184);
      font-size: 0.8125rem;
    }

    /* ================================================================
       WAITLIST
       ================================================================ */
    .evf-waitlist {
      padding: 0 1.5rem 1rem;
      flex-shrink: 0;
    }
    .evf-waitlist-card {
      border-radius: var(--evf-radius-md);
      border: 1px solid rgb(253 230 138);
      background: rgb(255 251 235);
      padding: 0.75rem 1rem;
    }
    :host-context(.dark) .evf-waitlist-card,
    .dark .evf-waitlist-card {
      background: rgb(30 18 0);
      border-color: rgb(113 63 18);
    }
    .evf-waitlist-text {
      font-size: 0.75rem;
      font-weight: 500;
      color: rgb(146 64 14);
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
    :host-context(.dark) .evf-waitlist-text,
    .dark .evf-waitlist-text {
      color: rgb(253 224 71);
    }

    /* ================================================================
       FOOTER
       ================================================================ */
    .evf-footer {
      /* In-flow flex item: stays at the bottom of the panel because
         .evf-panel is a column flex with height: 90vh. The .evf-body
         sibling has flex: 1 + overflow-y: auto, so it absorbs any
         extra content height while the footer remains pinned to the
         panel's bottom edge (NOT the viewport). The previous
         position: fixed leaked the footer outside the modal. */
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.875rem 1.5rem;
      background: white;
      border-top: 1px solid rgb(241 245 249);
      flex-shrink: 0;
      box-shadow: 0 -4px 20px rgb(0 0 0 / 0.04);
    }
    :host-context(.dark) .evf-footer,
    .dark .evf-footer {
      background: rgb(15 23 42);
      border-top-color: rgb(30 41 59);
      box-shadow: 0 -4px 20px rgb(0 0 0 / 0.3);
    }
    @media (min-width: 640px) {
      .evf-footer {
        border-radius: 0 0 var(--evf-radius-xl) var(--evf-radius-xl);
        box-shadow: none;
      }
    }
    .evf-footer-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .evf-footer-meta-label {
      font-size: 0.625rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgb(148 163 184);
      line-height: 1;
    }
    :host-context(.dark) .evf-footer-meta-label,
    .dark .evf-footer-meta-label {
      color: rgb(100 116 139);
    }
    .evf-footer-meta-value {
      font-size: 0.8125rem;
      font-weight: 600;
      color: rgb(15 23 42);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    :host-context(.dark) .evf-footer-meta-value,
    .dark .evf-footer-meta-value {
      color: rgb(248 250 252);
    }
    /* "Pagado · Efectivo/Tarjeta/Bizum/Online" badge that appears in
       the footer-meta when editing an already-paid booking. */
    .evf-footer-paid-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      margin-top: 0.25rem;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background: rgb(220 252 231);
      color: rgb(22 101 52);
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .evf-footer-paid-badge i {
      font-size: 0.7rem;
    }
    :host-context(.dark) .evf-footer-paid-badge,
    .dark .evf-footer-paid-badge {
      background: rgb(20 83 45 / 0.3);
      color: rgb(134 239 172);
    }
    .evf-footer-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
      /* Mobile: stack vertically with column-reverse so the dominant
         "Crear Reserva" sits at the very bottom of the stack (closest
         to the user's thumb). Cancelar stays at the top of the stack.
         On sm+ lay them out in a single row right-aligned, with the
         primary rightmost. */
      flex-direction: column-reverse;
      align-items: stretch;
      flex: 1;
    }
    @media (min-width: 640px) {
      .evf-footer-actions {
        flex-direction: row;
        align-items: center;
        justify-content: flex-end;
        flex: 0 0 auto;
      }
    }

    /* Primary submit ("Crear Reserva") — visually dominant. Larger
       padding and font than the other footer actions so the eye
       lands on it first, especially on mobile. */
    .evf-btn-primary--main {
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
      font-weight: 700;
      order: 1;
    }
    @media (min-width: 640px) {
      .evf-btn-primary--main {
        order: 2; /* keep primary rightmost in the row */
      }
    }

    /* Secondary "Crear y marcar como pagado" — outline style, less
       visually heavy than the primary. Shown in the middle of the
       action cluster so the primary remains the call to action. */
    .evf-btn-paid {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.625rem 0.875rem;
      font-size: 0.8125rem;
      font-weight: 600;
      border-radius: var(--evf-radius-md);
      background: transparent;
      color: rgb(22 163 74);
      border: 1.5px solid rgb(34 197 94 / 0.4);
      cursor: pointer;
      transition: all 0.15s ease;
      order: 2;
    }
    .evf-btn-paid:hover:not(:disabled) {
      background: rgb(34 197 94 / 0.08);
      border-color: rgb(34 197 94 / 0.7);
    }
    .evf-btn-paid:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    :host-context(.dark) .evf-btn-paid,
    .dark .evf-btn-paid {
      color: rgb(74 222 128);
      border-color: rgb(74 222 128 / 0.3);
    }
    :host-context(.dark) .evf-btn-paid:hover:not(:disabled),
    .dark .evf-btn-paid:hover:not(:disabled) {
      background: rgb(74 222 128 / 0.1);
      border-color: rgb(74 222 128 / 0.6);
    }
    @media (min-width: 640px) {
      .evf-btn-paid {
        order: 1; /* sits between Cancelar and the primary */
      }
    }

    /* ================================================================
       CUSTOM SELECT INTEGRATION — overrides for evf look & feel
       ================================================================ */
    ::ng-deep .evf-section app-custom-select .custom-select__trigger {
      border-radius: var(--evf-radius-md);
      border: 1.5px solid rgb(226 232 240);
      padding: 0.5625rem 0.75rem;
      font-size: 0.875rem;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.02);
      background: white;
      height: auto;
      min-height: 2.5rem;
      transition: border-color var(--evf-transition-fast),
                  box-shadow var(--evf-transition-fast),
                  background-color var(--evf-transition-fast);
    }
    ::ng-deep .evf-section app-custom-select .custom-select__trigger:hover:not(:disabled) {
      border-color: rgb(203 213 225);
      background: rgb(250 250 250);
    }
    ::ng-deep .evf-section app-custom-select .custom-select__trigger:focus,
    ::ng-deep .evf-section app-custom-select.custom-select--open .custom-select__trigger {
      border-color: rgb(99 102 241);
      box-shadow: 0 0 0 3px rgb(99 102 241 / 0.1), 0 1px 3px rgb(0 0 0 / 0.04);
      background: white;
    }
    ::ng-deep .evf-section app-custom-select .custom-select__panel {
      border-radius: var(--evf-radius-md);
      box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1), 0 0 0 1px rgb(0 0 0 / 0.04);
    }
    /* Dark mode overrides */
    ::ng-deep .dark .evf-section app-custom-select .custom-select__trigger,
    :host-context(.dark) ::ng-deep .evf-section app-custom-select .custom-select__trigger {
      background: rgb(15 23 42);
      border-color: rgb(51 65 85);
      color: rgb(241 245 249);
      box-shadow: none;
    }
    ::ng-deep .dark .evf-section app-custom-select .custom-select__trigger:hover:not(:disabled),
    :host-context(.dark) ::ng-deep .evf-section app-custom-select .custom-select__trigger:hover:not(:disabled) {
      border-color: rgb(71 85 105);
      background: rgb(17 24 39);
    }
    ::ng-deep .dark .evf-section app-custom-select .custom-select__trigger:focus,
    ::ng-deep .dark .evf-section app-custom-select.custom-select--open .custom-select__trigger,
    :host-context(.dark) ::ng-deep .evf-section app-custom-select .custom-select__trigger:focus,
    :host-context(.dark) ::ng-deep .evf-section app-custom-select.custom-select--open .custom-select__trigger {
      border-color: rgb(129 140 248);
      box-shadow: 0 0 0 3px rgb(129 140 248 / 0.15);
      background: rgb(15 23 42);
    }
  `],
})
export class EventFormComponent implements OnInit, OnChanges {
  @Input() initialDate: Date | null = null;
  @Input() calendarId: string | undefined;
  @Input() professionals: any[] = [];
  @Input() availableResources: any[] = [];
  @Input() bookableServices: any[] = [];
  @Input() clients: any[] = [];
  @Input() bookingConstraints: any;

  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<any>();

  loading = false;
  checkingCapacity = signal(false);
  /**
   * Payment method selected in the dialog when "Crear y marcar como pagado"
   * was clicked. null = the user is using the regular "Crear Reserva" path
   * (no payment method, status stays pending).
   */
  pendingPaymentMethod: PaymentMethodChoice | null = null;
  /** Reference to the payment-method dialog so we can open it from TS. */
  @ViewChild('paymentMethodDialogRef') paymentMethodDialogRef?: PaymentMethodDialogComponent;

  /**
   * Whether the booking being edited has already been paid. Drives whether
   * the "Crear y marcar como pagado" button is shown in the footer.
   * For new bookings this is always false; for edits it reads
   * payment_status from the incoming event's extendedProps.
   */
  isAlreadyPaid = computed(() => {
    if (!this.eventToEdit) return false;
    const shared = this.eventToEdit.extendedProps?.shared ?? {};
    return shared.paymentStatus === 'paid';
  });

  /**
   * Human-readable label of the current payment method when editing a
   * paid booking. Returns null for new bookings or pending ones.
   */
  currentPaymentMethodLabel = computed(() => {
    if (!this.eventToEdit) return null;
    const shared = this.eventToEdit.extendedProps?.shared ?? {};
    const method = shared.paymentMethod;
    if (!method) return null;
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      bizum: 'Bizum',
      online: 'Online',
    };
    return labels[method] ?? method;
  });

  /**
   * Open the payment-method dialog. Triggered by the
   * "Crear y marcar como pagado" footer button.
   */
  onSubmitAndMarkAsPaid(): void {
    if (!this.canSubmit() || this.loading) return;
    this.paymentMethodDialogRef?.open();
  }

  /**
   * Called by the dialog when the user picks a method. Store the choice
   * and re-run onSubmit with the method passed through.
   */
  onPaymentMethodChosen(selection: { method: PaymentMethodChoice }): void {
    this.pendingPaymentMethod = selection.method;
    this.onSubmit();
  }

  /**
   * Reset modal-local state and emit close. Used by the Cancel button
   * and the X close icon. Keeps the payment-method picker fresh across
   * opens so a previous "marcar como pagado" choice doesn't leak.
   */
  closeModal(): void {
    this.pendingPaymentMethod = null;
    this.close.emit();
  }

  get serviceName(): string {
    const service = this.form.get("service")?.value as any;
    return service?.name || "Nueva Cita";
  }

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private toastService = inject(ToastService);
  private supabase = inject(SimpleSupabaseService);
  private settingsService = inject(SupabaseSettingsService);
  private customersService = inject(SupabaseCustomersService);
  private bookingsService = inject(SupabaseBookingsService);
  private waitlistService = inject(SupabaseWaitlistService);
  authService = inject(AuthService);

  companySettings = signal<any>(null);

  // Role detection
  userRole = this.authService.userRole;
  isClient = computed(() => this.userRole() === "client");
  isProfessional = computed(() => this.userRole() === "professional");
  currentProfessionalId = computed(() => this.authService.activeProfessionalId());

  // Capacity / waitlist state
  /** Count of confirmed/pending bookings for the currently selected slot */
  currentBookingCount = signal<number>(0);
  /** Whether the currently selected slot is at max capacity */
  slotFull = computed(() => {
    const svc = this.selectedService() as any;
    const maxCap = svc?.max_capacity;
    if (!maxCap || !this.selectedStart() || !this.selectedEnd()) return false;
    return this.currentBookingCount() >= maxCap;
  });
  /** Whether the selected service supports active-mode waitlist */
  waitlistEligible = computed(() => {
    const svc = this.selectedService() as any;
    return !!(svc?.enable_waitlist && (svc?.active_mode_enabled ?? true));
  });
  /** Max capacity of the selected service */
  selectedServiceMaxCapacity = computed(
    () => (this.selectedService() as any)?.max_capacity ?? 0,
  );
  /** Current company ID — passed to waitlist button */
  currentCompanyId = computed(() => this.authService.currentCompanyId() ?? "");

  // Client Search Control
  clientSearchControl = new FormControl("");
  clientSearchTerm = toSignal(this.clientSearchControl.valueChanges, {
    initialValue: "",
  });
  showClientList = signal(false);
  /** Whether the submit-button tooltip is currently visible (hover/focus). */
  submitTooltipOpen = signal(false);
  /**
   * Bumped on every @Input change cycle. Read by computed signals
   * (`freeResources`, `filteredResourcesByService`) so they re-evaluate
   * when the parent pushes fresh `allBookings` / `availableResources`
   * after the async load completes. Without this, the first modal open
   * would show the resource count based on the initial empty arrays
   * (which made `freeResources()` return all 4) and only correct itself
   * on the second open (when the @Input was already set).
   */
  inputsVersion = signal(0);

  @Input() allEvents: any[] = [];
  /**
   * ALL bookings in the currently-loaded date range (any professional).
   * Resources are shared across the whole team, so availability for rooms must
   * be checked against this set — not just `allEvents`, which is filtered to
   * the active professional's own bookings (used only for the calendar display
   * and for the current professional's own free/busy checks).
   */
  @Input() allBookings: any[] = [];
  @Input() eventToEdit: any | null = null;
  @Input() getProfessionalSchedules: ((professionalId: string) => Observable<any[]>) | null = null;
  /**
   * ID of the professional currently in focus on the parent calendar.
   * When set, slot availability is checked ONLY against this professional's
   * bookings (so the dropdown hides hours where the focused professional is
   * busy, regardless of whether other capable professionals are free).
   * When null/undefined, falls back to "any capable professional is free" —
   * the legacy behaviour for the company-wide calendar view.
   *
   * Named `focusedProfessionalId` to avoid colliding with the existing
   * `currentProfessionalId` computed signal in this class (which reads from
   * the auth service's active professional).
   */
  @Input() focusedProfessionalId: string | null = null;
  /**
   * Source key for booking creation — used by Phase 5 routing. Defaults to
   * 'admin' for backward compatibility, but is OVERRIDDEN to 'professional'
   * when the current user is acting as a professional (see
   * `effectiveBookingSource` below). Parents can still force a different
   * source for non-professional contexts (public portal, docplanner, etc.).
   */
  @Input() bookingSource: SourceKey = 'admin';
  /**
   * Resolved source used when persisting the booking. Professionals always
   * get 'professional' so the booking card shows the 💼 icon instead of
   * being mis-attributed to the 👤 Admin. For all other roles we honour
   * whatever the parent passed in (admin / public_portal / docplanner).
   */
  effectiveBookingSource = computed<SourceKey>(() =>
    this.isProfessional() ? 'professional' : this.bookingSource,
  );

  // Time selections for resource availability
  selectedStart = signal<string | null>(null);
  selectedEnd = signal<string | null>(null);
  selectedService = signal<any>(null);
  selectedDate = signal<string | null>(null);
  selectedTime = signal<string | null>(null);
  /** Tracks previous blockRoom value to detect toggle changes on edit */
  previousBlockRoom = signal<boolean>(false);

  /**
   * Company email/notification preferences (from Configuración > Notificaciones).
   * Controls whether Google Calendar invites / client confirmations / owner or
   * professional notifications are sent. Loaded once on init; the Google Calendar
   * sync reads `google_calendar_invite` to decide whether to invoke the edge
   * function at all (when the company disabled invites for bulk imports, etc.).
   */
  emailPreferences = signal<{
    google_calendar_invite: boolean;
    booking_confirmation_client: boolean;
    booking_cancellation_client: boolean;
    booking_notification_owner: boolean;
    booking_notification_professional: boolean;
  }>({
    google_calendar_invite: true,
    booking_confirmation_client: true,
    booking_cancellation_client: true,
    booking_notification_owner: true,
    booking_notification_professional: true,
  });

  selectedEndFormatted = computed(() => {
    const endStr = this.selectedEnd();
    if (!endStr) return null;
    const timeFormatter = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return timeFormatter.format(new Date(endStr));
  });

  availableTimeSlots = computed(() => {
    const dStr = this.selectedDate();
    const service: any = this.selectedService();
    const constraints = this.bookingConstraints;

    if (!dStr || !constraints) return [];

    // Create Date recognizing local timezone so getDay() matches local
    const selectedDateParts = dStr.split("-");
    const selectedDateObj = new Date(
      Number(selectedDateParts[0]),
      Number(selectedDateParts[1]) - 1,
      Number(selectedDateParts[2]),
    );
    const dayOfWeek = selectedDateObj.getDay();

    if (
      constraints.workingDays &&
      !constraints.workingDays.includes(dayOfWeek)
    ) {
      return [];
    }

    const daySchedules = (constraints.schedules || []).filter(
      (s: any) => s.day_of_week === dayOfWeek,
    );

    const parseTimeToMinutes = (t: string) => {
      const parts = t.split(":").map(Number);
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    };

    const minH = constraints.minHour ?? 8;
    const maxH = constraints.maxHour ?? 20;

    // Helper: check if a time slot falls within any working slot (supports both legacy and new slots format)
    const isWithinWorkingHours = (slotMinutes: number, slotDuration: number): boolean => {
      if (daySchedules.length === 0) return true; // No schedule = all hours available
      return daySchedules.some((s: any) => {
        // Support new slots array format
        if (s.slots && Array.isArray(s.slots) && s.slots.length > 0) {
          return s.slots.some((slot: any) => {
            const schedStart = parseTimeToMinutes(slot.start);
            const schedEnd = parseTimeToMinutes(slot.end);
            return slotMinutes >= schedStart && slotMinutes + slotDuration <= schedEnd;
          });
        }
        // Legacy fallback: start_time/end_time
        if (s.start_time && s.end_time) {
          const schedStart = parseTimeToMinutes(s.start_time);
          const schedEnd = parseTimeToMinutes(s.end_time);
          return slotMinutes >= schedStart && slotMinutes + slotDuration <= schedEnd;
        }
        return false;
      });
    };

    // If no service selected, return all time slots in working hours (no availability check)
    if (!service) {
      const slots: { time: string; isAvailable: boolean }[] = [];
      for (let h = minH; h <= maxH; h++) {
        for (const m of [0, 15, 30, 45]) {
          if (h === maxH && m > 0) continue;
          const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
          const slotMinutes = h * 60 + m;
          // When no service, just check if within working hours (any slot)
          const available = isWithinWorkingHours(slotMinutes, 15); // min 15min slot
          if (available) {
            slots.push({ time: timeStr, isAvailable: true });
          }
        }
      }
      return slots;
    }

    // Service selected: full availability check
    const slots: { time: string; isAvailable: boolean }[] = [];
    const duration = service.duration_minutes || 30;

    // When editing, the slot that matches the event being edited must ALWAYS
    // be present in the list (and selectable), even if its own booking would
    // make `hasFreeProfessional` return false. Without this, the hour shown in
    // the form (populated by populateEditForm) is not in the dropdown, so
    // users see "Editar Cita" but cannot change the hour.
    const editCurrentTime: string | null = this.eventToEdit
      ? (() => {
          if (!this.eventToEdit.start) return null;
          const ed = new Date(this.eventToEdit.start);
          if (Number.isNaN(ed.getTime())) return null;
          return `${ed.getHours().toString().padStart(2, "0")}:${ed
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;
        })()
      : null;

    // When the service is a legacy stub (not in any professional's services
    // list — happens when a service was renamed/flagged is_bookable=false
    // but old bookings still reference it), fall back to the event's
    // original professional as the only "capable" one. Without this, the
    // available-time-slot computation thinks no pro can perform the
    // service and the hour dropdown stays empty after a date change.
    const serviceIsLegacyStub = !!(service as any)._legacyStub;
    const editProfessionalId: string | null = this.eventToEdit
      ? (this.eventToEdit.extendedProps?.shared?.professionalId ?? null)
      : null;

    for (let h = minH; h <= maxH; h++) {
      for (const m of [0, 15, 30, 45]) {
        if (h === maxH && m > 0) continue;

        const slotStartMinutes = h * 60 + m;
        const slotEndMinutes = slotStartMinutes + duration;

        // Ensure the entire event fits within at least one working block
        if (!isWithinWorkingHours(slotStartMinutes, duration)) continue;

        const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        const slotStartStr = `${dStr}T${timeStr}:00`;
        const slotEnd = new Date(
          new Date(slotStartStr).getTime() + duration * 60000,
        );

        let capableProfessionals = this.professionals.filter((prof) =>
          prof.services?.some((s: any) => s.id === service.id),
        );

        // Legacy-service fallback: if the lookup returned nothing but we
        // know the booking's original professional, treat them as capable
        // so the availability check can still run for them.
        if (capableProfessionals.length === 0 && serviceIsLegacyStub && editProfessionalId) {
          const fallback = this.professionals.find((p) => p.id === editProfessionalId);
          if (fallback) {
            capableProfessionals = [fallback];
          }
        }

        const currentId = this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;

        // The current edit-slot must be treated as available for the same
        // professional that owns the event being edited, regardless of the
        // generic conflict check below. Otherwise the edit's own hour is
        // excluded from the dropdown and the user can't change it.
        const isEditCurrentSlot = editCurrentTime === timeStr;

        let hasFreeProfessional = false;
        if (isEditCurrentSlot) {
          hasFreeProfessional = true;
        } else if (capableProfessionals.length > 0) {
          // When the parent calendar is scoped to a specific professional
          // (Roberto, etc.), only that professional's bookings should make a
          // slot unavailable. The "any capable pro is free" logic would
          // otherwise hide the conflict when another pro who also offers the
          // service is free at the same time.
          const professionalsToCheck = this.focusedProfessionalId
            ? capableProfessionals.filter(
                (p) => p.id === this.focusedProfessionalId,
              )
            : capableProfessionals;

          if (professionalsToCheck.length === 0) {
            // Focused professional can't do this service at all — slot is not
            // bookable from the current view. Leave `hasFreeProfessional` false.
            hasFreeProfessional = false;
          } else {
            hasFreeProfessional = professionalsToCheck.some((prof) => {
              // Check against ALL company bookings (resources are already
              // global, and this also catches multi-pro conflicts for the
              // legacy "any pro free" view).
              return !this.allBookings.some((event) => {
                // If it's the exact same professional and the times overlap
                if (event.extendedProps?.shared?.professionalId !== prof.id)
                  return false;
                // Exclude the event being edited from conflict check
                if (currentId) {
                  const eventId = event.localBooking?.id || event.id;
                  if (eventId === currentId) return false;
                }
                if (!event.start || !event.end) return false;
                const slotStartMs = new Date(slotStartStr).getTime();
                const slotEndMs = slotEnd.getTime();
                const eStartMs = new Date(event.start).getTime();
                const eEndMs = new Date(event.end).getTime();
                return slotStartMs < eEndMs && slotEndMs > eStartMs;
              });
            });
          }
        }

        // User requested: "Deben aparecer sólo las horas que tienen alguna disponibilidad"
        if (hasFreeProfessional) {
          slots.push({ time: timeStr, isAvailable: true });
        }
      }
    }

    // Safety net: if for any reason the edit's current hour still didn't make
    // it in (e.g. duration puts it past maxHour, or it's outside the working
    // block), inject it now so the user can always keep/move the current
    // reservation time. We log a warning so this case is visible during dev.
    if (
      this.eventToEdit &&
      editCurrentTime &&
      !slots.some((s) => s.time === editCurrentTime)
    ) {
      console.warn(
        `[event-form] Edit-current hour ${editCurrentTime} was filtered out of availableTimeSlots; re-adding so the user can change it.`,
      );
      slots.push({ time: editCurrentTime, isAvailable: true });
    }

    return slots;
  });

  availableBookableServices = computed(() => {
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    const currentId = this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;

    return this.bookableServices.map((svc) => {
      const capableProfessionals = this.professionals.filter((prof) =>
        prof.services?.some((s: any) => s.id === svc.id),
      );

      let capableResources = this.availableResources;
      if (this.availableResources.length > 0) {
        capableResources = this.availableResources.filter((resource) => {
          const resServices = resource.resource_services;
          return (
            !resServices ||
            resServices.length === 0 ||
            resServices.some((rs: any) => rs.service_id === svc.id)
          );
        });
      }

      let isAvailable =
        capableProfessionals.length > 0 &&
        (this.availableResources.length === 0 || capableResources.length > 0);

      if (isAvailable && startStr && endStr) {
        const startMs = new Date(startStr).getTime();
        const endMs = new Date(endStr).getTime();

        const professionalsToCheck = this.focusedProfessionalId
          ? capableProfessionals.filter(
              (p) => p.id === this.focusedProfessionalId,
            )
          : capableProfessionals;

        const hasFreeProfessional = professionalsToCheck.length > 0 && professionalsToCheck.some((prof) => {
          // Check against ALL company bookings, not just the active
          // professional's events — same reason as in availableTimeSlots.
          return !this.allBookings.some((event) => {
            if (event.extendedProps?.shared?.professionalId !== prof.id)
              return false;
            // Exclude the event being edited from conflict check
            if (currentId) {
              const eventId = event.localBooking?.id || event.id;
              if (eventId === currentId) return false;
            }
            if (!event.start || !event.end) return false;
            const eStartMs = new Date(event.start).getTime();
            const eEndMs = new Date(event.end).getTime();
            return startMs < eEndMs && endMs > eStartMs;
          });
        });

        let hasFreeResource = true;
        if (capableResources.length > 0) {
          hasFreeResource = capableResources.some((resource) => {
            // Resource availability is GLOBAL — check against all company
            // bookings, not just the current professional's events.
            return !this.allBookings.some((event) => {
              if (event.extendedProps?.shared?.resourceId !== resource.id)
                return false;
              // Exclude the event being edited from conflict check
              if (currentId) {
                const eventId = event.localBooking?.id || event.id;
                if (eventId === currentId) return false;
              }
              if (!event.start || !event.end) return false;
              const eStartMs = new Date(event.start).getTime();
              const eEndMs = new Date(event.end).getTime();
              return startMs < eEndMs && endMs > eStartMs;
            });
          });
        }

        isAvailable = hasFreeProfessional && hasFreeResource;
      }

      return {
        ...svc,
        isAvailable,
      };
    });
  });

  filteredResourcesByService = computed(() => {
    // Re-evaluate when the parent pushes a new `availableResources` array
    // (the @Input is a plain reference, not a signal — read inputsVersion
    // to establish the dependency on the @Input change cycle).
    this.inputsVersion();
    const selectedService = this.selectedService();
    if (!selectedService) return this.availableResources;

    // Legacy-service stub: the original service was deactivated and the
    // resource_services associations are not present for the stub's ID.
    // Show ALL resources so the user can pick any (and we can re-associate
    // at save time if needed).
    if ((selectedService as any)._legacyStub) {
      return this.availableResources;
    }

    return this.availableResources.filter((resource) => {
      const resServices = resource.resource_services;
      return (
        !resServices ||
        resServices.length === 0 ||
        resServices.some((rs: any) => rs.service_id === selectedService.id)
      );
    });
  });

  freeResources = computed(() => {
    // Re-evaluate when the parent pushes a new `allBookings` or
    // `availableResources` array (the @Inputs are plain references, not
    // signals — read inputsVersion to establish the dependency on the
    // @Input change cycle so the resource count updates as soon as the
    // data arrives, not only on the second modal open).
    this.inputsVersion();
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    const resources = this.filteredResourcesByService();

    if (!startStr || !endStr) return resources;

    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    const currentId = this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;

    // Resource availability is GLOBAL across the team — check against all
    // company bookings, not just the active professional's events.
    return resources.filter((resource) => {
      return !this.allBookings.some((event) => {
        if (event.extendedProps?.shared?.resourceId !== resource.id)
          return false;
        // Exclude the event being edited from conflict check
        if (currentId) {
          const eventId = event.localBooking?.id || event.id;
          if (eventId === currentId) return false;
        }
        if (!event.start || !event.end) return false;
        const eStartMs = new Date(event.start).getTime();
        const eEndMs = new Date(event.end).getTime();
        return startMs < eEndMs && endMs > eStartMs;
      });
    });
  });

  // ── Custom select options for app-custom-select integration ──
  serviceOptions = computed((): SelectOption[] =>
    this.availableBookableServices().map((svc) => {
      const priceStr = svc.base_price
        ? ' \u2014 ' + new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(svc.base_price)
        : '';
      return {
        label: `${svc.name}${priceStr}${!svc.isAvailable ? ' (no disponible)' : ''}`,
        value: svc,
        disabled: !svc.isAvailable,
      };
    }),
  );

  timeOptions = computed((): SelectOption[] =>
    this.availableTimeSlots().map((slot) => ({
      label: `${slot.time}${!slot.isAvailable ? ' \u2014 Sin profesionales libres' : ''}`,
      value: slot.time,
      disabled: !slot.isAvailable,
    })),
  );

  resourceOptions = computed((): SelectOption[] => {
    const options: SelectOption[] = [];
    const hasFree = this.freeResources().length > 0;
    options.push({
      label: hasFree ? 'Autom\u00e1tico (asignar recurso libre)' : 'Ninguno disponible',
      value: 'automatic',
      disabled: !hasFree,
    });
    for (const res of this.filteredResourcesByService()) {
      const isFree = this.isResourceFree(res.id);
      options.push({
        label: `${res.name} \u00b7 ${res.type || 'Recurso'}${!isFree ? ' (ocupado)' : ''}`,
        value: res,
        disabled: !isFree,
      });
    }
    return options;
  });

  // Bridge: resolve form service value by ID so object identity matches SelectOption values
  resolvedServiceValue = computed(() => {
    const formVal: any = this.form.get('service')?.value;
    if (!formVal) return null;
    // Try strict match first (object identity), then by id (handles the
    // case where the form holds an object that was mapped/copied and no
    // longer === the option's value reference).
    const all = this.availableBookableServices() as any[];
    if (!Array.isArray(all) || all.length === 0) return null;
    return (
      all.find((s: any) => s === formVal) ||
      all.find((s: any) => s?.id != null && s.id === formVal.id) ||
      null
    );
  });

  // Bridge: resolve form resource value by ID (objects) or pass-through string 'automatic'
  resolvedResourceValue = computed(() => {
    const formVal: any = this.form.get('resource')?.value;
    if (!formVal || formVal === 'automatic') return formVal;
    return (this.filteredResourcesByService() as any[]).find((r: any) => r.id === formVal.id) || formVal;
  });

  // ── Change handlers for custom select → form bridge ─────────
  onServiceChange(svc: any): void {
    this.form.patchValue({ service: svc });
  }

  onTimeChange(time: string | null): void {
    this.form.patchValue({ time: time });
  }

  onResourceChange(res: any): void {
    this.form.patchValue({ resource: res });
  }

  selectClient(client: any) {
    this.form.get("client")?.setValue(client);
    this.showClientList.set(false);
    this.clientSearchControl.setValue(""); // Clear search or keep name? Clear is better if we show badge.
  }

  nextAvailableSuggestion = computed(() => {
    if (this.freeResources().length > 0) return null;
    const resources = this.filteredResourcesByService();
    if (resources.length === 0) return null;

    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    if (!startStr || !endStr) return null;

    const duration = new Date(endStr).getTime() - new Date(startStr).getTime();
    let attemptStart = new Date(startStr);

    for (let i = 0; i < 24; i++) {
      attemptStart = new Date(attemptStart.getTime() + 30 * 60000);
      const attemptEnd = new Date(attemptStart.getTime() + duration);

      const hasFreeResource = resources.some((resource) => {
        // Resource availability is GLOBAL across the team.
        return !this.allBookings.some((event) => {
          if (event.extendedProps?.shared?.resourceId !== resource.id)
            return false;
          if (!event.start || !event.end) return false;
          const eStart = new Date(event.start);
          const eEnd = new Date(event.end);
          return attemptStart < eEnd && attemptEnd > eStart;
        });
      });

      if (hasFreeResource) {
        const timeFormatter = new Intl.DateTimeFormat("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const dateFormatter = new Intl.DateTimeFormat("es-ES", {
          day: "2-digit",
          month: "2-digit",
        });
        if (attemptStart.getDate() === new Date(startStr).getDate()) {
          return `Prueba a las ${timeFormatter.format(attemptStart)}`;
        } else {
          return `Prueba el ${dateFormatter.format(attemptStart)} a las ${timeFormatter.format(attemptStart)}`;
        }
      }
    }
    return "Consulte disponibilidad en los próximos días";
  });

  isResourceFree(resourceId: string): boolean {
    return this.freeResources().some((r) => r.id === resourceId);
  }

  /** Debug helper for the resources panel — formats a resource's
   *  associated service IDs as a comma-separated string. */
  getResourceServiceIds(r: any): string {
    const ids = (r?.resource_services || []).map((rs: any) => rs.service_id);
    return ids.length > 0 ? ids.join(', ') : 'no services';
  }

  /**
   * Returns true if the given resource has a conflicting event in allBookings,
   * excluding the event currently being edited (self-conflict allowed).
   * Used to verify availability at save-time, since freeResources() excludes
   * the current event from its list during edit.
   */
  hasResourceConflict(resourceId: string): boolean {
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();
    if (!startStr || !endStr) return false;

    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();
    const currentId =
      this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;

    // Resource availability is GLOBAL across the team.
    return this.allBookings.some((event) => {
      if (event.extendedProps?.shared?.resourceId !== resourceId) return false;
      // Allow self (the event being edited) — only other bookings block
      if (currentId) {
        const eventId = event.localBooking?.id || event.id;
        if (eventId === currentId) return false;
      }
      if (!event.start || !event.end) return false;
      const eStartMs = new Date(event.start).getTime();
      const eEndMs = new Date(event.end).getTime();
      return startMs < eEndMs && endMs > eStartMs;
    });
  }

  compareById(opt1: any, opt2: any): boolean {
    return opt1 && opt2 ? opt1.id === opt2.id : opt1 === opt2;
  }

  filteredProfessionals = computed(() => {
    const selectedService = this.selectedService();
    if (!selectedService) return this.professionals;

    return this.professionals.filter((prof) =>
      prof.services?.some((s: any) => s.id === selectedService.id),
    );
  });

  freeProfessionals = computed(() => {
    const professionals = this.filteredProfessionals();
    const startStr = this.selectedStart();
    const endStr = this.selectedEnd();

    if (!startStr || !endStr) return professionals;

    const start = new Date(startStr);
    const end = new Date(endStr);
    const currentId = this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;

    return professionals.filter((prof) => {
      return !this.allEvents.some((event) => {
        if (event.extendedProps?.shared?.professionalId !== prof.id)
          return false;
        // Exclude the event being edited from conflict check
        if (currentId) {
          const eventId = event.localBooking?.id || event.id;
          if (eventId === currentId) return false;
        }
        if (!event.start || !event.end) return false;
        const eStart = new Date(event.start);
        const eEnd = new Date(event.end);
        return start < eEnd && end > eStart;
      });
    });
  });

  isProfessionalFree(profId: string): boolean {
    return this.freeProfessionals().some((p) => p.id === profId);
  }

  isTimeInAvailableSlots(time: string | null | undefined): boolean {
    if (!time) return false;
    return this.availableTimeSlots().some((s) => s.time === time);
  }

// Track selected professional ID for reactive filtering
  selectedProfessionalId = signal<string | null>(null);

  // Filtered clients using effect-based reactivity
  private _filteredClientsResult = signal<any[]>([]);
  get filteredClientsResult() { return this._filteredClientsResult(); }

  // Filter clients based on search term only.
  // Clients are already scoped by professional assignment at the data-fetching level
  // (getClientsBasic via client_assignments), so no secondary filtering needed here.
  private _recomputeFilteredClients() {
    const term = this.clientSearchTerm()?.toLowerCase() || "";
    const clients = this.clients;

    if (!term) {
      this._filteredClientsResult.set(clients.slice(0, 50));
    } else {
      this._filteredClientsResult.set(
        clients.filter(c =>
          (c.displayName && c.displayName.toLowerCase().includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term)) ||
          (c.name && c.name.toLowerCase().includes(term)) ||
          (c.surname && c.surname.toLowerCase().includes(term))
        )
      );
    }
  }

  canInviteUnregistered = computed(() => {
    const settings = this.companySettings();
    if (!settings?.allow_unregistered_client_invites) return false;

    const term = this.clientSearchTerm()?.trim();
    if (!term || !term.includes("@") || !term.includes(".")) return false; // Basic email heuristic

    // Check if matches exactly an existing client's email
    const exactMatch = this.clients.some(
      (c) => c.email && c.email.toLowerCase() === term.toLowerCase(),
    );
    return !exactMatch;
  });

  form = this.fb.group({
    service: [null, Validators.required],
    client: [null, Validators.required],
    summary: [""],
    description: [""],
    date: ["", Validators.required],
    time: ["", Validators.required],
    professional: ["automatic"],
    resource: ["automatic"],
    session_type: ["presencial"],
    blockRoom: [false],
    chooseResourceManually: [false],
  });

  /**
   * Single source of truth for "why can't the user save this booking right now?".
   * Returns `null` when the form is ready to submit, or a structured reason
   * describing what is missing or conflicting. The submit button uses this to
   * decide whether to be enabled AND what to show in the tooltip.
   *
   * Reasons are ordered by priority: the first failing check wins. This keeps
   * the tooltip focused on a single problem at a time so the user isn't
   * overwhelmed by a wall of issues.
   *
   * IMPORTANT: We do NOT read this.form.value here. We read each control
   * individually via this.form.get('xxx')?.value. There is a class of
   * Angular signal/FormGroup interaction bugs where this.form.value
   * returns a stale aggregate even when the individual controls are
   * correct. The per-control read is always fresh.
   */
  submitBlockReason = computed<{
    title: string;
    details: string[];
  } | null>(() => {
    // Force re-evaluation when the form changes. `formValue` is a signal
    // backed by form.valueChanges — reading it here establishes the
    // dependency so the computed re-runs whenever any control updates.
    // Without this, `form.get('xxx')?.value` reads are non-reactive and
    // the computed caches its first result forever.
    this.formValue();

    // 1. Async operations
    if (this.loading) {
      return {
        title: 'Guardando cambios…',
        details: ['Espera a que termine el guardado.'],
      };
    }
    if (this.checkingCapacity()) {
      return {
        title: 'Verificando disponibilidad…',
        details: ['Comprobando que el horario siga libre antes de guardar.'],
      };
    }

    // 2. Required form fields. Read each control individually (NOT
    //    this.form.value, which can be stale in computed pipelines).
    const svc: any = this.form.get('service')?.value;
    const cli: any = this.form.get('client')?.value;
    const d: any = this.form.get('date')?.value;
    const t: any = this.form.get('time')?.value;

    const missing: string[] = [];
    if (!svc) missing.push('Servicio');
    if (!cli && !this.isClient()) missing.push('Cliente');
    if (!d) missing.push('Fecha');
    if (!t) missing.push('Hora de inicio');
    if (missing.length > 0) {
      return {
        title: 'Faltan datos por completar',
        details: missing.map((m) => `Selecciona un valor para "${m}".`),
      };
    }

    // 3. Capacity (only on new bookings; edits can stay in the same slot
    //    even if it's "full" because the user's existing seat is being
    //    moved/rescheduled, not duplicated).
    if (!this.eventToEdit && this.slotFull()) {
      return {
        title: 'Cupo lleno',
        details: [
          `Este horario ya tiene ${this.currentBookingCount()}/${this.selectedServiceMaxCapacity()} plazas ocupadas.`,
          'Únete a la lista de espera o elige otro horario.',
        ],
      };
    }

    // 4. Date+time must produce a valid start/end signal — happens if
    //    the time picker produced a value that doesn't parse correctly.
    if (!this.selectedStart() || !this.selectedEnd()) {
      return {
        title: 'Fecha u hora inválida',
        details: ['La combinación de fecha y hora no es válida.'],
      };
    }

    // 5. Professional availability — only relevant for owner mode where
    //    the user picks "automatic" and we auto-assign. If a specific pro
    //    was picked, freeProfessionals is filtered for that one.
    const prof = this.form.get('professional')?.value;
    if (prof === 'automatic' && !this.isProfessional()) {
      const freeProfs = this.freeProfessionals();
      if (freeProfs.length === 0 && this.professionals.length > 0) {
        const editHint = this.eventToEdit
          ? ' (incluyendo a la profesional original de esta reserva)'
          : '';
        return {
          title: 'Sin profesionales disponibles',
          details: [
            `Ningún profesional que ofrezca este servicio está libre en ese horario${editHint}.`,
            'Elige otra hora o cambia el servicio.',
          ],
        };
      }
    }

    // 6. Resource availability — three cases:
    //    a) User picked a specific resource manually → it must be free.
    //    b) User chose "automatic" and asked to block a room → at least
    //       one room must be free (handled by onSubmit, but we mirror the
    //       check here so the button reflects the same state).
    //    c) User chose "automatic" without blocking → no resource check
    //       needed unless resources are required (filteredResourcesByService
    //       is non-empty).
    const resVal: any = this.form.get('resource')?.value;
    const allRes = this.filteredResourcesByService();
    const resourcesAreRequired = allRes.length > 0;
    const blockRoom = this.form.get('blockRoom')?.value === true;

    if (resVal && typeof resVal === 'object' && resVal.id) {
      // Case (a): manual resource selection
      if (this.hasResourceConflict(resVal.id)) {
        return {
          title: 'Sala ocupada',
          details: [
            `La sala "${resVal.name}" ya está reservada en ese horario.`,
            'Elige otra sala o desmarca "Bloquear sala".',
          ],
        };
      }
    } else if (resVal === 'automatic') {
      const freeRes = this.freeResources();
      if (blockRoom) {
        // Case (b): user wants a room, none free
        if (resourcesAreRequired && freeRes.length === 0) {
          return {
            title: 'Sin salas disponibles',
            details: [
              'Pediste bloquear una sala pero no hay ninguna libre en ese horario.',
              'Elige otra hora o desmarca "Bloquear sala".',
            ],
          };
        }
      } else if (resourcesAreRequired && freeRes.length === 0 && allRes.length > 0) {
        // Case (c): automatic assignment but no resource is free AND the
        // user didn't explicitly say "I don't need a room". Allow it —
        // the booking can be saved without a resource. This is the same
        // decision the onSubmit handler makes, so the button reflects
        // the same outcome.
        // (No-op: don't block the button here.)
      }
    }

    // 7. The selected hour itself must be in the list of available slots.
    //    This catches the case where the user typed a time that isn't in
    //    the dropdown (e.g. outside working hours) or where the hour was
    //    removed by a recomputation.
    if (t) {
      const slot = this.availableTimeSlots().find((s) => s.time === t);
      if (!slot) {
        return {
          title: 'Hora no disponible',
          details: [
            'La hora seleccionada no está en la lista de horarios disponibles.',
            'Elige una hora del desplegable.',
          ],
        };
      }
      if (!slot.isAvailable && !this.isEditCurrentSlot()) {
        return {
          title: 'Hora sin profesionales libres',
          details: [
            'En esa hora no hay ningún profesional capaz libre para este servicio.',
            'Elige otra hora.',
          ],
        };
      }
    }

    return null;
  });

  /**
   * Helper used by submitBlockReason to detect "the user picked the same
   * hour that the booking already has" so the legacy-stub edit case
   * doesn't get flagged as unavailable. Returns true when v.time equals
   * the original start time of the event being edited.
   */
  private isEditCurrentSlot(): boolean {
    if (!this.eventToEdit?.start) return false;
    const d = new Date(this.eventToEdit.start);
    if (Number.isNaN(d.getTime())) return false;
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return (this.form.get('time')?.value || '') === `${hh}:${mm}`;
  }

  canSubmit = computed(() => this.submitBlockReason() === null);

  /**
   * Signal-backed mirror of the form value, used inside `submitBlockReason`
   * so the computed re-evaluates whenever the form changes. Without this,
   * the computed reads `form.get('xxx')?.value` which is NOT a signal — the
   * computed caches its first result forever, leaving the submit button
   * disabled even when all fields are filled.
   * Initialized in the constructor (after `form` is available).
   */
  private formValue!: ReturnType<typeof toSignal<any>>;

  constructor() {
    // Mirror form value into a signal so the computed `submitBlockReason`
    // re-evaluates on form changes.
    this.formValue = toSignal(this.form.valueChanges, {
      initialValue: this.form.value,
    });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((val) => {
      if (val.service || val.client) {
        const serviceName = (val.service as any)?.name || "Servicio";
        const clientName =
          (val.client as any)?.displayName ||
          ((val.client as any)?.name
            ? `${(val.client as any).name} ${(val.client as any).surname || ""}`.trim()
            : null) ||
          "Cliente";

        if (val.service && val.client) {
          this.form.patchValue(
            { summary: `${serviceName} - ${clientName}` },
            { emitEvent: false },
          );
        }
      }

      // Update signals for computed properties
      if (val.date !== this.selectedDate()) {
        this.selectedDate.set(val.date || null);
      }
      if (val.time !== this.selectedTime()) {
        this.selectedTime.set(val.time || null);
      }
      // Keep selectedService in sync so filteredResourcesByService() and
      // freeResources() stay correct as the user changes the service in the form.
      if (val.service !== this.selectedService()) {
        this.selectedService.set(val.service || null);
      }

      const d = val.date;
      const t = val.time;
      const svc = val.service as any;

      if (d && t) {
        const startStr = `${d}T${t}:00`;
        this.selectedStart.set(startStr);
        const durationMin = svc?.duration_minutes || 60;
        const endObj = new Date(
          new Date(startStr).getTime() + durationMin * 60000,
        );
        this.selectedEnd.set(endObj.toISOString());
      } else {
        this.selectedStart.set(null);
        this.selectedEnd.set(null);
      }
    });

    // React to blockRoom toggle — only meaningful when editing an existing booking
    this.form.get('blockRoom')?.valueChanges.pipe(takeUntilDestroyed()).subscribe((blockRoom: boolean | null) => {
      const prev = this.previousBlockRoom();
      const current = !!blockRoom;
      this.previousBlockRoom.set(current);

      if (prev === current) return; // no actual toggle

      if (!this.eventToEdit) return; // only reacts on edits

      const bookingId = this.eventToEdit?.localBooking?.id || this.eventToEdit?.id;
      if (!bookingId) return;

      if (!current) {
        // Was checked → now unchecked: release the room from this booking
        this.bookingsService.updateBooking(bookingId, { resource_id: null } as any).then(() => {
          this.toastService.success('Sala liberada', 'La sala ha sido liberada de esta reserva.');
        }).catch(() => {
          this.toastService.error('Error', 'No se pudo liberar la sala.');
        });
      } else {
        // Was unchecked → now checked: try to assign a free room
        const freeRooms = this.freeResources();
        if (freeRooms.length === 0) {
          this.toastService.warning('Sin salas disponibles', 'No hay ninguna sala libre en este horario.');
          // Revert the checkbox visually
          this.form.patchValue({ blockRoom: false }, { emitEvent: false });
          this.previousBlockRoom.set(false);
        } else {
          const roomToAssign = freeRooms[0];
          this.bookingsService.updateBooking(bookingId, { resource_id: roomToAssign.id }).then(() => {
            this.form.patchValue({ resource: roomToAssign });
            this.toastService.success('Sala asignada', `${roomToAssign.name} ha sido asignada a esta reserva.`);
          }).catch(() => {
this.toastService.error('Error', 'No se pudo asignar la sala.');
          });
        }
      }
    });

    // Recompute filtered clients when clients or search term changes.
    // Clients are already scoped by professional assignment at the data-fetching level
    // (getClientsBasic via client_assignments), so no secondary filtering by events needed.
    effect(() => {
      // Read signals to create dependencies
      const _profId = this.selectedProfessionalId();
      const searchTerm = this.clientSearchTerm();
      const _eventsLen = this.allEvents.length;
      // Always read this.clients as plain array (input binding)
      const clients = this.clients;
      const term = searchTerm?.toLowerCase() || "";
      if (!term) {
        this._filteredClientsResult.set(clients.slice(0, 50));
      } else {
        this._filteredClientsResult.set(
          clients.filter(c =>
            (c.displayName && c.displayName.toLowerCase().includes(term)) ||
            (c.email && c.email.toLowerCase().includes(term)) ||
            (c.name && c.name.toLowerCase().includes(term)) ||
            (c.surname && c.surname.toLowerCase().includes(term))
          )
        );
      }
    });
  }

  // Initialize date/time from initialDate - reliable first-run, called from ngOnInit
  private initDateFromInitialDate() {
    if (!this.initialDate) return;
    const localDate = new Date(this.initialDate);
    const yy = localDate.getFullYear();
    const mm = (localDate.getMonth() + 1).toString().padStart(2, "0");
    const dd = localDate.getDate().toString().padStart(2, "0");

    const dateStr = `${yy}-${mm}-${dd}`;
    this.form.patchValue({ date: dateStr });
    this.selectedDate.set(dateStr);

    // Pre-populate the TIME from the clicked cell. availableTimeSlots()
    // is keyed off the service+pro, so we don't validate the time here —
    // even if the clicked hour isn't in the list, leaving `time` empty
    // meant freeResources() also returned the full list ("always 4
    // available") which broke the resource availability check the user
    // depends on. Patch the time; if the service+pro don't accept it,
    // the user can pick another slot from the dropdown.
    const hh = localDate.getHours().toString().padStart(2, "0");
    const min = localDate.getMinutes().toString().padStart(2, "0");
    const timeStr = `${hh}:${min}`;
    this.form.patchValue({ time: timeStr });
    this.selectedTime.set(timeStr);

    // Also seed selectedStart / selectedEnd so freeResources() can do its
    // availability filter immediately.
    const startStr = `${dateStr}T${timeStr}:00`;
    this.selectedStart.set(startStr);
    const serviceDuration = (this.selectedService() as any)?.duration_minutes || 60;
    const endObj = new Date(
      new Date(startStr).getTime() + serviceDuration * 60000,
    );
    this.selectedEnd.set(endObj.toISOString());
  }

  ngOnInit() {
    // Initialize date/time from initialDate input
    this.initDateFromInitialDate();

    // Load company email/notification preferences — controls whether the
    // Google Calendar invite is sent on save (Configuración > Notificaciones).
    this.loadEmailPreferences();

    if (this.isClient()) {
      const user = this.authService.userProfile;
      if (user?.email) {
        const client = this.clients.find(
          (c) => c.email?.toLowerCase() === user.email?.toLowerCase(),
        );
        if (client) {
          this.selectClient(client);
        }
      }
    }

    if (this.eventToEdit) {
      // Check if it's an existing event with extendedProps
      if (this.eventToEdit.extendedProps) {
        // Only populate if arrays are already loaded; otherwise ngOnChanges will handle it
        if (this.bookableServices.length > 0 && this.clients.length > 0 && this.professionals.length > 0) {
          this.populateEditForm();
        }
      }
      // Or if it's pre-selected data for a new event (e.g. from "Reservar" click)
      else {
        const prof = this.eventToEdit.professional;
        this.form.patchValue({
          service: this.eventToEdit.service || null,
          professional: prof || "automatic",
        });
        // Update signal for reactive client filtering
        if (prof && typeof prof === 'object' && prof.id) {
          this.selectedProfessionalId.set(prof.id);
        }
      }
      return; // Skip normal defaults
    }

    // Auto-select for professional users: find THEIR professional record
    if (this.isProfessional()) {
      const myUserId = this.authService.userProfile?.id;
      const myProf = myUserId ? this.professionals.find((p: any) => p.user_id === myUserId) : null;
      if (myProf) {
        this.form.patchValue({ professional: myProf }, { emitEvent: false });
        this.selectedProfessionalId.set(myProf.id);
      }
    }

    if (this.professionals.length === 1) {
      this.form.patchValue(
        { professional: this.professionals[0] },
        { emitEvent: false },
      );
      this.selectedProfessionalId.set(this.professionals[0].id);
    }
    if (this.availableResources.length === 1) {
      this.form.patchValue(
        { resource: this.availableResources[0] },
        { emitEvent: false },
      );
    }
  }

  /**
   * Loads the company's email/notification preferences from `company_settings`.
   * The flag `google_calendar_invite` is consulted before invoking the
   * `google-auth` edge function so the sync can be disabled company-wide from
   * Configuración > Notificaciones (e.g. during bulk imports).
   *
   * Failures are non-fatal: we keep the defaults (all enabled) so the form
   * continues to work even if the row is missing or the user is offline.
   */
  private async loadEmailPreferences(): Promise<void> {
    try {
      const companyId = this.authService.currentCompanyId();
      if (!companyId) return;

      const { data, error } = await this.supabase
        .getClient()
        .from('company_settings')
        .select('email_preferences')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.warn('[event-form] Could not load email preferences:', error);
        return;
      }

      const saved = data?.email_preferences || {};
      this.emailPreferences.update((current) => ({ ...current, ...saved }));
    } catch (err) {
      console.warn('[event-form] loadEmailPreferences failed:', err);
    }
  }

  /** Tracks whether the edit form has been populated (prevents re-patching on subsequent changes) */
  editFormPopulated = false;

  /** Shared method to populate the form from eventToEdit. Called by ngOnInit (if data ready) and ngOnChanges (when arrays load). */
  private populateEditForm(): void {
    if (this.editFormPopulated) {
      return;
    }
    if (!this.eventToEdit?.extendedProps) {
      return;
    }

    const shared = this.eventToEdit.extendedProps?.shared || {};

    const serviceId = shared.serviceId;
    const clientId = shared.clientId;
    const profesionalId = shared.professionalId;
    const resourceId = shared.resourceId;

    let service = this.bookableServices.find((s: any) => s.id === serviceId);
    let client = this.clients.find((c: any) => c.id === clientId);
    const profesional = this.professionals.find((p: any) => p.id === profesionalId);
    let resource = this.availableResources.length > 0 && resourceId
      ? this.availableResources.find((r: any) => r.id === resourceId)
      : null;

    // The booking's client may not be in `this.clients` because the parent
    // loads it filtered by client_assignments of the active professional
    // (professional mode), or because the client was unassigned/legacy. In
    // that case the form silently loses the field — the user sees an empty
    // client step and has no clue the booking already has one. Build a
    // minimal client stub from shared props (or fetch the full record async)
    // so the form is populated AND the user can pick a different one.
    // The stub keeps the dropdown's filtered list intact (which is still
    // scoped to the active professional's assignments — see lines around
    // 2195-2196 / 2334-2335 in the dropdown filter).
    if (!client && (clientId || shared.clientName)) {
      // Build a stub whenever the booking references a client we can't
      // resolve against this.clients (filtered list, unregistered invite,
      // or a legacy booking whose client_id is null but whose customer
      // name/email is preserved in the row). Without this, the form's
      // `client` control ends up null and the user sees no client at all
      // in the edit modal — even though the booking obviously had one.
      //
      // clientId may be:
      //   - a real uuid → stub mirrors it (user can swap to a real one)
      //   - 'new'        → invitation-only, keep id 'new'
      //   - null/undef   → treat as invitation-only; the save flow will
      //                    auto-create the client from name+email
      const clientName =
        shared.clientName ||
        shared.client_name ||
        '';
      const clientEmail = shared.clientEmail || shared.client_email || '';
      const displayName = clientName || `Cliente ${(clientId || 'new').toString().slice(0, 8)}`;
      client = {
        id: clientId || 'new',
        name: displayName,
        displayName,
        email: clientEmail,
        phone: null,
        // Mark as not in the active list — UI can show a small "(no está
        // en tu lista)" hint, and the user can pick a real one to replace.
        isAvailable: false,
        _legacyStub: true,
      } as any;
    }

    // The booking's resource may not be in `availableResources` (e.g.
    // filtered by service, or assigned to another professional). Mirror the
    // client pattern: build a minimal stub so the form preloads the real
    // resourceId rather than defaulting to 'automatic'. Without this, the
    // user editing a booking that already had a specific resource would
    // see "Automático" and the saved booking would lose the assignment.
    if (!resource && resourceId) {
      const resourceName =
        shared.resourceName || shared.resource_name || '';
      resource = {
        id: resourceId,
        name: resourceName || `Recurso ${resourceId.slice(0, 8)}`,
        isAvailable: false,
        _legacyStub: true,
      } as any;
    }

    // The booking's service may not be in `bookableServices` because it's
    // flagged is_bookable=false (e.g. legacy service that was renamed or
    // deactivated but still referenced by old bookings). In that case the
    // service lookup returns nothing and the form silently loses the field —
    // the user sees an empty service selector and has no clue the booking
    // already has one. Build a minimal service stub so the form is populated
    // AND the user can see the original name and pick a different one.
    if (!service && serviceId) {
      const serviceName =
        shared.serviceName ||
        (typeof this.eventToEdit.title === 'string' ? this.eventToEdit.title : '') ||
        'Servicio';
      service = {
        id: serviceId,
        name: serviceName,
        duration_minutes: 60,
        base_price: undefined,
        // Mark as not bookable so the custom-select shows "(no disponible)"
        // — the user can still see it and pick a real one to replace it.
        isAvailable: false,
        _legacyStub: true,
      } as any;
    }

    // Compute date/time from the event's start so the user can see AND
    // change them. compute this even if service/client/professional haven't
    // resolved yet — date and time are independent of those lookups.
    let dateStr = '';
    let timeStr = '';
    if (this.eventToEdit.start) {
      const d = new Date(this.eventToEdit.start);
      const yy = d.getFullYear();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const dd = d.getDate().toString().padStart(2, '0');
      const hh = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      dateStr = `${yy}-${mm}-${dd}`;
      timeStr = `${hh}:${min}`;
    }

    // Patch the form. Use emitEvent: true so Angular re-renders the bound
    // <input type="date"> and <app-custom-select> with the new values. Using
    // emitEvent: false here would silently desync the DOM from the form
    // (especially for the native date picker on Windows/Edge, which never
    // gets re-written to once the form control is patched silently).
    this.form.patchValue({
      service: service || null,
      client: client || null,
      date: dateStr,
      time: timeStr,
      professional: profesional || 'automatic',
      resource: resource || 'automatic',
      description: this.eventToEdit.description || '',
      session_type: shared.sessionType || 'presencial',
    });

    // Signals stay in sync via the form.valueChanges subscription in the
    // constructor — no need to set them manually now that we patched with
    // emitEvent: true.

    // Force change detection so the native <input type="date"> re-renders
    // with the patched value. Without this, Chrome/Edge's date picker
    // sometimes desyncs from the form control on the first patch (because
    // the input was created with value="" and Angular's writeValue doesn't
    // always push the new value to the native input until the next CD pass).
    this.cdr.detectChanges();

    // Second detectChanges on the next microtask — covers the case where
    // the first detectChanges runs while Angular is still in the middle of
    // composing the view (the date input may not be in the DOM yet on the
    // first pass when the modal is animating in). This guarantees the date
    // and time values are written to the actual input elements.
    setTimeout(() => {
      // Re-assert the date and time values directly on the underlying
      // controls in case the form-level patchValue didn't propagate to the
      // native input (this is a known issue with `<input type="date">` on
      // some Chromium versions when the form control is initialized with
      // an empty string and the value is patched within the same change
      // detection cycle as the modal opening).
      const dateCtrl = this.form.get('date');
      const timeCtrl = this.form.get('time');
      if (dateCtrl && dateCtrl.value && dateCtrl.value !== dateStr) {
        dateCtrl.setValue(dateStr, { emitEvent: false });
      } else if (dateCtrl && dateStr) {
        dateCtrl.setValue(dateStr, { emitEvent: false });
      }
      if (timeCtrl && timeStr && timeCtrl.value !== timeStr) {
        timeCtrl.setValue(timeStr, { emitEvent: false });
      }
      this.cdr.detectChanges();
    }, 0);

    // Mark as populated so subsequent ngOnChanges cycles (clients arriving,
    // resources arriving, etc.) don't re-patch and clobber the user's edits.
    this.editFormPopulated = true;
  }

  ngOnChanges(changes: any) {
    // Bump the inputs version so computed signals that depend on
    // @Input() arrays (freeResources, filteredResourcesByService) re-evaluate
    // when the parent pushes fresh data.
    if (changes['allBookings'] || changes['availableResources']) {
      this.inputsVersion.update((n) => n + 1);
    }

    // When clients input changes (e.g. after force reload), recompute filtered clients
    if (changes['clients']) {
      this._recomputeFilteredClients();
    }

    // Auto-select the professional for professional users when it becomes available
    if (changes['professionals'] && !this.selectedProfessionalId()) {
      if (this.isProfessional()) {
        const myUserId = this.authService.userProfile?.id;
        const myProf = myUserId ? this.professionals.find((p: any) => p.user_id === myUserId) : null;
        if (myProf) {
          this.form.patchValue({ professional: myProf }, { emitEvent: false });
          this.selectedProfessionalId.set(myProf.id);
        }
      } else if (this.professionals.length === 1) {
        this.form.patchValue(
          { professional: this.professionals[0] },
          { emitEvent: false },
        );
        this.selectedProfessionalId.set(this.professionals[0].id);
      }
    }

    if (!this.eventToEdit || this.editFormPopulated) return;

    // Populate the edit form as soon as we have the event. populateEditForm
    // itself looks up service/client/professional by ID from the loaded arrays
    // and falls back to null/empty when they're not yet available — so waiting
    // for ALL three arrays to be non-empty (the previous behaviour) caused the
    // form to never populate when one array loaded later than the others,
    // leaving date/time/service controls empty and effectively locked.
    // We still re-attempt on every relevant change below so any fields that
    // resolved to null get filled in once the data arrives.
    this.populateEditForm();
  }

  forceClientsReload(): void {
    // Clear the cache and force reload of clients
    this.customersService.clearClientsCache();
    // Use created to signal parent to reload
    this.created.emit({ __reloadClients: true } as any);
  }

  clearClient(): void {
    this.form.get("client")?.setValue(null);
  }

  /** Called by the WaitlistButtonComponent when a join succeeds — close the form */
  onWaitlistJoined(): void {
    this.close.emit();
  }

  async onSubmit() {
    if (this.form.invalid) return;

    this.loading = true;
    const formValue = this.form.value;

    try {
      let description = formValue.description
        ? `<p>${formValue.description.replace(/\\n/g, "<br/>")}</p>`
        : "";

      const isOnline = formValue.session_type === 'online';
      const blockRoom = formValue.blockRoom === true;

      // Resolve assignedResource from form value, handling all shapes (object, 'automatic', null)
      const resFormValue: any = this.form.get('resource')?.value;
      let assignedResource: any = null;
      if (resFormValue && typeof resFormValue === 'object' && resFormValue.id) {
        // When editing, isResourceFree() returns false for the event's own
        // resource (self is in allEvents), so use hasResourceConflict instead.
        // hasResourceConflict excludes the event being edited and only blocks
        // if another booking occupies the resource at this time slot.
        const conflict = this.eventToEdit && this.hasResourceConflict(resFormValue.id);
        if (conflict) {
          if (blockRoom) {
            this.toastService.warning(
              'Sala no disponible',
              `La sala "${resFormValue.name}" ya está ocupada en ese horario. Elige otra sala o desmarca "Bloquear sala".`,
            );
            this.loading = false;
            return;
          }
          // Not blocking room — allow saving without this resource
        } else {
          assignedResource = resFormValue;
        }
      } else if (resFormValue === 'automatic') {
        const freeRes = this.freeResources();
        const allRes = this.filteredResourcesByService();
        if (freeRes.length > 0) {
          assignedResource = freeRes[0];
        } else if (allRes.length > 0) {
          // Hay recursos en el sistema pero ninguno libre en este horario → bloquear
          this.toastService.warning(
            'Sin salas disponibles',
            'No hay ninguna sala libre en este horario. Elige otro horario.',
          );
          this.loading = false;
          return;
        }
        // allRes.length === 0 → no hay recursos definidos → permitir sin recurso
      }
      // else null (no resource)

      let assignedProfessional = null;
      if (this.isProfessional()) {
        // Professional mode: auto-assign to the current professional (dropdown removed)
        const myId = this.currentProfessionalId();
        assignedProfessional = this.professionals.find((p: any) => p.id === myId) || null;
      } else if (formValue.professional === "automatic") {
        const freeProfs = this.freeProfessionals();
        if (freeProfs.length > 0) {
          assignedProfessional = freeProfs[0];
        }
      } else if (formValue.professional && (formValue.professional as any).id) {
        assignedProfessional = formValue.professional as any;
      }

      const details = [];
      if (formValue.service) {
        details.push(`<b>Servicio:</b> ${(formValue.service as any).name}`);
      }
      if (formValue.client) {
        details.push(
          `<b>Cliente:</b> ${(formValue.client as any).displayName || (formValue.client as any).name + " " + ((formValue.client as any).surname || "")}`,
        );
      }
      if (assignedProfessional && !this.isProfessional()) {
        details.push(
          `<b>Profesional Asignado:</b> ${assignedProfessional.display_name}`,
        );
      }
      if (assignedResource) {
        details.push(`<b>Recurso/Sala:</b> ${assignedResource.name}`);
      }

      if (details.length > 0) {
        description += `<br/><ul>${details.map((d) => `<li>${d}</li>`).join("")}</ul>`;
      }

      const startStr = this.selectedStart();
      const endStr = this.selectedEnd();
      if (!startStr || !endStr) throw new Error("Falta fecha y hora de inicio");

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      let finalClient = formValue.client as any;

      let targetMemberIdForOwner: string | undefined;
      if (assignedProfessional?.id) {
        targetMemberIdForOwner = assignedProfessional.id;
      }

      if (finalClient && finalClient.isNew) {
        try {
          const newCustomerObj = {
            name: finalClient.name,
            surname: "",
            dni: "",
            phone: "",
            email: finalClient.email,
            client_type: "individual" as const,
            status: "lead" as const, // Default for incomplete registered
          } as any;
          const createdClient = await firstValueFrom(
            this.customersService.createCustomer(newCustomerObj, {
              assignedMemberId: targetMemberIdForOwner,
            }),
          );
          finalClient = createdClient;
          // Important: Swap the form value so it has the real ID for description logic below
          this.form.patchValue(
            { client: createdClient as any },
            { emitEvent: false },
          );
        } catch (err: any) {
          console.error("Error auto-creating client:", err);
          throw new Error("No se pudo crear el cliente para la invitación.");
        }
      }

      // 0. Capacity check — only for new bookings (not edits)
      const isNewBooking = !(this.eventToEdit && this.eventToEdit.isLocal);
      if (isNewBooking && this.slotFull()) {
        this.loading = false;
        this.toastService.warning(
          'Cupo lleno',
          'Este horario está completo. Únete a la lista de espera.'
        );
        return;
      }

      // 1. Create or Update the booking locally first
      let localBooking: any;
      try {
        const companyId = this.authService.currentCompanyId();
        if (!companyId)
          throw new Error("No se pudo obtener el ID de la empresa");

        const bookingData: any = {
          company_id: companyId,
          client_id: finalClient.id,
          customer_name:
            finalClient.displayName ||
            `${finalClient.name} ${finalClient.surname || ""}`.trim(),
          customer_email: finalClient.email,
          service_id: (formValue.service as any)?.id || undefined,
          professional_id: assignedProfessional?.id || undefined,
          resource_id: assignedResource?.id || undefined,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          status: "confirmed" as const,
          notes: formValue.description || undefined,
          session_type: (formValue as any).session_type || "presencial",
          total_price: (formValue.service as any)?.base_price || undefined,
        };
        // If the user clicked "Crear y marcar como pagado" the dialog
        // stored the chosen method in pendingPaymentMethod. Persist it
        // on the booking and mark the payment_status as paid. For all
        // other paths (regular Crear Reserva, edit) the fields stay
        // unset so the booking starts in pending/awaiting-payment.
        if (this.pendingPaymentMethod) {
          bookingData.payment_method = this.pendingPaymentMethod;
          bookingData.payment_status = 'paid';
        }

        if (this.eventToEdit && this.eventToEdit.isLocal) {
          const localId =
            this.eventToEdit.extendedProps?.shared?.localBookingId ||
            this.eventToEdit.id;
          localBooking = await this.bookingsService.updateBooking(
            localId,
            bookingData,
          );
        } else {
          // Use atomic bookSlot() RPC to prevent double-booking
          this.checkingCapacity.set(true);
          try {
            const profId = assignedProfessional?.id;
            if (!profId) throw new Error('No hay profesional asignado');
            localBooking = await this.bookingsService.bookSlot(
              profId,
              startDate.toISOString(),
              endDate.toISOString(),
              bookingData,
              this.effectiveBookingSource(),
            );
          } catch (err: any) {
            this.checkingCapacity.set(false);
            if (err?.message === 'slot_taken' || err?.message?.includes('slot_taken')) {
              this.toastService.warning(
                'Cupo lleno',
                'Este horario acaba de ser reservado. Por favor elige otro.'
              );
              return;
            }
            if (err?.message === 'professional_blocked' || err?.message?.includes('professional_blocked')) {
              this.toastService.warning(
                'Fecha bloqueada',
                'El profesional no está disponible en esta fecha. Selecciona otra fecha u otro profesional.'
              );
              return;
            }
            if (err?.message === 'service_blocked' || err?.message?.includes('service_blocked')) {
              this.toastService.warning(
                'Servicio no disponible',
                'Este servicio no está disponible en esta fecha. Selecciona otra fecha.'
              );
              return;
            }
            throw err;
          } finally {
            this.checkingCapacity.set(false);
          }
        }
      } catch (err: any) {
        console.error("Error saving local booking:", err);
        throw new Error("No se pudo guardar la reserva en el sistema.");
      }

      // 2. Try to sync with Google Calendar if integration exists
      let targetCalendarId = this.calendarId;
      if (assignedProfessional?.google_calendar_id) {
        targetCalendarId = assignedProfessional.google_calendar_id;
      }

      let createdGoogleEvent = null;

      // Respect the company's "Google Calendar invite" preference
      // (Configuración > Notificaciones → company_settings.email_preferences).
      // When disabled (e.g. during bulk imports) we skip the edge function
      // call entirely so no invite is sent and no warning toast is shown.
      const googleCalendarInvitesEnabled =
        this.emailPreferences().google_calendar_invite !== false;

      if (targetCalendarId && googleCalendarInvitesEnabled) {
        const eventAttendees: { email: string }[] = [];
        if (finalClient?.email) {
          eventAttendees.push({ email: finalClient.email });
        }
        if (assignedResource?.google_calendar_id) {
          eventAttendees.push({ email: assignedResource.google_calendar_id });
        }

        const eventData = {
          summary: formValue.summary,
          description: description,
          start: { dateTime: startDate.toISOString() },
          end: { dateTime: endDate.toISOString() },
          extendedProperties: {
            shared: {
              localBookingId: localBooking.id,
              serviceId: (formValue.service as any)?.id
                ? String((formValue.service as any).id)
                : undefined,
              clientId: finalClient?.id ? String(finalClient.id) : undefined,
              professionalId: assignedProfessional?.id
                ? String(assignedProfessional.id)
                : undefined,
              resourceId: assignedResource?.id
                ? String(assignedResource.id)
                : undefined,
              sessionType: (formValue.session_type as any) || 'presencial',
              clientName:
                finalClient?.displayName ||
                (finalClient?.name
                  ? finalClient.name +
                    (finalClient.surname ? " " + finalClient.surname : "")
                  : undefined),
              serviceName: (formValue.service as any)?.name,
              professionalName: assignedProfessional?.display_name,
              resourceName: assignedResource?.name,
            },
          },
          attendees: eventAttendees,
        };

        const actionName =
          this.eventToEdit?.googleEventId || this.eventToEdit?.isGoogle
            ? "update-event"
            : "create-event";
        const targetEventId =
          this.eventToEdit?.googleEventId ||
          (this.eventToEdit?.isGoogle ? this.eventToEdit?.id : undefined);

        // The backend `google-auth update-event` action validates that
        // `event.id` is present inside the event body (line 493 of
        // google-auth/index.ts) before PATCHing Google. Without this, the
        // request 400s with "Missing event data or event ID" and no
        // attendee notification is sent. For create-event, id is left out
        // so Google assigns a new one.
        if (actionName === "update-event" && targetEventId) {
          (eventData as any).id = targetEventId;
        }

        if (actionName !== "update-event" && (formValue as any).session_type === 'online') {
          (eventData as any).conferenceData = {
            createRequest: {
              requestId: localBooking.id,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        const { data, error } = await this.supabase
          .getClient()
          .functions.invoke("google-auth", {
            body: {
              action: actionName,
              calendarId: targetCalendarId,
              event: eventData,
              ...(actionName === "update-event" && { eventId: targetEventId }),
              ...(actionName === "create-event" && (formValue as any).session_type === 'online' && { conferenceDataVersion: 1 }),
            },
          });

        if (error) {
          console.error(
            "Supabase Function Error (Calendar sync failed):",
            error,
          );
          this.toastService.warning(
            "Sincronización Fallida",
            "La cita se guardó localmente, pero falló la sincronización con Google Calendar.",
          );
        } else if (data && data.error) {
          console.error("Google API Error from Backend:", data.error);
          const errMsg = data.error.message || '';
          const errCode = data.error.code;
          // "No google_calendar integration found" is NOT a real error — it
          // means the professional hasn't connected their Google account yet.
          // Suppress the warning toast in that case; the booking is saved
          // locally and the user can connect Google Calendar later.
          if (
            errMsg.includes('google_calendar') &&
            errMsg.includes('integration') &&
            errMsg.includes('not found')
          ) {
            // Silent — expected case for unconnected professionals.
            console.info('[event-form] Professional has no Google Calendar integration — skipping sync warning.');
          } else if (
            errCode === 403 ||
            errMsg.includes("requiredAccessLevel")
          ) {
            this.toastService.warning(
              "Error de Permisos en Calendar",
              "La cita se guardó localmente, pero no tienes permisos en el calendario.",
            );
          } else {
            console.error("Google Calendar sync error:", errMsg);
            this.toastService.warning(
              "Aviso",
              "La cita se guardó localmente, pero hubo un problema al sincronizar con Calendar.",
            );
          }
        } else if (data && data.success) {
          createdGoogleEvent = data.event;
          try {
            const bookingUpdates: any = { google_event_id: createdGoogleEvent.id };
            if (createdGoogleEvent.hangoutLink) {
              bookingUpdates.meeting_link = createdGoogleEvent.hangoutLink;
              localBooking.meeting_link = createdGoogleEvent.hangoutLink;
            }
            await this.bookingsService.updateBooking(localBooking.id, bookingUpdates);
            localBooking.google_event_id = createdGoogleEvent.id;
          } catch (updateErr) {
            console.error(
              "Failed to update local booking with google event ID",
              updateErr,
            );
          }
        }
      }

      const isUpdate = !!this.eventToEdit;

      if (createdGoogleEvent) {
        this.toastService.success(
          isUpdate ? "Evento Actualizado" : "Evento Creado",
          "La cita se ha guardado y sincronizado con Google Calendar correctamente.",
        );
      } else if (!targetCalendarId || !googleCalendarInvitesEnabled) {
        this.toastService.success(
          isUpdate ? "Cita Actualizada" : "Cita Creada",
          googleCalendarInvitesEnabled
            ? "La reserva se ha guardado correctamente."
            : "La reserva se ha guardado correctamente. (Invitaciones de Google Calendar deshabilitadas en Configuración > Notificaciones.)",
        );
      } else {
        // It had a target calendar but failed to sync, toast warning already shown above
      }

      // Enrich localBooking with professional and resource names for immediate UI update
      if (localBooking) {
        localBooking.professional = assignedProfessional;
        localBooking.resource = assignedResource;
        localBooking.service = formValue.service;
      }

      // Send confirmation email (non-blocking — errors logged, booking already saved)
      // Respect the company's "booking confirmation to client" preference
      // (Configuración > Notificaciones → company_settings.email_preferences).
      // When disabled (e.g. during bulk imports) we skip the call entirely so
      // no email is sent and no warning toast is shown.
      const clientConfirmationEnabled =
        this.emailPreferences().booking_confirmation_client !== false;

      if (finalClient?.email && localBooking && clientConfirmationEnabled) {
        this.bookingsService
          .sendBookingConfirmationEmail({
            companyId: this.authService.currentCompanyId() ?? '',
            clientName:
              finalClient.displayName ||
              `${finalClient.name} ${finalClient.surname || ''}`.trim(),
            clientEmail: finalClient.email,
            serviceName: (formValue.service as any)?.name || '',
            startTime: startDate.toISOString(),
            endTime: endDate.toISOString(),
            professionalName: assignedProfessional?.display_name,
            sessionType: (formValue as any).session_type || 'presencial',
          })
          .catch((err: unknown) =>
            console.warn('[onSubmit] Confirmation email failed (non-blocking):', err),
          );
      }

      this.created.emit({ localBooking, googleEvent: createdGoogleEvent });
      // Reset the payment-method picker so a future "Crear Reserva"
      // (without marking as paid) doesn't accidentally carry over
      // the previous "marcar como pagado" choice.
      this.pendingPaymentMethod = null;
      this.close.emit();
    } catch (error: any) {
      console.error("Error creating event:", error);
      this.toastService.error(
        "Error al crear evento",
        "No se pudo guardar la cita. Inténtalo de nuevo.",
      );
    } finally {
      this.loading = false;
    }
  }
}
