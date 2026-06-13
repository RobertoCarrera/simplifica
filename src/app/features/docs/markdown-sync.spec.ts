import { tiptapHtmlToMarkdown, markdownToTiptapHtml } from './markdown-sync';

describe('markdown-sync', () => {
  describe('tiptapHtmlToMarkdown', () => {
    it('returns empty string for empty input', () => {
      expect(tiptapHtmlToMarkdown('')).toBe('');
    });

    it('returns empty string for an empty paragraph', () => {
      expect(tiptapHtmlToMarkdown('<p></p>')).toBe('');
    });

    it('serializes a simple paragraph', () => {
      expect(tiptapHtmlToMarkdown('<p>hola mundo</p>')).toBe('hola mundo');
    });

    it('serializes h1/h2/h3 with # syntax', () => {
      expect(tiptapHtmlToMarkdown('<h1>titulo</h1>')).toBe('# titulo');
      expect(tiptapHtmlToMarkdown('<h2>sub</h2>')).toBe('## sub');
      expect(tiptapHtmlToMarkdown('<h3>sub2</h3>')).toBe('### sub2');
    });

    it('serializes strong and em', () => {
      expect(tiptapHtmlToMarkdown('<p><strong>negrita</strong></p>')).toBe('**negrita**');
      expect(tiptapHtmlToMarkdown('<p><em>cursiva</em></p>')).toBe('*cursiva*');
    });

    it('serializes inline code with backticks', () => {
      expect(tiptapHtmlToMarkdown('<p><code>x</code></p>')).toBe('`x`');
    });

    it('serializes a pre/code block with fenced code', () => {
      const html = '<pre><code>let a = 1;\nlet b = 2;</code></pre>';
      const md = tiptapHtmlToMarkdown(html);
      expect(md).toContain('```');
      expect(md).toContain('let a = 1;');
    });

    it('serializes unordered lists with - markers', () => {
      const html = '<ul><li>uno</li><li>dos</li></ul>';
      expect(tiptapHtmlToMarkdown(html)).toBe('- uno\n- dos');
    });

    it('serializes ordered lists with 1. markers', () => {
      const html = '<ol><li>primero</li><li>segundo</li></ol>';
      expect(tiptapHtmlToMarkdown(html)).toBe('1. primero\n1. segundo');
    });

    it('serializes blockquotes with > prefix', () => {
      expect(tiptapHtmlToMarkdown('<blockquote><p>cita</p></blockquote>')).toBe('> cita');
    });

    it('serializes links as [text](href)', () => {
      expect(tiptapHtmlToMarkdown('<p><a href="https://x.com">link</a></p>')).toBe('[link](https://x.com)');
    });

    it('serializes images as ![alt](src)', () => {
      expect(tiptapHtmlToMarkdown('<p><img src="https://x.com/i.png" alt="img" /></p>')).toBe('![img](https://x.com/i.png)');
    });

    it('strips unknown tags but keeps their text', () => {
      expect(tiptapHtmlToMarkdown('<p><unknown>x</unknown>y</p>')).toBe('xy');
    });

    it('handles multiple paragraphs separated by blank lines', () => {
      const html = '<p>uno</p><p>dos</p>';
      expect(tiptapHtmlToMarkdown(html)).toBe('uno\n\ndos');
    });
  });

  describe('markdownToTiptapHtml', () => {
    it('returns empty string for empty input', () => {
      expect(markdownToTiptapHtml('')).toBe('');
    });

    it('wraps a plain string in a paragraph', () => {
      expect(markdownToTiptapHtml('hola')).toBe('<p>hola</p>');
    });

    it('converts # syntax to h1', () => {
      expect(markdownToTiptapHtml('# titulo')).toBe('<h1>titulo</h1>');
    });

    it('converts - list items to ul/li', () => {
      const html = markdownToTiptapHtml('- uno\n- dos');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>uno</li>');
      expect(html).toContain('<li>dos</li>');
    });
  });

  describe('round-trip', () => {
    const inputs = [
      '# titulo\n\nParrafo con **negrita** y *cursiva*.',
      '- item a\n- item b',
      '1. uno\n1. dos',
      '[link](https://x.com)',
      '![alt](https://x.com/i.png)',
    ];
    inputs.forEach((md) => {
      it(`md -> html -> md preserves the input for: ${md.slice(0, 30)}`, () => {
        const html = markdownToTiptapHtml(md);
        const back = tiptapHtmlToMarkdown(html);
        expect(back).toBe(md);
      });
    });
  });
});
