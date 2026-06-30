/**
 * Unit tests for the canonical module-key helpers hoisted out of
 * modules-admin.component.ts. These run via the project's Karma+Jasmine
 * test runner (`npm run test`); the helper itself is pure (no Angular
 * DI, no DOM), so no TestBed setup is required.
 *
 * Spec ref: F-PB-004 (Module Key Namespace Canonicalization).
 */
import {
  SIDEBAR_CATALOG,
  LEGACY_MODULE_KEY_ALIASES,
  MODULE_KEY_ALIASES,
  CANONICAL_MODULE_KEYS,
  canonicalModuleKey,
  canonicalizeModules,
  isCanonicalModuleKey,
} from './module-keys';

describe('module-keys', () => {
  describe('SIDEBAR_CATALOG', () => {
    it('exposes 18 entries (matches the production sidebar surface)', () => {
      expect(SIDEBAR_CATALOG.length).toBe(18);
    });

    it('contains no duplicate keys', () => {
      const seen = new Set<string>();
      for (const entry of SIDEBAR_CATALOG) {
        expect(seen.has(entry.key)).toBe(false);
        seen.add(entry.key);
      }
      expect(seen.size).toBe(SIDEBAR_CATALOG.length);
    });

    it('every entry has key, label, icon, and category', () => {
      for (const entry of SIDEBAR_CATALOG) {
        expect(typeof entry.key).toBe('string');
        expect(entry.key.length).toBeGreaterThan(0);
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
        expect(typeof entry.icon).toBe('string');
        expect(['core', 'production']).toContain(entry.category);
      }
    });
  });

  describe('LEGACY_MODULE_KEY_ALIASES', () => {
    const expectedMappings: ReadonlyArray<[string, string]> = [
      ['clientes', 'core_/clientes'],
      ['reservas', 'moduloReservas'],
      ['webmail', 'core_/webmail'],
      ['analiticas', 'moduloAnaliticas'],
      ['facturas', 'moduloFacturas'],
      ['presupuestos', 'moduloPresupuestos'],
      ['facturacion', 'moduloFacturas'],
      ['marketing', 'marketing'],
      ['proyectos', 'moduloProyectos'],
      ['servicios', 'moduloServicios'],
      ['productos', 'moduloProductos'],
      ['dispositivos', 'moduloSAT'],
      ['tickets', 'moduloChat'],
    ];

    it.each(expectedMappings)(
      'maps legacy "%s" → canonical "%s"',
      (legacy, canonical) => {
        expect(LEGACY_MODULE_KEY_ALIASES[legacy]).toBe(canonical);
      },
    );

    it('MODULE_KEY_ALIASES is the same reference as LEGACY_MODULE_KEY_ALIASES (alias contract)', () => {
      expect(MODULE_KEY_ALIASES).toBe(LEGACY_MODULE_KEY_ALIASES);
    });

    it('exposes exactly 13 aliases', () => {
      expect(Object.keys(LEGACY_MODULE_KEY_ALIASES).length).toBe(13);
    });
  });

  describe('canonicalModuleKey', () => {
    it('returns the canonical form for a legacy plain key', () => {
      expect(canonicalModuleKey('clientes')).toBe('core_/clientes');
      expect(canonicalModuleKey('reservas')).toBe('moduloReservas');
      expect(canonicalModuleKey('facturacion')).toBe('moduloFacturas');
    });

    it('passes through canonical keys unchanged', () => {
      expect(canonicalModuleKey('core_/clientes')).toBe('core_/clientes');
      expect(canonicalModuleKey('moduloReservas')).toBe('moduloReservas');
      expect(canonicalModuleKey('marketing')).toBe('marketing');
    });

    it('passes unknown keys through unchanged (forward-compat for future canonical keys)', () => {
      expect(canonicalModuleKey('future/key')).toBe('future/key');
      expect(canonicalModuleKey('foo')).toBe('foo');
    });

    it('returns the empty string unchanged', () => {
      expect(canonicalModuleKey('')).toBe('');
    });
  });

  describe('canonicalizeModules', () => {
    it('canonicalizes a mixed list with legacy + canonical keys', () => {
      expect(
        canonicalizeModules(['clientes', 'reservas', 'core_/webmail']),
      ).toEqual(['core_/clientes', 'moduloReservas', 'core_/webmail']);
    });

    it('de-duplicates entries that collapse onto the same canonical key', () => {
      // 'facturas' and 'facturacion' both resolve to moduloFacturas.
      const result = canonicalizeModules(['facturas', 'facturacion']);
      expect(result).toEqual(['moduloFacturas']);
    });

    it('keeps an entry that already matches a canonical key', () => {
      expect(canonicalizeModules(['moduloReservas'])).toEqual(['moduloReservas']);
    });

    it('passes unknown keys through unchanged so they are not silently dropped', () => {
      const result = canonicalizeModules(['clientes', 'unknown-key']);
      expect(result).toEqual(['core_/clientes', 'unknown-key']);
    });

    it('returns an empty array for an empty input', () => {
      expect(canonicalizeModules([])).toEqual([]);
    });

    it('does not mutate the input array', () => {
      const input = ['clientes', 'facturas'];
      const snapshot = [...input];
      canonicalizeModules(input);
      expect(input).toEqual(snapshot);
    });

    it('order is preserved (first occurrence wins among duplicates)', () => {
      const result = canonicalizeModules(['core_/clientes', 'clientes']);
      expect(result).toEqual(['core_/clientes']);
    });
  });

  describe('CANONICAL_MODULE_KEYS / isCanonicalModuleKey', () => {
    it('contains every SIDEBAR_CATALOG key', () => {
      for (const entry of SIDEBAR_CATALOG) {
        expect(CANONICAL_MODULE_KEYS.has(entry.key)).toBe(true);
      }
    });

    it('returns true for canonical keys', () => {
      expect(isCanonicalModuleKey('core_/clientes')).toBe(true);
      expect(isCanonicalModuleKey('moduloReservas')).toBe(true);
    });

    it('returns false for legacy plain keys', () => {
      expect(isCanonicalModuleKey('clientes')).toBe(false);
      expect(isCanonicalModuleKey('facturas')).toBe(false);
    });

    it('returns false for unknown keys', () => {
      expect(isCanonicalModuleKey('not-a-key')).toBe(false);
      expect(isCanonicalModuleKey('')).toBe(false);
    });
  });
});