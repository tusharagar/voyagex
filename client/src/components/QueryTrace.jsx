/**
 * QueryTrace — shows the SQL behind whatever is on screen.
 *
 * Phase 7 · SRS FR-24, NFR-08 · wireframes/02_catalogue.svg
 *
 * This component is the DBMS submission's visible evidence, so it appears on
 * every screen that displays data and is never conditional on a developer flag.
 * Collapsed by default so it supports the page rather than dominating it.
 *
 * THE PLACEHOLDERS ARE NEVER INTERPOLATED. The SQL is rendered exactly as the
 * server executed it — `WHERE category = $1` — with the bound values listed
 * separately beneath. Splicing the value into the statement for a "nicer"
 * display would destroy the one artifact that answers the SQL-injection
 * question, which is the whole point of showing it (NFR-04).
 */

import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// PrismLight with one language registered, rather than Prism, which bundles
// every grammar it knows: that alone was ~600 kB of the built JavaScript for a
// page that only ever highlights SQL.
SyntaxHighlighter.registerLanguage('sql', sql);

function ParamList({ params }) {
  if (!params || params.length === 0) {
    return <p className="text-xs text-ink-400 italic">no bound parameters</p>;
  }
  return (
    <ul className="space-y-1">
      {params.map((p, i) => (
        <li key={i} className="flex items-baseline gap-2 font-mono text-xs">
          <span className="text-sand-600 font-semibold shrink-0">${i + 1}</span>
          <span className="text-ink-400">=</span>
          <span className="text-ink-800 break-all">
            {p === null ? <em className="text-ink-400">null</em> : JSON.stringify(p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResultGrid({ columns, rows }) {
  // Columns come from res.fields on the server, so an empty result still has
  // headers. Rendering them proves the query ran and returned nothing, rather
  // than leaving the reader unable to tell that from a failure.
  if (!columns || columns.length === 0) return null;
  const shown = rows.slice(0, 5);
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-ink-200 bg-white">
      <table className="min-w-full text-xs">
        <thead className="bg-ink-50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2.5 py-1.5 text-left font-semibold text-ink-600 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {shown.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2.5 py-3 text-center text-ink-400 italic">
                0 rows — the query ran and matched nothing
              </td>
            </tr>
          ) : shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className="px-2.5 py-1.5 text-ink-700 whitespace-nowrap max-w-[16rem] truncate">
                  {row[c] === null ? <span className="text-ink-300">null</span> : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="px-2.5 py-1.5 text-xs text-ink-400 border-t border-ink-100">
          showing 5 of {rows.length} rows
        </p>
      )}
    </div>
  );
}

function SingleTrace({ trace, index, total }) {
  const [open, setOpen] = useState(false);
  if (!trace?.sql) return null;

  return (
    <div className="rounded-lg ring-1 ring-ink-200 bg-ink-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ink-100/70 transition-colors"
      >
        <span className={`text-ink-400 text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {total > 1 && (
          <span className="chip bg-ink-200 text-ink-700 font-mono">{index + 1}/{total}</span>
        )}
        <span className="text-xs font-medium text-ink-700">
          {trace.rowCount} {trace.rowCount === 1 ? 'row' : 'rows'}
        </span>
        <span className="text-ink-300">·</span>
        <span className="text-xs font-mono text-ocean-700">{trace.executionMs} ms</span>
        <span className="ml-auto text-xs font-semibold text-ocean-700">
          {open ? 'Hide SQL' : 'Show SQL'}
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-200 bg-white p-3 space-y-3">
          <div className="rounded-lg overflow-hidden ring-1 ring-ink-800">
            <SyntaxHighlighter
              language="sql"
              style={oneDark}
              customStyle={{ margin: 0, fontSize: '0.72rem', padding: '0.75rem', background: '#21262e' }}
              wrapLongLines
            >
              {trace.sql}
            </SyntaxHighlighter>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="label mb-1">Bound parameters</p>
              <ParamList params={trace.params} />
              <p className="mt-2 text-[0.68rem] leading-snug text-ink-400">
                Placeholders stay as <span className="font-mono text-sand-600">$n</span> above —
                values are sent separately over the wire and never become part of the statement.
              </p>
            </div>
            <div>
              <p className="label mb-1">Columns returned</p>
              <p className="font-mono text-xs text-ink-700 break-words">
                {trace.columns?.length ? trace.columns.join(', ') : <em className="text-ink-400">none</em>}
              </p>
            </div>
          </div>

          <div>
            <p className="label mb-1">Result</p>
            <ResultGrid columns={trace.columns} rows={trace.rows ?? []} />
          </div>

          {trace.plan && (
            <div>
              <p className="label mb-1">Query plan</p>
              <pre className="text-[0.68rem] font-mono bg-ink-900 text-ink-100 rounded-lg p-3 overflow-x-auto">
                {trace.plan}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param {object|object[]} trace  one traced result, or several when a screen
 *                                 is assembled from more than one statement
 * @param {string} label           what these statements produced
 */
export default function QueryTrace({ trace, label = 'SQL executed for this view' }) {
  const traces = (Array.isArray(trace) ? trace : [trace]).filter((t) => t && t.sql);
  if (traces.length === 0) return null;

  const totalMs = traces.reduce((sum, t) => sum + (t.executionMs ?? 0), 0);

  return (
    <section className="mt-6" aria-label="SQL trace">
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</h2>
        <span className="text-xs text-ink-400">
          {traces.length} {traces.length === 1 ? 'statement' : 'statements'} · {totalMs.toFixed(2)} ms total
        </span>
      </div>
      <div className="space-y-2">
        {traces.map((t, i) => (
          <SingleTrace key={i} trace={t} index={i} total={traces.length} />
        ))}
      </div>
    </section>
  );
}
