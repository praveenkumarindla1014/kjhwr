import { formatDay, formatTime } from '../../utils/format.js';

export const COLORS = {
  forecast: '#2a78d6',
  actual: '#1baf7a',
  over: '#e34948',
  under: '#2a78d6',
  grid: '#e2e8f0',
  axis: '#94a3b8',
  ink: '#64748b',
};

export const AXIS_TICK = { fill: COLORS.ink, fontSize: 11 };

const has = (v) => v !== null && v !== undefined;

/**
 * Rows -> chart points keyed by epoch ms.
 * `forecastLine` is drawing-only: WINDFOR is hourly, so half-past rows are bridged
 * between two real hourly forecasts. Genuinely missing forecasts stay null and
 * break the line. Tooltips always read the real `forecast` value.
 */
export function toSeries(rows) {
  return rows.map((r, i) => {
    let forecastLine = r.forecast;
    if (r.status === 'no_forecast_interval') {
      const prev = rows[i - 1]?.forecast;
      const next = rows[i + 1]?.forecast;
      forecastLine = has(prev) && has(next) ? (prev + next) / 2 : null;
    }
    return {
      t: Date.parse(r.start_time),
      forecast: r.forecast,
      forecastLine,
      actual: r.actual,
      error: r.error,
      absError: r.abs_error,
      publishTime: r.publish_time,
      status: r.status,
    };
  });
}

/** Only intervals where a forecast exists (hourly), for error charts. */
export function toEvaluationSeries(rows) {
  return toSeries(rows.filter((r) => r.status !== 'no_forecast_interval'));
}

/** One tick per UK day for multi-day ranges, every 3 hours for a single day. */
export function timeTicks(rows) {
  if (!rows.length) return { ticks: [], formatter: formatTime };
  const days = new Set(rows.map((r) => r.delivery_date));
  if (days.size <= 1) {
    const ticks = rows.filter((_, i) => i % 6 === 0).map((r) => Date.parse(r.start_time));
    return { ticks, formatter: formatTime };
  }
  const step = days.size > 16 ? 3 : days.size > 7 ? 2 : 1;
  const seen = [];
  rows.forEach((r) => {
    if (seen.length === 0 || seen[seen.length - 1].day !== r.delivery_date) {
      seen.push({ day: r.delivery_date, t: Date.parse(r.start_time) });
    }
  });
  return { ticks: seen.filter((_, i) => i % step === 0).map((s) => s.t), formatter: formatDay };
}

export const mwTick = (v) => `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
