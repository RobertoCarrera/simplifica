import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
    providedIn: 'root'
})
export class GlobalInputConfigService {

    constructor(@Inject(PLATFORM_ID) private platformId: Object) { }

    public init() {
        if (!isPlatformBrowser(this.platformId)) {
            return;
        }

        // Function to apply attributes
        const processElement = (el: HTMLElement) => {
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                // Force autocomplete off.
                // We respect 'new-password' as it effectively disables history for critical fields.
                // Otherwise, overwrite.
                const current = el.getAttribute('autocomplete');
                if (current !== 'new-password') {
                    el.setAttribute('autocomplete', 'off');
                }

                // Additional protections like autocorrect/autocapitalize could act here too if desired
                // el.setAttribute('autocorrect', 'off');
                // el.setAttribute('autocapitalize', 'off');
                // el.setAttribute('spellcheck', 'false');
            }
        };

        const processNode = (node: Node) => {
            if (node.nodeType === 1) { // ELEMENT_NODE
                const element = node as HTMLElement;
                processElement(element);

                // Scan children
                if (element.querySelectorAll) {
                    const children = element.querySelectorAll('input, select, textarea');
                    children.forEach((child: any) => processElement(child));
                }
            }
        };

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach((node) => processNode(node));
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial pass for elements already in DOM
        const initialInputs = document.querySelectorAll('input, select, textarea');
        initialInputs.forEach((input: any) => processElement(input));

        console.log('[GlobalInputConfig] Autocomplete protection active.');
    }
}
