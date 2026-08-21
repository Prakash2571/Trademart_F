'use client';

/**
 * Audit trail.
 *
 * Answers, for anything Trademart changed: what changed, who changed it, when,
 * from what value to what value, and which request caused it.
 *
 * FAILURES ARE SHOWN, not filtered out. A refused stale write, a blocked
 * live-store write or a PREVIEW_STALE apply is usually the more interesting
 * entry - it is what explains "why didn't my change save?". The default view is
 * therefore everything, with a one-click filter down to failures.
 *
 * Read-only by design. There is no delete or edit action here, and the backend
 * exposes none: an audit trail that can be altered through the API it audits is
 * not evidence of anything. Entries age out only via their retention TTL.
 */

import { useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';

import {
  Badge,
  Callout,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { formatDateTime, shortGid } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

/** Actions grouped for the filter, so the dropdown is navigable. */
const ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Products', actions: ['PRODUCT_CREATE', 'PRODUCT_UPDATE', 'PRICE_UPDATE'] },
  {
    label: 'Publication',
    actions: ['PRODUCT_PUBLISH', 'PRODUCT_UNPUBLISH', 'PRODUCT_APPROVE'],
  },
  { label: 'Costs', actions: ['COST_UPDATE', 'COST_DELETE'] },
  { label: 'Inventory', actions: ['INVENTORY_UPDATE'] },
  {
    label: 'Automation',
    actions: ['AUTOMATION_APPLY', 'AUTOMATION_RULE_UPDATE', 'AUTOMATION_PREVIEW'],
  },
  { label: 'Sessions', actions: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT'] },
  { label: 'Webhooks', actions: ['WEBHOOK_RETRY', 'WEBHOOK_REGISTER'] },
];

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every change Trademart made, who made it, and what the value was before. Refused attempts are recorded too."
      />
      <AuditConsole />
    </>
  );
}

