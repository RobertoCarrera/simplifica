import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WaitlistToggleComponent, WaitlistToggleState } from './waitlist-toggle.component';

describe('WaitlistToggleComponent', () => {
  let component: WaitlistToggleComponent;
  let fixture: ComponentFixture<WaitlistToggleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WaitlistToggleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(WaitlistToggleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Default state
  // ─────────────────────────────────────────────────────────────────────────

  it('should have default localState with enable_waitlist=false', () => {
    expect(component.localState().enable_waitlist).toBeFalse();
    expect(component.localState().active_mode_enabled).toBeTrue();
    expect(component.localState().passive_mode_enabled).toBeTrue();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ngOnChanges — syncs input state to localState
  // ─────────────────────────────────────────────────────────────────────────

  describe('ngOnChanges()', () => {
    it('should update localState when state @Input changes', () => {
      const newState: WaitlistToggleState = {
        enable_waitlist: true,
        active_mode_enabled: false,
        passive_mode_enabled: true,
      };

      component.state = newState;
      component.ngOnChanges({
        state: {
          currentValue: newState,
          previousValue: component.localState(),
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.localState().enable_waitlist).toBeTrue();
      expect(component.localState().active_mode_enabled).toBeFalse();
      expect(component.localState().passive_mode_enabled).toBeTrue();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // toggle() — emits stateChange
  // ─────────────────────────────────────────────────────────────────────────

  describe('toggle()', () => {
    it('should update localState when enable_waitlist is toggled', () => {
      component.toggle('enable_waitlist', true);

      expect(component.localState().enable_waitlist).toBeTrue();
    });

    it('should update localState when active_mode_enabled is toggled off', () => {
      component.toggle('active_mode_enabled', false);

      expect(component.localState().active_mode_enabled).toBeFalse();
    });

    it('should emit stateChange with updated state on toggle', () => {
      const emittedStates: WaitlistToggleState[] = [];
      component.stateChange.subscribe((s) => emittedStates.push(s));

      component.toggle('enable_waitlist', true);

      expect(emittedStates.length).toBe(1);
      expect(emittedStates[0].enable_waitlist).toBeTrue();
    });

    it('should emit complete state object (not just changed field) on toggle', () => {
      const initialState: WaitlistToggleState = {
        enable_waitlist: true,
        active_mode_enabled: true,
        passive_mode_enabled: true,
      };
      component.state = initialState;
      component.ngOnChanges({
        state: {
          currentValue: initialState,
          previousValue: null,
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      const emitted: WaitlistToggleState[] = [];
      component.stateChange.subscribe((s) => emitted.push(s));

      component.toggle('passive_mode_enabled', false);

      expect(emitted[0]).toEqual({
        enable_waitlist: true,
        active_mode_enabled: true,
        passive_mode_enabled: false,
      });
    });

    it('should NOT mutate the input state — should use a new object', () => {
      const originalState: WaitlistToggleState = {
        enable_waitlist: false,
        active_mode_enabled: true,
        passive_mode_enabled: true,
      };
      component.state = originalState;
      component.ngOnChanges({
        state: {
          currentValue: originalState,
          previousValue: null,
          firstChange: true,
          isFirstChange: () => true,
        },
      });

      component.toggle('enable_waitlist', true);

      // Original input object should be unchanged
      expect(originalState.enable_waitlist).toBeFalse();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('should not show sub-checkboxes when enable_waitlist=false', () => {
      component.toggle('enable_waitlist', false);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      // Active/passive mode section only appears when enable_waitlist is true
      const subModeElements = compiled.querySelectorAll('.fa-bolt, .fa-bell');
      expect(subModeElements.length).toBe(0);
    });

    it('should show active and passive sub-checkboxes when enable_waitlist=true', () => {
      component.toggle('enable_waitlist', true);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const activeBolt = compiled.querySelector('.fa-bolt');
      const passiveBell = compiled.querySelector('.fa-bell');
      expect(activeBolt).toBeTruthy();
      expect(passiveBell).toBeTruthy();
    });
  });
});
