import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { provideTransloco } from '@jsverse/transloco';
import { signal } from '@angular/core';
import { InvoiceListComponent } from './invoice-list.component';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { ProjectsService } from '../../../core/services/projects.service';
import { Invoice, InvoiceStatus, InvoiceType } from '../../../models/invoice.model';

describe('InvoiceListComponent — markAsPaid', () => {
  let component: InvoiceListComponent;
  let fixture: ComponentFixture<InvoiceListComponent>;
  let mockInvoices: jasmine.SpyObj<SupabaseInvoicesService>;
  let mockAuth: any;
  let mockToast: jasmine.SpyObj<ToastService>;

  const mockInvPending: Invoice = {
    id: 'INV1', company_id: 'C1', client_id: 'CL1', series_id: 'S1',
    invoice_number: '1', invoice_series: 'A', full_invoice_number: 'A-1',
    invoice_type: InvoiceType.SIMPLIFIED,
    invoice_date: '2026-06-15', due_date: '2026-07-15',
    subtotal: 50, tax_amount: 10.5, total: 60.5, paid_amount: 0, currency: 'EUR',
    status: InvoiceStatus.DRAFT, payment_status: 'pending',
    items: [], created_at: '2026-06-15', updated_at: '2026-06-15',
  } as any;

  const mockInvPaid: Invoice = {
    ...mockInvPending,
    id: 'INV2',
    payment_status: 'paid',
    status: InvoiceStatus.PAID,
  };

  beforeEach(async () => {
    mockInvoices = jasmine.createSpyObj<SupabaseInvoicesService>('SupabaseInvoicesService', [
      'updateInvoice', 'getInvoices', 'getSeriesStats', 'getAllInvoiceSeries',
      'createInvoiceSeries', 'updateInvoiceSeries', 'setDefaultInvoiceSeries',
    ]);
    mockInvoices.updateInvoice.and.returnValue(of(mockInvPending));
    mockInvoices.getInvoices.and.returnValue(of([mockInvPending, mockInvPaid]));
    mockInvoices.getAllInvoiceSeries.and.returnValue(of([]));
    mockInvoices.getSeriesStats.and.returnValue(of({ invoice_count: 0, max_invoice_number: null }));

    mockAuth = { isAdmin: () => true, companyId: signal('C1') };
    mockToast = jasmine.createSpyObj<ToastService>('ToastService', ['success', 'error', 'info', 'warning']);

    await TestBed.configureTestingModule({
      imports: [InvoiceListComponent, CommonModule, FormsModule, RouterTestingModule],
      providers: [
        { provide: SupabaseInvoicesService, useValue: mockInvoices },
        { provide: AuthService, useValue: mockAuth },
        { provide: ToastService, useValue: mockToast },
        // Stub all services that depend on SupabaseClientService to avoid env-loading
        { provide: SupabaseClientService, useValue: { getClient: () => ({ from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }) } },
        { provide: SupabaseBookingsService, useValue: {} },
        { provide: SupabaseModulesService, useValue: {} },
        { provide: SupabaseSettingsService, useValue: {} },
        { provide: SupabaseQuotesService, useValue: {} },
        { provide: HoldedIntegrationService, useValue: { holdedInvoices: signal([]), loadingHolded: signal(false), holdedError: signal(null), fetchHoldedInvoices: () => Promise.resolve(), downloadHoldedPdf: () => Promise.resolve() } },
        { provide: ProjectsService, useValue: {} },
        provideTransloco({ config: { defaultLang: 'es' } }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceListComponent);
    component = fixture.componentInstance;
    component.invoices.set([mockInvPending, mockInvPaid]);
  });

  it('canMarkAsPaid returns true for pending invoices', () => {
    expect(component.canMarkAsPaid(mockInvPending)).toBeTrue();
  });

  it('canMarkAsPaid returns false for already-paid invoices', () => {
    expect(component.canMarkAsPaid(mockInvPaid)).toBeFalse();
  });

  it('markAsPaid returns early if user cancels the confirm', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    await component.markAsPaid(mockInvPending);
    expect(mockInvoices.updateInvoice).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('markAsPaid calls updateInvoice and updates local state when confirmed', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const updated: Invoice = { ...mockInvPending, payment_status: 'paid', status: InvoiceStatus.PAID };
    mockInvoices.updateInvoice.and.returnValue(of(updated));
    await component.markAsPaid(mockInvPending);
    expect(mockInvoices.updateInvoice).toHaveBeenCalledWith('INV1', { payment_status: 'paid' });
    expect(component.invoices()[0].payment_status).toBe('paid');
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('markAsPaid shows error toast when service throws', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    mockInvoices.updateInvoice.and.returnValue(throwError(() => new Error('boom')));
    await component.markAsPaid(mockInvPending);
    expect(mockToast.error).toHaveBeenCalled();
    expect(component.markingAsPaid()).toBeNull();
  });

  it('markAsPaid is blocked while another mark is in flight', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.markingAsPaid.set('INV1');
    await component.markAsPaid(mockInvPending);
    expect(mockInvoices.updateInvoice).not.toHaveBeenCalled();
    component.markingAsPaid.set(null);
  });

  it('markingAsPaid signal is null by default', () => {
    expect(component.markingAsPaid()).toBeNull();
  });

  it('zeroTotalCount counts invoices with total=0', () => {
    // mockInvPending has total: 60.5, mockInvPaid has total: 60.5. Add a zero one.
    component.invoices.set([
      { ...mockInvPending, id: 'Z1', total: 0 },
      { ...mockInvPending, id: 'Z2', total: 100 },
      { ...mockInvPaid,   id: 'Z3', total: 0 },
    ]);
    expect(component.zeroTotalCount()).toBe(2);
  });

  it('unpaidAndPastInvoiceDateCount counts unpaid invoices with past invoice_date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().slice(0, 10);

    component.invoices.set([
      // unpaid + past → counts
      { ...mockInvPending, id: 'U1', invoice_date: yesterdayIso, payment_status: 'pending' },
      // unpaid + today → does NOT count (not strictly in the past)
      { ...mockInvPending, id: 'U2', invoice_date: today,        payment_status: 'pending' },
      // unpaid + future → does NOT count
      { ...mockInvPending, id: 'U3', invoice_date: tomorrowIso, payment_status: 'pending' },
      // paid + past → does NOT count
      { ...mockInvPending, id: 'U4', invoice_date: yesterdayIso, payment_status: 'paid' },
      // cancelled + past → does NOT count
      { ...mockInvPending, id: 'U5', invoice_date: yesterdayIso, payment_status: 'cancelled' },
    ]);
    expect(component.unpaidAndPastInvoiceDateCount()).toBe(1);
  });

  it('unpaidAndPastInvoiceDateCount handles empty list', () => {
    component.invoices.set([]);
    expect(component.unpaidAndPastInvoiceDateCount()).toBe(0);
  });
});
