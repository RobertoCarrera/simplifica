import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/**
 * Shape of the company object the parent passes in. We don't import the
 * full `Company` type from auth.service to keep the component free of
 * service-graph dependencies; only the two fields we render are required.
 */
export interface SeatBadgeCompany {
  /** Maximum non-client users allowed by the plan. NULL = unlimited. */
  max_users?: number | null;
  /** Pre-computed non-client count (kept on the parent so multiple badges
   *  share one query). If undefined the component treats it as 0. */
  seat_current?: number | null;
}

/**
 * Tiny standalone badge that shows "X / Y seats" for a company row in
 * the super_admin Empresas tab. Renders "Sin límite" when max_users is
 * NULL (F-SEAT-004 scenario 1) and a warning colour when current >= max
 * (F-SEAT-004 scenario 1 last bullet). Clicking the badge emits
 * `seatBadgeClick` so the parent can open a breakdown panel without the
 * component owning any navigation logic (F-SEAT-004 scenario 2).
 *
 * Lives in shared/ because both admin surfaces (ModulesAdminComponent
 * today, and a future CompaniesAdminComponent) will want it.
 */
@Component({
  selector: 'app-seat-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let max = company().max_users ?? null;
    @let current = company().seat_current ?? 0;
    @let atCapacity = max !== null && current >= max;
    <button
      type="button"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
      [class.bg-amber-100]="atCapacity"
      [class.text-amber-800]="atCapacity"
      [class.bg-gray-100]="!atCapacity"
      [class.text-gray-700]="!atCapacity"
      [attr.aria-label]="ariaLabel()"
      [title]="ariaLabel()"
      (click)="seatBadgeClick.emit(company())"
    >
      <i class="fas fa-users text-[10px]" aria-hidden="true"></i>
      <span>{{ label() }}</span>
    </button>
  `,
})
export class SeatBadgeComponent {
  /** Company row to render. Required — only the two seat-related fields are read. */
  readonly company = input.required<SeatBadgeCompany>();

  /**
   * Emitted when the badge is clicked. The component MUST NOT mutate
   * the company state — that's the parent's job (F-SEAT-004 scenario 2).
   */
  readonly seatBadgeClick = output<SeatBadgeCompany>();

  /** Visible text. "Sin límite" when max_users is null, "X / Y" otherwise. */
  readonly label = computed<string>(() => {
    const max = this.company().max_users ?? null;
    const current = this.company().seat_current ?? 0;
    if (max === null) return 'Sin límite';
    return `${current} / ${max}`;
  });

  /** Spoken label for screen readers (more descriptive than the visible text). */
  readonly ariaLabel = computed<string>(() => {
    const max = this.company().max_users ?? null;
    const current = this.company().seat_current ?? 0;
    if (max === null) {
      return `Sin límite de plazas (${current} usuarios actualmente)`;
    }
    return `${current} de ${max} plazas ocupadas`;
  });
}