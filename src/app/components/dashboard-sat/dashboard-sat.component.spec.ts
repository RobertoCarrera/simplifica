import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardSatComponent } from './dashboard-sat.component';

describe('DashboardSatComponent', () => {
  let component: DashboardSatComponent;
  let fixture: ComponentFixture<DashboardSatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardSatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardSatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
