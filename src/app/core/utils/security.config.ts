import DOMPurify from 'dompurify';

/**
 * Configures global security settings for the application.
 * This should be called once during application initialization (e.g., in main.ts).
 *
 * NOTE: This configuration affects direct usages of DOMPurify, such as in the 'SafeHtmlPipe'.
 * Angular's default DomSanitizer is NOT affected by this, but since we bypass it
 * using SafeHtmlPipe (which uses DOMPurify), these hooks will be applied there.
 */
export function configureSecurity(): void {
  // Add a hook to enforce rel="noopener noreferrer" on all links with target="_blank"
  // This prevents reverse tabnabbing attacks where the opened page can manipulate the opener.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      const currentRel = node.getAttribute('rel') || '';
      // Split by whitespace and filter empty strings
      const rels = new Set(currentRel.split(/\s+/).filter(r => r.length > 0));

      // Add required security attributes
      rels.add('noopener');
      rels.add('noreferrer');

      node.setAttribute('rel', Array.from(rels).join(' '));
    }
  });

  console.log('🛡️ Security configuration initialized: DOMPurify hooks applied.');
}
