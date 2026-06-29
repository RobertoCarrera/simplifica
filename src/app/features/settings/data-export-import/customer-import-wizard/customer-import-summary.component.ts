import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

export interface CustomerImportSummaryResult {
  importedCount: number;
  alreadyExistsCount: number;
  skippedCount: number;
  failedCount: number;
  totalCount: number;
}

export interface CustomerImportSummaryFailure {
  rowIndex: number;
  errorCode: string;
  errorMessage: string;
}

/**
 * Final summary shown after the import finishes. Displays 4 counts in
 * cards and (when there are failures) a "Descargar reporte" button.
 * The parent handles the actual CSV generation — the summary only
 * emits the intent.
 */
@Component({
  selector: 'app-customer-import-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './customer-import-summary.component.html',
})
export class CustomerImportSummaryComponent {
  @Input() result!: CustomerImportSummaryResult;
  @Input() failures: CustomerImportSummaryFailure[] = [];

  @Output() downloadFailures = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  get hasFailures(): boolean {
    return (this.result?.failedCount ?? 0) > 0;
  }

  get titleKey(): string {
    return this.hasFailures
      ? 'customerImport.summary.titlePartial'
      : 'customerImport.summary.titleComplete';
  }

  onDownloadFailures() {
    if (!this.hasFailures) return;
    this.downloadFailures.emit();
  }

  onClose() {
    this.close.emit();
  }
}