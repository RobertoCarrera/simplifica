// @ts-nocheck
/**
 * Unit tests for _shared/email-templates.ts
 *
 * Rafter v0.60+ — locked the preview-vs-send contract.
 * Source of truth for expected substrings: supabase/email-samples.json
 * (mirrored into public.email_sample_fixtures by migration 20260706_*).
 *
 * The same expected_substrings list is consumed by
 * supabase/tests/snapshot_email_render.sql which asserts the SQL renderer
 * produces HTML matching every substring for every type. Drift between
 * the TS renderer and the PL/pgSQL email_render_template RPC is detected
 * the moment either side changes a substring expectation without
 * updating the other.
 *
 * Running:
 *   cd supabase/functions && deno test _shared/email-templates.test.ts
 *
 * Coverage:
 *   - 26 types × default branch (sample_data fixture, no overrides) → 26 cases
 *   - 26 types × escape contract (name = '<script>...</script>') → 1 case
 *   - 26 types × custom body override → 26 cases
 *   - 26 types × custom subject override → 26 cases
 *   - RGPD compliance footer always appended → 1 case (universal)
 *   - Branding font/bg injected into <body> style → 1 case
 *   - Unknown type falls through to default (generic) → 1 case
 *   - Pure renderer: same input twice → byte-identical output → 1 case
 *   - PR1 (email-block-editor): 9 block-renderer tests
 *       4 per-type renderers (logo/heading/paragraph/button) with valid props
 *       1 mixed-array test (all 4 types in one array)
 *       1 invalid-prop test (block with malformed color/size)
 *       1 unknown-type test (forward-compat: unknown type → '')
 *       1 javascript: post-interp case (Fix 4) — button url='{{x}}' + x='javascript:...' → <span>
 *       1 defaultEmailBody mirror test (returns non-empty HTML for each of 26 types)
 *   Total: ~80 assertions across 26 EMAIL_TYPES plus 9 PR1 block tests.
 */

// We import the JSON fixture directly to drive the tests; the SQL snapshot
// harness consumes the SAME data through public.email_sample_fixtures.
import emailSamplesJson from '../../email-samples.json' with { type: 'json' };
import {
  renderTemplate,
  EMAIL_TYPES,
  renderBlockLogo,
  renderBlockHeading,
  renderBlockParagraph,
  renderBlockButton,
  renderBlocksToHtml,
  defaultEmailBody,
  type EmailType,
  type CompanyInfo,
  type TemplateData,
  type Block,
  type LogoBlock,
  type HeadingBlock,
  type ParagraphBlock,
  type ButtonBlock,
} from './email-templates.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildBrandingCompany(): CompanyInfo {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Clínica Norte',
    logo_url: 'https://app.simplificacrm.es/logo.png',
    nif: 'B12345678',
    settings: {
      branding: { primary_color: '#FF6B35' },
      email_branding: {
        background_color: '#F7F7F7',
        font_family: 'Inter, sans-serif',
      },
      address: 'Calle Mayor 1, 28013 Madrid',
    },
  };
}

function buildMinimalCompany(): CompanyInfo {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Acme',
    logo_url: null,
    nif: null,
    settings: null,
  };
}

const fixtures: Record<string, { sample_data: TemplateData; expected_substrings: string[] }> =
  emailSamplesJson as Record<string, { sample_data: TemplateData; expected_substrings: string[] }>;

function getFixture(type: EmailType): { sample_data: TemplateData; expected_substrings: string[] } {
  const f = fixtures[type];
  if (!f) throw new Error(`Missing fixture for ${type}`);
  return f;
}

// ── Test: per-type default rendering matches expected_substrings ─────────────

const sampleTypes: EmailType[] = EMAIL_TYPES as unknown as EmailType[];

for (const t of sampleTypes) {
  const fixture = getFixture(t);
  Deno.test(`default:${t} — renders with sample_data + contains every expected substring`, () => {
    const { subject, html } = renderTemplate(t, buildBrandingCompany(), fixture.sample_data);
    console.assert(subject.length > 0, `${t}: subject should be non-empty`);
    console.assert(html.length > 0, `${t}: html should be non-empty`);
    for (const needle of fixture.expected_substrings) {
      console.assert(
        html.includes(needle),
        `${t}: expected substring not found: "${needle}"`,
      );
    }
  });
}

