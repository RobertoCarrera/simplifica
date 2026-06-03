// @ts-nocheck
/**
 * Unit tests for classification-engine.ts
 *
 * Covers:
 *   - buildEmailFeatures — email parsing
 *   - tokenizeSubject — keyword extraction
 *   - sanitizeFolderName — name cleaning
 *   - SenderRule — sender-based suggestions + similarity
 *   - SubjectKeywordRule — keyword-based suggestions + similarity
 *   - LabelBasedRule — star/label-based suggestions + similarity
 *   - DomainBasedRule — domain-based suggestions + similarity
 *   - ClassificationEngine — rule aggregation, scoring, deduplication
 *   - createDefaultEngine — pre-configured engine
 *   - Extensibility — registering/removing custom rules
 *
 * Running:
 *   deno test supabase/functions/mail-folders/classification-engine.test.ts
 */

import {
  buildEmailFeatures,
  tokenizeSubject,
  sanitizeFolderName,
  extractDomain,
  SenderRule,
  SubjectKeywordRule,
  LabelBasedRule,
  DomainBasedRule,
  ClassificationEngine,
  createDefaultEngine,
} from './classification-engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFolder(name: string, path?: string) {
  return { name, path: path ?? `/${name}`, id: `id-${name}` };
}

function makeEmail(overrides: Partial<{
  id: string;
  name: string;
  email: string;
  subject: string;
  starred: boolean;
  labels: string[];
}> = {}) {
  return buildEmailFeatures({
    id: overrides.id ?? 'msg-1',
    from: {
      name: overrides.name ?? 'Test User',
      email: overrides.email ?? 'test@example.com',
    },
    subject: overrides.subject ?? 'Hello World',
    is_starred: overrides.starred ?? false,
    labels: overrides.labels ?? [],
  });
}

// ── buildEmailFeatures ────────────────────────────────────────────────────────

Deno.test('buildEmailFeatures: extracts sender fields correctly', () => {
  const f = buildEmailFeatures({
    from: { name: 'Alice', email: 'alice@company.com' },
    subject: '  Q3 Report  ',
    is_starred: true,
  });

  if (f.senderName !== 'Alice') throw new Error(`Expected Alice, got ${f.senderName}`);
  if (f.senderEmail !== 'alice@company.com') throw new Error(`Expected alice@company.com, got ${f.senderEmail}`);
  if (f.senderDomain !== 'company.com') throw new Error(`Expected company.com, got ${f.senderDomain}`);
  if (f.subject !== '  Q3 Report  ') throw new Error('Subject should preserve original');
  if (f.subjectLower !== '  q3 report  ') throw new Error(`Expected lowercased subject, got ${f.subjectLower}`);
  if (!f.isStarred) throw new Error('Expected starred');
});

Deno.test('buildEmailFeatures: handles missing from gracefully', () => {
  const f = buildEmailFeatures({});
  if (f.senderName !== '') throw new Error(`Expected empty senderName, got "${f.senderName}"`);
  if (f.senderEmail !== '') throw new Error(`Expected empty senderEmail`);
  if (f.senderDomain !== '') throw new Error(`Expected empty senderDomain`);
  if (!Array.isArray(f.subjectWords)) throw new Error('Expected subjectWords array');
});

Deno.test('buildEmailFeatures: extracts labels', () => {
  const f = buildEmailFeatures({
    from: { email: 'x@y.com' },
    subject: 'Test',
    labels: ['Importante', 'Trabajo'],
  });
  if (f.labels?.length !== 2) throw new Error(`Expected 2 labels, got ${f.labels?.length}`);
});

// ── tokenizeSubject ───────────────────────────────────────────────────────────

Deno.test('tokenizeSubject: extracts meaningful words, filters stop words', () => {
  const words = tokenizeSubject('Re: Hola, ¿cómo estás? El reporte de ventas');
  // Should contain: hola, cómo, estás, reporte, ventas
  // Stop words filtered: de, el, re
  if (!words.includes('hola')) throw new Error('Missing "hola"');
  if (!words.includes('cómo')) throw new Error('Missing "cómo"');
  if (!words.includes('estás')) throw new Error('Missing "estás"');
  if (!words.includes('reporte')) throw new Error('Missing "reporte"');
  if (!words.includes('ventas')) throw new Error('Missing "ventas"');
  // de and el should be filtered
  if (words.includes('de')) throw new Error('Stop word "de" should be filtered');
  if (words.includes('el')) throw new Error('Stop word "el" should be filtered');
  if (words.includes('re')) throw new Error('Prefix "re" should be filtered (< 3 chars)');
});

