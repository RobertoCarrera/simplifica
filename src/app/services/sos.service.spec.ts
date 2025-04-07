import { TestBed } from '@angular/core/testing';

import { SosService } from './sos.service';

describe('SosService', () => {
  let service: SosService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SosService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
