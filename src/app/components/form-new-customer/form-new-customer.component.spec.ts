import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormNewCustomerComponent } from './form-new-customer.component';

describe('FormNewCustomerComponent', () => {
  let component: FormNewCustomerComponent;
  let fixture: ComponentFixture<FormNewCustomerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormNewCustomerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormNewCustomerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