Deno.test('tokenizeSubject: deduplicates words', () => {
  const words = tokenizeSubject('test test test hola hola');
  const unique = new Set(words);
  if (words.length !== unique.size) throw new Error('Words should be deduplicated');
});

Deno.test('tokenizeSubject: handles accents', () => {
  const words = tokenizeSubject('Canción básica árbol niño');
  if (!words.includes('canción')) throw new Error('Missing accented "canción"');
  if (!words.includes('básica')) throw new Error('Missing accented "básica"');
  if (!words.includes('árbol')) throw new Error('Missing accented "árbol"');
  if (!words.includes('niño')) throw new Error('Missing accented "niño"');
});

Deno.test('tokenizeSubject: empty string returns empty array', () => {
  const words = tokenizeSubject('');
  if (words.length !== 0) throw new Error('Expected empty array');
});

// ── sanitizeFolderName ────────────────────────────────────────────────────────

Deno.test('sanitizeFolderName: removes special chars', () => {
  const result = sanitizeFolderName('Hola: "Mundo" <test>?');
  // Should remove <>:"/\|?* and replace spaces with underscores
  if (result.includes(':')) throw new Error('Should remove colon');
  if (result.includes('"')) throw new Error('Should remove quotes');
  if (result.includes('<')) throw new Error('Should remove angle brackets');
  if (result.includes('?')) throw new Error('Should remove question mark');
});

Deno.test('sanitizeFolderName: replaces spaces with underscores', () => {
  const result = sanitizeFolderName('Mi Carpeta Importante');
  if (result !== 'Mi_Carpeta_Importante') throw new Error(`Expected "Mi_Carpeta_Importante", got "${result}"`);
});

Deno.test('sanitizeFolderName: truncates to 50 chars', () => {
  const long = 'A'.repeat(100);
  const result = sanitizeFolderName(long);
  if (result.length > 50) throw new Error(`Expected max 50 chars, got ${result.length}`);
});

Deno.test('sanitizeFolderName: empty → "Sin_nombre"', () => {
  const result = sanitizeFolderName('   ');
  if (result !== 'Sin_nombre') throw new Error(`Expected "Sin_nombre", got "${result}"`);
});

// ── extractDomain ─────────────────────────────────────────────────────────────

Deno.test('extractDomain: extracts domain from email', () => {
  if (extractDomain('user@example.com') !== 'example.com') throw new Error('Domain mismatch');
  if (extractDomain('a@b.co') !== 'b.co') throw new Error('Domain mismatch for subdomain');
  if (extractDomain('noat') !== '') throw new Error('Expected empty for no @');
});

// ── SenderRule ────────────────────────────────────────────────────────────────

Deno.test('SenderRule.suggest: exact match on existing folder', () => {
  const rule = new SenderRule();
  const email = makeEmail({ email: 'alice@company.com', name: 'Alice' });
  const folders = [makeFolder('alice'), makeFolder('bob')];

  const suggestions = rule.suggest(email, folders);
  const exact = suggestions.find(s => s.score === 1.0);
  if (!exact) throw new Error('Expected exact sender match');
  if (exact.folderName !== 'alice') throw new Error(`Expected "alice", got "${exact.folderName}"`);
});

Deno.test('SenderRule.suggest: match on display name', () => {
  const rule = new SenderRule();
  const email = makeEmail({ email: 'alice@company.com', name: 'Alice Johnson' });
  const folders = [makeFolder('Alice_Johnson')];

  const suggestions = rule.suggest(email, folders);
  const nameMatch = suggestions.find(s => s.score >= 0.9);
  if (!nameMatch) throw new Error('Expected display name match');
});

