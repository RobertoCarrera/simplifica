import DOMPurify from 'dompurify';

// Configure the hook once to avoid duplicates if called repeatedly
// This ensures that any link with target="_blank" also has rel="noopener noreferrer"
// to prevent Reverse Tabnabbing attacks.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Sanitizes HTML content using DOMPurify with secure defaults.
 *
 * @param html The HTML string to sanitize.
 * @param config Optional DOMPurify configuration to override defaults.
 * @returns The sanitized HTML string.
 */
export function sanitizeHtml(html: string, config: any = {}): string {
  const defaultConfig: any = {
    // Allow target attribute for links (safe because of the hook above)
    ADD_ATTR: ['target'],
    ...config
  };

  // Force cast to unknown then string to handle TrustedHTML type mismatch
  return DOMPurify.sanitize(html, defaultConfig) as unknown as string;
}
