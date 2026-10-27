import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Gauge, Scale, Sigma, Target, Wind } from 'lucide-react';
import KpiCard from '../components/KpiCard.jsx';
import Panel from '../components/Panel.jsx';
import ForecastActualChart from '../components/charts/ForecastActualChart.jsx';
import { COLORS } from '../components/charts/chartUtils.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState } from '../components/States.jsx';
import {
  formatCalendarDate,
  formatDateTime,
  formatHours,
  formatMW,
  formatMWUnit,
  formatPct,
  formatTime,
} from '../utils/format.js';

export const METRIC_HELP = {
  mae: 'Mean Absolute Error: the average size of the forecast miss in MW, ignoring direction. Lower is better.',
  rmse: 'Root Mean Squared Error: like MAE but penalises large misses more heavily. A big gap between RMSE and MAE indicates occasional large errors.',
  bias: 'Mean signed error (forecast − actual). Positive = forecasts were systematically too high (over-forecast); negative = too low.',
  mape: 'Mean Absolute Percentage Error, computed only where actual generation is non-zero. It inflates sharply when generation is low, so read it alongside MAE.',
  coverage: 'Share of hourly target intervals where both an eligible forecast and an actual value exist. Only matched intervals are used in the metrics.',
};

export default function OverviewPage({ data }) {
  const evaluationRows = useMemo(() => data.rows.filter((r) => r.status !== 'no_forecast_interval'), [data.rows]);
  const dates = useMemo(() => [...new Set(evaluationRows.map((r) => r.delivery_date))], [evaluationRows]);

  const [selectedDate, setSelectedDate] = useState(dates[0]);
  const [selectedTime, setSelectedTime] = useState(null);

  useEffect(() => {
    if (!dates.includes(selectedDate)) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const dayRows = useMemo(
    () => evaluationRows.filter((r) => r.delivery_date === selectedDate),
    [evaluationRows, selectedDate],
  );
  const interval =
    dayRows.find((r) => r.start_time === selectedTime) ||
    dayRows.find((r) => formatTime(r.start_time) === '18:00') ||
    dayRows[0];

  const { metrics: m, coverage: c, cutoff } = data;

  if (!evaluationRows.length) {
    return <EmptyState title="No intervals in this range" message="Choose a different delivery date range." />;
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Target interval"
        subtitle="Pick a delivery date and hour to see what the desk could have known at the decision cutoff."
        bodyClassName="px-5 py-4"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-xs font-medium text-slate-600">
            Delivery date
            <select
              className="input mt-1 block"
              value={selectedDate || ''}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedTime(null);
              }}
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatCalendarDate(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Interval start (UK)
            <select
              className="input mt-1 block"
              value={interval?.start_time || ''}
              onChange={(e) => setSelectedTime(e.target.value)}
            >
              {dayRows.map((r) => (
                <option key={r.start_time} value={r.start_time}>
                  {formatTime(r.start_time)}
                </option>
              ))}
            </select>
          </label>
          {interval && (
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
              <div>
                <dt className="text-slate-500">Decision cutoff</dt>
                <dd className="font-medium text-slate-800">{formatDateTime(interval.cutoff)} UK</dd>
              </div>
              <div>
                <dt className="text-slate-500">Forecast published</dt>
                <dd className="font-medium text-slate-800">
                  {interval.publish_time ? `${formatDateTime(interval.publish_time)} UK` : 'None before cutoff'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Lead time</dt>
                <dd className="font-medium text-slate-800">{formatHours(interval.lead_time_hours)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge status={interval.status} />
                </dd>
              </div>
            </dl>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Forecast generation"
          accent={COLORS.forecast}
          value={formatMW(interval?.forecast)}
          unit="MW"
          scope="interval"
          icon={Wind}
          detail={interval ? `${formatCalendarDate(interval.delivery_date)} ${formatTime(interval.start_time)}` : null}
          info="Latest WINDFOR forecast for this interval that was published on or before the decision cutoff."
        />
        <KpiCard
          label="Actual generation"
          accent={COLORS.actual}
          value={formatMW(interval?.actual)}
          unit="MW"
          scope="interval"
          icon={Target}
          detail={
            interval?.error != null
              ? `Error ${formatMWUnit(interval.error, { signed: true })} (${interval.error > 0 ? 'over' : interval.error < 0 ? 'under' : 'exact'})`
              : 'Error unavailable'
          }
          info="FUELHH wind outturn for the same half-hour interval start."
        />
        <KpiCard
          label="Data coverage"
          value={formatPct(c.coverage_pct)}
          scope="period"
          icon={CalendarClock}
          detail={`${c.matched_intervals} of ${c.expected_evaluation_intervals} hourly intervals matched`}
          info={METRIC_HELP.coverage}
        />
        <KpiCard
          label="Mean absolute error"
          value={formatMW(m.mae)}
          unit="MW"
          scope="period"
          icon={Gauge}
          detail={m.normalised_mae_pct != null ? `${formatPct(m.normalised_mae_pct)} of mean actual` : null}
          info={METRIC_HELP.mae}
        />
        <KpiCard
          label="Root mean squared error"
          value={formatMW(m.rmse)}
          unit="MW"
          scope="period"
          icon={Sigma}
          detail={`n = ${m.observations}`}
          info={METRIC_HELP.rmse}
        />
        <KpiCard
          label="Forecast bias"
          value={formatMW(m.bias, { signed: true })}
          unit="MW"
          scope="period"
          icon={Scale}
          detail={m.bias == null ? null : m.bias > 0 ? 'Systematic over-forecast' : 'Systematic under-forecast'}
          info={METRIC_HELP.bias}
        />
      </div>

      <Panel
        title="Forecast vs actual wind generation"
        subtitle={`${formatCalendarDate(data.period.start_date)} – ${formatCalendarDate(data.period.end_date)} · ${cutoff.description}`}
      >
        <ForecastActualChart rows={data.rows} />
      </Panel>
    </div>
  );
}
