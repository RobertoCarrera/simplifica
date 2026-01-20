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
    it('should highlight matches in plain text', () => {
      const text = 'Hello World';
      const query = 'World';
      const result = service.highlightMatches(text, query);
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should escape HTML tags in text to prevent HTML injection', () => {
      const text = '<h1>Title</h1>';
      const query = 'Title';
      const result = service.highlightMatches(text, query);

      // We expect the HTML tags to be escaped
      expect(result).toContain('&lt;h1&gt;');
      expect(result).toContain('&lt;/h1&gt;');

      // And the match to be highlighted
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">Title</mark>');
    });

    it('should escape HTML tags even when they match the query', () => {
      const text = 'Message <script>';
      const query = '<script>';
      const result = service.highlightMatches(text, query);

      // The match itself should be escaped inside the mark tag
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">&lt;script&gt;</mark>');
    });

    it('should handle special characters in query', () => {
      const text = 'Me & You';
      const query = '&';
      const result = service.highlightMatches(text, query);

      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">&amp;</mark>');
    });
  });
});
