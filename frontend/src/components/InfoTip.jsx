import { useId, useState } from 'react';
import { Info } from 'lucide-react';

/** Accessible hover/focus tooltip for explaining technical terms. */
export default function InfoTip({ text, label = 'More information' }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className="rounded text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forecast/40"
      >
        <Info size={14} aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg bg-navy-900 px-3 py-2 text-xs font-normal leading-relaxed text-slate-100 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
