import { STATUS_LABELS, formatDateTime } from './format.js';

export function filterRows(rows, { search = '', status = 'evaluation', date = '' } = {}) {
  const term = search.trim().toLowerCase();
  return rows.filter((r) => {
    if (status === 'evaluation' && r.status === 'no_forecast_interval') return false;
    if (status !== 'all' && status !== 'evaluation' && r.status !== status) return false;
    if (date && r.delivery_date !== date) return false;
    if (!term) return true;
    const haystack = [
      formatDateTime(r.start_time),
      r.publish_time ? formatDateTime(r.publish_time) : '',
      STATUS_LABELS[r.status] || r.status,
      r.forecast ?? '',
      r.actual ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

/** Sort with missing values always last, regardless of direction. */
export function sortRows(rows, key, direction = 'asc') {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const aMissing = av === null || av === undefined;
    const bMissing = bv === null || bv === undefined;
    if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}

export function paginate(rows, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { pageRows: rows.slice((current - 1) * pageSize, current * pageSize), pageCount, page: current };
}
