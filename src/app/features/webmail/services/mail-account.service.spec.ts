import { TestBed } from '@angular/core/testing';

import { MailAccountService } from './mail-account.service';

describe('MailAccountService', () => {
  let service: MailAccountService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MailAccountService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
