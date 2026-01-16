/**
 * Initializes global security configurations.
 * This should be called before the application bootstraps.
 */
export function initSecurityConfig(): void {
  // Global MutationObserver to enforce rel="noopener noreferrer" on target="_blank" links
  // This protects against Reverse Tabnabbing attacks across the entire application (Defense in Depth)
  if (typeof window !== 'undefined' && window.MutationObserver) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node.tagName === 'A') checkAnchor(node as HTMLAnchorElement);
              // Check descendants efficiently if node is a container
              else if (node.childElementCount) {
                node.querySelectorAll('a[target="_blank"]').forEach((a) => checkAnchor(a as HTMLAnchorElement));
              }
            }
          });
        } else if (m.type === 'attributes' && m.attributeName === 'target') {
          checkAnchor(m.target as HTMLAnchorElement);
        }
      });
    });

    // Start observing the document
    const targetNode = document.body || document.documentElement;
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['target']
    });
  }
}

function checkAnchor(a: HTMLAnchorElement): void {
  // Double-check target is blank (safeguard)
  if (a.getAttribute('target') === '_blank') {
    const rel = (a.getAttribute('rel') || '').split(/\s+/).filter(Boolean);
    let changed = false;
    ['noopener', 'noreferrer'].forEach(r => {
      if (!rel.includes(r)) { rel.push(r); changed = true; }
    });
    if (changed) a.setAttribute('rel', rel.join(' '));
  }
}
