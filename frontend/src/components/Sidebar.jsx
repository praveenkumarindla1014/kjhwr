import { Activity, BarChart3, Database, LayoutDashboard, LineChart, Table2, Wind } from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'forecast', label: 'Forecast Analysis', icon: LineChart },
  { id: 'accuracy', label: 'Accuracy Analysis', icon: BarChart3 },
  { id: 'explorer', label: 'Data Explorer', icon: Table2 },
  { id: 'sources', label: 'Data Sources', icon: Database },
];

export default function Sidebar({ route, onNavigate, health }) {
  const online = health?.data_loaded;
  return (
    <aside className="flex w-full shrink-0 flex-col bg-navy-900 text-slate-300 lg:sticky lg:top-0 lg:h-screen lg:w-64">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-emerald-300">
          <Wind size={20} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-[0.14em] text-white">WIND INTELLIGENCE</p>
          <p className="text-xs text-slate-400">UK Renewable Forecast Analytics</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto p-3 lg:flex-1 lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = route === id;
          return (
            <a
              key={id}
              href={`#/${id}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(id);
              }}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <Icon size={17} aria-hidden="true" className={active ? 'text-sky-300' : ''} />
              {label}
            </a>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 px-5 py-4 text-xs lg:block">
        <div className="flex items-center gap-2">
          <Activity size={14} aria-hidden="true" className={online ? 'text-emerald-400' : 'text-amber-400'} />
          <span className="text-slate-300">{online ? 'Elexon data loaded' : 'Data not loaded'}</span>
        </div>
        <p className="mt-1 text-slate-500">Source: Elexon BMRS · FUELHH & WINDFOR</p>
      </div>
    </aside>
  );
}
