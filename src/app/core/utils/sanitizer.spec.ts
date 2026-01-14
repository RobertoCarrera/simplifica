import { sanitizeHtml } from './sanitizer';

describe('sanitizeHtml', () => {
  it('should sanitize scripts', () => {
    const dirty = '<script>alert(1)</script>hello';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('hello');
  });

  it('should add rel="noopener noreferrer" to target="_blank" links', () => {
    const dirty = '<a href="http://example.com" target="_blank">Link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it('should not add rel to target="_self" links', () => {
    const dirty = '<a href="http://example.com" target="_self">Link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('rel="noopener noreferrer"');
  });

  it('should not add rel to links without target', () => {
    const dirty = '<a href="http://example.com">Link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain('rel="noopener noreferrer"');
  });
});
