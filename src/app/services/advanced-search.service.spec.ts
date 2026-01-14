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
    it('should escape HTML in text when no query', () => {
      const text = '<b>Bold</b>';
      const result = service.highlightMatches(text, '');
      expect(result).toBe('&lt;b&gt;Bold&lt;/b&gt;');
    });

    it('should highlight matches and escape HTML', () => {
      const text = 'Hello <script>';
      const query = 'script';
      // Expected: Hello &lt;<mark ...>script</mark>&gt;
      const result = service.highlightMatches(text, query);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">script</mark>');
    });

    it('should handle case insensitivity', () => {
      const text = 'Hello world';
      const query = 'WORLD';
      const result = service.highlightMatches(text, query);
      expect(result).toContain('world</mark>');
    });

    it('should handle special regex characters in query', () => {
      const text = '(Test)';
      const query = '(';
      const result = service.highlightMatches(text, query);
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">(</mark>');
    });

    it('should handle malicious injection in matched text', () => {
       const text = '<img src=x onerror=alert(1)>';
       const query = 'img';
       const result = service.highlightMatches(text, query);
       // Should be &lt;<mark>img</mark> src=x onerror=alert(1)&gt;
       // NOT <mark>img</mark> src=x ...
       expect(result).toContain('&lt;');
       expect(result).toContain('&gt;');
       expect(result).not.toContain('<img');
    });
  });
});
