import { TestBed } from '@angular/core/testing';
import { AdvancedSearchService } from './advanced-search.service';

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AdvancedSearchService]
    });
    service = TestBed.inject(AdvancedSearchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('highlightMatches', () => {
    it('should return original text if query is empty', () => {
      const text = 'Hello World';
      const result = service.highlightMatches(text, '');
      // Expect escaped text because we treat input as plain text
      expect(result).toBe('Hello World'); // Wait, if I escape everything, it should be 'Hello World' (no special chars)
    });

    it('should highlight matches case-insensitively', () => {
      const text = 'Hello World';
      const query = 'world';
      const result = service.highlightMatches(text, query);
      expect(result).toBe('Hello <mark class="bg-yellow-200 text-yellow-800 px-1 rounded">World</mark>');
    });

    it('should escape HTML in text (XSS prevention)', () => {
      const text = 'Hello <script>alert(1)</script>';
      const query = 'script';
      const result = service.highlightMatches(text, query);
      // The tags < and > should be escaped. Matches should be highlighted.
      // Expected: Hello &lt;<mark...>script</mark>&gt;alert(1)&lt;/<mark...>script</mark>&gt;
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">script</mark>');
      // Ensure no raw <script> tag exists (except inside the mark text which is NOT interpreted as tag because it is wrapped in mark?)
      // Wait, if result contains <mark>script</mark>, the browser sees a mark tag.
      // The content of mark is "script".
      // The surrounding text is "&lt;" and "&gt;".
      // So it renders as: Hello <script> (highlighted script) ...
    });

    it('should escape HTML even if no match found', () => {
        const text = '<b>Bold</b>';
        const query = 'xyz'; // no match
        const result = service.highlightMatches(text, query);
        expect(result).toBe('&lt;b&gt;Bold&lt;/b&gt;');
    });

    it('should handle special regex characters in query', () => {
        const text = 'Do you like C++?';
        const query = '++';
        const result = service.highlightMatches(text, query);
        expect(result).toContain('<mark class="bg-yellow-200 text-yellow-800 px-1 rounded">++</mark>');
    });
  });
});
