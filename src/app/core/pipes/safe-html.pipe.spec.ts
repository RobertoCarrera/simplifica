import { TestBed } from '@angular/core/testing';
import { SafeHtmlPipe } from './safe-html.pipe';
import { DomSanitizer } from '@angular/platform-browser';

describe('SafeHtmlPipe', () => {
  let pipe: SafeHtmlPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SafeHtmlPipe,
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustHtml: (val: string) => val
          }
        }
      ]
    });
    pipe = TestBed.inject(SafeHtmlPipe);
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should remove script tags', () => {
    const dangerous = '<script>alert("xss")</script><b>Safe</b>';
    const result = pipe.transform(dangerous) as string;
    expect(result).toBe('<b>Safe</b>');
  });

  it('should allow target="_blank"', () => {
    const link = '<a href="https://example.com" target="_blank">Link</a>';
    const result = pipe.transform(link) as string;
    expect(result).toContain('target="_blank"');
    expect(result).toContain('href="https://example.com"');
  });

  it('should add rel="noopener noreferrer" to target="_blank" links', () => {
    const link = '<a href="https://example.com" target="_blank">Link</a>';
    const result = pipe.transform(link) as string;
    expect(result).toContain('rel="noopener noreferrer"');
  });
});
