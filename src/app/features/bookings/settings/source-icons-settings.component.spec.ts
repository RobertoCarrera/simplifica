import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SourceIconsSettingsComponent } from './source-icons-settings.component';
import { SupabaseBookingsService, DEFAULT_ICONS, SourceKey } from '../../../services/supabase-bookings.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

describe('SourceIconsSettingsComponent', () => {
  let component: SourceIconsSettingsComponent;
  let fixture: ComponentFixture<SourceIconsSettingsComponent>;
  let mockBookingsService: {
    getBookingSourceIcons: jasmine.Spy;
  };
  let mockAuthService: { currentCompanyId: jasmine.Spy };
  let mockSbClient: { instance: jasmine.Spy };
  let mockToast: { success: jasmine.Spy; error: jasmine.Spy };

  beforeEach(async () => {
    mockBookingsService = {
      getBookingSourceIcons: jasmine.createSpy('getBookingSourceIcons').and.returnValue(Promise.resolve([])),
    };
    mockAuthService = {
      currentCompanyId: jasmine.createSpy('currentCompanyId').and.returnValue('test-company-id'),
    };
    mockSbClient = {
      instance: jasmine.createSpy('instance').and.returnValue({
        from: jasmine.createSpy('from').and.returnValue({
          upsert: jasmine.createSpy('upsert').and.returnValue(Promise.resolve({ error: null })),
        }),
      }),
    };
    mockToast = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
    };

    await TestBed.configureTestingModule({
      imports: [SourceIconsSettingsComponent],
      providers: [
        { provide: SupabaseBookingsService, useValue: mockBookingsService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseClientService, useValue: mockSbClient },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SourceIconsSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('6.5: renders 4 rows with correct defaults', () => {
    it('should render exactly 4 source rows', () => {
      const rows = component.rows;
      expect(rows.length).toBe(4);
    });

    it('should have rows for agenda, admin, professional, and docplanner', () => {
      const sources = component.rows.map(r => r.source);
      expect(sources).toContain('agenda');
      expect(sources).toContain('admin');
      expect(sources).toContain('professional');
      expect(sources).toContain('docplanner');
    });

    it('should initialize each row with correct default icon and label', () => {
      for (const row of component.rows) {
        const defaultIcon = DEFAULT_ICONS[row.source as SourceKey];
        expect(row.icon).toBe(defaultIcon.icon);
        expect(row.label).toBe(defaultIcon.label);
      }
    });

    it('should not mark any row as custom initially (no DB records)', () => {
      for (const row of component.rows) {
        expect(row.isCustom).toBe(false);
      }
    });
  });
});
