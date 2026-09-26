/**
 * TC-U-02 — refund tier boundaries.
 * SRS FR-18 · brief §12.2 ("test the boundaries, not just the middles")
 *
 * The tiers exist in two places: cancel_booking() in PL/pgSQL, which is
 * authoritative, and refundPercentFor() in JavaScript, which only previews the
 * figure before a user confirms. Duplication is a known risk (booking.service
 * says so), so this asserts the JavaScript copy at every boundary, and
 * tests/integration/booking.test.js asserts the database against the same
 * numbers. If the two ever diverge, one of the two suites fails.
 */
import { describe, it, expect } from 'vitest';
import { refundPercentFor } from '../../server/services/booking.service.js';

describe('refundPercentFor — the published penalty scale', () => {
  it.each([
    [400, 1.00, 'far future'],
    [32,  1.00, 'comfortably over 30 days'],
    [31,  1.00, 'one day over the boundary'],
    [30,  0.50, 'EXACTLY 30 — the 50% tier, not 100%'],
    [29,  0.50, 'just inside 15-30'],
    [16,  0.50, 'upper-middle of 15-30'],
    [15,  0.50, 'EXACTLY 15 — still 50%'],
    [14,  0.25, 'EXACTLY 14 — drops to 25%'],
    [10,  0.25, 'middle of 7-14'],
    [7,   0.25, 'EXACTLY 7 — still 25%'],
    [6,   0.00, 'EXACTLY 6 — nothing back'],
    [1,   0.00, 'day before'],
    [0,   0.00, 'day of departure'],
  ])('TC-U-02 %i days before departure refunds %f (%s)', (days, pct) => {
    expect(refundPercentFor(days)).toBe(pct);
  });

  it('TC-U-02n a departure already past refunds nothing', () => {
    expect(refundPercentFor(-5)).toBe(0);
  });
});
