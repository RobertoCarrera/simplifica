import { TestBed } from '@angular/core/testing';
import { SafeHtmlPipe } from './safe-html.pipe';
import { DomSanitizer, BrowserModule } from '@angular/platform-browser';

describe('SafeHtmlPipe', () => {
  let pipe: SafeHtmlPipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [BrowserModule],
      providers: [SafeHtmlPipe]
    });
    pipe = TestBed.inject(SafeHtmlPipe);
  });

  it('should create instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('should sanitize unsafe HTML', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    const result = pipe.transform(unsafe) as any;
    // Inspect the inner value of SafeHtml impl
    const clean = result.changingThisBreaksApplicationSecurity;
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('<img src="x">');
  });

  it('should add rel="noopener noreferrer" to target="_blank" links', () => {
    const html = '<a href="https://example.com" target="_blank">External</a>';
    const result = pipe.transform(html) as any;
    const clean = result.changingThisBreaksApplicationSecurity;
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('should not add rel attribute to normal links', () => {
      const html = '<a href="https://example.com">Internal</a>';
      const result = pipe.transform(html) as any;
      const clean = result.changingThisBreaksApplicationSecurity;
      expect(clean).not.toContain('rel="');
  });
});
