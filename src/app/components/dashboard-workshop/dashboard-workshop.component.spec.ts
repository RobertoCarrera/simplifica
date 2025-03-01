import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DashboardWorkshopComponent } from './dashboard-workshop.component';

describe('DashboardWorkshopComponent', () => {
  let component: DashboardWorkshopComponent;
  let fixture: ComponentFixture<DashboardWorkshopComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardWorkshopComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardWorkshopComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
