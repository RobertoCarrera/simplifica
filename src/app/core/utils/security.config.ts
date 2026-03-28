import DOMPurify from 'dompurify';

/**
 * Initializes global security configurations and hooks.
 * Should be called once during application startup.
 */
export function initializeSecurity() {
  // Security Hook: Force rel="noopener noreferrer" on target="_blank" links
  // to prevent reverse tabnabbing attacks (OWASP).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      const currentRel = node.getAttribute('rel') || '';
      const parts = currentRel.split(/\s+/).filter(p => p.length > 0);
      let changed = false;

      // Add 'noopener' if missing
      if (!parts.includes('noopener')) {
        parts.push('noopener');
        changed = true;
      }

      // Add 'noreferrer' if missing
      if (!parts.includes('noreferrer')) {
        parts.push('noreferrer');
        changed = true;
      }

      if (changed) {
        node.setAttribute('rel', parts.join(' '));
      }
    }
  });
}
