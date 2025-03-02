import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormNewCompanyComponent } from './form-new-company.component';

describe('FormNewCompanyComponent', () => {
  let component: FormNewCompanyComponent;
  let fixture: ComponentFixture<FormNewCompanyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormNewCompanyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormNewCompanyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