Deno.test('SenderRule.suggest: no match → suggest creation', () => {
  const rule = new SenderRule();
  const email = makeEmail({ email: 'nuevo@empresa.es', name: 'Nuevo Cliente' });
  const folders = [makeFolder('otro')];

  const suggestions = rule.suggest(email, folders);
  const creation = suggestions.find(s => s.createIfMissing);
  if (!creation) throw new Error('Expected create suggestion');
  if (creation.score < 0.6) throw new Error(`Expected score >= 0.6, got ${creation.score}`);
});

Deno.test('SenderRule.suggest: includes domain suggestion as fallback', () => {
  const rule = new SenderRule();
  const email = makeEmail({ email: 'contact@stripe.com' });
  const folders: { name: string; path: string }[] = [];

  const suggestions = rule.suggest(email, folders);
  const domainSug = suggestions.find(s => s.folderName === 'stripe');
  if (!domainSug) throw new Error('Expected domain-based folder suggestion');
  if (domainSug.score >= 0.5) throw new Error('Domain suggestion should be lower priority');
});

Deno.test('SenderRule.findSimilar: exact sender match', () => {
  const rule = new SenderRule();
  const trigger = makeEmail({ id: 't1', email: 'bob@corp.com' });
  const candidates = [
    makeEmail({ id: 'c1', email: 'bob@corp.com', subject: 'X' }),
    makeEmail({ id: 'c2', email: 'alice@corp.com', subject: 'Y' }),
    makeEmail({ id: 'c3', email: 'bob@corp.com', subject: 'Z' }),
  ];

  const matches = rule.findSimilar(trigger, candidates, { folderName: '', folderPath: '', score: 0, reason: '' });
  if (matches.length !== 2) throw new Error(`Expected 2 matches, got ${matches.length}`);
  if (matches.every(m => m.score === 1.0) !== true) throw new Error('All same-sender matches should have score 1.0');
});

// ── SubjectKeywordRule ────────────────────────────────────────────────────────

Deno.test('SubjectKeywordRule.suggest: matches folder by keyword overlap', () => {
  const rule = new SubjectKeywordRule(0.2);
  const email = makeEmail({ subject: 'Factura del mes de marzo' });
  const folders = [makeFolder('Facturas'), makeFolder('Otros')];

  const suggestions = rule.suggest(email, folders);
  const match = suggestions.find(s => s.folderName === 'Facturas');
  if (!match) throw new Error('Expected keyword match with "Facturas" folder');
  if (match.score <= 0.5) throw new Error(`Expected score > 0.5, got ${match.score}`);
});

Deno.test('SubjectKeywordRule.suggest: no match → top keyword suggestion', () => {
  const rule = new SubjectKeywordRule(0.5);
  const email = makeEmail({ subject: 'Reunión de presupuesto Q4' });
  const folders = [makeFolder('Cosas')];

  const suggestions = rule.suggest(email, folders);
  // Should suggest "Reunión" as top keyword
  if (suggestions.length === 0) throw new Error('Expected at least one keyword suggestion');
  const keywordSug = suggestions[0];
  if (!keywordSug.createIfMissing) throw new Error('Expected createIfMissing');
  if (keywordSug.score < 0.2) throw new Error(`Expected score >= 0.2, got ${keywordSug.score}`);
});

Deno.test('SubjectKeywordRule.suggest: no suggestions for empty subject', () => {
  const rule = new SubjectKeywordRule();
  const email = makeEmail({ subject: '' });
  const folders = [makeFolder('Test')];
  const suggestions = rule.suggest(email, folders);
  if (suggestions.length !== 0) throw new Error('Expected empty suggestions for empty subject');
});

Deno.test('SubjectKeywordRule.findSimilar: groups emails with shared keywords', () => {
  const rule = new SubjectKeywordRule(0.3);
  const trigger = makeEmail({ id: 't1', subject: 'Informe de ventas Q1 2026' });
  const candidates = [
    makeEmail({ id: 'c1', subject: 'Informe de ventas Q2 2026' }),
    makeEmail({ id: 'c2', subject: 'Pizza para el viernes' }),
    makeEmail({ id: 'c3', subject: 'Ventas: actualización semanal' }),
  ];

  const matches = rule.findSimilar(trigger, candidates, { folderName: '', folderPath: '', score: 0, reason: '' });
  // c1 should match (informe + ventas), c3 should match (ventas), c2 should not
  const matchedIds = matches.map(m => m.emailId);
  if (!matchedIds.includes('c1')) throw new Error('c1 should match');
  if (!matchedIds.includes('c3')) throw new Error('c3 should match');
  if (matchedIds.includes('c2')) throw new Error('c2 should NOT match');
});

