import Panel from '../components/Panel.jsx';
import InfoTip from '../components/InfoTip.jsx';
import { AbsoluteErrorChart, DailyErrorChart, HourProfileChart, SignedErrorChart } from '../components/charts/ErrorCharts.jsx';
import { COLORS } from '../components/charts/chartUtils.js';
import { EmptyState } from '../components/States.jsx';
import { formatCalendarDate, formatMW, formatPct } from '../utils/format.js';
import { METRIC_HELP } from './OverviewPage.jsx';

function MetricTile({ label, value, unit, help, note }) {
  return (
    <div className="panel p-5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
        <InfoTip text={help} label={`About ${label}`} />
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">
        {value}
        {unit && value !== '—' && <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{note}</p>
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-600">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

export default function AccuracyPage({ data }) {
  const { metrics: m, coverage: c, daily, hour_of_day: hourProfile } = data;

  if (!m.observations) {
    return (
      <div className="panel">
        <EmptyState
          title="No matched intervals"
          message="There are no intervals with both an eligible forecast and an actual value for this selection."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        Metrics use <strong className="text-slate-900">{m.observations}</strong> matched hourly intervals out of{' '}
        {c.expected_evaluation_intervals} expected ({formatPct(c.coverage_pct)} coverage).{' '}
        {c.excluded_intervals > 0 && `${c.excluded_intervals} intervals were excluded because a forecast or actual value was missing.`}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="MAE" value={formatMW(m.mae)} unit="MW" help={METRIC_HELP.mae}
          note={`Typical miss. Median ${formatMW(m.median_abs_error)} MW, 90th percentile ${formatMW(m.p90_abs_error)} MW.`} />
        <MetricTile label="RMSE" value={formatMW(m.rmse)} unit="MW" help={METRIC_HELP.rmse}
          note={`Largest single miss: ${formatMW(m.max_abs_error)} MW.`} />
        <MetricTile label="Bias" value={formatMW(m.bias, { signed: true })} unit="MW" help={METRIC_HELP.bias}
          note={`${m.over_forecast_count} over-forecast vs ${m.under_forecast_count} under-forecast intervals.`} />
        <MetricTile label="MAPE" value={formatPct(m.mape)} help={METRIC_HELP.mape}
          note={`${m.mape_observations} intervals with non-zero actual; ${m.mape_excluded_zero_actual} excluded (zero actual). Unstable at low output.`} />
      </div>

      <Panel
        title="Signed forecast error over time"
        subtitle="Forecast − actual for each matched hourly interval."
        actions={<Legend items={[[COLORS.over, 'Over-forecast (+)'], [COLORS.under, 'Under-forecast (−)']]} />}
      >
        <SignedErrorChart rows={data.rows} />
      </Panel>

      <Panel title="Absolute error over time" subtitle="|forecast − actual| with the period MAE for reference.">
        <AbsoluteErrorChart rows={data.rows} mae={m.mae} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Daily accuracy"
          subtitle="MAE and bias per UK delivery day."
          actions={<Legend items={[['#0f1f38', 'MAE'], [COLORS.over, 'Bias +'], [COLORS.under, 'Bias −']]} />}
        >
          <DailyErrorChart daily={daily} />
        </Panel>
        <Panel title="Error by hour of day" subtitle="MAE grouped by the UK-local hour of the target interval.">
          <HourProfileChart profile={hourProfile} />
        </Panel>
      </div>

      <Panel title="Daily accuracy summary" bodyClassName="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Delivery date</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Matched</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">MAE (MW)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">RMSE (MW)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Bias (MW)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">MAPE</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Max |error| (MW)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {daily.map((d) => (
              <tr key={d.delivery_date} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{formatCalendarDate(d.delivery_date)}</td>
                <td className="num px-5 py-2.5 text-right">{d.observations}/{d.expected_intervals}</td>
                <td className="num px-5 py-2.5 text-right">{formatMW(d.mae)}</td>
                <td className="num px-5 py-2.5 text-right">{formatMW(d.rmse)}</td>
                <td className={`num px-5 py-2.5 text-right ${d.bias > 0 ? 'text-red-600' : d.bias < 0 ? 'text-blue-700' : ''}`}>
                  {formatMW(d.bias, { signed: true })}
                </td>
                <td className="num px-5 py-2.5 text-right">{formatPct(d.mape)}</td>
                <td className="num px-5 py-2.5 text-right">{formatMW(d.max_abs_error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
