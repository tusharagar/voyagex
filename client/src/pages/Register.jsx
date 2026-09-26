/** Register · SRS FR-01 · UC-01 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo } from '../components/ui.jsx';
import QueryTrace from '../components/QueryTrace.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '', phone: '', city: '' });
  const [error, setError] = useState(null);
  const [trace, setTrace] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await register(form);
      setTrace(d.trace);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <Logo className="mb-8" />
      <h1 className="text-2xl font-bold text-ink-900">Create your account</h1>
      <p className="text-sm text-ink-500 mt-1">
        The account and its customer record are created in one transaction — you cannot end up
        with half a registration.
      </p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input id="firstName" required className="field" value={form.firstName} onChange={set('firstName')} />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Last name</label>
            <input id="lastName" className="field" value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required className="field" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} className="field"
                 value={form.password} onChange={set('password')} />
          <p className="mt-1 text-xs text-ink-400">At least 8 characters. Stored as a bcrypt hash, cost 12.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="phone">Phone</label>
            <input id="phone" className="field" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label" htmlFor="city">City</label>
            <input id="city" className="field" value={form.city} onChange={set('city')} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 ring-1 ring-red-200 p-3" role="alert">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500">
        Already registered? <Link to="/login" className="font-semibold text-ocean-700 hover:underline">Sign in</Link>
      </p>

      <QueryTrace trace={trace} label="SQL that created the account" />
    </div>
  );
}
