import Panel from '../components/Panel.jsx';
import ForecastActualChart from '../components/charts/ForecastActualChart.jsx';
import { EmptyState } from '../components/States.jsx';
import { formatCalendarDate, formatDateTime, formatHours, formatMW } from '../utils/format.js';

export default function ForecastAnalysisPage({ data }) {
  const { daily, cutoff, metrics: m } = data;
  const hasData = data.rows.some((r) => r.forecast != null || r.actual != null);

  return (
    <div className="space-y-6">
      <Panel
        title="Forecast vs actual, interval by interval"
        subtitle={`${cutoff.description}. Drag the handles below the chart to zoom.`}
        info="Actual generation (FUELHH) is half-hourly. WINDFOR forecasts are hourly; the forecast line is drawn through the hourly points. Hover any point for its publication time and error."
      >
        {hasData ? (
          <ForecastActualChart rows={data.rows} height={420} brush />
        ) : (
          <EmptyState title="No data for this range" />
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mean forecast</p>
          <p className="mt-2 text-xl font-semibold">{formatMW(m.mean_forecast)} <span className="text-sm text-slate-500">MW</span></p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mean actual</p>
          <p className="mt-2 text-xl font-semibold">{formatMW(m.mean_actual)} <span className="text-sm text-slate-500">MW</span></p>
        </div>
        <div className="panel p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mean forecast lead time</p>
          <p className="mt-2 text-xl font-semibold">{formatHours(m.mean_lead_time_hours)}</p>
          <p className="mt-1 text-xs text-slate-500">Time between publication and target interval</p>
        </div>
      </div>

      <Panel
        title="Forecast runs used per delivery day"
        subtitle="The publication time of the forecast selected for each day under the current cutoff rule."
        bodyClassName="overflow-x-auto"
      >
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-5 py-2.5 font-medium">Delivery date</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Selected forecast run(s), UK</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Mean forecast (MW)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Mean actual (MW)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Matched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {daily.map((d) => (
              <tr key={d.delivery_date} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-2.5 font-medium text-slate-800">{formatCalendarDate(d.delivery_date)}</td>
                <td className="px-5 py-2.5 text-slate-600">
                  {d.forecast_publish_times.length
                    ? d.forecast_publish_times.map(formatDateTime).join(', ')
                    : <span className="text-amber-700">No eligible forecast</span>}
                </td>
                <td className="num px-5 py-2.5 text-right">{formatMW(d.mean_forecast)}</td>
                <td className="num px-5 py-2.5 text-right">{formatMW(d.mean_actual)}</td>
                <td className="num px-5 py-2.5 text-right text-slate-600">
                  {d.observations}/{d.expected_intervals}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