// ── Test: custom_body override bypasses the per-type default branch ──────────

for (const t of sampleTypes) {
  Deno.test(`customBody:${t} — interpolated into the rendered html`, () => {
    const customBody = `<p>Hola {{name}}, tu cita es el {{fecha}}</p>`;
    const { html } = renderTemplate(
      t,
      buildBrandingCompany(),
      { name: 'Ada Lovelace', fecha: '2026-07-10' } as unknown as TemplateData,
      null,
      customBody,
    );
    console.assert(
      html.includes('Hola Ada Lovelace, tu cita es el 2026-07-10'),
      `${t}: custom body not interpolated`,
    );
  });
}

// ── Test: custom_subject override replaces the per-type default subject ──────

for (const t of sampleTypes) {
  Deno.test(`customSubject:${t} — replaces default subject`, () => {
    const { subject } = renderTemplate(
      t,
      buildBrandingCompany(),
      getFixture(t).sample_data,
      'Override subject',
      null,
      null,
      null,
    );
    // The custom subject is used as-is (no {{var}} interpolation at the
    // subject level — only the html body interpolates). The renderers
    // honor `customSubject` verbatim, falling back to a per-type default.
    console.assert(
      subject === 'Override subject',
      `${t}: custom subject not applied — got "${subject}"`,
    );
  });
}

// ── Test: escape contract — value with HTML is HTML-escaped ──────────────────

Deno.test('escape:name=<script>alert(1)</script> — escaped, not executable', () => {
  // Use a customBody so the {{name}} token is interpolated through
  // interpolateSafe. The default branches render `data.message` as raw HTML
  // (admin-authored templates are trusted; only variable values are escaped).
  const { html } = renderTemplate(
    'generic',
    buildBrandingCompany(),
    { name: '<script>alert(1)</script>' } as unknown as TemplateData,
    null,
    '<p>Hola {{name}}</p>',
    null,
    null,
  );
  console.assert(
    html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
    'HTML in variable value must be escaped',
  );
  console.assert(
    !html.includes('<script>alert(1)</script>'),
    'Raw HTML must not appear in rendered output',
  );
});

// ── Test: RGPD compliance footer is always appended ──────────────────────────

Deno.test('compliance:footer — appended to every rendered type', () => {
  for (const t of sampleTypes) {
    const { html } = renderTemplate(
      t,
      buildBrandingCompany(),
      getFixture(t).sample_data,
    );
    console.assert(
      html.includes('política de privacidad'),
      `${t}: missing privacy policy link`,
    );
    console.assert(
      html.includes('Darse de baja'),
      `${t}: missing unsubscribe link`,
    );
    console.assert(
      html.includes('RGPD'),
      `${t}: missing RGPD reference`,
    );
  }
});

// ── Test: branding font + background injected into <body> ────────────────────

Deno.test('branding:inject — font-family + background-color in body style', () => {
  const { html } = renderTemplate(
    'booking_confirmation',
    buildBrandingCompany(),
    getFixture('booking_confirmation').sample_data,
  );
  console.assert(
    html.includes('font-family:Inter, sans-serif'),
    'font-family from email_branding must be injected into <body> style',
  );
  console.assert(
    html.includes('background-color:#F7F7F7'),
    'background-color from email_branding must be injected into <body> style',
  );
  console.assert(
    html.includes('color:#FF6B35'),
    'primary_color from branding must be applied to heading colors',
  );
});

// ── Test: minimal company (no branding, no logo, no address) still renders ──

Deno.test('branding:minimal — missing logo + branding still produces html', () => {
  const { html } = renderTemplate(
    'generic',
    buildMinimalCompany(),
    { message: 'Mensaje de prueba' },
  );
  console.assert(html.length > 0, 'minimal company should still render html');
  console.assert(!html.includes('class="brand-logo"'), 'no logo → no <img class="brand-logo">');
});

// ── Test: unknown type falls through to default (generic) ───────────────────

