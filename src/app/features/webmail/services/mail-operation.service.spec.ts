import { TestBed } from '@angular/core/testing';

import { MailOperationService } from './mail-operation.service';

describe('MailOperationService', () => {
  let service: MailOperationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MailOperationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
