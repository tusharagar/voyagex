/**
 * Travellers — add, edit and DELETE the customer's traveller records.
 * Phase 7 · SRS FR-05 · UC-05
 *
 * This screen carries the delete interface the DBMS brief requires, and it is
 * the only DELETE any application role is granted (07_roles_grants.sql §3).
 */
import { useEffect, useState } from 'react';
import { api, shortDate } from '../api/client.js';
import QueryTrace from '../components/QueryTrace.jsx';
import { Spinner, ErrorNote, EmptyState } from '../components/ui.jsx';

const BLANK = { fullName: '', gender: '', dateOfBirth: '', relation: '', passportNo: '' };

export default function Travellers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastTrace, setLastTrace] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/travellers').then(setData).catch(setError).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
    try {
      const d = editing
        ? await api.put(`/travellers/${editing}`, body)
        : await api.post('/travellers', body);
      setLastTrace(d.trace);
      setForm(BLANK); setEditing(null); load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  async function remove(t) {
    setError(null);
    try {
      const d = await api.del(`/travellers/${t.traveller_id}`);
      setLastTrace(d.trace);
      load();
    } catch (err) { setError(err); }
  }

  const travellers = data?.travellers ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-900">Travellers</h1>
      <p className="text-sm text-ink-500 mt-1">
        People you book for. A traveller already on a booking cannot be removed — the foreign key
        would refuse it, so the interface says why instead.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,20rem]">
        <div className="space-y-3">
          <ErrorNote error={error} />
          {loading ? <Spinner label="Loading travellers" />
            : travellers.length === 0 ? <EmptyState title="No travellers yet">Add the first one on the right.</EmptyState>
            : travellers.map((t) => (
              <div key={t.traveller_id} className="card p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900">{t.full_name}</p>
                  <p className="text-xs text-ink-500">
                    {t.relation_to_customer ?? 'Traveller'}
                    {t.gender ? ` · ${t.gender}` : ''}
                    {t.date_of_birth ? ` · born ${shortDate(t.date_of_birth)}` : ''}
                    {t.passport_no ? ` · passport ${t.passport_no}` : ''}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {Number(t.bookings_count) > 0 && (
                    <span className="chip bg-ocean-50 text-ocean-700">
                      on {t.bookings_count} booking{Number(t.bookings_count) > 1 ? 's' : ''}
                    </span>
                  )}
                  <button onClick={() => { setEditing(t.traveller_id); setForm({
                    fullName: t.full_name, gender: t.gender ?? '', relation: t.relation_to_customer ?? '',
                    dateOfBirth: t.date_of_birth ? t.date_of_birth.slice(0, 10) : '', passportNo: t.passport_no ?? '',
                  }); }} className="btn-ghost !py-1.5 !text-xs">Edit</button>
                  <button onClick={() => remove(t)} className="btn-danger !py-1.5 !text-xs"
                          disabled={Number(t.bookings_count) > 0}
                          title={Number(t.bookings_count) > 0 ? 'On a booking — cannot be deleted' : 'Delete'}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>

        <aside>
          <form onSubmit={save} className="card p-4 lg:sticky lg:top-20 space-y-3">
            <h2 className="font-bold text-ink-900">{editing ? 'Edit traveller' : 'Add a traveller'}</h2>
            <div>
              <label className="label" htmlFor="fullName">Full name</label>
              <input id="fullName" required className="field" value={form.fullName} onChange={set('fullName')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="gender">Gender</label>
                <select id="gender" className="field" value={form.gender} onChange={set('gender')}>
                  <option value="">—</option><option value="M">M</option><option value="F">F</option><option value="O">O</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="relation">Relation</label>
                <input id="relation" className="field" value={form.relation} onChange={set('relation')} placeholder="Self" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="dob">Date of birth</label>
              <input id="dob" type="date" className="field" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
            </div>
            <div>
              <label className="label" htmlFor="passport">Passport no.</label>
              <input id="passport" className="field" value={form.passportNo} onChange={set('passportNo')} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn-primary flex-1" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add traveller'}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); setForm(BLANK); }} className="btn-ghost">Cancel</button>
              )}
            </div>
          </form>
        </aside>
      </div>

      <QueryTrace trace={[data?.trace, ...(Array.isArray(lastTrace) ? lastTrace : [lastTrace])]}
                  label="SQL behind travellers" />
    </div>
  );
}
