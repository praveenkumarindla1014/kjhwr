// SYNTHETIC fixtures for frontend tests only - not real Elexon data.

export function makeRows() {
  const rows = [];
  for (let h = 0; h < 3; h += 1) {
    for (const m of [0, 30]) {
      const start = `2026-01-10T${String(h).padStart(2, '0')}:${m ? '30' : '00'}:00Z`;
      const isHour = m === 0;
      const forecast = isHour ? 1000 + h * 100 : null;
      const actual = h === 2 && isHour ? null : 900 + h * 100;
      const error = forecast != null && actual != null ? forecast - actual : null;
      rows.push({
        start_time: start,
        delivery_date: '2026-01-10',
        cutoff: '2026-01-09T11:00:00Z',
        publish_time: isHour ? '2026-01-09T09:30:00Z' : null,
        forecast,
        actual,
        error,
        abs_error: error == null ? null : Math.abs(error),
        lead_time_hours: isHour ? 14.5 + h : null,
        status: !isHour ? 'no_forecast_interval' : actual == null ? 'missing_actual' : 'matched',
      });
    }
  }
  return rows;
}

export function makeAnalysis(overrides = {}) {
  return {
    period: { start_date: '2026-01-01', end_date: '2026-01-31', timezone: 'Europe/London' },
    cutoff: {
      mode: 'day_ahead',
      cutoff_time: '11:00',
      horizon_hours: 24,
      description: 'Latest forecast published by 11:00 UK time on the day before delivery (D-1)',
    },
    metrics: {
      observations: 2, mae: 100, rmse: 100, bias: 100, mape: 10.5, mape_observations: 2, mape_excluded_zero_actual: 0,
      normalised_mae_pct: 10.5, median_abs_error: 100, p90_abs_error: 100, max_abs_error: 100,
      mean_forecast: 1050, mean_actual: 950, over_forecast_count: 2, under_forecast_count: 0, mean_lead_time_hours: 15,
    },
    coverage: {
      expected_half_hour_intervals: 6, actual_half_hour_intervals_available: 5, expected_evaluation_intervals: 3,
      matched_intervals: 2, missing_forecast_intervals: 0, missing_actual_intervals: 1, missing_both_intervals: 0,
      excluded_intervals: 1, coverage_pct: 66.67,
    },
    daily: [
      {
        delivery_date: '2026-01-10', observations: 2, expected_intervals: 3, mae: 100, rmse: 100, bias: 100, mape: 10.5,
        mean_forecast: 1050, mean_actual: 950, max_abs_error: 100, forecast_publish_times: ['2026-01-09T09:30:00Z'],
      },
    ],
    hour_of_day: [{ hour: 0, observations: 1, mae: 100, bias: 100 }],
    rows: makeRows(),
    data_refreshed_at: '2026-10-27T09:18:20Z',
    ...overrides,
  };
}

export const META = {
  analysis_period: { start_date: '2026-01-01', end_date: '2026-01-31', timezone: 'Europe/London' },
  default_cutoff: { mode: 'day_ahead', cutoff_time: '11:00', horizon_hours: 24, description: 'Latest forecast published by 11:00 UK time on the day before delivery (D-1)' },
  max_horizon_hours: 72,
  data_refreshed_at: '2026-10-27T09:18:20Z',
  loaded_from: 'local_snapshot',
  sources: [
    { name: 'Actual wind generation', dataset: 'FUELHH', description: 'x', endpoint: 'https://e/FUELHH/stream', documentation_url: 'https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream', fields: ['startTime'] },
    { name: 'Wind generation forecast', dataset: 'WINDFOR', description: 'y', endpoint: 'https://e/WINDFOR/stream', documentation_url: 'https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream', fields: ['publishTime'] },
  ],
  record_counts: { actuals: { valid_records: 6 }, forecasts: { valid_records: 3 } },
  forecast_publish_runs: 1,
};

const json = (body, status = 200) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

/** Builds a fetch mock. `handlers` maps a path to a function (url, init) => response promise. */
export function mockFetch(handlers = {}) {
  return vi.fn((url, init) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (handlers[path]) return handlers[path](url, init);
    if (path === '/api/analysis') return json(makeAnalysis());
    if (path === '/api/meta') return json(META);
    if (path === '/api/health') return json({ status: 'ok', data_loaded: true, data_refreshed_at: META.data_refreshed_at, last_refresh_error: null });
    return json({ detail: 'not found' }, 404);
  });
}

export { json };
