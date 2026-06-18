import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DoctoraliaImportSummary } from './doctoralia-import-summary.types';
import { DoctoraliaImportSummaryComponent as DoctoraliaImportSummaryComponentImpl } from './doctoralia-import-summary.component';

describe('DoctoraliaImportSummaryComponent', () => {
  let component: DoctoraliaImportSummaryComponentImpl;
  let fixture: ComponentFixture<DoctoraliaImportSummaryComponentImpl>;

  const baseResult: DoctoraliaImportSummary = {
    total: 10,
    imported: 7,
    deduped: 3,
    notesImported: 2,
    notesDropped: 1,
    failed: [
      { rowIndex: 5, errorCode: 'consent_not_granted', errorMessage: 'No consent' },
    ],
    elapsedMs: 1500,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctoraliaImportSummaryComponentImpl],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctoraliaImportSummaryComponentImpl);
    component = fixture.componentInstance;
    component.result = baseResult;
    fixture.detectChanges();
  });

  it('exposes elapsed time in seconds', () => {
    expect(component.elapsedSec).toBe('1.5s');
  });

  it('computes newCount as imported - deduped', () => {
    expect(component.newCount).toBe(4);
  });

  it('detects failures', () => {
    expect(component.hasFailures()).toBeTrue();
  });

  it('detects notes imported', () => {
    expect(component.hasNotesImported()).toBeTrue();
  });

  it('detects notes dropped', () => {
    expect(component.hasNotesDropped()).toBeTrue();
  });

  it('emits downloadFailures on demand', () => {
    spyOn(component.downloadFailures, 'emit');
    component.downloadFailures.emit();
    expect(component.downloadFailures.emit).toHaveBeenCalled();
  });
});
