import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupabaseCustomersComponent } from './supabase-customers.component';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { of, BehaviorSubject } from 'rxjs';
import { Customer } from '../../../models/customer';
import { ChangeDetectorRef, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastService } from '../../../services/toast.service';
import { GdprComplianceService } from '../../../services/gdpr-compliance.service';
import { AnimationService } from '../../../services/animation.service';
import { AddressesService } from '../../../services/addresses.service';
import { LocalitiesService } from '../../../services/localities.service';
import { HoneypotService } from '../../../services/honeypot.service';
import { AiService } from '../../../services/ai.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService } from '../../../services/auth.service';
import { ClientPortalService } from '../../../services/client-portal.service';
import { Overlay } from '@angular/cdk/overlay';

describe('SupabaseCustomersComponent Sorting', () => {
  let component: SupabaseCustomersComponent;
  let fixture: ComponentFixture<SupabaseCustomersComponent>;
  let mockCustomersService: any;

  const mockCustomers: Customer[] = [
    { id: '1', name: 'Zack', apellidos: 'Zackson', created_at: '2023-01-01', email: 'z@test.com', phone: '', dni: '', client_type: 'individual', usuario_id: 'u1' } as Customer,
    { id: '2', name: 'Aaron', apellidos: 'Aaronson', created_at: '2023-01-02', email: 'a@test.com', phone: '', dni: '', client_type: 'individual', usuario_id: 'u1' } as Customer,
    { id: '3', name: 'Álvaro', apellidos: 'Álvarez', created_at: '2023-01-03', email: 'al@test.com', phone: '', dni: '', client_type: 'individual', usuario_id: 'u1' } as Customer,
  ];

  beforeEach(async () => {
    mockCustomersService = {
      customers$: new BehaviorSubject<Customer[]>(mockCustomers),
      loading$: new BehaviorSubject<boolean>(false),
      loadCustomers: jasmine.createSpy('loadCustomers'),
      computeCompleteness: (c: Customer) => ({ complete: true, missingFields: [] }),
      getCustomers: () => of([]),
      customers: jasmine.createSpy('customers').and.returnValue(mockCustomers)
    };

    const mockRouter = { navigate: jasmine.createSpy('navigate') };
    const mockAuthService = { companyId: () => 'company1', currentUser: () => ({ id: 'user1' }) };
    const mockPortalService = { listMappings: () => Promise.resolve({ data: [] }) };
    const mockGdprService = { getComplianceDashboard: () => of({}), getAccessRequests: () => of([]) };

    await TestBed.configureTestingModule({
      imports: [SupabaseCustomersComponent],
      providers: [
        { provide: SupabaseCustomersService, useValue: mockCustomersService },
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ClientPortalService, useValue: mockPortalService },
        { provide: GdprComplianceService, useValue: mockGdprService },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        { provide: AnimationService, useValue: {} },
        { provide: AddressesService, useValue: {} },
        { provide: LocalitiesService, useValue: {} },
        { provide: HoneypotService, useValue: {} },
        { provide: AiService, useValue: {} },
        { provide: SidebarStateService, useValue: {} },
        { provide: DevRoleService, useValue: { isDev: () => false } },
        { provide: Overlay, useValue: { position: () => ({ global: () => ({}) }), create: () => ({ attach: () => {}, dispose: () => {} }) } },
        { provide: ViewContainerRef, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SupabaseCustomersComponent);
    component = fixture.componentInstance;

    component.customers.set(mockCustomers);
    fixture.detectChanges();
  });

  it('should sort customers correctly', () => {
    component.sortBy.set('name');
    component.sortOrder.set('asc');
    const sorted = component.filteredCustomers();

    // We expect correct Spanish sorting eventually: Aaron, Álvaro, Zack
    // But verify what happens now.
    // If standard sort (ASCII based on lower case):
    // Aaron (a) < Zack (z) < Álvaro (á)

    // We will verify the names order
    const names = sorted.map(c => c.name);

    // Expect correct Spanish sorting: Aaron, Álvaro, Zack
    // (Standard ASCII sort would be Aaron, Zack, Álvaro because 'Z' < 'Á')
    expect(names).toEqual(['Aaron', 'Álvaro', 'Zack']);
  });
});
