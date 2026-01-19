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
      currentTourData: signal(null),
      currentStep: signal({
        id: 'test',
        title: 'Test Step',
        content: '<script>alert("XSS")</script><b>Bold Content</b>',
        targetElement: 'body',
        position: 'center',
        showNext: true,
        showPrev: false,
        showSkip: true
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

  it('should sanitize innerHTML content', () => {
    // We are mocking currentStep to return content with a script tag
    // The component template uses [innerHTML]="currentStep()!.content | safeHtml"
    // SafeHtmlPipe uses DOMPurify to remove script tags

    // We need to trigger change detection to update the view
    fixture.detectChanges();

    const pElement = fixture.nativeElement.querySelector('p');
    const innerHTML = pElement.innerHTML;

    // Check that script tag is removed
    expect(innerHTML).not.toContain('<script>');
    expect(innerHTML).not.toContain('alert("XSS")');

    // Check that safe HTML is preserved
    expect(innerHTML).toContain('<b>Bold Content</b>');
  });
});
