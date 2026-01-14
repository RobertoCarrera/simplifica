import DOMPurify from 'dompurify';

let hookAdded = false;

/**
 * Adds security hooks to DOMPurify.
 * Currently adds 'rel="noopener noreferrer"' to links with target="_blank"
 * to prevent reverse tabnabbing attacks.
 */
function addSecurityHooks() {
  if (hookAdded) return;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  hookAdded = true;
}

/**
 * Sanitizes an HTML string using DOMPurify with enhanced security defaults.
 *
 * @param html The HTML string to sanitize
 * @param options Additional DOMPurify options (will be merged with defaults)
 * @returns The sanitized HTML string
 */
export function sanitizeHtml(html: string, options?: any): string {
  if (!html) return '';

  addSecurityHooks();

  const config = {
    ADD_ATTR: ['target'], // Allow target by default (secured by hook)
    ...options
  };

  return DOMPurify.sanitize(html, config) as unknown as string;
}
