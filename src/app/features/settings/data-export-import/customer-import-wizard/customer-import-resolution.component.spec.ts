import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { CustomerImportResolutionComponent } from './customer-import-resolution.component';
import {
  ClassifiedCustomerRow,
  CustomerMatchCandidate,
  CustomerLite,
} from '../../../../services/customer-import.types';

describe('CustomerImportResolutionComponent', () => {
  let component: CustomerImportResolutionComponent;
  let fixture: ComponentFixture<CustomerImportResolutionComponent>;

  const c1: CustomerLite = {
    id: 'c-1', name: 'Marc', surname: 'Escoda', email: 'marc@x.com',
    cif_nif: null, dni: null,
  };
  const c2: CustomerLite = {
    id: 'c-2', name: 'Marc', surname: 'Escoda', email: 'marc2@x.com',
    cif_nif: null, dni: null,
  };
  const candidate: CustomerMatchCandidate = {
    client: c1, jaccard: 0.95, apellidoMatches: true, source: 'fuzzy',
  };

  function buildRow(over: Partial<ClassifiedCustomerRow>): ClassifiedCustomerRow {
    return {
      csv: {
        rowIndex: 1,
        firstName: 'Marc', surname: 'Escoda',
        email: 'marc@x.com', phone: null, cif: null, dni: null,
        clientType: 'individual', businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      },
      status: 'likely_duplicate',
      candidates: [candidate],
      invalidFields: [],
      ...over,
    } as ClassifiedCustomerRow;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerImportResolutionComponent, TranslocoTestingModule.forRoot({})],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerImportResolutionComponent);
    component = fixture.componentInstance;
  });

  it('renders one ⚠️ row card per input row, with Vincular/Crear/Saltar buttons', () => {
    component.rows = [
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1 } }),
      buildRow({
        csv: { ...buildRow({}).csv, rowIndex: 2, email: 'other@x.com' },
        candidates: [{ ...candidate, client: c2 }],
      }),
    ];
    fixture.detectChanges();
    expect(component._rows().length).toBe(2);
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('customerImport.resolution.vincular');
    expect(html).toContain('customerImport.resolution.crear');
    expect(html).toContain('customerImport.resolution.saltar');
  });

  it('clicking Vincular sets resolution.choice = link and linkedClientId', () => {
    component.rows = [buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1 } })];
    fixture.detectChanges();

    component.pickLink(component._rows()[0], candidate);

    const updated = component._rows()[0];
    expect(updated.resolution?.choice).toBe('link');
    expect(updated.resolution?.linkedClientId).toBe('c-1');
  });

  it('clicking Crear sets resolution.choice = create (no linkedClientId)', () => {
    component.rows = [buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1 } })];
    fixture.detectChanges();

    component.pickCreate(component._rows()[0]);

    const updated = component._rows()[0];
    expect(updated.resolution?.choice).toBe('create');
    expect(updated.resolution?.linkedClientId).toBeUndefined();
  });

  it('clicking Saltar sets resolution.choice = skip', () => {
    component.rows = [buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1 } })];
    fixture.detectChanges();

    component.pickSkip(component._rows()[0]);

    const updated = component._rows()[0];
    expect(updated.resolution?.choice).toBe('skip');
  });

  it('bulk checkbox is hidden when no other row shares the email (N=1 case)', () => {
    component.rows = [
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1, email: 'unique@x.com' } }),
      buildRow({
        csv: { ...buildRow({}).csv, rowIndex: 2, email: 'different@x.com' },
        candidates: [{ ...candidate, client: c2 }],
      }),
    ];
    fixture.detectChanges();
    // Row 1 has no sibling with the same email.
    expect(component.countEmailDuplicates(component._rows()[0], 1)).toBe(0);
    // The bulk checkbox should NOT be rendered for row 1.
    // We assert this via the `countEmailDuplicates` getter (the template uses `*ngIf` on it).
  });

  it('bulk decision applies the same choice to all rows sharing the email', () => {
    component.rows = [
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1, email: 'shared@x.com' } }),
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 2, email: 'shared@x.com' } }),
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 3, email: 'other@x.com' } }),
    ];
    fixture.detectChanges();

    // Confirm the duplicates count before broadcasting.
    expect(component.countEmailDuplicates(component._rows()[0], 1)).toBe(1);

    // Turn broadcast ON for row 1 and apply Vincular → c-1.
    component.setBroadcast(1, true);
    component.pickLink(component._rows()[0], candidate);

    // Both rows 1 and 2 (shared email) got the link decision.
    expect(component._rows()[0].resolution?.choice).toBe('link');
    expect(component._rows()[0].resolution?.linkedClientId).toBe('c-1');
    expect(component._rows()[1].resolution?.choice).toBe('link');
    expect(component._rows()[1].resolution?.linkedClientId).toBe('c-1');

    // Row 3 (different email) is NOT touched.
    expect(component._rows()[2].resolution).toBeUndefined();
  });
});