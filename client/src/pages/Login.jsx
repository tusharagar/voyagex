/** Login · SRS FR-02 · UC-02 · wireframes/01_login.svg */
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const u = await login(email, password);
      navigate(u.role === 'CUSTOMER' ? (location.state?.from ?? '/') : '/bookings', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-bold text-ink-900">Sign in</h1>
          <p className="text-sm text-ink-500 mt-1">Welcome back. Your bookings are waiting.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" className="field"
                     value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" type="password" required autoComplete="current-password" className="field"
                     value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {/* One message for a wrong password and an unknown email alike:
                distinguishing them turns this form into an oracle for which
                addresses hold accounts. */}
            {error && (
              <div className="rounded-lg bg-red-50 ring-1 ring-red-200 p-3" role="alert">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-sm text-ink-500">
            No account yet? <Link to="/register" className="font-semibold text-ocean-700 hover:underline">Create one</Link>
          </p>

          <div className="mt-8 rounded-lg bg-ink-100/70 p-3">
            <p className="text-[0.7rem] text-ink-500 leading-relaxed">
              <strong className="text-ink-700">Demo accounts</strong> (seeded, local database only):
              <span className="font-mono block mt-1">customer@example.test · agent@example.test</span>
              <span className="font-mono">manager@example.test — password <strong>voyagex-demo</strong></span>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block relative ph-Hill">
        <div className="absolute inset-0 bg-gradient-to-br from-ocean-900/80 to-ocean-700/40" />
        <div className="relative h-full flex flex-col justify-end p-12">
          <Logo className="mb-auto [&_span]:text-white" />
          <blockquote className="text-white/95">
            <p className="text-2xl font-semibold leading-snug max-w-sm">
              Two people can never take the same last seat.
            </p>
            <footer className="mt-3 text-sm text-ocean-100/80 max-w-sm">
              Seat allocation runs inside PostgreSQL under a row lock, so the guarantee holds for
              every client — not just this one.
            </footer>
          </blockquote>
        </div>
      </div>
    </div>
  );
}