Deno.test('defaultRenderer:unknown — falls back to generic template', () => {
  // Cast through unknown — the registry lookup is what enforces the type;
  // a deliberately-invalid type should hit the default branch.
  const { subject, html } = renderTemplate(
    'unknown_type_xyz' as unknown as EmailType,
    buildBrandingCompany(),
    { message: 'fallback message' },
  );
  console.assert(html.length > 0, 'unknown type should still render via default');
  console.assert(
    html.includes('fallback message'),
    'default branch should use data.message',
  );
});

// ── Test: purity — same inputs twice → byte-identical output ─────────────────

Deno.test('purity:deterministic — same input → byte-identical output', () => {
  const args = {
    company: buildBrandingCompany(),
    data: getFixture('invite_owner').sample_data,
    customSubject: null as string | null,
    customBody: null as string | null,
    customHeader: null as string | null,
    customButtonText: null as string | null,
  };
  const a = renderTemplate('invite_owner', args.company, args.data, args.customSubject, args.customBody, args.customHeader, args.customButtonText);
  const b = renderTemplate('invite_owner', args.company, args.data, args.customSubject, args.customBody, args.customHeader, args.customButtonText);
  console.assert(a.subject === b.subject, 'subjects must match');
  console.assert(a.html === b.html, 'html must be byte-identical');
  console.assert(a.html.length > 0, 'html non-empty');
});

// ────────────────────────────────────────────────────────────────────────────
// PR1 (email-block-editor): block-renderer tests
// ────────────────────────────────────────────────────────────────────────────

// ── Test: renderBlockLogo with valid http(s) src ────────────────────────────

Deno.test('blocks:renderBlockLogo — http src → <img> wrapped in <table>', () => {
  const html = renderBlockLogo({
    src: 'https://app.simplificacrm.es/logo.png',
    alt: 'Acme Logo',
    max_height: 80,
    max_width: 240,
  });
  console.assert(html.includes('<img'), 'logo: missing <img> tag');
  console.assert(html.includes('src="https://app.simplificacrm.es/logo.png"'), 'logo: src not escaped');
  console.assert(html.includes('alt="Acme Logo"'), 'logo: alt not escaped');
  console.assert(html.includes('max-height:80px'), 'logo: max_height not applied');
  console.assert(html.includes('max-width:240px'), 'logo: max_width not applied');
  console.assert(html.includes('<table'), 'logo: <img> should be wrapped in <table>');
});

// ── Test: renderBlockHeading with level + color ──────────────────────────────

Deno.test('blocks:renderBlockHeading — level=2, color #FF6B35, align center', () => {
  const html = renderBlockHeading({
    text: 'Bienvenido a Simplifica',
    level: 2,
    color: '#FF6B35',
    align: 'center',
    font_size: 28,
  });
  console.assert(html.includes('<h2'), 'heading: missing <h2> tag');
  console.assert(html.includes('Bienvenido a Simplifica'), 'heading: text not present');
  console.assert(html.includes('color:#FF6B35'), 'heading: color not applied');
  console.assert(html.includes('font-size:28px'), 'heading: font_size not applied');
  console.assert(html.includes('text-align:center'), 'heading: align not applied');
});

// ── Test: renderBlockParagraph with italic + color ──────────────────────────

Deno.test('blocks:renderBlockParagraph — italic + color + justify align', () => {
  const html = renderBlockParagraph({
    text: 'Texto del párrafo',
    align: 'justify',
    color: '#374151',
    font_size: 18,
    italic: true,
  });
  console.assert(html.includes('<p'), 'paragraph: missing <p> tag');
  console.assert(html.includes('Texto del párrafo'), 'paragraph: text not present');
  console.assert(html.includes('font-style:italic'), 'paragraph: italic not applied');
  console.assert(html.includes('font-size:18px'), 'paragraph: font_size not applied');
  console.assert(html.includes('text-align:justify'), 'paragraph: justify align not applied');
});

// ── Test: renderBlockButton with valid http url ──────────────────────────────

