import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { ReconciliationComponent } from './reconciliation.component';
import { ReconciliationService, ReconciliationRow, ReconciliationSummary } from './reconciliation.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';

@Pipe({ name: 'transloco', standalone: true })
class FakeTranslocoPipe implements PipeTransform {
  transform(key: string, params?: Record<string, any>): string {
    const m: Record<string, string> = {
      'bookings.conciliation.title': 'Conciliación de reservas',
      'bookings.conciliation.subtitle': 'Reservas, presupuestos y facturas',
      'bookings.conciliation.backToBookings': 'Volver a Reservas',
      'bookings.conciliation.counters.totalBookings': 'Reservas totales',
      'bookings.conciliation.counters.withoutQuote': 'Sin presupuesto',
      'bookings.conciliation.counters.quotesDraft': 'Presupuestos en borrador',
      'bookings.conciliation.counters.sessionsWithoutInvoice': 'Sin factura',
      'bookings.conciliation.counters.invoicesDraft': 'Facturas en borrador',
      'bookings.conciliation.counters.invoicesPaid': 'Facturas pagadas',
      'bookings.conciliation.filters.all': 'Todas',
      'bookings.conciliation.filters.missingQuote': 'Sin presupuesto',
      'bookings.conciliation.filters.missingInvoice': 'Sin factura',
      'bookings.conciliation.filters.quoteDraft': 'Presupuesto en borrador',
      'bookings.conciliation.filters.quoteRejected': 'Presupuesto rechazado',
      'bookings.conciliation.filters.invoiceDraft': 'Factura en borrador',
      'bookings.conciliation.filters.invoicePending': 'Factura pendiente de pago',
      'bookings.conciliation.filters.paid': 'Pagada',
      'bookings.conciliation.filters.ok': 'Conciliadas',
      'bookings.conciliation.search.placeholder': 'Buscar por cliente, estado…',
      'bookings.conciliation.search.clear': 'Limpiar',
      'bookings.conciliation.search.showing': 'Mostrando {count} de {total}',
      'bookings.conciliation.search.noResults': 'Sin resultados para esa búsqueda.',
      'bookings.conciliation.table.headers.customer': 'Cliente',
      'bookings.conciliation.table.headers.date': 'Fecha',
      'bookings.conciliation.table.headers.bookingStatus': 'Estado reserva',
      'bookings.conciliation.table.headers.quote': 'Presupuesto',
      'bookings.conciliation.table.headers.invoice': 'Factura',
      'bookings.conciliation.table.headers.invoicePayment': 'Pago factura',
      'bookings.conciliation.table.headers.conciliation': 'Conciliación',
      'bookings.conciliation.table.empty': 'No hay reservas para mostrar.',
      'bookings.conciliation.errors.load': 'No se pudo cargar la conciliación.',
    };
    let value = m[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  }
}

describe('ReconciliationComponent', () => {
  let component: ReconciliationComponent;
  let fixture: ComponentFixture<ReconciliationComponent>;
  let mockService: jasmine.SpyObj<ReconciliationService>;
  const companyId = 'C1';

  const mockSummary: ReconciliationSummary = {
    company_id: companyId,
    total_bookings: 4,
    bookings_without_quote: 1,
    bookings_with_quote: 3,
    quotes_draft: 1,
    quotes_accepted: 2,
    quotes_rejected: 0,
    sessions_without_invoice: 1,
    invoices_draft: 1,
    invoices_issued: 0,
    invoices_paid: 1,
    paid_amount_total: 242,
  };

  const mockRows: ReconciliationRow[] = [
    { booking_id: 'B1', company_id: companyId, client_id: 'CL1', customer_name: 'Juan', start_time: '2026-01-01T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'pending', session_confirmed: false, is_past_or_confirmed: true, has_quote: false, quote_status: null, quote_total: null, has_invoice: false, invoice_status: null, invoice_payment_status: null, invoice_total: null, reconciliation_status: 'missing_quote' },
    { booking_id: 'B2', company_id: companyId, client_id: 'CL1', customer_name: 'Ana', start_time: '2026-01-02T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'paid', session_confirmed: false, is_past_or_confirmed: true, has_quote: true, quote_status: 'draft', quote_total: 110, has_invoice: false, invoice_status: null, invoice_payment_status: null, invoice_total: null, reconciliation_status: 'quote_draft' },
    { booking_id: 'B3', company_id: companyId, client_id: 'CL2', customer_name: 'Luis', start_time: '2026-01-03T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'paid', session_confirmed: false, is_past_or_confirmed: true, has_quote: true, quote_status: 'accepted', quote_total: 121, has_invoice: true, invoice_status: 'draft', invoice_payment_status: 'pending', invoice_total: 121, reconciliation_status: 'invoice_pending' },
    { booking_id: 'B4', company_id: companyId, client_id: 'CL3', customer_name: 'Marta', start_time: '2026-01-04T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'paid', session_confirmed: false, is_past_or_confirmed: true, has_quote: true, quote_status: 'accepted', quote_total: 242, has_invoice: true, invoice_status: 'issued', invoice_payment_status: 'paid', invoice_total: 242, reconciliation_status: 'paid' },
  ];

  beforeEach(async () => {
    mockService = jasmine.createSpyObj<ReconciliationService>('ReconciliationService',
      ['getSummary', 'getRows'],
    );
    mockService.getSummary.and.returnValue(Promise.resolve(mockSummary));
    mockService.getRows.and.returnValue(Promise.resolve(mockRows));

    const companyIdSignal = (): string => companyId;
    (companyIdSignal as any).set = () => {};
    const mockAuth: any = { companyId: companyIdSignal };

    await TestBed.configureTestingModule({
      imports: [ReconciliationComponent, FakeTranslocoPipe, FormsModule, RouterTestingModule],
      providers: [
        { provide: ReconciliationService, useValue: mockService },
        { provide: AuthService, useValue: mockAuth },
        { provide: SupabaseBookingsService, useValue: {
          updateBooking: () => Promise.resolve({}),
          getBookings: () => Promise.resolve([]),
          getBookingById: () => Promise.resolve({} as any),
          createBooking: () => Promise.resolve({} as any),
          createBookingWithResource: () => Promise.resolve({} as any),
          createBookingWithQuote: () => Promise.resolve({} as any),
        } as unknown as Partial<SupabaseBookingsService> },
      ],
    })
    .overrideComponent(ReconciliationComponent, {
      set: { imports: [FakeTranslocoPipe, FormsModule] },
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReconciliationComponent);
    component = fixture.componentInstance;
  });

  it('renders counters from the summary view', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('Reservas totales');
    expect(html).toContain('4');
    expect(html).toContain('Sin presupuesto');
    expect(html).toContain('Facturas pagadas');
  });

  it('clicking missing_quote chip filters rows', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    mockService.getRows.and.callFake((cid: string, status?: string) => {
      if (status === 'missing_quote') return Promise.resolve([mockRows[0]]);
      if (status === 'missing_invoice') return Promise.resolve([]);
      return Promise.resolve(mockRows);
    });
    component.setStatusFilter('missing_quote');
    await fixture.whenStable();
    expect(mockService.getRows).toHaveBeenCalledWith(companyId, 'missing_quote');
    expect(component.visibleRows().length).toBe(1);
    expect(component.visibleRows()[0].booking_id).toBe('B1');
  });

  it('empty state renders when no rows', async () => {
    mockService.getRows.and.returnValue(Promise.resolve([]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('No hay reservas');
  });

  it('error state renders when service throws', async () => {
    mockService.getSummary.and.rejectWith(new Error('boom'));
    mockService.getRows.and.rejectWith(new Error('boom'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('boom');
  });

  it('search filter narrows visible rows by customer name (case-insensitive)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('juan');
    expect(component.visibleRows().length).toBe(1);
    expect(component.visibleRows()[0].customer_name).toBe('Juan');
  });

  it('search filter matches by invoice_payment_status', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('paid');
    expect(component.visibleRows().length).toBe(1);
    expect(component.visibleRows()[0].booking_id).toBe('B4');
  });

  it('search with no matches shows noResults message', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('zzzzz-no-existe');
    expect(component.visibleRows().length).toBe(0);
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('Sin resultados');
  });

  it('clearing the search restores all rows', async () => {
    // Ensure getRows always returns the full 4-row set when no status filter
    mockService.getRows.and.callFake((cid: string, status?: string) => {
      if (status) return Promise.resolve([]);
      return Promise.resolve(mockRows);
    });
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('juan');
    expect(component.visibleRows().length).toBe(1);
    component.setSearch('');
    expect(component.visibleRows().length).toBe(4);
  });

  it('clicking missing_quote chip filters rows', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    // Mock getRows to return only missing_quote rows when filtered
    mockService.getRows.and.callFake((cid: string, status?: string) => {
      if (status === 'missing_quote') return Promise.resolve([mockRows[0]]);
      return Promise.resolve(mockRows);
    });
    component.setStatusFilter('missing_quote');
    await fixture.whenStable();
    expect(mockService.getRows).toHaveBeenCalledWith(companyId, 'missing_quote');
    expect(component.rows().length).toBe(1);
    expect(component.rows()[0].booking_id).toBe('B1');
  });

  it('empty state renders when no rows', async () => {
    mockService.getRows.and.returnValue(Promise.resolve([]));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('No hay reservas');
  });

  it('error state renders when service throws', async () => {
    mockService.getSummary.and.rejectWith(new Error('boom'));
    mockService.getRows.and.rejectWith(new Error('boom'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('boom');
  });

  it('search filter narrows visible rows by customer name (case-insensitive)', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('juan');
    expect(component.visibleRows().length).toBe(1);
    expect(component.visibleRows()[0].customer_name).toBe('Juan');
  });

  it('search filter is case-insensitive and matches partial substrings', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('LUIS');
    expect(component.visibleRows().length).toBe(1);
    expect(component.visibleRows()[0].customer_name).toBe('Luis');
  });

  it('search with no matches shows noResults message', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('zzzzz-no-existe');
    expect(component.visibleRows().length).toBe(0);
    fixture.detectChanges();
    const html = fixture.nativeElement.textContent;
    expect(html).toContain('Sin resultados');
  });

  it('clearing the search restores all rows', async () => {
    // Ensure getRows always returns the full 4-row set when no status filter
    mockService.getRows.and.callFake((cid: string, status?: string) => {
      if (status) return Promise.resolve([]);
      return Promise.resolve(mockRows);
    });
    fixture.detectChanges();
    await fixture.whenStable();
    component.setSearch('juan');
    expect(component.visibleRows().length).toBe(1);
    component.setSearch('');
    expect(component.visibleRows().length).toBe(4);
  });
});
