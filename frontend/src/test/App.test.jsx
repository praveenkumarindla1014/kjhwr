import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { json, makeAnalysis, mockFetch } from './fixtures.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('loads backend data into the overview KPI cards', async () => {
    vi.stubGlobal('fetch', mockFetch());
    render(<App />);
    expect(screen.getByRole('status', { name: /loading data/i })).toBeInTheDocument();
    expect(await screen.findByText('Mean absolute error')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 hourly intervals matched')).toBeInTheDocument();
  });

  it('navigates between views from the sidebar', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mean absolute error');
    const nav = screen.getByRole('navigation', { name: /main navigation/i });

    await user.click(within(nav).getByText('Accuracy Analysis'));
    expect(screen.getByRole('heading', { level: 1, name: 'Accuracy Analysis' })).toBeInTheDocument();
    expect(screen.getByText(/2 over-forecast vs 0 under-forecast/)).toBeInTheDocument();

    await user.click(within(nav).getByText('Data Sources'));
    expect(await screen.findAllByText('Official documentation')).toHaveLength(2);
  });

  it('shows a retryable error state when the API fails', async () => {
    let fail = true;
    const fetchMock = mockFetch({
      '/api/analysis': () => (fail ? json({ detail: 'No cached data and Elexon fetch failed' }, 503) : json(makeAnalysis())),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('No cached data and Elexon fetch failed')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Mean absolute error')).toBeInTheDocument();
  });

  it('sends cutoff changes to the backend', async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mean absolute error');
    await user.selectOptions(screen.getByLabelText('Cutoff rule'), 'horizon');
    await user.selectOptions(screen.getByLabelText('Minimum lead time'), '6');
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => url).filter((u) => u.includes('/api/analysis'));
      expect(urls.at(-1)).toContain('cutoff_mode=horizon');
      expect(urls.at(-1)).toContain('horizon_hours=6');
    });
  });

  it('only reports a successful refresh when the backend confirms it', async () => {
    let refreshOk = false;
    const fetchMock = mockFetch({
      '/api/refresh': () =>
        refreshOk
          ? json({ status: 'ok', data_refreshed_at: '2026-10-27T10:00:00Z', actual_records: 1584, forecast_records: 20440, forecast_publish_runs: 280 })
          : json({ detail: 'Elexon refresh failed; previous data retained.' }, 502),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mean absolute error');

    await user.click(screen.getByRole('button', { name: /refresh data/i }));
    expect(await screen.findByText(/Refresh failed: Elexon refresh failed/)).toBeInTheDocument();
    expect(screen.queryByText(/Data refreshed from Elexon/)).not.toBeInTheDocument();

    refreshOk = true;
    await user.click(screen.getByRole('button', { name: /refresh data/i }));
    expect(await screen.findByText(/Data refreshed from Elexon at .*1,584 actual/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true);
  });

  it('validates the delivery date range', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mean absolute error');
    const start = screen.getByLabelText('Start date');
    await user.clear(start);
    await user.type(start, '2026-01-20');
    const end = screen.getByLabelText('End date');
    await user.clear(end);
    await user.type(end, '2026-01-10');
    expect(await screen.findByText('The start date must be on or before the end date.')).toBeInTheDocument();
  });

  it('data explorer searches, sorts and exports CSV', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const createObjectURL = vi.fn(() => 'blob:mock');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.location.hash = '#/explorer';
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('3 records')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by availability'), 'missing_actual');
    expect(screen.getByText('1 records')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by availability'), 'evaluation');

    await user.click(screen.getByRole('button', { name: /^Forecast \(MW\)/ }));
    await user.click(screen.getByRole('button', { name: /^Forecast \(MW\)/ }));
    const firstRow = screen.getAllByRole('row')[1];
    expect(within(firstRow).getByText('1,200')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export csv/i }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(text.split('\r\n')).toHaveLength(4);
    expect(text).toContain('forecast_publish_time_utc');
    clickSpy.mockRestore();
  });
});
