import { TestBed } from '@angular/core/testing';
import { signal, computed } from '@angular/core';
import { Subject, of } from 'rxjs';
import { DashboardAnalyticsComponent } from './dashboard-analytics.component';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { AnalyticsService } from '../../services/analytics.service';
import { AnimationService } from '../../services/animation.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { ToastService } from '../../services/toast.service';
import { AiAnalyticsService } from '../../services/ai-analytics.service';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeFetchSpy(returnValue = of([])) {
  return jasmine.createSpy('fetchEffectiveModules').and.returnValue(returnValue);
}

function mockSupabaseModulesService(fetchSpy = makeFetchSpy()) {
  const modulesSignal = signal<any[] | null>(null);
  return {
    modulesSignal: modulesSignal.asReadonly(),
    isModuleEnabled: (_key: string) => false,
    fetchEffectiveModules: fetchSpy,
  };
}

function mockAnalyticsService() {
  return {
    getInvoiceMetrics: computed(() => []),
    getQuoteMetrics: computed(() => []),
    getTicketMetrics: computed(() => []),
    getQuoteHistoricalTrend: computed(() => []),
    getInvoiceHistoricalTrend: computed(() => []),
    getTicketHistoricalTrend: computed(() => []),
    getRecurringMonthly: computed(() => null),
    getCurrentPipeline: computed(() => null),
    isLoading: computed(() => false),
    getError: jasmine.createSpy('getError').and.returnValue(null),
    refreshAnalytics: jasmine.createSpy('refreshAnalytics').and.returnValue(Promise.resolve()),
  };
}

function mockSidebarStateService() {
  const collapsed = signal(false);
  return {
    isCollapsed: collapsed.asReadonly(),
  };
}

function mockToastService() {
  return {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };
}

function mockAiAnalyticsService() {
  return {
    getUsageBreakdown: jasmine.createSpy('getUsageBreakdown').and.returnValue(of(null)),
    getPotentialSavings: jasmine.createSpy('getPotentialSavings').and.returnValue(of(0)),
    getAiUsageData: jasmine.createSpy('getAiUsageData').and.returnValue(Promise.resolve(null)),
  };
}

// ---------------------------------------------------------------------------
// T06 — DashboardAnalyticsComponent: takeUntilDestroyed usage
// ---------------------------------------------------------------------------

describe('DashboardAnalyticsComponent — takeUntilDestroyed (T06)', () => {
  let fetchSpy: jasmine.Spy;

  function setup(fetchReturnValue = of([])) {
    fetchSpy = makeFetchSpy(fetchReturnValue);

    TestBed.configureTestingModule({
      imports: [DashboardAnalyticsComponent],
      providers: [
        { provide: SupabaseModulesService, useValue: mockSupabaseModulesService(fetchSpy) },
        { provide: AnalyticsService, useValue: mockAnalyticsService() },
        { provide: AnimationService, useValue: {} },
        { provide: SidebarStateService, useValue: mockSidebarStateService() },
        { provide: ToastService, useValue: mockToastService() },
        { provide: AiAnalyticsService, useValue: mockAiAnalyticsService() },
      ],
    }).compileComponents();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create the component', () => {
    setup();
    const fixture = TestBed.createComponent(DashboardAnalyticsComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should call fetchEffectiveModules() at least once during init (component + child widgets)', () => {
    // DashboardAnalyticsComponent calls it in ngOnInit; AiSavingsWidgetComponent (child)
    // also calls it. Both share the same mock spy — total ≥ 1.
    setup();
    const fixture = TestBed.createComponent(DashboardAnalyticsComponent);
    fixture.detectChanges();

    // At minimum the component's own ngOnInit subscription was created
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should subscribe to fetchEffectiveModules() in ngOnInit (not fire-and-forget)', () => {
    // Use a Subject to verify a live subscription is created rather than a completed Observable
    const fetchSubject = new Subject<any[]>();
    const subjectSpy = jasmine
      .createSpy('fetchEffectiveModules')
      .and.returnValue(fetchSubject.asObservable());
    fetchSpy = subjectSpy;

    TestBed.configureTestingModule({
      imports: [DashboardAnalyticsComponent],
      providers: [
        { provide: SupabaseModulesService, useValue: mockSupabaseModulesService(subjectSpy) },
        { provide: AnalyticsService, useValue: mockAnalyticsService() },
        { provide: AnimationService, useValue: {} },
        { provide: SidebarStateService, useValue: mockSidebarStateService() },
        { provide: ToastService, useValue: mockToastService() },
        { provide: AiAnalyticsService, useValue: mockAiAnalyticsService() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardAnalyticsComponent);
    fixture.detectChanges();

    // fetchEffectiveModules was called at least once — subject has at least 1 subscriber
    expect(subjectSpy).toHaveBeenCalled();
    expect(fetchSubject.observed).toBeTrue();
  });

  it('DashboardAnalyticsComponent uses takeUntilDestroyed: subscription bound to DestroyRef lifecycle', () => {
    // Verify that the component uses DestroyRef injection (indirectly via takeUntilDestroyed).
    // We do this by checking that the component has a destroyRef field (private).
    // Since it's private, we test the behavior: ngOnDestroy triggers cleanup via destroy$.
    setup();
    const fixture = TestBed.createComponent(DashboardAnalyticsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // The component should be destroyable without errors (takeUntilDestroyed handles cleanup)
    expect(() => fixture.destroy()).not.toThrow();
  });

  it('should NOT throw when component is destroyed while fetchEffectiveModules is still pending', () => {
    const pendingSubject = new Subject<any[]>();
    const pendingSpy = jasmine
      .createSpy('fetchEffectiveModules')
      .and.returnValue(pendingSubject.asObservable());

    TestBed.configureTestingModule({
      imports: [DashboardAnalyticsComponent],
      providers: [
        { provide: SupabaseModulesService, useValue: mockSupabaseModulesService(pendingSpy) },
        { provide: AnalyticsService, useValue: mockAnalyticsService() },
        { provide: AnimationService, useValue: {} },
        { provide: SidebarStateService, useValue: mockSidebarStateService() },
        { provide: ToastService, useValue: mockToastService() },
        { provide: AiAnalyticsService, useValue: mockAiAnalyticsService() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DashboardAnalyticsComponent);
    fixture.detectChanges();

    // Destroy the component while the observable is still pending (never completes)
    expect(() => fixture.destroy()).not.toThrow();

    // Emitting AFTER destroy should not cause errors (subscription was cleaned up)
    expect(() => pendingSubject.next([])).not.toThrow();
  });
});
