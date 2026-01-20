import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarActionModalComponent } from './calendar-action-modal.component';

describe('CalendarActionModalComponent', () => {
  let component: CalendarActionModalComponent;
  let fixture: ComponentFixture<CalendarActionModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarActionModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarActionModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
