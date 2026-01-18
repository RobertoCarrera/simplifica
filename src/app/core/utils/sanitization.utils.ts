import DOMPurify from 'dompurify';

/**
 * Global security hook: Enforce rel="noopener noreferrer" for target="_blank"
 * This prevents Reverse Tabnabbing attacks where the opened page can manipulate
 * the window.opener location.
 */
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node instanceof Element && node.tagName.toLowerCase() === 'a') {
    const target = node.getAttribute('target');
    if (target === '_blank') {
      const currentRel = node.getAttribute('rel') || '';
      const parts = currentRel.split(/\s+/).filter(p => p.length > 0);
      let changed = false;

      if (!parts.includes('noopener')) {
        parts.push('noopener');
        changed = true;
      }
      if (!parts.includes('noreferrer')) {
        parts.push('noreferrer');
        changed = true;
      }

      if (changed) {
        node.setAttribute('rel', parts.join(' '));
      }
    }
  }
});

/**
 * Centralized HTML sanitization utility.
 * Uses DOMPurify to strip unsafe tags and attributes while preserving
 * safe HTML structure.
 *
 * Automatically enforces rel="noopener noreferrer" for links with target="_blank".
 *
 * @param value The raw HTML string to sanitize
 * @returns The sanitized HTML string
 */
export function sanitizeHtml(value: string): string {
  if (!value) return '';

  return DOMPurify.sanitize(value, {
    ADD_ATTR: ['target', 'class', 'style'], // Allow specific attributes
  });
}
