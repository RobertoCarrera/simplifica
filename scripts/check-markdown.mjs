#!/usr/bin/env node
/**
 * Smoke check for the /docs markdown pipeline — pure Node, no Angular.
 *
 * Re-implements the MarkdownService pipeline (marked → DOMPurify with
 * the same allowlist) to confirm the trust boundary is sound against
 * the XSS cases the spec covers. Not a replacement for the unit
 * tests; just an offline sanity check that doesn't need Karma.
 *
 * Run: `node scripts/check-markdown.mjs`
 */
import { JSDOM } from 'jsdom';
import DOMPurifyFactory from 'dompurify';
import { Marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const win = dom.window;
const DOMPurify = DOMPurifyFactory(win);
const marked = new Marked({ gfm: true, breaks: false, async: false });

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1','h2','h3','h4','h5','h6',
    'p','ul','ol','li','blockquote','pre','code',
    'strong','em','b','i','a','img',
    'table','thead','tbody','tr','th','td',
    'div','span','br','hr',
  ],
  ALLOWED_ATTR: ['href','title','alt','src','class','id','target','rel','loading','type'],
  FORBID_TAGS: ['script','iframe','object','embed','form','style','link'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur'],
};

function preprocessCallouts(md) {
  const lines = md.split('\n');
  const out = [];
  let buffer = null;
  const TYPES = new Set(['info','warn','warning','tip','success','danger','note']);
  const NORM = { warning: 'warn', success: 'tip', note: 'info' };
  const flush = () => {
    if (!buffer) return;
    const inner = buffer.lines.join('\n').trim();
    out.push(`<blockquote class="callout callout--${buffer.type}">`);
    out.push('');
    out.push(inner);
    out.push('');
    out.push('</blockquote>');
    out.push('');
    buffer = null;
  };
  for (const line of lines) {
    const m = line.match(/^>\s*\[!([A-Za-z]+)\]\s*(.*)$/);
    if (m) {
      flush();
      const t = m[1].toLowerCase();
      if (!TYPES.has(t)) { out.push(`> ${m[2]}`); continue; }
      buffer = { type: NORM[t] ?? t, lines: [m[2]] };
      continue;
    }
    const c = line.match(/^>\s?(.*)$/);
    if (buffer && c) { buffer.lines.push(c[1]); continue; }
    flush();
    out.push(line);
  }
  flush();
  return out.join('\n');
}

function rewriteAnchorsAndImages(html) {
  let h = html;
  h = h.replace(
    /<a\b([^>]*?)href=(["'])([^"']+)\2([^>]*)>/gi,
    (full, pre, q, href, post) => {
      if (!/^(https?:|mailto:)/i.test(href)) return full;
      const cp = pre.replace(/\s+(target|rel)=(["'])[^"']*\2/gi, '');
      const cpost = post.replace(/\s+(target|rel)=(["'])[^"']*\2/gi, '');
      return `<a${cp} href=${q}${href}${q}${cpost} target="_blank" rel="noopener noreferrer">`;
    },
  );
  h = h.replace(
    /<img\b([^>]*?)>/gi,
    (full, attrs) => /\bloading\s*=/i.test(attrs) ? full : `<img${attrs} loading="lazy">`,
  );
  return h;
}

function render(md) {
  if (!md) return '';
  const withCallouts = preprocessCallouts(md);
  const raw = marked.parse(withCallouts, { async: false });
  const shaped = rewriteAnchorsAndImages(raw);
  return DOMPurify.sanitize(shaped, PURIFY_CONFIG);
}

const tests = [
  ['paragraph', 'Hola', (h) => assertContains(h, '<p>Hola</p>')],
  ['callout info', '> [!INFO] Aviso importante', (h) => assertContains(h, 'callout callout--info')],
  ['callout warn multi-line', '> [!WARN] A\n> B', (h) => { assertContains(h, 'callout--warn'); assertContains(h, 'A'); assertContains(h, 'B'); }],
  ['callout normalises warning→warn', '> [!WARNING] x', (h) => assertContains(h, 'callout--warn')],
  ['unknown callout type falls back', '> [!FOO] x', (h) => assertNotContains(h, 'callout--')],
  ['regular blockquote untouched', '> Cita', (h) => assertNotContains(h, 'callout--')],
  ['script stripped', '<script>alert(1)</script>', (h) => { assertNotContains(h.toLowerCase(), '<script'); assertNotContains(h.toLowerCase(), 'alert(1)'); }],
  ['onerror stripped', '<img src="x" onerror="alert(1)">', (h) => assertNotContains(h.toLowerCase(), 'onerror')],
  ['javascript: stripped', '[click](javascript:alert(1))', (h) => assertNotContains(h.toLowerCase(), 'javascript:')],
  ['iframe stripped', '<iframe src="x"></iframe>', (h) => assertNotContains(h.toLowerCase(), '<iframe')],
  ['external link gets target+rel', '[docs](https://example.com)', (h) => { assertContains(h, 'target="_blank"'); assertContains(h, 'rel="noopener noreferrer"'); }],
  ['internal link untouched', '[home](/docs)', (h) => assertNotContains(h, 'target="_blank"')],
  ['image gets alt + lazy', '![captura](/x.png)', (h) => { assertContains(h, 'alt="captura"'); assertContains(h, 'loading="lazy"'); }],
  ['image keeps existing loading=eager', '<img src="/x.png" alt="x" loading="eager">', (h) => { assertContains(h, 'loading="eager"'); assertNotContains(h, 'loading="lazy"'); }],
  ['code block has language class', '```bash\nnpm i\n```', (h) => { assertContains(h, '<pre>'); assertContains(h, 'language-bash'); }],
  ['table renders', '| a | b |\n|---|---|\n| 1 | 2 |', (h) => { assertContains(h, '<table>'); assertContains(h, '<th>a</th>'); }],
];

function assertContains(h, n) { if (!h.includes(n)) throw new Error(`expected to contain: ${n}\n--- got ---\n${h}\n-----------`); }
function assertNotContains(h, n) { if (h.includes(n)) throw new Error(`expected NOT to contain: ${n}\n--- got ---\n${h}\n-----------`); }

let failed = 0;
for (const [name, md, check] of tests) {
  try {
    const html = render(md);
    check(html);
    console.log(`  PASS  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`    ${e.message}`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} smoke checks passed`);
process.exit(failed > 0 ? 1 : 0);
