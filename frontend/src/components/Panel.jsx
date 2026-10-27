import InfoTip from './InfoTip.jsx';

export default function Panel({ title, subtitle, info, actions, children, className = '', bodyClassName = 'p-5' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              {title}
              {info && <InfoTip text={info} label={`About ${title}`} />}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
