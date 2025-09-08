import { TestBed } from '@angular/core/testing';

import { SupabaseServicesService } from './supabase-services.service';

describe('SupabaseServicesService', () => {
  let service: SupabaseServicesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseServicesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
