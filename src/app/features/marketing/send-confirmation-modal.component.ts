import {
  ChangeDetectionStrategy,
  Component,
  computed,
  EventEmitter,
  input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Personalized send-confirmation modal for marketing campaigns.
 *
 * Replaces the native browser `confirm()` dialog with a tailored overlay that
 * adapts its copy based on the campaign type:
 *
 *   - **Consent migration** (`isConsentMigration === true`): the campaign is
 *     routed through `send-client-consent-invite` and sends a one-time RGPD
 *     informational email asking the recipient to accept or reject. The
 *     modal explains this clearly and warns that the send is one-shot.
 *
 *   - **Marketing** (`isConsentMigration === false`): the campaign is sent
 *     as a transactional email to clients with marketing consent. The modal
 *     previews the subject and a truncated body.
 *
 * The modal is purely presentational — it never calls the backend. The
 * parent component listens for the `confirmed` event to trigger the actual
 * `sendCampaign` request.
 *
 * Following the codebase's existing modal convention (see
 * `block-dates-modal`, the preview modal in `campaign-form.component.ts`)
 * this component renders inline as a fixed-overlay panel rather than via
 * `MatDialog` — `@angular/material` is not a dependency of this project.
 */
@Component({
  selector: 'app-send-confirmation-modal',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 bg-slate-900/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm"
      (click)="onBackdropClick($event)"
      data-testid="send-confirmation-modal"
    >
      <div
        class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3
            class="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
            data-testid="send-confirmation-title"
          >
            @if (isConsentMigration()) {
              <i class="fas fa-shield-alt text-amber-500"></i>
              {{ 'marketing.sendConfirmation.consentTitle' | transloco }}
            } @else {
              <i class="fas fa-paper-plane text-blue-500"></i>
              {{ 'marketing.sendConfirmation.marketingTitle' | transloco }}
            }
          </h3>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            (click)="onCancel()"
            [attr.aria-label]="'common.cancel' | transloco"
            data-testid="send-confirmation-close"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          @if (isConsentMigration()) {
            <!-- 📋 What this send does -->
            <p
              class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
              data-testid="send-confirmation-consent-intro"
            >
              <i class="fas fa-clipboard-list text-amber-500 mr-1.5"></i>
              {{
                'marketing.sendConfirmation.consentIntro'
                  | transloco: { count: audienceCount() }
              }}
            </p>

            <!-- ⚠️ One-time warning -->
            <div
              class="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 leading-relaxed"
              data-testid="send-confirmation-consent-warning"
            >
              <i class="fas fa-exclamation-triangle mr-1.5"></i>
              {{ 'marketing.sendConfirmation.consentOneTimeWarning' | transloco }}
            </div>

            <!-- Explanation of the email contents -->
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {{ 'marketing.sendConfirmation.consentInformational' | transloco }}
            </p>

            <!-- Recipient summary -->
            <div>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                {{ 'marketing.sendConfirmation.summary' | transloco }}
              </p>
              <ul
                class="text-sm text-slate-700 dark:text-slate-300 space-y-1 list-disc list-inside"
                data-testid="send-confirmation-recipient-list"
              >
                @for (name of audienceNames(); track name) {
                  <li>{{ name }}</li>
                }
                @if (extraCount() > 0) {
                  <li class="text-slate-500 dark:text-slate-400 italic">
                    +{{ extraCount() }}
                    {{ 'marketing.sendConfirmation.andMore' | transloco }}
                  </li>
                }
              </ul>
            </div>
          } @else {
            <!-- Marketing campaign: full preview -->
            <div class="space-y-3">
              <div>
                <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {{ 'marketing.sendConfirmation.campaignName' | transloco }}
                </p>
                <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {{ campaignName() }}
                </p>
              </div>

              <div>
                <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {{ 'marketing.sendConfirmation.audienceCount' | transloco }}
                </p>
                <p class="text-sm text-slate-700 dark:text-slate-300">
                  {{ audienceCount() }}
                  {{ 'marketing.clients' | transloco }}
                </p>
              </div>

              @if (subject()) {
                <div>
                  <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {{ 'marketing.sendConfirmation.subject' | transloco }}
                  </p>
                  <p class="text-sm text-slate-700 dark:text-slate-300">
                    {{ subject() }}
                  </p>
                </div>
              }

              @if (contentPreview()) {
                <div>
                  <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    {{ 'marketing.sendConfirmation.contentPreview' | transloco }}
                  </p>
                  <div
                    class="mt-1 p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono"
                  >
                    {{ contentPreview() }}{{ contentPreviewWasTruncated() ? '…' : '' }}
                  </div>
                </div>
              }

              <div>
                <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  {{ 'marketing.sendConfirmation.summary' | transloco }}
                </p>
                <ul
                  class="text-sm text-slate-700 dark:text-slate-300 space-y-1 list-disc list-inside"
                  data-testid="send-confirmation-recipient-list"
                >
                  @for (name of audienceNames(); track name) {
                    <li>{{ name }}</li>
                  }
                  @if (extraCount() > 0) {
                    <li class="text-slate-500 dark:text-slate-400 italic">
                      +{{ extraCount() }}
                      {{ 'marketing.sendConfirmation.andMore' | transloco }}
                    </li>
                  }
                </ul>
              </div>
            </div>
          }
        </div>

        <!-- Footer -->
        <div
          class="px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2"
        >
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            (click)="onCancel()"
            data-testid="send-confirmation-cancel"
          >
            {{ 'marketing.sendConfirmation.cancel' | transloco }}
          </button>
          <button
            type="button"
            [class]="
              isConsentMigration()
                ? 'px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors'
                : 'px-4 py-2 rounded-lg text-sm font-bold bg-green-600 hover:bg-green-700 text-white transition-colors'
            "
            (click)="onConfirm()"
            data-testid="send-confirmation-confirm"
          >
            @if (isConsentMigration()) {
              <i class="fas fa-shield-alt mr-1"></i>
              {{ 'marketing.sendConfirmation.consentConfirm' | transloco }}
            } @else {
              <i class="fas fa-paper-plane mr-1"></i>
              {{ 'marketing.sendConfirmation.marketingConfirm' | transloco }}
            }
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SendConfirmationModalComponent {
  /** Name of the campaign being sent. */
  readonly campaignName = input.required<string>();

  /** Total number of recipients in the audience. */
  readonly audienceCount = input.required<number>();

  /**
   * Display names for the first few recipients. The modal renders these in a
   * bullet list and adds a "+N más" line when `audienceCount` exceeds the
   * length of this array. The parent is responsible for slicing — the modal
   * never re-slices the input.
   */
  readonly audienceNames = input.required<string[]>();

  /**
   * When `true`, the modal renders the RGPD consent-migration copy (a one-time
   * informational email explaining that the recipient must accept or reject).
   * When `false`, the modal renders the standard marketing send preview.
   */
  readonly isConsentMigration = input.required<boolean>();

  /** Email subject — marketing campaigns only. Ignored in consent mode. */
  readonly subject = input<string>('');

  /**
   * Plain-text content preview. Should already be truncated by the parent to
   * the desired length (typically the first 200 chars). The modal appends an
   * ellipsis when `contentPreviewWasTruncated` is true.
   */
  readonly contentPreview = input<string>('');

  /** Set to `true` if the content was truncated by the parent. */
  readonly contentPreviewWasTruncated = input<boolean>(false);

  /** Emitted when the user clicks the primary button (Enviar / Enviar solicitud). */
  @Output() confirmed = new EventEmitter<void>();

  /** Emitted when the user clicks Cancel or the backdrop. */
  @Output() cancelled = new EventEmitter<void>();

  /** How many more recipients there are beyond the names shown in the list. */
  readonly extraCount = computed(() => {
    const total = this.audienceCount();
    const shown = this.audienceNames().length;
    return Math.max(0, total - shown);
  });

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  /**
   * Close when the user clicks outside the modal panel. The inner panel uses
   * `$event.stopPropagation()` to keep its own clicks from bubbling up here.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}