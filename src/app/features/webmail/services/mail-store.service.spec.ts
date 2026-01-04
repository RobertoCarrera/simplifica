import { TestBed } from '@angular/core/testing';

import { MailStoreService } from './mail-store.service';

describe('MailStoreService', () => {
  let service: MailStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MailStoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
