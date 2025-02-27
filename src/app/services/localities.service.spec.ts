import { TestBed } from '@angular/core/testing';

import { LocalitiesService } from './localities.service';

describe('LocalitiesService', () => {
  let service: LocalitiesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LocalitiesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
