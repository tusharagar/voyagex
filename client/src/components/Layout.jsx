/** Sticky header, footer, and the page shell every route renders inside. */
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo } from './ui.jsx';

function navClass({ isActive }) {
  return `px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
    isActive ? 'text-ocean-800 bg-ocean-50' : 'text-ink-600 hover:text-ocean-800 hover:bg-ink-50'
  }`;
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-ink-100">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-2">
          <Link to="/" className="mr-2 shrink-0"><Logo /></Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navClass}>Packages</NavLink>
            {user && <NavLink to="/bookings" className={navClass}>My bookings</NavLink>}
            {user && <NavLink to="/travellers" className={navClass}>Travellers</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:flex flex-col items-end leading-tight mr-1">
                  <span className="text-sm font-medium text-ink-800">{user.first_name ?? user.email}</span>
                  <span className="text-[0.68rem] uppercase tracking-wide text-ink-400">{user.role_name}</span>
                </span>
                <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost !py-2">Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost !py-2">Sign in</Link>
                <Link to="/register" className="btn-primary !py-2">Create account</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-ink-100 bg-white mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-ink-400 flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <p>VoyageX — Travel &amp; Tourism Management System · MNNIT Allahabad coursework</p>
          <p>
            Every screen shows the SQL it ran. Seat allocation is enforced by PostgreSQL,
            not by this interface.
          </p>
        </div>
      </footer>
    </div>
  );
}
