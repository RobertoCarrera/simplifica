import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { sanitizeHtml } from '../utils/sanitizer';

@Pipe({
    name: 'safeHtml',
    standalone: true
})
export class SafeHtmlPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(value: string | null | undefined): SafeHtml {
        if (!value) return '';

        // 1. Sanitize the HTML to remove scripts/unsafe tags and add security attributes
        const cleanHtml = sanitizeHtml(value);

        // 2. Trust the sanitized HTML (bypassing Angular's default stripper)
        return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    }
}
