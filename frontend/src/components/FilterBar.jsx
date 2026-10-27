import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Clock3, Loader2, RefreshCw } from 'lucide-react';
import { formatDateTime } from '../utils/format.js';
import InfoTip from './InfoTip.jsx';

const CUTOFF_TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  return `${h}:${i % 2 ? '30' : '00'}`;
});
const HORIZONS = [1, 2, 4, 6, 8, 12, 18, 24, 30, 36, 42, 48, 60, 72];

export function validateRange(start, end, min, max) {
  if (!start || !end) return 'Select both a start and an end date.';
  if (start < min || end > max) return `Dates must be between ${min} and ${max}.`;
  if (start > end) return 'The start date must be on or before the end date.';
  return null;
}

export default function FilterBar({ filters, onChange, period, refreshedAt, loading, refreshing, onRefresh }) {
  const [draft, setDraft] = useState({ startDate: filters.startDate, endDate: filters.endDate });
  const min = period.start_date;
  const max = period.end_date;
  const rangeError = validateRange(draft.startDate, draft.endDate, min, max);

  useEffect(() => {
    setDraft({ startDate: filters.startDate, endDate: filters.endDate });
  }, [filters.startDate, filters.endDate]);

  const updateDate = (key, value) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    if (!validateRange(next.startDate, next.endDate, min, max)) onChange(next);
  };

  return (
    <div className="panel px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <fieldset className="flex flex-wrap items-end gap-2">
          <legend className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <CalendarDays size={13} aria-hidden="true" /> Delivery dates (UK)
          </legend>
          <label className="sr-only" htmlFor="start-date">Start date</label>
          <input
            id="start-date"
            type="date"
            className="input"
            min={min}
            max={max}
            value={draft.startDate}
            aria-invalid={Boolean(rangeError)}
            onChange={(e) => updateDate('startDate', e.target.value)}
          />
          <span className="pb-2 text-sm text-slate-400">to</span>
          <label className="sr-only" htmlFor="end-date">End date</label>
          <input
            id="end-date"
            type="date"
            className="input"
            min={min}
            max={max}
            value={draft.endDate}
            aria-invalid={Boolean(rangeError)}
            onChange={(e) => updateDate('endDate', e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary h-9 text-xs"
            onClick={() => {
              setDraft({ startDate: min, endDate: max });
              onChange({ startDate: min, endDate: max });
            }}
          >
            Full month
          </button>
        </fieldset>

        <fieldset className="flex flex-wrap items-end gap-2">
          <legend className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Clock3 size={13} aria-hidden="true" /> Decision cutoff
            <InfoTip
              label="About the decision cutoff"
              text="Only forecasts published on or before the cutoff are eligible; the latest eligible run is used. Default assumption: D-1 at 11:00 UK time (GB day-ahead auction gate closure). This is a configurable assumption, not an official rule for your trading desk."
            />
          </legend>
          <label className="sr-only" htmlFor="cutoff-mode">Cutoff rule</label>
          <select
            id="cutoff-mode"
            className="input"
            value={filters.cutoffMode}
            onChange={(e) => onChange({ cutoffMode: e.target.value })}
          >
            <option value="day_ahead">Day-ahead (D-1 at time)</option>
            <option value="horizon">Fixed lead time</option>
          </select>
          {filters.cutoffMode === 'day_ahead' ? (
            <>
              <label className="sr-only" htmlFor="cutoff-time">Cutoff time (UK)</label>
              <select
                id="cutoff-time"
                className="input"
                value={filters.cutoffTime}
                onChange={(e) => onChange({ cutoffTime: e.target.value })}
              >
                {CUTOFF_TIMES.map((t) => (
                  <option key={t} value={t}>
                    {t} UK
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="sr-only" htmlFor="horizon-hours">Minimum lead time</label>
              <select
                id="horizon-hours"
                className="input"
                value={filters.horizonHours}
                onChange={(e) => onChange({ horizonHours: Number(e.target.value) })}
              >
                {HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    ≥ {h} h before
                  </option>
                ))}
              </select>
            </>
          )}
        </fieldset>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <div className="text-right text-xs leading-tight text-slate-500">
            <p>Last successful refresh</p>
            <p className="font-medium text-slate-700">{refreshedAt ? `${formatDateTime(refreshedAt)} UK` : '—'}</p>
          </div>
          {loading && !refreshing && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500" role="status">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Updating…
            </span>
          )}
          <button type="button" className="btn-primary" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </div>
      {rangeError && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle size={13} aria-hidden="true" /> {rangeError}
        </p>
      )}
    </div>
  );
}