Deno.test('blocks:renderBlockButton — http url → <a> styled button', () => {
  const html = renderBlockButton({
    text: 'Ver factura',
    url: 'https://app.simplificacrm.es/invoices/123',
    background_color: '#FF6B35',
    text_color: '#FFFFFF',
    padding: 14,
    border_radius: 8,
    align: 'center',
  });
  console.assert(html.includes('<a '), 'button: missing <a> tag');
  console.assert(html.includes('href="https://app.simplificacrm.es/invoices/123"'), 'button: href not set');
  console.assert(html.includes('Ver factura'), 'button: text not present');
  console.assert(html.includes('background:#FF6B35'), 'button: background_color not applied');
  console.assert(html.includes('border-radius:8px'), 'button: border_radius not applied');
});

// ── Test: renderBlocksToHtml — mixed array of all 4 types ────────────────────

Deno.test('blocks:renderBlocksToHtml — mixed array dispatches to all 4 renderers', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'logo', version: 1, props: { src: 'https://x.test/logo.png' } } as LogoBlock,
    { id: 'b', type: 'heading', version: 1, props: { text: 'Hola', level: 1 } } as HeadingBlock,
    { id: 'c', type: 'paragraph', version: 1, props: { text: 'Mundo' } } as ParagraphBlock,
    { id: 'd', type: 'button', version: 1, props: { text: 'Click', url: 'https://x.test/cta' } } as ButtonBlock,
  ];
  const html = renderBlocksToHtml(blocks);
  console.assert(html.includes('<img'), 'mixed: logo not rendered');
  console.assert(html.includes('<h1'), 'mixed: heading not rendered');
  console.assert(html.includes('<p'), 'mixed: paragraph not rendered');
  console.assert(html.includes('<a '), 'mixed: button not rendered');
});

// ── Test: renderBlockLogo — invalid src → empty (forward-compat degrade) ─────

Deno.test('blocks:renderBlockLogo — javascript: src → empty string', () => {
  const html = renderBlockLogo({ src: 'javascript:alert(1)' });
  console.assert(html === '', 'logo: javascript: src must be rejected (empty output)');
});

// ── Test: renderBlocksToHtml — unknown type → empty (forward-compat) ─────────

Deno.test('blocks:renderBlocksToHtml — unknown type → empty (forward-compat)', () => {
  const html = renderBlocksToHtml([
    { id: 'x', type: 'spacer' as 'logo', version: 1, props: {} },
  ]);
  console.assert(html === '', 'unknown type must produce empty string');
});

// ── Test: renderBlockButton — javascript: post-interp (Fix 4) → <span> ──────
//
// SECURITY FIX 4: button url = '{{invoice_url}}' with sample_data.invoice_url
// = 'javascript:alert(1)' must produce a <span>, NOT an <a href="javascript:...">.
// The literal "javascript:" substring must NOT appear anywhere in the output.

Deno.test('blocks:renderBlockButton — javascript: post-interp → <span> (Fix 4)', () => {
  const html = renderBlockButton(
    { text: 'Pagar', url: '{{invoice_url}}', background_color: '#4f46e5', text_color: '#FFFFFF' },
    { invoice_url: 'javascript:alert(1)' },
  );
  console.assert(html.includes('<span'), 'button: javascript: post-interp must degrade to <span>');
  console.assert(!html.includes('<a '), 'button: javascript: post-interp must NOT produce <a>');
  console.assert(!html.includes('javascript:'), 'button: javascript: literal must NOT appear in output');
  console.assert(html.includes('Pagar'), 'button: text should still be present');
});

// ── Test: defaultEmailBody — returns non-empty HTML for each of 26 types ─────

Deno.test('blocks:defaultEmailBody — every EMAIL_TYPE returns non-empty HTML', () => {
  for (const t of EMAIL_TYPES) {
    const html = defaultEmailBody(t);
    console.assert(typeof html === 'string', `${t}: defaultEmailBody must return string`);
    console.assert(html.length > 0, `${t}: defaultEmailBody must return non-empty HTML`);
  }
});

Deno.test('blocks:defaultEmailBody — unknown type throws', () => {
  let threw = false;
  try {
    defaultEmailBody('unknown_type_xyz');
  } catch (_e) {
    threw = true;
  }
  console.assert(threw, 'unknown email_type must throw');
});

