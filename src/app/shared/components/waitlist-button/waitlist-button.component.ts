import { Component, Input, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * WaitlistButtonComponent - Stub para compatibilidad
 *
 * Este es un stub passthrough porque Waitlist es una feature de Agenda (portal),
 * no forma parte del CRM.
 *
 * El componente real está en el proyecto simplifica-copilot.
 */
@Component({
  selector: "app-waitlist-button",
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      [disabled]="disabled || !enableWaitlist"
      (click)="onJoinWaitlist()"
    >
      <span>{{ text }}</span>
    </button>
  `,
})
export class WaitlistButtonComponent {
  @Input() text: string = "Añadir a lista de espera";
  @Input() disabled: boolean = false;
  @Input() serviceId: string = "";
  @Input() companyId: string = "";
  @Input() startTime: string = "";
  @Input() endTime: string = "";
  @Input() enableWaitlist: boolean = false;
  @Input() activeModeEnabled: boolean = true;
  @Output() joined = new EventEmitter<void>();

  onJoinWaitlist() {
    this.joined.emit();
  }
}
