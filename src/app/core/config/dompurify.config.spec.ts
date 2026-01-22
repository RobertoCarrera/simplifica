import { initializeDomPurify } from './dompurify.config';
import DOMPurify from 'dompurify';

describe('DOMPurify Configuration', () => {
  it('should add rel="noopener noreferrer" to target="_blank" links', () => {
    // Initialize the configuration (adds the hook)
    initializeDomPurify();

    const dirty = '<a href="https://example.com" target="_blank">Malicious Link</a>';
    const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] });

    // Check if rel attribute was added
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it('should handle case-insensitive target="_BLANK"', () => {
    initializeDomPurify();
    const dirty = '<a href="https://example.com" target="_BLANK">Malicious Link</a>';
    const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] });
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('should not add rel attribute to non-blank targets', () => {
    // Initialize (idempotent for this test context effectively, or additive)
    initializeDomPurify();

    const dirty = '<a href="https://example.com" target="_self">Safe Link</a>';
    const clean = DOMPurify.sanitize(dirty, { ADD_ATTR: ['target'] });

    expect(clean).not.toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_self"');
  });

  it('should work when target is missing', () => {
      initializeDomPurify();
      const dirty = '<a href="https://example.com">Normal Link</a>';
      const clean = DOMPurify.sanitize(dirty);
      expect(clean).not.toContain('rel=');
  });
});
