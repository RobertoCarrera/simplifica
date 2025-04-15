import { TestBed } from '@angular/core/testing';
import { TicketStagesService } from './ticket-stages.service';

describe('TicketsService', () => {
  let service: TicketStagesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TicketStagesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
