import { formatDateTime, formatMWUnit } from '../../utils/format.js';
import { COLORS } from './chartUtils.js';

function Row({ color, label, value }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-slate-600">
        {color && <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="num font-medium text-slate-900">{value}</span>
    </div>
  );
}

/** Tooltip for forecast-vs-actual style charts; reads the hovered point's payload. */
export default function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const hasForecast = p.forecast !== null && p.forecast !== undefined;
  return (
    <div className="min-w-[230px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{formatDateTime(p.t)} UK</p>
      <p className="mb-2 text-[11px] text-slate-500">
        {hasForecast
          ? `Forecast published ${formatDateTime(p.publishTime)}`
          : p.status === 'no_forecast_interval'
            ? 'No forecast: WINDFOR is hourly'
            : 'No eligible forecast before cutoff'}
      </p>
      <div className="space-y-1">
        <Row color={COLORS.forecast} label="Forecast" value={formatMWUnit(p.forecast)} />
        <Row color={COLORS.actual} label="Actual" value={formatMWUnit(p.actual)} />
        <div className="my-1 border-t border-slate-100" />
        <Row
          label={p.error > 0 ? 'Error (over-forecast)' : p.error < 0 ? 'Error (under-forecast)' : 'Error'}
          value={formatMWUnit(p.error, { signed: true })}
        />
      </div>
    </div>
  );
}