// ── LabelBasedRule ────────────────────────────────────────────────────────────

Deno.test('LabelBasedRule.suggest: starred email suggests "Destacados"', () => {
  const rule = new LabelBasedRule();
  const email = makeEmail({ starred: true });
  const suggestions = rule.suggest(email, []);

  const destacados = suggestions.find(s => s.folderName === 'Destacados');
  if (!destacados) throw new Error('Expected "Destacados" suggestion for starred email');
  if (destacados.score < 0.5) throw new Error(`Expected score >= 0.5, got ${destacados.score}`);
});

Deno.test('LabelBasedRule.suggest: maps known labels to folder names', () => {
  const rule = new LabelBasedRule();
  const email = makeEmail({ labels: ['Importante', 'Facturas'] });
  const suggestions = rule.suggest(email, []);

  const importante = suggestions.find(s => s.folderName === 'Importante');
  const facturas = suggestions.find(s => s.folderName === 'Facturas');
  if (!importante) throw new Error('Expected "Importante" folder suggestion');
  if (!facturas) throw new Error('Expected "Facturas" folder suggestion');
});

Deno.test('LabelBasedRule.suggest: unknown label → sanitized folder name', () => {
  const rule = new LabelBasedRule();
  const email = makeEmail({ labels: ['Proyecto X: Fase 1'] });
  const suggestions = rule.suggest(email, []);

  if (suggestions.length === 0) throw new Error('Expected at least one suggestion for unknown label');
  // Should sanitize the label name
  const sug = suggestions[0];
  if (sug.folderName.includes(':')) throw new Error('Folder name should not contain colon');
});

Deno.test('LabelBasedRule.suggest: no star + no labels → empty', () => {
  const rule = new LabelBasedRule();
  const email = makeEmail({ starred: false, labels: [] });
  const suggestions = rule.suggest(email, []);
  if (suggestions.length !== 0) throw new Error('Expected no suggestions for unstarred no-label email');
});

Deno.test('LabelBasedRule.findSimilar: groups starred emails', () => {
  const rule = new LabelBasedRule();
  const trigger = makeEmail({ id: 't1', starred: true });
  const candidates = [
    makeEmail({ id: 'c1', starred: true }),
    makeEmail({ id: 'c2', starred: false }),
    makeEmail({ id: 'c3', starred: true }),
  ];

  const matches = rule.findSimilar(trigger, candidates, { folderName: '', folderPath: '', score: 0, reason: '' });
  const matchedIds = matches.map(m => m.emailId);
  if (matchedIds.length !== 2) throw new Error(`Expected 2 starred matches, got ${matchedIds.length}`);
  if (!matchedIds.includes('c1')) throw new Error('c1 should match');
  if (!matchedIds.includes('c3')) throw new Error('c3 should match');
  if (matchedIds.includes('c2')) throw new Error('c2 should NOT match (not starred)');
});

Deno.test('LabelBasedRule.findSimilar: groups emails with same labels', () => {
  const rule = new LabelBasedRule();
  const trigger = makeEmail({ id: 't1', labels: ['Facturas', 'Urgente'] });
  const candidates = [
    makeEmail({ id: 'c1', labels: ['Facturas'] }),
    makeEmail({ id: 'c2', labels: ['Personal'] }),
    makeEmail({ id: 'c3', labels: ['Facturas', 'Urgente'] }),
  ];

  const matches = rule.findSimilar(trigger, candidates, { folderName: '', folderPath: '', score: 0, reason: '' });
  // c3 = 2/2 = 1.0, c1 = 1/2 = 0.5, c2 = 0/2 = 0
  if (matches.length !== 2) throw new Error(`Expected 2 matches, got ${matches.length}`);
  const c3 = matches.find(m => m.emailId === 'c3');
  if (!c3 || c3.score !== 1.0) throw new Error('c3 should have score 1.0');
  const c1 = matches.find(m => m.emailId === 'c1');
  if (!c1 || c1.score !== 0.5) throw new Error('c1 should have score 0.5');
});

