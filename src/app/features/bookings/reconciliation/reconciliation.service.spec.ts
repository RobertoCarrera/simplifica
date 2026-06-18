import { TestBed } from '@angular/core/testing';
import { ReconciliationService, ReconciliationStatus, ReconciliationRow, ReconciliationSummary } from './reconciliation.service';
import { SimpleSupabaseService } from '../../../services/simple-supabase.service';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockFrom: jasmine.Spy;
  let mockChain: any;

  const mockSummary: ReconciliationSummary = {
    company_id: 'C1',
    total_bookings: 3,
    bookings_without_quote: 1,
    bookings_with_quote: 2,
    quotes_draft: 1,
    quotes_accepted: 1,
    quotes_rejected: 0,
    sessions_without_invoice: 0,
    invoices_draft: 0,
    invoices_issued: 0,
    invoices_paid: 0,
    paid_amount_total: 0,
  };

  const mockRows: ReconciliationRow[] = [
    { booking_id: 'B1', company_id: 'C1', client_id: 'CL1', customer_name: 'Juan', start_time: '2026-01-01T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'pending', session_confirmed: false, is_past_or_confirmed: true, has_quote: false, quote_status: null, quote_total: null, has_invoice: false, invoice_status: null, invoice_payment_status: null, invoice_total: null, reconciliation_status: 'missing_quote' },
    { booking_id: 'B2', company_id: 'C1', client_id: 'CL1', customer_name: 'Ana',  start_time: '2026-01-02T10:00:00Z', booking_status: 'confirmed', booking_payment_status: 'paid',    session_confirmed: false, is_past_or_confirmed: true, has_quote: true,  quote_status: 'draft',    quote_total: 110, has_invoice: false, invoice_status: null, invoice_payment_status: null, invoice_total: null, reconciliation_status: 'quote_draft' },
  ];

  function setupChain(result: { data: any; error: any }): any {
    const chain: any = {};
    chain.select = jasmine.createSpy('select').and.returnValue(chain);
    chain.eq = jasmine.createSpy('eq').and.returnValue(chain);
    chain.order = jasmine.createSpy('order').and.returnValue(chain);
    chain.maybeSingle = jasmine.createSpy('maybeSingle').and.callFake(() => Promise.resolve(result));
    // make the chain awaitable as a thenable for `.then` access
    chain.then = (resolve: any) => Promise.resolve(result).then(resolve);
    chain.catch = (reject: any) => Promise.resolve(result).catch(reject);
    return chain;
  }

  beforeEach(() => {
    mockChain = setupChain({ data: mockSummary, error: null });
    const rowsChain = setupChain({ data: mockRows, error: null });
    mockFrom = jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'v_reconciliation_summary') return mockChain;
      if (table === 'v_booking_reconciliation') return rowsChain;
      return mockChain;
    });
    const mockSupabase = { getClient: () => ({ from: mockFrom }) };
    TestBed.configureTestingModule({
      providers: [
        ReconciliationService,
        { provide: SimpleSupabaseService, useValue: mockSupabase },
      ],
    });
    service = TestBed.inject(ReconciliationService);
  });

  it('getSummary returns the summary shape', async () => {
    const s = await service.getSummary('C1');
    expect(s.company_id).toBe('C1');
    expect(s.total_bookings).toBe(3);
    expect(s.bookings_without_quote).toBe(1);
    expect(s.quotes_draft).toBe(1);
    expect(mockFrom).toHaveBeenCalledWith('v_reconciliation_summary');
  });

  it('getRows returns the row shape', async () => {
    const rows = await service.getRows('C1');
    expect(rows.length).toBe(2);
    expect(rows[0].reconciliation_status).toBe('missing_quote');
    expect(mockFrom).toHaveBeenCalledWith('v_booking_reconciliation');
  });

  it('getRows applies status filter when provided', async () => {
    const localChain = setupChain({ data: [mockRows[1]], error: null });
    mockFrom.and.callFake(() => localChain);
    await service.getRows('C1', 'quote_draft');
    expect(localChain.eq).toHaveBeenCalledWith('company_id', 'C1');
    expect(localChain.eq).toHaveBeenCalledWith('reconciliation_status', 'quote_draft');
  });

  it('getRows without status does not filter by reconciliation_status', async () => {
    const localChain = setupChain({ data: mockRows, error: null });
    mockFrom.and.callFake(() => localChain);
    await service.getRows('C1');
    const eqCalls = localChain.eq.calls.allArgs();
    const filterCalls = eqCalls.filter(([col]: any[]) => col === 'reconciliation_status');
    expect(filterCalls.length).toBe(0);
  });
});
