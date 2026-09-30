/**
 * AdminQuery — the DB_ADMIN custom SQL console.
 * Phase 11 · SRS FR-26, FR-27 · db/07_roles_grants.sql §6
 *
 * Any statement here runs on sql_console_ro, not app_dbadmin: a write is
 * refused by PostgreSQL itself, not by anything in this page.
 */
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { ErrorNote, Spinner } from '../components/ui.jsx';

const EXAMPLE = 'SELECT * FROM package LIMIT 20';

function ResultTable({ columns, rows }) {
  if (!columns || columns.length === 0) {
    return <p className="text-sm text-ink-400 italic mt-4">Query returned no columns.</p>;
  }
  return (
    <div className="mt-4 overflow-auto rounded-lg ring-1 ring-ink-200 bg-white max-h-[32rem]">
      <table className="min-w-full text-xs">
        <thead className="bg-ink-50 sticky top-0">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold text-ink-600 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-4 text-center text-ink-400 italic">
                0 rows — the query ran and matched nothing
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="hover:bg-ink-50/60">
              {columns.map((c) => (
                <td key={c} className="px-3 py-1.5 text-ink-700 whitespace-nowrap max-w-[20rem] truncate">
                  {row[c] === null ? <span className="text-ink-300">null</span> : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small "Add" button, so inserting an identifier is its own explicit action
 * rather than a side effect of expanding a table. */
function AddButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Insert "${label}" into the query`}
      className="shrink-0 chip bg-ocean-50 text-ocean-700 hover:bg-ocean-100 font-semibold"
    >
      Add
    </button>
  );
}

/**
 * The table/column browser. Clicking a table name only expands its column
 * list; clicking a column name does nothing by itself. Each row carries its
 * own "Add" button, and that button is what writes the identifier into the
 * SQL box at the cursor — insertion is a deliberate, separate action from
 * browsing.
 */
function SchemaBrowser({ tables, loading, error, onPick }) {
  const [openTable, setOpenTable] = useState(null);

  if (loading) return <Spinner label="Loading schema" />;
  if (error) return <ErrorNote error={error} />;

  const names = Object.keys(tables).sort();
  if (names.length === 0) {
    return <p className="text-xs text-ink-400 italic">No tables found.</p>;
  }

  return (
    <div className="space-y-0.5 max-h-[70vh] overflow-y-auto pr-1">
      {names.map((name) => {
        const open = openTable === name;
        return (
          <div key={name}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOpenTable(open ? null : name)}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 min-w-0 text-left text-sm font-mono rounded-lg hover:bg-ink-50 text-ink-800"
                title={`${open ? 'Hide' : 'Show'} columns of "${name}"`}
              >
                <span className={`text-ink-400 text-xs shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                <span className="truncate">{name}</span>
              </button>
              <AddButton label={name} onClick={() => onPick(name)} />
            </div>

            {open && (
              <ul className="ml-5 mb-1 space-y-0.5 border-l border-ink-100 pl-3">
                {tables[name].map((col) => (
                  <li key={col.column} className="flex items-center gap-1.5">
                    <div
                      className="flex-1 flex items-baseline gap-2 px-1.5 py-1 min-w-0 text-xs font-mono text-ink-700"
                      title={`${col.type}${col.nullable ? '' : ' · not null'}`}
                    >
                      <span className="truncate">{col.column}</span>
                      <span className="ml-auto text-ink-400 shrink-0">{col.type}</span>
                    </div>
                    <AddButton label={col.column} onClick={() => onPick(col.column)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdminQuery() {
  const [statement, setStatement] = useState(EXAMPLE);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef(null);

  const [tables, setTables] = useState({});
  const [schemaLoading, setSchemaLoading] = useState(true);
  const [schemaError, setSchemaError] = useState(null);

  useEffect(() => {
    api.get('/admin/schema')
      .then((d) => setTables(d.tables))
      .catch(setSchemaError)
      .finally(() => setSchemaLoading(false));
  }, []);

  /**
   * Inserts `text` at the textarea's current cursor position — not appended
   * to the end — so clicking a column while the caret sits inside an
   * unfinished SELECT list lands it exactly where it was typed.
   */
  function insertAtCursor(text) {
    const el = textareaRef.current;
    if (!el) {
      setStatement((s) => (s ? `${s} ${text}` : text));
      return;
    }
    const { selectionStart, selectionEnd, value } = el;
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    setStatement(next);
    const pos = selectionStart + text.length;
    // The DOM node still holds the pre-insert value until React commits the
    // new one, so the cursor has to be restored on the next frame.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function run(e) {
    e.preventDefault();
    if (!statement.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.post('/admin/query', { statement });
      setResult(d);
    } catch (err) {
      setError(err);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink-900">Custom query</h1>
      <p className="text-sm text-ink-500 mt-1 max-w-2xl">
        Runs against <code className="font-mono text-xs bg-ink-100 px-1 py-0.5 rounded">sql_console_ro</code> —
        a database role with SELECT and nothing else, anywhere. A statement that writes is refused by PostgreSQL,
        not by this page. Every statement, successful or not, is recorded in{' '}
        <code className="font-mono text-xs bg-ink-100 px-1 py-0.5 rounded">admin_query_log</code>.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,16rem]">
        <div>
          <form onSubmit={run} className="card p-4 space-y-3">
            <label className="label" htmlFor="sql">SQL statement</label>
            <textarea
              id="sql"
              ref={textareaRef}
              className="field font-mono text-sm min-h-[10rem]"
              spellCheck={false}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary" disabled={busy || !statement.trim()}>
                {busy ? 'Running…' : 'Run query'}
              </button>
              {result && (
                <span className="text-xs text-ink-500">
                  {result.rowCount} {result.rowCount === 1 ? 'row' : 'rows'} · {result.durationMs} ms
                </span>
              )}
            </div>
          </form>

          <ErrorNote error={error} />
          {busy && <Spinner label="Running query" />}
          {result && !busy && <ResultTable columns={result.columns} rows={result.rows} />}
        </div>

        <aside className="card p-3 lg:sticky lg:top-20 self-start">
          <h2 className="label mb-2 px-1">Tables</h2>
          <SchemaBrowser
            tables={tables}
            loading={schemaLoading}
            error={schemaError}
            onPick={insertAtCursor}
          />
        </aside>
      </div>
    </div>
  );
}
