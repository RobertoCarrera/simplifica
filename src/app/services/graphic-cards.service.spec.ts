import { TestBed } from '@angular/core/testing';

import { GraphicCardsService } from './graphic-cards.service';

describe('GraphicCardsService', () => {
  let service: GraphicCardsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GraphicCardsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
