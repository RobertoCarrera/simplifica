import { TestBed } from '@angular/core/testing';
import { AdvancedSearchService } from './advanced-search.service';

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AdvancedSearchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('highlightMatches', () => {
    it('should highlight matching text', () => {
      const text = 'Hello World';
      const query = 'World';
      const result = service.highlightMatches(text, query);
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should escape HTML in text preventing XSS', () => {
      const text = 'Hello <img src=x onerror=alert(1)> World';
      const query = 'World';
      const result = service.highlightMatches(text, query);

      // The result should NOT contain the raw image tag
      expect(result).not.toContain('<img src=x onerror=alert(1)>');

      // The result SHOULD contain escaped HTML
      expect(result).toContain('&lt;img src=x onerror=alert(1)&gt;');

      // And the match should still be highlighted
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should handle special characters in query', () => {
        const text = 'Hello (World)';
        const query = '(World)';
        const result = service.highlightMatches(text, query);
        expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">(World)</mark>');
    });
  });
});
