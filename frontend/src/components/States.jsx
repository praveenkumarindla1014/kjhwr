import { AlertTriangle, Inbox, RotateCw } from 'lucide-react';

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-slate-200/70 ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading data" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="panel p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-7 w-32" />
            <Skeleton className="mt-3 h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="panel p-5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-6 h-72 w-full" />
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div role="alert" className="panel flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle size={20} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      {message && <p className="mt-1 max-w-lg text-sm text-slate-600">{message}</p>}
      {onRetry && (
        <button type="button" className="btn-secondary mt-5" onClick={onRetry}>
          <RotateCw size={15} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title = 'No data', message }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox size={20} aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-slate-800">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p>}
    </div>
  );
}
