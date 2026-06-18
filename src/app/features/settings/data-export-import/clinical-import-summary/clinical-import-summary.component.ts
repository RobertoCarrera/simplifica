import {
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';

export interface ClinicalImportSummary {
  total: number;
  imported: number;
  deduped: number;
  failed: { rowIndex: number; clientId?: string; errorCode: string; errorMessage: string }[];
  elapsedMs: number;
}

@Component({
  selector: 'app-clinical-import-summary',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './clinical-import-summary.component.html'
})
export class ClinicalImportSummaryComponent {
  @Input() result!: ClinicalImportSummary;
  @Output() downloadFailures = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  get newCount(): number {
    return this.result.imported - this.result.deduped;
  }

  get elapsedSec(): string {
    return (this.result.elapsedMs / 1000).toFixed(1) + 's';
  }

  hasFailures(): boolean {
    return this.result.failed.length > 0;
  }
}
