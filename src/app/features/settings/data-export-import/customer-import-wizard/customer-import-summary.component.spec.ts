import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { CustomerImportSummaryComponent, CustomerImportSummaryResult } from './customer-import-summary.component';

describe('CustomerImportSummaryComponent', () => {
  let component: CustomerImportSummaryComponent;
  let fixture: ComponentFixture<CustomerImportSummaryComponent>;

  const baseResult: CustomerImportSummaryResult = {
    importedCount: 3,
    alreadyExistsCount: 1,
    skippedCount: 1,
    failedCount: 0,
    totalCount: 5,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerImportSummaryComponent, TranslocoTestingModule.forRoot({})],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerImportSummaryComponent);
    component = fixture.componentInstance;
    component.result = { ...baseResult };
    component.failures = [];
    fixture.detectChanges();
  });

  it('renders the four counts (imported / alreadyExists / skipped / failed)', () => {
    const html = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(html).toContain('3');
    expect(html).toContain('1');
  });

  it('uses the "complete" title when failed === 0', () => {
    component.result = { ...baseResult, failedCount: 0 };
    fixture.detectChanges();
    expect(component.titleKey).toBe('customerImport.summary.titleComplete');
    expect(component.hasFailures).toBe(false);
  });

  it('uses the "partial" title when failed > 0 and shows the download button', () => {
    component.result = { ...baseResult, failedCount: 2 };
    component.failures = [
      { rowIndex: 4, errorCode: 'insert_failed', errorMessage: 'boom' },
      { rowIndex: 5, errorCode: 'insert_failed', errorMessage: 'boom2' },
    ];
    fixture.detectChanges();
    expect(component.titleKey).toBe('customerImport.summary.titlePartial');
    expect(component.hasFailures).toBe(true);
    const btn = (fixture.nativeElement as HTMLElement).querySelector('button');
    expect(btn?.textContent ?? '').toContain('customerImport.summary.downloadFailures');
  });

  it('hides the download button when failed === 0 and emits close when the user closes', () => {
    component.result = { ...baseResult, failedCount: 0 };
    fixture.detectChanges();
    spyOn(component.close, 'emit');
    spyOn(component.downloadFailures, 'emit');
    // The download button should NOT be in the DOM.
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).not.toContain('customerImport.summary.downloadFailures');
    // Find and click the close button.
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    // Last button is always the close button.
    const closeBtn = buttons[buttons.length - 1] as HTMLButtonElement;
    closeBtn.click();
    expect(component.close.emit).toHaveBeenCalled();
    expect(component.downloadFailures.emit).not.toHaveBeenCalled();
  });
});