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

        // 1. Sanitize the HTML to remove scripts/unsafe tags
        const cleanHtml = DOMPurify.sanitize(value, {
            // Optional: Add specific config here if needed (e.g., allowing specific tags)
            ADD_ATTR: ['target'], // Allow target="_blank"
        });

        // 2. Trust the sanitized HTML (bypassing Angular's default stripper)
        return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    }
}
