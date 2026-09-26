/**
 * TC-U-01 — the whitelist filter builder.
 * SRS NFR-04 · FR-06 · brief §12.2
 *
 * This is the function that stands between a query string and the SQL, so it
 * gets tested on the hostile cases as well as the ordinary ones.
 */
import { describe, it, expect } from 'vitest';
import { buildWhere } from '../../server/utils/runTraced.js';
import { PACKAGE_FILTERS } from '../../server/routes/packages.js';

describe('buildWhere — whitelisted filter construction', () => {
  it('TC-U-01a emits sequential $n placeholders in order', () => {
    const { clause, values } = buildWhere(
      { category: 'Hill', maxPrice: 30000 }, PACKAGE_FILTERS,
    );
    expect(clause).toContain('$1');
    expect(clause).toContain('$2');
    expect(values).toEqual(['Hill', 30000]);
    // Never a literal spliced into the text.
    expect(clause).not.toContain('Hill');
    expect(clause).not.toContain('30000');
  });

  it('TC-U-01b continues numbering from startAt, for composing clauses', () => {
    const { clause, values } = buildWhere({ category: 'Beach' }, PACKAGE_FILTERS, 4);
    expect(clause).toContain('$4');
    expect(values).toEqual(['Beach']);
  });

  it('TC-U-01c discards unknown keys and reports them', () => {
    const { clause, values, applied, ignored } = buildWhere(
      { category: 'Hill', nonsense: 'x', user_id: 7 }, PACKAGE_FILTERS,
    );
    expect(applied).toEqual(['category']);
    expect(ignored).toEqual(['nonsense', 'user_id']);
    expect(values).toEqual(['Hill']);
    expect(clause).not.toContain('nonsense');
    expect(clause).not.toContain('user_id');
  });

  it('TC-U-01d a SQL-injection attempt in a KEY changes nothing', () => {
    const clean = buildWhere({ category: 'Hill' }, PACKAGE_FILTERS);
    // Built with JSON.parse rather than an object literal, deliberately: in a
    // literal, `__proto__` sets the prototype instead of creating an own
    // property, so Object.entries never sees it and the test would be asserting
    // against a key that was never there. JSON.parse creates a real own
    // property — and is also how a request body actually arrives.
    const evil = buildWhere(JSON.parse(JSON.stringify({
      category: 'Hill',
      'city; DROP TABLE booking --': 'x',
      "1' OR '1'='1": 'y',
    }) .replace(/}$/, ',"__proto__":"z"}')), PACKAGE_FILTERS);

    // Byte-identical SQL, identical bound values: the hostile keys contributed
    // nothing at all.
    expect(evil.clause).toBe(clean.clause);
    expect(evil.values).toEqual(clean.values);
    expect(evil.ignored).toHaveLength(3);
  });

  it('TC-U-01e a SQL-injection attempt in a VALUE stays a bound parameter', () => {
    const { clause, values } = buildWhere(
      { category: "Hill'; DROP TABLE booking; --" }, PACKAGE_FILTERS,
    );
    // The payload rides in values, where PostgreSQL treats it as a string and
    // never as syntax.
    expect(values).toEqual(["Hill'; DROP TABLE booking; --"]);
    expect(clause).toBe('WHERE p.category = $1');
  });

  it('TC-U-01f skips empty, null and undefined values', () => {
    const { clause, values, applied } = buildWhere(
      { category: '', destination: null, month: undefined, maxPrice: 5000 },
      PACKAGE_FILTERS,
    );
    expect(applied).toEqual(['maxPrice']);
    expect(values).toEqual([5000]);
    expect(clause).toBe('WHERE dep.price <= $1');
  });

  it('TC-U-01g no filters produces no WHERE clause at all', () => {
    const { clause, values } = buildWhere({}, PACKAGE_FILTERS);
    expect(clause).toBe('');
    expect(values).toEqual([]);
  });

  it('TC-U-01h ILIKE filters are wrapped for partial matching', () => {
    const { clause, values } = buildWhere({ destination: 'Man' }, PACKAGE_FILTERS);
    expect(clause).toBe('WHERE d.name ILIKE $1');
    expect(values).toEqual(['%Man%']);
  });
});
