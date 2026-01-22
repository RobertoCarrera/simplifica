import DOMPurify from 'dompurify';

/**
 * Initializes DOMPurify with global hooks for security.
 * This should be run during application initialization.
 */
export function initializeDomPurify(): void {
  // Add a hook to enforce rel="noopener noreferrer" for all target="_blank" links
  // This prevents Reverse Tabnabbing attacks where the opened page can manipulate the opener
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node) {
      const target = node.getAttribute('target');
      if (target && target.toLowerCase() === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });
}
