import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimelineViewComponent } from './timeline-view.component';

describe('TimelineViewComponent', () => {
  let component: TimelineViewComponent;
  let fixture: ComponentFixture<TimelineViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TimelineViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
