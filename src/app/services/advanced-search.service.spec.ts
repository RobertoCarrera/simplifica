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
      expect(result).toBe('Hello <mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should be case insensitive', () => {
      const text = 'Hello World';
      const query = 'world';
      const result = service.highlightMatches(text, query);
      expect(result).toBe('Hello <mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should handle XSS attempts by escaping HTML tags', () => {
      const text = '<script>alert(1)</script>';
      const query = 'script';
      // Current unsafe implementation would likely return: <<mark...>script</mark>>alert(1)</<mark...>script</mark>>
      // Desired safe implementation should return: &lt;<mark...>script</mark>&gt;alert(1)&lt;/<mark...>script</mark>&gt;
      // or at least NOT contain executable script tags.

      const result = service.highlightMatches(text, query);

      // We assert that the output does NOT start with <script
      // It should likely start with &lt;script or similar if properly escaped
      expect(result).not.toContain('<script');
      expect(result).toContain('&lt;');
    });

    it('should correctly handle special characters like &', () => {
      const text = 'Fish & Chips';
      const query = 'Chips';
      const result = service.highlightMatches(text, query);

      // Should escape the & to &amp;
      expect(result).toContain('Fish &amp; <mark');
      expect(result).toContain('Chips</mark>');
    });

    it('should handle XSS in the text even when query does not match tags', () => {
        const text = '<img src=x onerror=alert(1)>';
        const query = 'src';
        const result = service.highlightMatches(text, query);

        // The <img tag should be escaped
        expect(result).not.toContain('<img');
        expect(result).toContain('&lt;img');
    });

    it('should handle special characters in query', () => {
        const text = 'Use <script> tag';
        const query = '<script>';
        // text escapes to: Use &lt;script&gt; tag
        // query escapes to: &lt;script&gt;
        // Match: Use <mark...>&lt;script&gt;</mark> tag

        const result = service.highlightMatches(text, query);
        expect(result).toContain('&lt;script&gt;');
        expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">&lt;script&gt;</mark>');
    });
  });
});
