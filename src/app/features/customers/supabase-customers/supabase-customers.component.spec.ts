
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupabaseCustomersComponent } from './supabase-customers.component';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';
import { AddressesService } from '../../../services/addresses.service';
import { LocalitiesService } from '../../../services/localities.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { HoneypotService } from '../../../services/honeypot.service';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { AnimationService } from '../../../services/animation.service';
import { AiService } from '../../../services/ai.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { of } from 'rxjs';

describe('SupabaseCustomersComponent', () => {
  let component: SupabaseCustomersComponent;
  let fixture: ComponentFixture<SupabaseCustomersComponent>;

  const mockCustomersService = {
    customers$: of([]),
    loading$: of(false),
    loadCustomers: jasmine.createSpy('loadCustomers'),
    computeCompleteness: jasmine.createSpy('computeCompleteness').and.returnValue({ complete: true, missingFields: [] })
  };

  const mockGdprService = {
    getComplianceDashboard: jasmine.createSpy('getComplianceDashboard').and.returnValue(of({})),
    getAccessRequests: jasmine.createSpy('getAccessRequests').and.returnValue(of([]))
  };

  const mockToastService = {
    error: jasmine.createSpy('error'),
    success: jasmine.createSpy('success')
  };

  // Mock other dependencies
  const mockAddressesService = {};
  const mockLocalitiesService = {};
  const mockSidebarService = {};
  const mockHoneypotService = {};
  const mockRouter = { navigate: jasmine.createSpy('navigate') };
  const mockAuthService = { companyId: jasmine.createSpy('companyId').and.returnValue('123') };
  const mockPortalService = { listMappings: jasmine.createSpy('listMappings').and.returnValue(Promise.resolve({ data: [] })) };
  const mockAnimationService = {};
  const mockAiService = {};
  const mockDevRoleService = {};


  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupabaseCustomersComponent],
      providers: [
        { provide: SupabaseCustomersService, useValue: mockCustomersService },
        { provide: GdprComplianceService, useValue: mockGdprService },
        { provide: ToastService, useValue: mockToastService },
        { provide: AddressesService, useValue: mockAddressesService },
        { provide: LocalitiesService, useValue: mockLocalitiesService },
        { provide: SidebarStateService, useValue: mockSidebarService },
        { provide: HoneypotService, useValue: mockHoneypotService },
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ClientPortalService, useValue: mockPortalService },
        { provide: AnimationService, useValue: mockAnimationService },
        { provide: AiService, useValue: mockAiService },
        { provide: DevRoleService, useValue: mockDevRoleService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SupabaseCustomersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should sort customers correctly using name (case insensitive)', () => {
    const customerA = { id: '1', name: 'Álvaro', apellidos: 'B', email: 'a@a.com', dni: '1', created_at: '2023-01-01' } as any;
    const customerB = { id: '2', name: 'zacarias', apellidos: 'A', email: 'z@z.com', dni: '2', created_at: '2023-01-02' } as any;

    component.customers.set([customerB, customerA]); // Wrong order initially
    component.sortBy.set('name');
    component.sortOrder.set('asc');

    const sorted = component.filteredCustomers();
    expect(sorted[0].name).toBe('Álvaro');
    expect(sorted[1].name).toBe('zacarias');
  });

  it('should get display name correctly avoiding UUIDs', () => {
     const uuid = '12345678-1234-1234-1234-123456789012';
     const customer = { id: '1', name: uuid, apellidos: '', client_type: 'individual' } as any;
     expect(component.getDisplayName(customer)).toBe('Cliente importado');
  });
});
