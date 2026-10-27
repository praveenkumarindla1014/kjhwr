import { useCallback, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import FilterBar from './components/FilterBar.jsx';
import Sidebar, { NAV_ITEMS } from './components/Sidebar.jsx';
import { ErrorState, PageSkeleton } from './components/States.jsx';
import { useAsync } from './hooks/useAsync.js';
import { useHashRoute } from './hooks/useHashRoute.js';
import AccuracyPage from './pages/AccuracyPage.jsx';
import DataExplorerPage from './pages/DataExplorerPage.jsx';
import DataSourcesPage from './pages/DataSourcesPage.jsx';
import ForecastAnalysisPage from './pages/ForecastAnalysisPage.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import { api } from './services/api.js';
import { formatDateTime } from './utils/format.js';

const DEFAULT_PERIOD = { start_date: '2026-01-01', end_date: '2026-01-31' };

const PAGE_TEXT = {
  overview: 'What the desk knew at the decision cutoff, and how it turned out.',
  forecast: 'The latest eligible forecast for every target interval, against the generation that followed.',
  accuracy: 'Quantified forecast error to size the risk around wind volume when buying day-ahead.',
  explorer: 'Interval-level records behind every chart and metric.',
  sources: 'Where the data comes from and exactly how it is processed.',
};

const PAGES = {
  overview: OverviewPage,
  forecast: ForecastAnalysisPage,
  accuracy: AccuracyPage,
  explorer: DataExplorerPage,
};

export default function App() {
  const [route, navigate] = useHashRoute();
  const [filters, setFilters] = useState({
    startDate: DEFAULT_PERIOD.start_date,
    endDate: DEFAULT_PERIOD.end_date,
    cutoffMode: 'day_ahead',
    cutoffTime: '11:00',
    horizonHours: 24,
  });
  const [dataVersion, setDataVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);

  const filterKey = JSON.stringify(filters);
  const analysis = useAsync(() => api.analysis(filters), `${filterKey}|${dataVersion}`);
  const meta = useAsync(() => api.meta(), dataVersion);
  const health = useAsync(() => api.health(), dataVersion);

  const period = meta.data?.analysis_period || DEFAULT_PERIOD;
  const refreshedAt = analysis.data?.data_refreshed_at || meta.data?.data_refreshed_at;

  const updateFilters = useCallback((patch) => setFilters((f) => ({ ...f, ...patch })), []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    try {
      const result = await api.refresh();
      setNotice({
        type: 'success',
        text: `Data refreshed from Elexon at ${formatDateTime(result.data_refreshed_at)} UK: ${result.actual_records.toLocaleString('en-GB')} actual and ${result.forecast_records.toLocaleString('en-GB')} forecast records.`,
      });
      setDataVersion((v) => v + 1);
    } catch (error) {
      setNotice({ type: 'error', text: `Refresh failed: ${error.message}` });
    } finally {
      setRefreshing(false);
    }
  };

  const title = NAV_ITEMS.find((n) => n.id === route)?.label;
  const Page = PAGES[route];

  let content;
  if (route === 'sources') {
    content = <DataSourcesPage meta={meta} analysis={analysis.data} />;
  } else if (analysis.error && !analysis.data) {
    content = <ErrorState title="Could not load analysis" message={analysis.error.message} onRetry={analysis.reload} />;
  } else if (!analysis.data) {
    content = <PageSkeleton />;
  } else {
    content = (
      <>
        {analysis.error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>Could not update with the latest filters: {analysis.error.message} Showing previous results.</span>
            <button type="button" className="btn-secondary h-8" onClick={analysis.reload}>Retry</button>
          </div>
        )}
        <div className={analysis.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={analysis.loading}>
          <Page data={analysis.data} />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar route={route} onNavigate={navigate} health={health.data} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
          <header>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{PAGE_TEXT[route]}</p>
          </header>

          <FilterBar
            filters={filters}
            onChange={updateFilters}
            period={period}
            refreshedAt={refreshedAt}
            loading={analysis.loading}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />

          {notice && (
            <div
              role="status"
              className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
                notice.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              <span className="flex items-start gap-2">
                {notice.type === 'success' ? <CheckCircle2 size={16} className="mt-0.5" aria-hidden="true" /> : <XCircle size={16} className="mt-0.5" aria-hidden="true" />}
                {notice.text}
              </span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="rounded p-0.5 hover:bg-black/5">
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}

          {content}
        </div>
      </main>
    </div>
  );
}
