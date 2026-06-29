import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { CustomerImportDryRunComponent } from './customer-import-dry-run.component';
import { ClassifiedCustomerRow } from '../../../../services/customer-import.types';

describe('CustomerImportDryRunComponent', () => {
  let component: CustomerImportDryRunComponent;
  let fixture: ComponentFixture<CustomerImportDryRunComponent>;

  function buildRow(over: Partial<ClassifiedCustomerRow>): ClassifiedCustomerRow {
    return {
      csv: {
        rowIndex: 1,
        firstName: 'Marc',
        surname: 'Escoda',
        email: 'marc@x.com',
        phone: null,
        cif: null,
        dni: null,
        clientType: 'individual',
        businessName: null,
        tradeName: null,
        legalRepresentativeName: null,
        legalRepresentativeDni: null,
        address: null,
        raw: {},
      },
      status: 'valid',
      candidates: [],
      invalidFields: [],
      ...over,
    } as ClassifiedCustomerRow;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerImportDryRunComponent, TranslocoTestingModule.forRoot({})],
    }).compileComponents();

    fixture = TestBed.createComponent(CustomerImportDryRunComponent);
    component = fixture.componentInstance;
  });

  it('renders the live counts (valid / duplicate / invalid / alreadyExists) from the input', () => {
    component.rows = [
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 1 }, status: 'valid' }),
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 2 }, status: 'likely_duplicate' }),
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 3 }, status: 'invalid', invalidFields: ['firstName'] }),
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 4 }, status: 'alreadyExists' }),
    ];
    fixture.detectChanges();
    expect(component.validCount()).toBe(1);
    expect(component.duplicateCount()).toBe(1);
    expect(component.invalidCount()).toBe(1);
    expect(component.alreadyExistsCount()).toBe(1);
    expect(component.totalCount()).toBe(4);
  });

  it('inline edit on an invalid row updates the row and emits rowsUpdated', () => {
    component.rows = [
      buildRow({
        csv: { ...buildRow({}).csv, rowIndex: 5, firstName: null, surname: null },
        status: 'invalid',
        invalidFields: ['firstName', 'surname'],
      }),
    ];
    fixture.detectChanges();
    spyOn(component.rowsUpdated, 'emit');

    component.onFieldChanged(5, 'firstName', 'Marc');
    component.onFieldChanged(5, 'surname', 'Escoda');

    expect(component.rowsUpdated.emit).toHaveBeenCalled();
    const updated = component._rows()[0];
    expect(updated.csv.firstName).toBe('Marc');
    expect(updated.csv.surname).toBe('Escoda');
  });

  it('clicking Saltar sets resolution.choice = skip and emits rowsUpdated', () => {
    component.rows = [
      buildRow({ csv: { ...buildRow({}).csv, rowIndex: 7 }, status: 'valid' }),
    ];
    fixture.detectChanges();
    spyOn(component.rowsUpdated, 'emit');

    component.skipRow(component._rows()[0]);

    expect(component.rowsUpdated.emit).toHaveBeenCalled();
    const updated = component._rows()[0];
    expect(updated.resolution?.choice).toBe('skip');
  });

  it('shows the list of invalidFields for invalid rows in the template', () => {
    component.rows = [
      buildRow({
        csv: { ...buildRow({}).csv, rowIndex: 9 },
        status: 'invalid',
        invalidFields: ['firstName', 'clientType'],
      }),
    ];
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('firstName');
    expect(html).toContain('clientType');
  });

  it('clicking Continuar emits next', () => {
    spyOn(component.next, 'emit');
    component.onContinue();
    expect(component.next.emit).toHaveBeenCalled();
  });

  it('clicking Back emits back', () => {
    spyOn(component.back, 'emit');
    component.onBack();
    expect(component.back.emit).toHaveBeenCalled();
  });
});