import { SafeHtmlPipe } from './safe-html.pipe';
import { DomSanitizer } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { SecurityContext } from '@angular/core';
import { initializeSecurity } from '../utils/security.config';

// Initialize global security hooks for tests
initializeSecurity();

describe('SafeHtmlPipe', () => {
  let pipe: SafeHtmlPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SafeHtmlPipe, {
        provide: DomSanitizer,
        useValue: {
          bypassSecurityTrustHtml: (val: string) => val,
          sanitize: (ctx: SecurityContext, val: string) => val
        }
      }]
    });
    pipe = TestBed.inject(SafeHtmlPipe);
    sanitizer = TestBed.inject(DomSanitizer);
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should add rel="noopener noreferrer" to target="_blank" links', () => {
    const input = '<a href="http://example.com" target="_blank">Link</a>';
    const output = pipe.transform(input) as unknown as string;
    // We expect the hook to work.
    expect(output).toContain('noopener');
    expect(output).toContain('noreferrer');
  });

  it('should not add rel="noopener noreferrer" if target is not _blank', () => {
    const input = '<a href="http://example.com">Link</a>';
    const output = pipe.transform(input) as unknown as string;
    expect(output).not.toContain('noopener');
    expect(output).not.toContain('noreferrer');
  });

  it('should preserve existing rel attributes', () => {
    const input = '<a href="http://example.com" target="_blank" rel="nofollow">Link</a>';
    const output = pipe.transform(input) as unknown as string;
    // Check preservation and addition
    expect(output).toContain('nofollow');
    expect(output).toContain('noopener');
    expect(output).toContain('noreferrer');
  });
});
