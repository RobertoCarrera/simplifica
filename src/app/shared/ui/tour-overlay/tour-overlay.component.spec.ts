import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TourOverlayComponent } from './tour-overlay.component';
import { OnboardingService } from '../../../features/services/onboarding.service';
import { SafeHtmlPipe } from '../../../core/pipes/safe-html.pipe';
import { signal } from '@angular/core';

describe('TourOverlayComponent', () => {
  let component: TourOverlayComponent;
  let fixture: ComponentFixture<TourOverlayComponent>;
  let mockOnboardingService: any;

  beforeEach(async () => {
    mockOnboardingService = {
      currentTourData: signal({
        id: 'test-tour',
        name: 'Test Tour',
        steps: [{ id: '1', title: 'Step 1', content: '<script>alert("XSS")</script>Test Content' }]
      }),
      currentStep: signal({
        id: '1',
        title: 'Step 1',
        content: '<script>alert("XSS")</script>Test Content'
      }),
      stepIndex: signal(0),
      isFirstStep: signal(true),
      isLastStep: signal(false),
      nextStep: jasmine.createSpy('nextStep'),
      previousStep: jasmine.createSpy('previousStep'),
      skipTour: jasmine.createSpy('skipTour')
    };

    await TestBed.configureTestingModule({
      imports: [TourOverlayComponent, SafeHtmlPipe],
      providers: [
        { provide: OnboardingService, useValue: mockOnboardingService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TourOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sanitize HTML content', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const contentP = compiled.querySelector('p.text-gray-700');
    expect(contentP?.innerHTML).not.toContain('<script>');
    expect(contentP?.innerHTML).toContain('Test Content');
  });
});
