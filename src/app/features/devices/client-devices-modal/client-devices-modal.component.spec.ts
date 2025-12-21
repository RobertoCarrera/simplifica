import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientDevicesModalComponent } from './client-devices-modal.component';

describe('ClientDevicesModalComponent', () => {
  let component: ClientDevicesModalComponent;
  let fixture: ComponentFixture<ClientDevicesModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientDevicesModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ClientDevicesModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
