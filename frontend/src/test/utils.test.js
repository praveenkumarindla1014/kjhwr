import { describe, expect, it } from 'vitest';
import { toCSV } from '../utils/csv.js';
import { formatCalendarDate, formatDateTime, formatMW, formatMWUnit, formatPct } from '../utils/format.js';
import { filterRows, paginate, sortRows } from '../utils/table.js';
import { validateRange } from '../components/FilterBar.jsx';
import { toSeries } from '../components/charts/chartUtils.js';
import { makeRows } from './fixtures.js';

describe('formatting', () => {
  it('formats MW values and shows a dash for missing values', () => {
    expect(formatMW(12345.6)).toBe('12,346');
    expect(formatMW(250, { signed: true })).toBe('+250');
    expect(formatMW(-250, { signed: true })).toBe('-250');
    expect(formatMW(null)).toBe('—');
    expect(formatMWUnit(undefined)).toBe('—');
    expect(formatPct(12.345)).toBe('12.3%');
  });

  it('displays UK local time, including BST', () => {
    expect(formatDateTime('2026-01-10T09:30:00Z')).toContain('09:30');
    expect(formatDateTime('2026-06-10T09:30:00Z')).toContain('10:30');
    expect(formatCalendarDate('2026-01-10')).toContain('10 Jan 2026');
  });
});

describe('date range validation', () => {
  it('rejects out-of-range and reversed dates', () => {
    expect(validateRange('2026-01-01', '2026-01-31', '2026-01-01', '2026-01-31')).toBeNull();
    expect(validateRange('2025-12-31', '2026-01-02', '2026-01-01', '2026-01-31')).toMatch(/between/);
    expect(validateRange('2026-01-10', '2026-01-05', '2026-01-01', '2026-01-31')).toMatch(/on or before/);
    expect(validateRange('', '2026-01-05', '2026-01-01', '2026-01-31')).toMatch(/Select both/);
  });
});

describe('table helpers', () => {
  const rows = makeRows();

  it('filters to hourly evaluation intervals by default and by status', () => {
    expect(filterRows(rows)).toHaveLength(3);
    expect(filterRows(rows, { status: 'all' })).toHaveLength(6);
    expect(filterRows(rows, { status: 'missing_actual' })).toHaveLength(1);
    expect(filterRows(rows, { status: 'all', search: 'hourly product' })).toHaveLength(3);
  });

  it('sorts with missing values last in both directions', () => {
    const asc = sortRows(filterRows(rows), 'actual', 'asc');
    const desc = sortRows(filterRows(rows), 'actual', 'desc');
    expect(asc.map((r) => r.actual)).toEqual([900, 1000, null]);
    expect(desc.map((r) => r.actual)).toEqual([1000, 900, null]);
  });

  it('paginates and clamps the page', () => {
    const result = paginate(rows, 9, 4);
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.pageRows).toHaveLength(2);
  });
});

describe('csv export', () => {
  it('escapes values and leaves missing values empty', () => {
    const csv = toCSV([{ a: 'x,y', b: null }, { a: 'say "hi"', b: 3 }], [
      { header: 'A', key: 'a' },
      { header: 'B', key: 'b' },
    ]);
    expect(csv).toBe('A,B\r\n"x,y",\r\n"say ""hi""",3');
  });
});

describe('chart series', () => {
  it('bridges half-hour rows for drawing but keeps real values null', () => {
    const series = toSeries(makeRows());
    expect(series[1].forecast).toBeNull();
    expect(series[1].forecastLine).toBe(1050);
    expect(series[5].forecastLine).toBeNull(); // no next hourly forecast
  });
});
