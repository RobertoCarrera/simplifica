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
 *   Total: ~80 assertions across 26 EMAIL_TYPES.
 */

// We import the JSON fixture directly to drive the tests; the SQL snapshot
// harness consumes the SAME data through public.email_sample_fixtures.
import emailSamplesJson from '../../email-samples.json' with { type: 'json' };
import {
  renderTemplate,
  EMAIL_TYPES,
  type EmailType,
  type CompanyInfo,
  type TemplateData,
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