import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CustomerImportWizardComponent } from './customer-import-wizard.component';
import { CustomerImportDryRunComponent } from './customer-import-dry-run.component';
import { CustomerImportResolutionComponent } from './customer-import-resolution.component';
import { CustomerImportSummaryComponent } from './customer-import-summary.component';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import {
  ClassifiedCustomerRow,
  CustomerCsvRow,
  CustomerLite,
} from '../../../../services/customer-import.types';

describe('CustomerImportWizardComponent', () => {
  let component: CustomerImportWizardComponent;
  let fixture: ComponentFixture<CustomerImportWizardComponent>;
  let customersSpy: jasmine.SpyObj<SupabaseCustomersService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const csvHeaders = ['Nombre', 'Apellidos', 'Email', 'Tipo'];
  const csvRows: string[][] = [
    ['Marc', 'Escoda', 'marc@x.com', 'individual'],
    ['Marta', 'Calero', 'marta@y.com', 'individual'],
  ];

  function buildClassified(over: Partial<ClassifiedCustomerRow>): ClassifiedCustomerRow {
    return {
      csv: {
        rowIndex: 1, firstName: 'Marc', surname: 'Escoda', email: 'marc@x.com',
        phone: null, cif: null, dni: null, clientType: 'individual',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: { firstName: 'Marc', surname: 'Escoda' },
      },
      status: 'valid', candidates: [], invalidFields: [],
      ...over,
    } as ClassifiedCustomerRow;
  }

  beforeEach(async () => {
    customersSpy = jasmine.createSpyObj('SupabaseCustomersService', [
      'fetchClientsForMatcher', 'classifyAllCustomerRows', 'classifyCustomerRow',
      'buildCustomersForInsert', 'importCustomersWizard',
    ]);
    // Default: no existing clients, classify returns valid rows.
    customersSpy.fetchClientsForMatcher.and.returnValue(Promise.resolve([] as CustomerLite[]));
    customersSpy.classifyAllCustomerRows.and.callFake((rows: CustomerCsvRow[]) =>
      rows.map((r) => ({
        csv: r, status: 'valid', candidates: [], invalidFields: [],
      } as ClassifiedCustomerRow)),
    );
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info']);

    await TestBed.configureTestingModule({
      imports: [
        CustomerImportWizardComponent,
        CustomerImportDryRunComponent,
        CustomerImportResolutionComponent,
        CustomerImportSummaryComponent,
        TranslocoTestingModule.forRoot({}),
      ],
      providers: [
        { provide: SupabaseCustomersService, useValue: customersSpy },
        { provide: AuthService, useValue: { companyId: () => 'company-1' } },
        { provide: ToastService, useValue: toastSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerImportWizardComponent);
    component = fixture.componentInstance;
    component.csvHeaders = csvHeaders;
    component.csvRows = csvRows;
  });

  it('initial render shows the dry-run view after init resolves', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.step()).toBe('dry-run');
    expect(component.classifiedRows().length).toBe(2);
  }));

  it('dry-run Next with no ⚠️ rows skips resolution and goes to preview', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.step()).toBe('dry-run');
    component.onDryRunNext();
    expect(component.step()).toBe('preview');
  }));

  it('dry-run Next with ⚠️ rows goes to resolution', fakeAsync(() => {
    // Override classifyAllCustomerRows to mark one row as likely_duplicate.
    customersSpy.classifyAllCustomerRows.and.callFake((rows: CustomerCsvRow[]) =>
      rows.map((r, i) => ({
        csv: r,
        status: i === 0 ? 'likely_duplicate' : 'valid',
        candidates: i === 0 ? [{ client: { id: 'c-1', name: 'Marc', surname: 'Escoda', email: 'marc@x.com', cif_nif: null, dni: null }, jaccard: 0.9, apellidoMatches: true, source: 'fuzzy' }] : [],
        invalidFields: [],
      } as ClassifiedCustomerRow)),
    );

    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.step()).toBe('dry-run');
    component.onDryRunNext();
    expect(component.step()).toBe('resolution');
  }));

  it('clicking cancel at the dry-run step emits closed', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    spyOn(component.closed, 'emit');
    component.cancel();
    expect(component.closed.emit).toHaveBeenCalled();
  }));

  it('error during classification transitions to error state', fakeAsync(() => {
    customersSpy.classifyAllCustomerRows.and.throwError('boom');
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.step()).toBe('error');
    expect(component.errorMessage()).toContain('boom');
  }));
});