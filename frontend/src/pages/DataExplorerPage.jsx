import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { EmptyState } from '../components/States.jsx';
import { downloadCSV, toCSV } from '../utils/csv.js';
import { STATUS_LABELS, formatCalendarDate, formatDateTime, formatMW } from '../utils/format.js';
import { filterRows, paginate, sortRows } from '../utils/table.js';

const COLUMNS = [
  { key: 'start_time', label: 'Target interval (UK)', align: 'left' },
  { key: 'publish_time', label: 'Forecast published (UK)', align: 'left' },
  { key: 'forecast', label: 'Forecast (MW)', align: 'right' },
  { key: 'actual', label: 'Actual (MW)', align: 'right' },
  { key: 'error', label: 'Signed error (MW)', align: 'right' },
  { key: 'abs_error', label: 'Abs. error (MW)', align: 'right' },
  { key: 'status', label: 'Availability', align: 'left' },
];

const CSV_COLUMNS = [
  { header: 'target_interval_start_utc', key: 'start_time' },
  { header: 'target_interval_start_uk', value: (r) => formatDateTime(r.start_time) },
  { header: 'delivery_date_uk', key: 'delivery_date' },
  { header: 'decision_cutoff_utc', key: 'cutoff' },
  { header: 'forecast_publish_time_utc', key: 'publish_time' },
  { header: 'forecast_mw', key: 'forecast' },
  { header: 'actual_mw', key: 'actual' },
  { header: 'signed_error_mw', key: 'error' },
  { header: 'absolute_error_mw', key: 'abs_error' },
  { header: 'lead_time_hours', key: 'lead_time_hours' },
  { header: 'status', key: 'status' },
];

const PAGE_SIZES = [25, 50, 100];

export default function DataExplorerPage({ data }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('evaluation');
  const [date, setDate] = useState('');
  const [sort, setSort] = useState({ key: 'start_time', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const dates = useMemo(() => [...new Set(data.rows.map((r) => r.delivery_date))], [data.rows]);
  useEffect(() => {
    if (date && !dates.includes(date)) setDate('');
  }, [dates, date]);

  const filtered = useMemo(
    () => sortRows(filterRows(data.rows, { search, status, date }), sort.key, sort.direction),
    [data.rows, search, status, date, sort],
  );
  const { pageRows, pageCount, page: currentPage } = paginate(filtered, page, pageSize);

  useEffect(() => setPage(1), [search, status, date, pageSize, data.rows]);

  const toggleSort = (key) =>
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'asc' ? 'desc' : 'asc' }));

  const exportCsv = () => {
    const suffix = date || `${data.period.start_date}_to_${data.period.end_date}`;
    downloadCSV(`wind-forecast-vs-actual_${suffix}.csv`, toCSV(filtered, CSV_COLUMNS));
  };

  return (
    <Panel
      title="Data Explorer"
      subtitle={`${formatCalendarDate(data.period.start_date)} – ${formatCalendarDate(data.period.end_date)} · ${data.cutoff.description}`}
      bodyClassName=""
      actions={
        <button type="button" className="btn-secondary" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={15} aria-hidden="true" /> Export CSV ({filtered.length})
        </button>
      }
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
        <label className="relative">
          <span className="sr-only">Search records</span>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="search"
            className="input w-64 pl-8"
            placeholder="Search time, status, value…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          <span className="sr-only">Filter by delivery date</span>
          <select className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Filter by delivery date">
            <option value="">All dates in range</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {formatCalendarDate(d)}
              </option>
            ))}
          </select>
        </label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by availability">
          <option value="evaluation">Hourly evaluation intervals</option>
          <option value="all">All half-hour intervals</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label} only
            </option>
          ))}
        </select>
        <p className="ml-auto text-xs text-slate-500">{filtered.length.toLocaleString('en-GB')} records</p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matching records" message="Adjust the search or filters to see records." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {COLUMNS.map((col) => {
                  const active = sort.key === col.key;
                  const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={`px-4 py-2.5 font-medium ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={`inline-flex items-center gap-1 rounded hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forecast/40 ${active ? 'text-slate-800' : ''}`}
                      >
                        {col.label}
                        <Icon size={12} aria-hidden="true" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((r) => (
                <tr key={r.start_time} className="hover:bg-slate-50">
                  <td className="num whitespace-nowrap px-4 py-2 text-slate-800">{formatDateTime(r.start_time)}</td>
                  <td className="num whitespace-nowrap px-4 py-2 text-slate-600">
                    {r.publish_time ? formatDateTime(r.publish_time) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="num px-4 py-2 text-right">{formatMW(r.forecast)}</td>
                  <td className="num px-4 py-2 text-right">{formatMW(r.actual)}</td>
                  <td className={`num px-4 py-2 text-right ${r.error > 0 ? 'text-red-600' : r.error < 0 ? 'text-blue-700' : ''}`}>
                    {formatMW(r.error, { signed: true })}
                  </td>
                  <td className="num px-4 py-2 text-right">{formatMW(r.abs_error)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          Rows per page
          <select className="input h-8" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">
            Page {currentPage} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-secondary h-8 px-2"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn-secondary h-8 px-2"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Panel>
  );
}
