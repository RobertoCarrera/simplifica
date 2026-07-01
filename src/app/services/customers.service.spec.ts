import { TestBed } from '@angular/core/testing';

import { CustomersService } from './customers.service';
import { SupabaseClientService } from './supabase-client.service';

describe('CustomersService', () => {
  let service: CustomersService;

  beforeEach(() => {
    // SupabaseClientService is injected by CustomersService.getCustomer.
    // The existing spec only verifies that the service can be constructed,
    // so a noop stub is enough — no real Supabase calls are made.
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseClientService,
          useValue: { instance: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) } },
        },
      ],
    });
    service = TestBed.inject(CustomersService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});