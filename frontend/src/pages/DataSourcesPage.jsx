import { ExternalLink } from 'lucide-react';
import Panel from '../components/Panel.jsx';
import { ErrorState, Skeleton } from '../components/States.jsx';
import { formatCalendarDate, formatDateTime } from '../utils/format.js';

function Item({ term, children }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[220px_1fr]">
      <dt className="text-sm font-medium text-slate-500">{term}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default function DataSourcesPage({ meta, analysis }) {
  if (meta.error && !meta.data) {
    return <ErrorState title="Could not load source information" message={meta.error.message} onRetry={meta.reload} />;
  }
  if (!meta.data) {
    return (
      <div className="panel space-y-3 p-6" role="status" aria-label="Loading source information">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  const m = meta.data;
  const counts = m.record_counts;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {m.sources.map((s) => (
          <Panel key={s.dataset} title={s.name} subtitle={`Elexon BMRS dataset ${s.dataset}`}>
            <p className="text-sm text-slate-600">{s.description}</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Endpoint</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-slate-700">GET {s.endpoint}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Fields used</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {s.fields.map((f) => (
                    <code key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{f}</code>
                  ))}
                </dd>
              </div>
            </dl>
            <a
              href={s.documentation_url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-forecast hover:underline"
            >
              Official documentation <ExternalLink size={14} aria-hidden="true" />
            </a>
          </Panel>
        ))}
      </div>

      <Panel title="Dataset & methodology">
        <dl className="divide-y divide-slate-100">
          <Item term="Analysis period">
            Delivery dates {formatCalendarDate(m.analysis_period.start_date)} – {formatCalendarDate(m.analysis_period.end_date)} (UK local
            days; purchase decisions for these days are made on the preceding day).
          </Item>
          <Item term="Last successful refresh">
            {m.data_refreshed_at ? `${formatDateTime(m.data_refreshed_at)} UK` : '—'}{' '}
            <span className="text-slate-500">({m.loaded_from === 'elexon_api' ? 'fetched live from Elexon' : 'served from the local snapshot of Elexon data'})</span>
          </Item>
          <Item term="Records loaded">
            {counts.actuals?.valid_records?.toLocaleString('en-GB')} actual half-hours ·{' '}
            {counts.forecasts?.valid_records?.toLocaleString('en-GB')} forecast values across {m.forecast_publish_runs} forecast runs.
            Invalid: {counts.actuals?.invalid_records ?? 0} actual / {counts.forecasts?.invalid_records ?? 0} forecast; duplicates removed:{' '}
            {counts.actuals?.duplicate_records ?? 0} / {counts.forecasts?.duplicate_records ?? 0}.
          </Item>
          <Item term="Decision cutoff assumption">
            <p>
              Default: <strong>{m.default_cutoff.description}</strong>. Currently applied:{' '}
              <strong>{analysis?.cutoff?.description ?? '—'}</strong>.
            </p>
            <p className="mt-1 text-slate-600">
              The default reflects the GB day-ahead hourly auction gate closure (11:00 UK on D-1). The brief does not state
              the client's exact cutoff, so it is an assumption you can change in the header (any D-1 time, or a fixed lead
              time of 1–{m.max_horizon_hours} h).
            </p>
          </Item>
          <Item term="Forecast selection">
            For each target interval, every WINDFOR run published on or before the cutoff (and before the interval
            starts) is eligible; the one with the latest <code>publishTime</code> is used. Later runs are never used,
            which avoids hindsight bias.
          </Item>
          <Item term="Matching & resolution">
            Forecast and actual values are matched on identical <code>startTime</code> (UTC). FUELHH is half-hourly and
            WINDFOR is hourly, so accuracy is evaluated on the hourly intervals; half-past intervals are shown as
            “No forecast (hourly product)” and are not counted as missing.
          </Item>
          <Item term="Metrics">
            <ul className="list-disc space-y-1 pl-5">
              <li>Signed error = forecast − actual (positive = over-forecast)</li>
              <li>MAE = mean(|forecast − actual|)</li>
              <li>RMSE = √mean((forecast − actual)²)</li>
              <li>Bias = mean(forecast − actual)</li>
              <li>MAPE = mean(|forecast − actual| / actual) × 100, only where actual ≠ 0; excluded count is reported</li>
            </ul>
          </Item>
          <Item term="Missing data">
            Missing values are never filled or treated as zero. Intervals lacking an eligible forecast or an actual value
            are labelled, counted in coverage, and excluded from the metrics. Duplicate actuals keep the latest published
            revision; exact duplicate forecasts are removed.
          </Item>
          <Item term="Time zones">
            All data is stored and processed in UTC. Delivery days, the cutoff, and all displayed times use UK local time
            (Europe/London), so daylight-saving days (46/50 half-hours) are handled correctly.
          </Item>
        </dl>
      </Panel>
    </div>
  );
}
