import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AiSavingsWidgetComponent } from './ai-savings-widget.component';

describe('AiSavingsWidgetComponent', () => {
  let component: AiSavingsWidgetComponent;
  let fixture: ComponentFixture<AiSavingsWidgetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiSavingsWidgetComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AiSavingsWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
