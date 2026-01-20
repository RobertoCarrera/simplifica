import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TourOverlayComponent } from './tour-overlay.component';
import { OnboardingService } from '../../../features/services/onboarding.service';
import { signal } from '@angular/core';

describe('TourOverlayComponent', () => {
  let component: TourOverlayComponent;
  let fixture: ComponentFixture<TourOverlayComponent>;
  let mockOnboardingService: any;

  beforeEach(async () => {
    mockOnboardingService = {
      currentTourData: signal(null),
      currentStep: signal(null),
      stepIndex: signal(0),
      isFirstStep: signal(true),
      isLastStep: signal(false),
      nextStep: jasmine.createSpy('nextStep'),
      previousStep: jasmine.createSpy('previousStep'),
      skipTour: jasmine.createSpy('skipTour')
    };

    await TestBed.configureTestingModule({
      imports: [TourOverlayComponent],
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
    const maliciousContent = '<img src=x onerror=alert(1)>Welcome';
    const safeContent = '<img src="x">Welcome'; // DOMPurify might remove onerror but keep img, or Angular might.

    mockOnboardingService.currentTourData.set({ name: 'Test Tour', steps: [] });
    mockOnboardingService.currentStep.set({
      id: 'step1',
      title: 'Step 1',
      content: maliciousContent,
      targetElement: 'body',
      position: 'center',
      showNext: true,
      showPrev: false,
      showSkip: true
    });

    fixture.detectChanges();

    const pElement = fixture.nativeElement.querySelector('p.text-gray-700');
    expect(pElement).toBeTruthy();

    // Check that onerror is not present.
    // Note: Angular's default sanitizer would also strip it, but we are adding SafeHtmlPipe
    // to be explicit and perhaps allow more rich text features than Angular default if needed,
    // or to ensure consistency.
    // However, since we are adding the pipe, we expect the output to be trusted.
    // If the pipe works, the content inside innerHTML should be the result of DOMPurify.

    const htmlContent = pElement.innerHTML;
    expect(htmlContent).not.toContain('onerror');
    expect(htmlContent).toContain('src="x"');
  });
});