function AuditConsole() {
  const [action, setAction] = useState('');
  const [result, setResult] = useState('');
  const [actor, setActor] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [limit, setLimit] = useState(50);

  const path = `/audit${query({ action, result, actor, resourceId, requestId, limit })}`;
  const entries = useApi<{ entries: AuditEntry[] }>(path);

  const rows = entries.data?.entries ?? [];
  const hasMore = entries.meta?.['hasMore'] === true;

  const failureCount = useMemo(
    () => rows.filter((row) => row.result === 'FAILURE').length,
    [rows],
  );

  const clearFilters = () => {
    setAction('');
    setResult('');
    setActor('');
    setResourceId('');
    setRequestId('');
  };

  const filtersActive =
    action !== '' || result !== '' || actor !== '' || resourceId !== '' || requestId !== '';

  return (
    <div className="stack">
      <Card
        title="Filters"
        actions={
          filtersActive ? (
            <button className="btn btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          ) : undefined
        }
      >
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="audit-action">
              Action
            </label>
            <select
              id="audit-action"
              className="select"
              value={action}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setAction(event.target.value)}
            >
              <option value="">All actions</option>
              {ACTION_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.actions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="audit-result">
              Outcome
            </label>
            <select
              id="audit-result"
              className="select"
              value={result}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setResult(event.target.value)}
            >
              <option value="">Everything</option>
              <option value="FAILURE">Failures only</option>
              <option value="SUCCESS">Successes only</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="audit-actor">
              Operator
            </label>
            <input
              id="audit-actor"
              className="input"
              value={actor}
              placeholder="e.g. operator"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setActor(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="audit-resource">
              Product / resource id
            </label>
            <input
              id="audit-resource"
              className="input"
              value={resourceId}
              placeholder="gid://shopify/Product/…"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setResourceId(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="audit-request">
              Request id
            </label>
            <input
              id="audit-request"
              className="input"
              value={requestId}
              placeholder="from an error message"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRequestId(event.target.value)}
            />
            <div className="field__hint">
              Filtering by request id shows every entry written while serving one request — the
              whole story of a single failed operation.
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="audit-limit">
              Rows
            </label>
            <select
              id="audit-limit"
              className="select"
              value={String(limit)}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => setLimit(Number(event.target.value))}
            >
              {[25, 50, 100, 200].map((option) => (
                <option key={option} value={String(option)}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {entries.error !== null ? (
        <Card title="Audit trail">
          <ErrorState error={entries.error} onRetry={entries.refetch} />
        </Card>
      ) : (
        <Card
          title={`Entries (${rows.length}${hasMore ? '+' : ''})`}
          actions={
            <button className="btn btn--sm" onClick={entries.refetch} disabled={entries.loading}>
              {entries.loading ? 'Loading…' : 'Refresh'}
            </button>
          }
        >
          <div className="stack">
            {failureCount > 0 && result === '' && (
              <Callout tone="warning" title={`${failureCount} of these attempts were refused`}>
                A refused attempt changed nothing. Filter to <strong>Failures only</strong> to see
                just those.
              </Callout>
            )}
            {hasMore && (
              <Callout tone="info" title="More entries match">
                Only the newest {limit} are shown. Narrow the filters or raise the row count.
              </Callout>
            )}

            {rows.length === 0 ? (
              <EmptyState
                title="No audit entries"
                description={
                  filtersActive
                    ? 'Nothing matches these filters.'
                    : 'Nothing has been changed yet, or the backend has no database configured to record it.'
                }
              />
            ) : (
              <div className="stack">
                {rows.map((entry) => (
                  <AuditRow key={entry._id ?? `${entry.at}-${entry.action}`} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- one entry -- */

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const failed = entry.result === 'FAILURE';

  return (
    <div
      className="card"
      style={{ padding: 12, borderLeft: `3px solid ${failed ? 'var(--danger)' : 'var(--border)'}` }}
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge tone={failed ? 'danger' : 'success'} dot>
          {entry.result}
        </Badge>
        <Badge tone="info">{entry.action}</Badge>
        <Badge tone="neutral">{entry.resourceType}</Badge>
        <span className="muted">{formatDateTime(entry.at)}</span>
        <span className="muted">
          by <strong>{entry.actor}</strong>
          {entry.authMethod !== null ? ` (${entry.authMethod})` : ''}
        </span>
        <button className="btn btn--sm" onClick={() => setOpen(!open)} style={{ marginLeft: 'auto' }}>
          {open ? 'Hide detail' : 'Detail'}
        </button>
      </div>

      {entry.resourceId !== null && (
        <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center' }}>
          <span className="mono muted">{shortGid(entry.resourceId)}</span>
          {entry.resourceId.startsWith('gid://shopify/Product/') && (
            <Link
              className="btn btn--sm"
              href={`/products/${encodeURIComponent(entry.resourceId)}`}
            >
              Open product
            </Link>
          )}
        </div>
      )}

      {failed && entry.errorCode !== null && (
        <p style={{ margin: '6px 0 0' }}>
          <Badge tone="danger">{entry.errorCode}</Badge>{' '}
          <span className="muted">{entry.errorMessage}</span>
        </p>
      )}

      {open && (
        <div className="stack" style={{ marginTop: 10 }}>
          <ValueBlock label="Before" value={entry.before} />
          <ValueBlock label="After" value={entry.after} />
          {entry.metadata !== null && <ValueBlock label="Context" value={entry.metadata} />}
          {entry.requestId !== null && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Request id <span className="mono">{entry.requestId}</span> —{' '}
              <Link href={`/audit?requestId=${encodeURIComponent(entry.requestId)}`}>
                see everything from this request
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a before/after value.
 *
 * Pretty-printed JSON rather than a bespoke renderer per action: the shapes vary
 * by action, and a generic view that always shows the truth is more useful than a
 * tidy one that quietly omits a field.
 */
function ValueBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div>
        <div className="field__label">{label}</div>
        <p className="muted" style={{ margin: 0 }}>
          —
        </p>
      </div>
    );
  }
  return (
    <div>
      <div className="field__label">{label}</div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: 8,
          background: 'var(--surface-alt)',
          borderRadius: 6,
          fontSize: 12,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