// ── DomainBasedRule ───────────────────────────────────────────────────────────

Deno.test('DomainBasedRule.suggest: matches existing domain folder', () => {
  const rule = new DomainBasedRule();
  const email = makeEmail({ email: 'contact@stripe.com' });
  const folders = [makeFolder('stripe'), makeFolder('other')];

  const suggestions = rule.suggest(email, folders);
  if (suggestions.length === 0) throw new Error('Expected domain folder match');
  if (suggestions[0].folderName !== 'stripe') throw new Error(`Expected "stripe", got "${suggestions[0].folderName}"`);
});

Deno.test('DomainBasedRule.suggest: no domain → empty', () => {
  const rule = new DomainBasedRule();
  const email = makeEmail({ email: '' });
  const suggestions = rule.suggest(email, []);
  if (suggestions.length !== 0) throw new Error('Expected empty suggestions for no domain');
});

Deno.test('DomainBasedRule.findSimilar: groups by domain', () => {
  const rule = new DomainBasedRule();
  const trigger = makeEmail({ id: 't1', email: 'a@stripe.com' });
  const candidates = [
    makeEmail({ id: 'c1', email: 'b@stripe.com' }),
    makeEmail({ id: 'c2', email: 'c@google.com' }),
    makeEmail({ id: 'c3', email: 'd@stripe.com' }),
  ];

  const matches = rule.findSimilar(trigger, candidates, { folderName: '', folderPath: '', score: 0, reason: '' });
  if (matches.length !== 2) throw new Error(`Expected 2 domain matches, got ${matches.length}`);
  matches.forEach(m => {
    if (m.score !== 0.3) throw new Error(`Expected score 0.3, got ${m.score}`);
  });
});

// ── ClassificationEngine ──────────────────────────────────────────────────────

Deno.test('ClassificationEngine: aggregates multiple rules', () => {
  const engine = new ClassificationEngine(
    [new SenderRule(), new LabelBasedRule()],
    { minSuggestionScore: 0.1, maxSuggestions: 5 },
  );

  const email = makeEmail({
    email: 'alice@company.com',
    name: 'Alice',
    starred: true,
  });
  const folders = [makeFolder('alice')];

  const result = engine.classify(email, folders, []);

  // Should have sender match (score 1.0) and Destacados (score 0.6)
  if (result.suggestions.length < 2) throw new Error(`Expected >= 2 suggestions, got ${result.suggestions.length}`);

  // Sender match should be top
  if (result.suggestions[0].folderName !== 'alice') {
    throw new Error(`Expected top suggestion "alice", got "${result.suggestions[0].folderName}"`);
  }
});

Deno.test('ClassificationEngine: deduplicates overlapping suggestions', () => {
  const engine = new ClassificationEngine(
    [new SenderRule(), new DomainBasedRule()],
    { maxSuggestions: 10 },
  );

  // Email from stripe.com with local part "stripe" — sender suggests "stripe",
  // domain also suggests "stripe" → should be deduplicated
  const email = makeEmail({ email: 'stripe@stripe.com' });
  const folders = [makeFolder('stripe')];

  const result = engine.classify(email, folders, []);
  const stripeSuggestions = result.suggestions.filter(s => s.folderName === 'stripe');
  if (stripeSuggestions.length > 1) {
    throw new Error(`Expected deduplicated "stripe" suggestions, got ${stripeSuggestions.length}`);
  }
});

Deno.test('ClassificationEngine: respects minSuggestionScore', () => {
  const engine = new ClassificationEngine(
    [new DomainBasedRule()],
    { minSuggestionScore: 0.5 }, // domain rule scores 0.4 at best
  );

  const email = makeEmail({ email: 'a@stripe.com' });
  const folders = [makeFolder('stripe')];

  const result = engine.classify(email, folders, []);
  // DomainBasedRule scores 0.4 — below 0.5 threshold
  if (result.suggestions.length !== 0) throw new Error('Expected no suggestions below threshold');
});

