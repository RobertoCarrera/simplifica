import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

@Pipe({
    name: 'safeHtml',
    standalone: true
})
export class SafeHtmlPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(value: string | null | undefined): SafeHtml {
        if (!value) return '';

        // 1. Sanitize to DocumentFragment to manipulate DOM safely
        const cleanHtmlFragment = DOMPurify.sanitize(value, {
            ADD_ATTR: ['target'], // Allow target="_blank"
            RETURN_DOM_FRAGMENT: true
        }) as DocumentFragment;

        // 2. Prevent Reverse Tabnabbing: Enforce rel="noopener noreferrer" on all target="_blank" links
        const links = cleanHtmlFragment.querySelectorAll('a[target="_blank"]');
        links.forEach((link: Element) => {
            const currentRel = link.getAttribute('rel') || '';
            const rels = new Set(currentRel.split(/\s+/).filter(s => s));
            rels.add('noopener');
            rels.add('noreferrer');
            link.setAttribute('rel', Array.from(rels).join(' '));
        });

        // 3. Serialize back to HTML string
        const div = document.createElement('div');
        div.appendChild(cleanHtmlFragment);

        // 4. Trust the sanitized HTML
        return this.sanitizer.bypassSecurityTrustHtml(div.innerHTML);
    }
}
