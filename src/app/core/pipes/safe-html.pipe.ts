import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';

@Pipe({
    name: 'safeHtml',
    standalone: true
})
export class SafeHtmlPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);

    transform(value: string | null | undefined, config?: any): SafeHtml {
        if (!value) return '';

        // Default configuration
        const defaultConfig = {
            ADD_ATTR: ['target'], // Allow target="_blank"
        };

        const finalConfig = { ...defaultConfig, ...config };

        // 1. Sanitize the HTML to remove scripts/unsafe tags
        // Cast to unknown first to avoid "TrustedHTML to string" conversion error if types mismatch
        const cleanHtml = DOMPurify.sanitize(value, finalConfig) as unknown as string;

        // 2. Trust the sanitized HTML (bypassing Angular's default stripper)
        return this.sanitizer.bypassSecurityTrustHtml(cleanHtml);
    }
}
