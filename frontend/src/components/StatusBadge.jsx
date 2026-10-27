import { CheckCircle2, CircleDashed, CircleSlash, MinusCircle } from 'lucide-react';
import { STATUS_LABELS } from '../utils/format.js';

const STYLES = {
  matched: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: CheckCircle2 },
  missing_forecast: { cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: MinusCircle },
  missing_actual: { cls: 'bg-amber-50 text-amber-800 ring-amber-200', icon: MinusCircle },
  missing_both: { cls: 'bg-red-50 text-red-700 ring-red-200', icon: CircleSlash },
  no_forecast_interval: { cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: CircleDashed },
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.no_forecast_interval;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.cls}`}>
      <Icon size={12} aria-hidden="true" />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
