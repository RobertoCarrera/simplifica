import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { provideTransloco } from '@jsverse/transloco';
import { InvoiceSeriesSettingsComponent } from './invoice-series-settings.component';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { InvoiceSeries } from '../../../models/invoice.model';

describe('InvoiceSeriesSettingsComponent', () => {
  let component: InvoiceSeriesSettingsComponent;
  let fixture: ComponentFixture<InvoiceSeriesSettingsComponent>;
  let mockService: jasmine.SpyObj<SupabaseInvoicesService>;

  const seriesA: InvoiceSeries = {
    id: 'S1',
    company_id: 'C1',
    series_code: 'A',
    series_name: 'Serie A',
    year: 2026,
    prefix: 'A-',
    next_number: 320,
    is_active: true,
    is_default: true,
    verifactu_enabled: false,
    created_at: '2026-06-15T00:00:00Z',
    updated_at: '2026-06-15T00:00:00Z',
  };

  const seriesB: InvoiceSeries = {
    ...seriesA,
    id: 'S2',
    series_code: 'B',
    series_name: 'Serie B',
    prefix: 'B-',
    next_number: 1,
  };

  const mockStats = new Map([
    ['S1', { invoice_count: 319, max_invoice_number: 319 }],
    ['S2', { invoice_count: 0, max_invoice_number: null }],
  ]);

  beforeEach(async () => {
    mockService = jasmine.createSpyObj<SupabaseInvoicesService>('SupabaseInvoicesService', [
      'getAllInvoiceSeries',
      'getSeriesStats',
      'createInvoiceSeries',
      'updateInvoiceSeries',
      'setDefaultInvoiceSeries',
    ]);
    mockService.getAllInvoiceSeries.and.returnValue(of([seriesA, seriesB]));
    mockService.getSeriesStats.and.callFake((id: string) => of(mockStats.get(id) ?? { invoice_count: 0, max_invoice_number: null }));
    mockService.updateInvoiceSeries.and.callFake((id: string, changes) => of({ ...(id === 'S1' ? seriesA : seriesB), ...changes } as InvoiceSeries));

    await TestBed.configureTestingModule({
      imports: [InvoiceSeriesSettingsComponent, CommonModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: SupabaseInvoicesService, useValue: mockService },
        provideTransloco({ config: { defaultLang: 'es' } }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceSeriesSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads series and stats on init', async () => {
    expect(component.series.length).toBe(2);
    expect(component.stats.get('S1')?.invoice_count).toBe(319);
    expect(component.stats.get('S2')?.max_invoice_number).toBeNull();
  });

  it('startEditNextNumber sets the editing state', () => {
    component.startEditNextNumber(seriesA);
    expect(component.editingSeriesId()).toBe('S1');
    expect(component.editingValue()).toBe(320);
  });

  it('cancelEditNextNumber clears the editing state', () => {
    component.startEditNextNumber(seriesA);
    component.cancelEditNextNumber();
    expect(component.editingSeriesId()).toBeNull();
    expect(component.editingValue()).toBeNull();
  });

  it('currentValidation: valid when next_number = max + 1 (contiguous)', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(320);
    expect(component.currentValidation().valid).toBeTrue();
    expect(component.currentValidation().error).toBeNull();
    expect(component.currentValidation().warning).toBeNull();
  });

  it('currentValidation: error when next_number <= max (would overwrite)', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(300);
    expect(component.currentValidation().valid).toBeFalse();
    expect(component.currentValidation().error).toContain('wouldOverwrite');
  });

  it('currentValidation: error when next_number < 1', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(0);
    expect(component.currentValidation().valid).toBeFalse();
    expect(component.currentValidation().error).toContain('mustBePositive');
  });

  it('currentValidation: error when next_number is negative', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(-5);
    expect(component.currentValidation().valid).toBeFalse();
  });

  it('currentValidation: warning when next_number > max + 1 (gap)', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(500);
    expect(component.currentValidation().valid).toBeTrue();
    expect(component.currentValidation().warning).toContain('gap');
  });

  it('currentValidation: valid for any positive number on a fresh series (no invoices)', () => {
    component.startEditNextNumber(seriesB);
    component.onEditInputChange(250);
    expect(component.currentValidation().valid).toBeTrue();
    expect(component.currentValidation().warning).toBeNull();
  });

  it('commitEditNextNumber does not call update when value is invalid', async () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(100); // would overwrite
    await component.commitEditNextNumber(seriesA);
    expect(mockService.updateInvoiceSeries).not.toHaveBeenCalled();
    expect(component.inlineError()).toContain('wouldOverwrite');
  });

  it('commitEditNextNumber calls update when value is valid', async () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(500);
    await component.commitEditNextNumber(seriesA);
    expect(mockService.updateInvoiceSeries).toHaveBeenCalledWith('S1', { next_number: 500 });
  });

  it('commitEditNextNumber is a no-op when value is unchanged', async () => {
    component.startEditNextNumber(seriesA);
    // value already 320 from initialization
    await component.commitEditNextNumber(seriesA);
    expect(mockService.updateInvoiceSeries).not.toHaveBeenCalled();
  });

  it('nextInvoicePreview formats prefix + number correctly', () => {
    expect(component.nextInvoicePreview('A-', 320)).toBe('A-320');
    expect(component.nextInvoicePreview('B-', 1)).toBe('B-1');
  });

  it('onEditInputChange handles null and empty string', () => {
    component.startEditNextNumber(seriesA);
    component.onEditInputChange(null);
    expect(component.editingValue()).toBeNull();
    component.onEditInputChange('');
    expect(component.editingValue()).toBeNull();
    component.onEditInputChange('not-a-number');
    expect(component.editingValue()).toBeNull();
  });

  it('createSeries blocks invalid next_number (< 1)', async () => {
    component.creating.set(true);
    component.newSeries = {
      series_code: 'X', series_name: 'X', year: 2026, prefix: 'X-',
      next_number: 0, is_active: true, is_default: false, verifactu_enabled: false,
    } as any;
    await component.createSeries();
    expect(mockService.createInvoiceSeries).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });
});
