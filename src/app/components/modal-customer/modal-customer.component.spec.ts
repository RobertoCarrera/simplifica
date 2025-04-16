import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModalCustomerComponent } from './modal-customer.component';

describe('ModalCustomerComponent', () => {
  let component: ModalCustomerComponent;
  let fixture: ComponentFixture<ModalCustomerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModalCustomerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModalCustomerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