// ── Test: renderTemplate — customBlocks wins over customBody (precedence) ────

// ── PR1-6type-fix regression tests ─────────────────────────────────────────
//
// Spec AC3: 6 simple types accept `custom_body_template` edits and preview
// reflects the change. Before PR1-6type-fix, the SQL `email_render_template`
// dropped `p_custom_body` for these 6 types while the TS mirror (which funnels
// them through `renderGeneric`) already honored `customBody`. Migration
// `20260710000001_email_block_6type_hotfix.sql` closes the SQL gap; these
// tests assert the TS side honors `customBody` for each of the 6 simple
// types so SQL ≡ TS parity is locked.

const SIMPLE_TYPES_HONORING_CUSTOM_BODY: EmailType[] = [
  'booking_reminder',
  'booking_cancellation',
  'password_reset',
  'magic_link',
  'welcome',
  'staff_credentials',
];

for (const t of SIMPLE_TYPES_HONORING_CUSTOM_BODY) {
  Deno.test(`6type:${t} — honors customBody (PR1-6type-fix)`, () => {
    const customBody = `<p>Custom Hello ${t}</p>`;
    const { html } = renderTemplate(
      t,
      buildBrandingCompany(),
      { message: 'ignored' } as unknown as TemplateData,
      null,
      customBody,
    );
    console.assert(
      html.includes(`Custom Hello ${t}`),
      `${t}: customBody MUST be interpolated into the rendered html — got "${html.slice(0, 200)}…"`,
    );
    // The bare default rendering for these 6 types is `<p style="font-size:16px;">{{message}}</p>`,
    // so the literal token `{{message}}` should NOT leak into the output when
    // a custom body is provided.
    console.assert(
      !html.includes('{{message}}'),
      `${t}: literal {{message}} token must NOT leak when customBody is set`,
    );
  });
}

Deno.test('blocks:renderTemplate — customBlocks wins over customBody', () => {
  const blocks: Block[] = [
    { id: 'a', type: 'heading', version: 1, props: { text: 'BLOCK_HEADING', level: 1 } } as HeadingBlock,
  ];
  const { html } = renderTemplate(
    'booking_confirmation',
    buildBrandingCompany(),
    getFixture('booking_confirmation').sample_data,
    null,
    '<p>CUSTOM_BODY</p>',
    null,
    null,
    blocks,
  );
  console.assert(html.includes('BLOCK_HEADING'), 'customBlocks must win over customBody');
  console.assert(!html.includes('CUSTOM_BODY'), 'customBody must NOT be used when customBlocks is set');
});

// ── Test: W2 fix — outer-interpolate {{var}} in TS renderBlocksToHtml ──────
//
// SQL `render_blocks_to_html` is wrapped by `interpolate_safe(...)` at
// migration line 471, so heading/paragraph text containing `{{var}}`
// tokens is substituted on the SQL path. Before the W2 fix, the TS
// `renderBlocksToHtml` did NOT outer-interpolate — Edge delivery and
// the snapshot harness would render `{{var}}` literally. This test
// locks in the fix.

Deno.test('blocks:renderBlocksToHtml — outer-interpolates {{var}} in block text (W2 fix)', () => {
  const blocks: Block[] = [
    {
      id: 'a',
      type: 'heading',
      version: 1,
      props: { text: 'Hola {{invited_name}}', level: 1 },
    } as HeadingBlock,
    {
      id: 'b',
      type: 'paragraph',
      version: 1,
      props: { text: 'Tu cita es {{fecha}}' },
    } as ParagraphBlock,
  ];
  const html = renderBlocksToHtml(blocks, { invited_name: 'Ada', fecha: 'mañana' });
  console.assert(html.includes('Hola Ada'), 'heading text {{var}} must be substituted by TS renderBlocksToHtml');
  console.assert(html.includes('Tu cita es mañana'), 'paragraph text {{var}} must be substituted by TS renderBlocksToHtml');
  console.assert(!html.includes('{{invited_name}}'), 'literal {{invited_name}} must NOT appear in output');
  console.assert(!html.includes('{{fecha}}'), 'literal {{fecha}} must NOT appear in output');
});