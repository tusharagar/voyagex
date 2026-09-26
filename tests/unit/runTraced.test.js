/**
 * TC-U-03 — the traced result shape.
 * SRS FR-24 · brief §12.2
 */
import { describe, it, expect, vi } from 'vitest';
import { runTraced, emptyTrace } from '../../server/utils/runTraced.js';

/** A stub client, so this stays a unit test with no database involved. */
function fakeClient(result) {
  return { query: vi.fn().mockResolvedValue(result) };
}

describe('runTraced', () => {
  it('TC-U-03a returns all seven keys of the traced shape', async () => {
    const client = fakeClient({
      rows: [{ a: 1 }], rowCount: 1, fields: [{ name: 'a' }],
    });
    const t = await runTraced('SELECT 1 AS a', [], client);
    expect(Object.keys(t).sort()).toEqual(
      ['columns', 'executionMs', 'params', 'plan', 'rowCount', 'rows', 'sql'],
    );
  });

  it('TC-U-03b keeps column names for an EMPTY result set', async () => {
    // The regression this guards: Object.keys(rows[0]) looks equivalent and
    // returns nothing here, so a search matching nothing would render a table
    // with no columns. res.fields still describes the shape of what was asked.
    const client = fakeClient({
      rows: [], rowCount: 0,
      fields: [{ name: 'package_id' }, { name: 'title' }],
    });
    const t = await runTraced('SELECT package_id, title FROM package WHERE false', [], client);
    expect(t.rows).toEqual([]);
    expect(t.rowCount).toBe(0);
    expect(t.columns).toEqual(['package_id', 'title']);
  });

  it('TC-U-03c never interpolates the bound values into the SQL text', async () => {
    const client = fakeClient({ rows: [], rowCount: 0, fields: [] });
    const t = await runTraced('SELECT * FROM package WHERE category = $1', ['Hill'], client);
    expect(t.sql).toContain('$1');
    expect(t.sql).not.toContain('Hill');
    expect(t.params).toEqual(['Hill']);
  });

  it('TC-U-03d measures execution time as a number', async () => {
    const client = fakeClient({ rows: [], rowCount: 0, fields: [] });
    const t = await runTraced('SELECT 1', [], client);
    expect(typeof t.executionMs).toBe('number');
    expect(t.executionMs).toBeGreaterThanOrEqual(0);
  });

  it('TC-U-03e survives a driver that reports no fields', async () => {
    const client = fakeClient({ rows: [], rowCount: 0 });
    const t = await runTraced('SET LOCAL x = 1', [], client);
    expect(t.columns).toEqual([]);
  });

  it('TC-U-03f a non-explainable statement does not fail the request', async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0, fields: [] })
        .mockRejectedValueOnce(new Error('cannot EXPLAIN this')),
    };
    const t = await runTraced('BEGIN', [], client, { explain: true });
    expect(t.plan).toBeNull();   // degraded, not thrown
  });

  it('TC-U-03g refuses to run without a client rather than failing obscurely', async () => {
    await expect(runTraced('SELECT 1', [], undefined)).rejects.toThrow(/no client or pool/);
  });

  it('TC-U-03h emptyTrace matches the same shape', () => {
    const t = emptyTrace('SELECT 1', []);
    expect(Object.keys(t).sort()).toEqual(
      ['columns', 'executionMs', 'params', 'plan', 'rowCount', 'rows', 'sql'],
    );
  });
});
