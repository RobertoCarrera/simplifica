import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { DoctoraliaImportSummary } from './doctoralia-import-summary.types';

@Component({
  selector: 'app-doctoralia-import-summary',
  standalone: true,
  imports: [CommonModule, TranslocoPipe],
  templateUrl: './doctoralia-import-summary.component.html'
})
export class DoctoraliaImportSummaryComponent {
  @Input() result!: DoctoraliaImportSummary;
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

  hasNotesImported(): boolean {
    return this.result.notesImported > 0;
  }

  hasNotesDropped(): boolean {
    return this.result.notesDropped > 0;
  }
}
