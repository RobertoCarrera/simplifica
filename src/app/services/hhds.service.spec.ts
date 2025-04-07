import { TestBed } from '@angular/core/testing';

import { HhdsService } from './hhds.service';

describe('HhdsService', () => {
  let service: HhdsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HhdsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
