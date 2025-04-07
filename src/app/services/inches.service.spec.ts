import { TestBed } from '@angular/core/testing';

import { InchesService } from './inches.service';

describe('InchesService', () => {
  let service: InchesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InchesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
