import InfoTip from './InfoTip.jsx';

const SCOPE_STYLES = {
  interval: 'bg-sky-50 text-sky-700 ring-sky-200',
  period: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default function KpiCard({ label, value, unit, detail, info, scope, icon: Icon, accent }) {
  return (
    <div className="panel flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          {accent && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
          {label}
          {info && <InfoTip text={info} label={`About ${label}`} />}
        </p>
        {Icon && <Icon size={16} aria-hidden="true" className="text-slate-400" />}
      </div>
      <p className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        {unit && value !== '—' && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {scope && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${SCOPE_STYLES[scope]}`}>
            {scope === 'interval' ? 'Selected interval' : 'Period aggregate'}
          </span>
        )}
        {detail && <span className="text-xs text-slate-500">{detail}</span>}
      </div>
    </div>
  );
}
