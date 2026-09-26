/** Small shared primitives. Hand-written rather than a component library (C-05). */
import { Link } from 'react-router-dom';

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#1d565d" />
        <path d="M16 4c4 4 4 20 0 24M16 4c-4 4-4 20 0 24" stroke="#72c3c5" strokeWidth="1.5" fill="none" />
        <path d="M3 16h26M5.5 9h21M5.5 23h21" stroke="#72c3c5" strokeWidth="1.5" />
        <path d="M22 9l4-4 1 5 5 1-4 4z" fill="#e6a534" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-ocean-900">
        Voyage<span className="text-sand-500">X</span>
      </span>
    </span>
  );
}

export function SeatsBadge({ seats, total }) {
  if (seats === 0) return <span className="chip bg-ink-100 text-ink-500">Sold out</span>;
  const low = total ? seats / total <= 0.2 : seats <= 4;
  return (
    <span className={`chip ${low ? 'bg-sand-100 text-sand-800' : 'bg-emerald-50 text-emerald-700'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${low ? 'bg-sand-500' : 'bg-emerald-500'}`} />
      {seats} {seats === 1 ? 'seat' : 'seats'} left
    </span>
  );
}

const STATUS_STYLES = {
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-ocean-50 text-ocean-700',
  CANCELLED: 'bg-red-50 text-red-700',
  PENDING:   'bg-sand-100 text-sand-800',
};
export function StatusBadge({ status }) {
  return <span className={`chip font-semibold ${STATUS_STYLES[status] ?? 'bg-ink-100 text-ink-600'}`}>{status}</span>;
}

export function CategoryBadge({ category }) {
  return <span className="chip bg-white/90 text-ink-800 backdrop-blur ring-1 ring-white/60">{category}</span>;
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-500" role="status">
      <span className="h-5 w-5 rounded-full border-2 border-ink-200 border-t-ocean-600 animate-spin" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="rounded-lg bg-red-50 ring-1 ring-red-200 p-4" role="alert">
      <p className="text-sm font-semibold text-red-800">{error.message}</p>
      {error.detail && <p className="mt-1 text-xs font-mono text-red-700/80 break-words">{error.detail}</p>}
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-3 !py-1.5 !text-xs">Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-base font-semibold text-ink-800">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-500 max-w-md mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Crumbs({ items }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500 mb-4" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-300">›</span>}
          {it.to ? <Link to={it.to} className="hover:text-ocean-700 hover:underline">{it.label}</Link>
                 : <span className="text-ink-800 font-medium">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}
