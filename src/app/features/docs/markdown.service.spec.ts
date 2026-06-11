import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';

import { MarkdownService } from './markdown.service';

/**
 * Unit tests for MarkdownService — the trust boundary for /docs
 * content. Covers: callout transformation, code blocks, external
 * link rewriting, lazy images, XSS sanitisation, and the heading
 * extractor used by the ToC builder in Phase 4.
 */
describe('MarkdownService', () => {
  let service: MarkdownService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // PLATFORM_ID defaults to 'browser' in jsdom; the service
        // checks it before invoking DOMPurify so we don't need
        // server-side fixtures here.
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    service = TestBed.inject(MarkdownService);
  });

  function asString(safe: unknown): string {
    // SafeHtml is an opaque string at runtime; cast for assertions.
    // We pass a result object from render() and read `htmlString` —
    // the plain sanitised HTML — to bypass the Angular SafeValue
    // contract (in test, `String(safe)` returns the security warning
    // because DomSanitizer.bypassSecurityTrustHtml doesn't expose
    // the underlying value directly).
    if (safe && typeof safe === 'object' && 'htmlString' in safe) {
      return String((safe as { htmlString: string }).htmlString);
    }
    return String(safe);
  }

  function htmlOf(md: string | null | undefined): string {
    return asString(service.render(md).html);
  }

  it('returns empty result for null / undefined / empty input', () => {
    const r1 = service.render(null);
    const r2 = service.render(undefined);
    const r3 = service.render('');
    expect(r1.htmlString).toBe('');
    expect(r2.htmlString).toBe('');
    expect(r3.htmlString).toBe('');
    expect(r1.headings).toEqual([]);
  });

  it('renders a paragraph', () => {
    const html = htmlOf('Hola mundo');
    expect(html).toContain('<p>Hola mundo</p>');
  });

  it('renders headings and assigns ids to H2/H3', () => {
    const result = service.render('## Instalación\n\n### Requisitos');
    const html = asString(result);
    expect(html).toMatch(/<h2[^>]*id="instalacion"/);
    expect(html).toMatch(/<h3[^>]*id="requisitos"/);
    expect(result.headings).toEqual([
      { id: 'instalacion', text: 'Instalación', level: 2 },
      { id: 'requisitos', text: 'Requisitos', level: 3 },
    ]);
  });

  it('skips H1 from the ToC (article title is rendered separately)', () => {
    const result = service.render('# Título\n\n## Sección');
    expect(result.headings.find((h) => h.level === 1)).toBeUndefined();
    expect(result.headings.length).toBe(1);
  });

  it('de-duplicates heading ids when two headings slug to the same value', () => {
    const result = service.render('## API\n\n## API');
    const ids = result.headings.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reuses author-supplied id when it is slug-safe', () => {
    const result = service.render('## Mi Sección {#custom-id}');
    expect(result.headings[0]?.id).toBe('custom-id');
  });

  it('ignores unsafe author-supplied ids and regenerates them', () => {
    const result = service.render('## Hola {#"><script>alert(1)</script>}');
    const id = result.headings[0]?.id;
    expect(id).toBeTruthy();
    expect(id).not.toContain('"');
    expect(id).not.toContain('<');
    expect(id).not.toContain('>');
  });

  it('transforms a single-line [!INFO] callout', () => {
    const html = htmlOf('> [!INFO] Aviso importante');
    expect(html).toContain('callout callout--info');
    expect(html).toContain('Aviso importante');
  });

  it('transforms multi-line callout continuations', () => {
    const md = `> [!WARN] Cabecera\n> Segunda línea\n> Tercera línea`;
    const html = htmlOf(md);
    expect(html).toContain('callout callout--warn');
    expect(html).toContain('Cabecera');
    expect(html).toContain('Segunda línea');
    expect(html).toContain('Tercera línea');
  });

  it('normalises callout aliases (warning→warn, success→tip, note→info)', () => {
    const html = htmlOf('> [!WARNING] a\n> [!SUCCESS] b\n> [!NOTE] c');
    expect(html).toContain('callout--warn');
    expect(html).toContain('callout--tip');
    expect(html).toContain('callout--info');
  });

  it('falls back to a plain blockquote for unknown callout types', () => {
    const html = htmlOf('> [!FOO] bar');
    expect(html).not.toContain('callout--');
  });

  it('does not transform a regular blockquote into a callout', () => {
    const html = htmlOf('> Cita normal sin [!TYPE]');
    expect(html).not.toContain('callout--');
  });

  it('rewrites external links with target=_blank rel=noopener noreferrer', () => {
    const html = htmlOf('[docs](https://example.com/path)');
    expect(html).toMatch(/target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
  });

  it('leaves internal links untouched', () => {
    const html = htmlOf('[home](/docs)');
    expect(html).not.toMatch(/target="_blank"/);
  });

  it('strips javascript: URLs via DOMPurify', () => {
    const html = htmlOf('[click](javascript:alert(1))');
    // DOMPurify removes the href entirely for javascript: schemes.
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('renders fenced code blocks with a language class', () => {
    const md = '```bash\nnpm install\n```';
    const html = htmlOf(md);
    expect(html).toContain('<pre>');
    expect(html).toContain('language-bash');
    expect(html).toContain('npm install');
  });

  it('renders GFM tables', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |';
    const html = htmlOf(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders images with alt and lazy loading', () => {
    const html = htmlOf('![captura](/x.png)');
    expect(html).toMatch(/<img/);
    expect(html).toMatch(/alt="captura"/);
    expect(html).toMatch(/loading="lazy"/);
  });

  it('does not duplicate loading=lazy when the author already set it', () => {
    const md = '<img src="/x.png" alt="x" loading="eager">';
    const html = htmlOf(md);
    expect(html).toMatch(/loading="eager"/);
    expect(html).not.toMatch(/loading="lazy"/);
  });

  it('strips <script> tags via DOMPurify', () => {
    const html = htmlOf('<script>alert(1)</script>\n\nTexto');
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('alert(1)');
  });

  it('strips inline event handlers (onerror, onclick) via DOMPurify', () => {
    const html = htmlOf('<img src="x" onerror="alert(1)">');
    expect(html.toLowerCase()).not.toContain('onerror');
  });

  it('strips iframes via DOMPurify', () => {
    const html = htmlOf('<iframe src="https://evil.example"></iframe>');
    expect(html.toLowerCase()).not.toContain('<iframe');
  });

  it('handles a realistic article with mixed content', () => {
    const md = [
      '## Instalación',
      '',
      'Instala las dependencias:',
      '',
      '```bash',
      'npm install',
      '```',
      '',
      '> [!INFO] Esto puede tardar unos minutos.',
      '',
      'Más detalles en [la docs](https://example.com).',
    ].join('\n');
    const result = service.render(md);
    const html = asString(result);
    expect(html).toContain('<h2');
    expect(html).toContain('language-bash');
    expect(html).toContain('callout--info');
    expect(html).toMatch(/target="_blank"/);
    expect(result.headings).toEqual([
      { id: 'instalacion', text: 'Instalación', level: 2 },
    ]);
  });
});
