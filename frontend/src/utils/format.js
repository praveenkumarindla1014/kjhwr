export const UK_TZ = 'Europe/London';

const mwFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const shortDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dayFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: UK_TZ, day: '2-digit', month: 'short' });
const longDayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const isMissing = (v) => v === null || v === undefined || Number.isNaN(v);

export function formatMW(value, { signed = false } = {}) {
  if (isMissing(value)) return '—';
  const text = mwFormatter.format(Math.round(value));
  return signed && value > 0 ? `+${text}` : text;
}

export function formatMWUnit(value, opts) {
  return isMissing(value) ? '—' : `${formatMW(value, opts)} MW`;
}

export function formatPct(value) {
  return isMissing(value) ? '—' : `${pctFormatter.format(value)}%`;
}

export function formatHours(value) {
  return isMissing(value) ? '—' : `${Number(value).toFixed(1)} h`;
}

const toDate = (v) => (v instanceof Date ? v : new Date(v));

export function formatDateTime(value) {
  return value ? dateTimeFormatter.format(toDate(value)) : '—';
}
export function formatShortDateTime(value) {
  return value ? shortDateTimeFormatter.format(toDate(value)) : '—';
}
export function formatTime(value) {
  return value ? timeFormatter.format(toDate(value)) : '—';
}
export function formatDay(value) {
  return value ? dayFormatter.format(toDate(value)) : '—';
}
/** Format a YYYY-MM-DD calendar date (no timezone shift). */
export function formatCalendarDate(isoDate) {
  return isoDate ? longDayFormatter.format(new Date(`${isoDate}T00:00:00Z`)) : '—';
}

export const STATUS_LABELS = {
  matched: 'Matched',
  missing_forecast: 'Missing forecast',
  missing_actual: 'Missing actual',
  missing_both: 'Missing both',
  no_forecast_interval: 'No forecast (hourly product)',
};
