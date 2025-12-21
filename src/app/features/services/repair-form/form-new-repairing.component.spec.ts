import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormNewRepairingComponent } from './form-new-repairing.component';

describe('FormNewRepairingComponent', () => {
  let component: FormNewRepairingComponent;
  let fixture: ComponentFixture<FormNewRepairingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormNewRepairingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormNewRepairingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
