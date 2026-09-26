import { Link } from 'react-router-dom';
import { inr, shortDate } from '../api/client.js';
import { SeatsBadge, CategoryBadge } from './ui.jsx';

/**
 * The gradient panel stands in for a photograph: the system is offline-only, so
 * there is no image service to call, and no third-party photography is bundled.
 * The category decides the treatment, so the catalogue still reads as varied.
 */
export default function PackageCard({ pkg }) {
  return (
    <Link
      to={`/packages/${pkg.package_id}`}
      className="card overflow-hidden hover:shadow-lift transition-shadow group flex flex-col"
    >
      <div className={`relative h-36 ph-${pkg.category ?? 'default'}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <div className="absolute top-3 left-3"><CategoryBadge category={pkg.category} /></div>
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white/85 text-[0.7rem] font-medium truncate">{pkg.destinations}</p>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-ink-900 group-hover:text-ocean-800 transition-colors">
          {pkg.title}
        </h3>
        <p className="mt-1 text-xs text-ink-500">
          {pkg.duration_days} days / {pkg.duration_nights} nights · max {pkg.max_group_size}
        </p>

        <div className="mt-3 flex items-center justify-between">
          <SeatsBadge seats={Number(pkg.seats_available)} />
          <span className="text-[0.7rem] text-ink-400">
            {pkg.departures_open} {Number(pkg.departures_open) === 1 ? 'date' : 'dates'}
          </span>
        </div>

        <div className="mt-auto pt-4 flex items-end justify-between border-t border-ink-100 mt-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-wide text-ink-400">from</p>
            <p className="text-lg font-bold text-ocean-800 leading-none">{inr(pkg.from_price)}</p>
            <p className="text-[0.68rem] text-ink-400 mt-0.5">per seat</p>
          </div>
          <div className="text-right">
            <p className="text-[0.68rem] uppercase tracking-wide text-ink-400">next</p>
            <p className="text-sm font-medium text-ink-700">{shortDate(pkg.next_departure)}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