Deno.test('ClassificationEngine: applies rule weights', () => {
  const engine = new ClassificationEngine(
    [new SenderRule(), new LabelBasedRule()],
    {
      ruleWeights: { sender: 0.5, label: 2.0 },
      minSuggestionScore: 0.1,
    },
  );

  const email = makeEmail({ email: 'alice@company.com', starred: true });
  const folders: { name: string; path: string }[] = [];

  const result = engine.classify(email, folders, []);

  // With weights: label rule (score 0.6 * 2.0 = 1.2) should beat sender rule (0.7 * 0.5 = 0.35)
  if (result.suggestions.length === 0) throw new Error('Expected suggestions');
  if (result.suggestions[0].folderName !== 'Destacados') {
    throw new Error(`Expected "Destacados" as top (weighted higher), got "${result.suggestions[0].folderName}"`);
  }
});

Deno.test('ClassificationEngine: finds similar emails across rules', () => {
  const engine = new ClassificationEngine(
    [new SenderRule(), new SubjectKeywordRule(0.2)],
    { minSimilarityScore: 0.2, maxSimilarEmails: 5 },
  );

  const trigger = makeEmail({
    id: 't1',
    email: 'bob@corp.com',
    subject: 'Informe mensual de ventas',
  });
  const candidates = [
    makeEmail({ id: 'c1', email: 'bob@corp.com', subject: 'Re: Informe mensual' }),
    makeEmail({ id: 'c2', email: 'other@corp.com', subject: 'Ventas: resumen' }),
    makeEmail({ id: 'c3', email: 'noise@other.com', subject: 'Pizza' }),
  ];

  const result = engine.classify(trigger, [], candidates);

  // c1: sender match (1.0) + keyword match → high score
  // c2: no sender match but keywords (ventas) → medium score
  // c3: no match → filtered
  const ids = result.similarEmails.map(m => m.emailId);
  if (!ids.includes('c1')) throw new Error('c1 should be similar (same sender)');
  if (!ids.includes('c2')) throw new Error('c2 should be similar (shared keywords)');
  if (ids.includes('c3')) throw new Error('c3 should NOT be similar');
});

Deno.test('ClassificationEngine: handles rule errors gracefully', () => {
  // Create a broken rule that throws
  const brokenRule = {
    name: 'broken',
    suggest: () => { throw new Error('Boom!'); },
    findSimilar: () => { throw new Error('Boom!'); },
  };

  const engine = new ClassificationEngine([brokenRule, new SenderRule()]);

  const email = makeEmail({ email: 'alice@company.com' });
  const folders = [makeFolder('alice')];

  // Should not throw — engine catches rule errors
  const result = engine.classify(email, folders, []);
  if (result.suggestions.length === 0) throw new Error('Engine should still return results from working rules');
});

Deno.test('ClassificationEngine: registerRule and removeRule', () => {
  const engine = new ClassificationEngine([]);

  if (engine.getRules().length !== 0) throw new Error('Engine should start empty');

  engine.registerRule(new SenderRule());
  if (engine.getRules().length !== 1) throw new Error('Should have 1 rule');

  // Register same name → replace
  engine.registerRule(new SenderRule());
  if (engine.getRules().length !== 1) throw new Error('Should still have 1 rule (replaced)');

  engine.removeRule('sender');
  if (engine.getRules().length !== 0) throw new Error('Should have 0 rules after removal');
});

// ── createDefaultEngine ───────────────────────────────────────────────────────

Deno.test('createDefaultEngine: returns pre-configured engine with 4 rules', () => {
  const engine = createDefaultEngine();
  const rules = engine.getRules();
  if (rules.length !== 4) throw new Error(`Expected 4 default rules, got ${rules.length}`);

  const names = rules.map(r => r.name);
  if (!names.includes('sender')) throw new Error('Missing sender rule');
  if (!names.includes('subject_keywords')) throw new Error('Missing subject_keywords rule');
  if (!names.includes('label')) throw new Error('Missing label rule');
  if (!names.includes('domain')) throw new Error('Missing domain rule');
});

Deno.test('createDefaultEngine: produces suggestions for typical email', () => {
  const engine = createDefaultEngine();

  const email = makeEmail({
    email: 'cliente@empresa.es',
    name: 'Cliente Nuevo',
    subject: 'Presupuesto para reforma cocina',
    starred: true,
  });
  const folders = [makeFolder('Proyectos')];

  const result = engine.classify(email, folders, []);

  // Should have multiple meaningful suggestions
  if (result.suggestions.length === 0) throw new Error('Expected suggestions for typical email');
  // Should include starred-derived suggestion
  const hasDestacados = result.suggestions.some(s => s.folderName === 'Destacados');
  if (!hasDestacados) throw new Error('Expected "Destacados" suggestion for starred email');
});

// ── Integration scenario ──────────────────────────────────────────────────────

Deno.test('Integration: full star + classify + auto-file flow', () => {
  const engine = createDefaultEngine();

  // Simulate: user stars an email from a known sender
  const email = makeEmail({
    id: 'msg-42',
    email: 'proveedor@acme.com',
    name: 'Proveedor ACME',
    subject: 'Factura #1234 — Servicios de limpieza Marzo 2026',
    starred: true,
  });

  const existingFolders = [
    makeFolder('Facturas'),
    makeFolder('Proveedores'),
    makeFolder('acme'),
  ];

  // Simulate other inbox emails
  const candidates = [
    makeEmail({ id: 'msg-1', email: 'proveedor@acme.com', subject: 'Factura #1233 — Febrero 2026' }),
    makeEmail({ id: 'msg-2', email: 'proveedor@acme.com', subject: 'Presupuesto limpieza anual' }),
    makeEmail({ id: 'msg-3', email: 'otro@xyz.com', subject: 'Reunión viernes' }),
    makeEmail({ id: 'msg-4', email: 'proveedor@acme.com', subject: 'Factura #1235 — Abril 2026', starred: false }),
  ];

  const result = engine.classify(email, existingFolders, candidates);

  // 1. Top suggestion should be "acme" folder (sender match, score ~1.2 with weight)
  if (result.suggestions.length === 0) throw new Error('Expected suggestions');
  if (result.suggestions[0].folderName !== 'acme') {
    throw new Error(`Expected top suggestion "acme", got "${result.suggestions[0].folderName}"`);
  }

  // 2. "Facturas" should also be suggested (keyword match from subject)
  const facturasSug = result.suggestions.find(s => s.folderName === 'Facturas');
  if (!facturasSug) throw new Error('Expected "Facturas" suggestion from keyword match');

  // 3. "Destacados" should be suggested (starred email)
  const destacadosSug = result.suggestions.find(s => s.folderName === 'Destacados');
  if (!destacadosSug) throw new Error('Expected "Destacados" suggestion from star');

  // 4. Similar emails: msg-1, msg-2, msg-4 should match (same sender)
  const similarIds = result.similarEmails.map(m => m.emailId);
  if (!similarIds.includes('msg-1')) throw new Error('msg-1 should be similar (same sender)');
  if (!similarIds.includes('msg-2')) throw new Error('msg-2 should be similar (same sender)');
  if (!similarIds.includes('msg-4')) throw new Error('msg-4 should be similar (same sender)');
  if (similarIds.includes('msg-3')) throw new Error('msg-3 should NOT be similar (different sender)');

  // 5. Sender matches should have high scores
  const highScoreMatches = result.similarEmails.filter(m => m.score >= 0.8);
  if (highScoreMatches.length < 2) throw new Error(`Expected >= 2 high-score matches, got ${highScoreMatches.length}`);
});

Deno.test('Integration: unstarred email from unknown sender', () => {
  const engine = createDefaultEngine();

  const email = makeEmail({
    email: 'newsletter@techblog.io',
    name: 'TechBlog Weekly',
    subject: 'Las 10 noticias de IA de esta semana',
    starred: false,
  });

  const folders = [makeFolder('Newsletters')]; // user already has this folder

  const result = engine.classify(email, folders, []);

  // Should suggest "Newsletters" (keyword match: "noticias", "news" filtered by name "Newsletters"... 
  // actually subject keywords are: noticias, esta, semana. Folder "Newsletters" = tokenizeSubject("Newsletters") = ["newsletters"]
  // Not a match. But "TechBlog_Weekly" should be suggested via sender rule.
  if (result.suggestions.length === 0) throw new Error('Expected at least one suggestion');
  // Should have a sender-based suggestion
  const hasSender = result.suggestions.some(s => s.createIfMissing);
  if (!hasSender) throw new Error('Expected createIfMissing suggestion for unknown sender');
});
