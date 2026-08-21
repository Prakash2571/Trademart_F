'use client';

/**
 * System health.
 *
 * The page an operator opens when something is wrong, so every panel degrades
 * independently: one failing endpoint must not blank the others. Each card
 * reports its own error rather than the page throwing.
 *
 * Deliberately shows NO secrets. Everything here is state and configuration
 * booleans - never a token, a connection string or a hash.
 */

import { useState } from 'react';
import Link from 'next/link';

import {
  Badge,
  Callout,
  Card,
  EmptyState,
  KeyValue,
  PageHeader,
} from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { ApiError, apiPost } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import type {
  AutomationStatus,
  IntegrityReport,
  RateLimitReport,
  ShopifyStatus,
  VersionInfo,
  WebhookEventsResponse,
} from '@/lib/types';

export default function SystemPage() {
  return (
    <>
      <PageHeader
        title="System"
        description="Version, store safety, Shopify capacity, webhook delivery health and Shopify state consistency."
      />
      <div className="stack">
        <VersionCard />
        <StoreModeCard />
        <RateLimitCard />
        <AutomationLockCard />
        <WebhookHealthCard />
        <IntegrityCard />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ version -- */

function VersionCard() {
  const version = useApi<VersionInfo>('/version');

  const uptime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  };

  return (
    <Card title="Build">
      {version.error !== null ? (
        <Callout tone="warning" title="Version unavailable">
          {version.error.message}
        </Callout>
      ) : version.data === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="stack">
          <KeyValue
            items={[
              { key: 'Version', value: <span className="mono">{version.data.version}</span> },
              {
                key: 'Commit',
                value: <span className="mono">{version.data.gitShaShort}</span>,
              },
              {
                key: 'Built',
                value:
                  version.data.buildTime === null
                    ? 'unknown'
                    : formatDateTime(version.data.buildTime),
              },
              { key: 'Node', value: <span className="mono">{version.data.nodeVersion}</span> },
              { key: 'Uptime', value: uptime(version.data.uptimeSeconds) },
              { key: 'Started', value: formatDateTime(version.data.startedAt) },
            ]}
          />
          {version.data.gitSha === 'unknown' && (
            <Callout tone="info" title="This build cannot be traced to a commit">
              GIT_SHA was not supplied at image build time, so there is no way to tell which code
              this container is running. Pass it as a build arg (Compose already does when GIT_SHA
              is set) so a deployment can be matched to a commit — and rolled back to a previous
              one.
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- store mode -- */

function StoreModeCard() {
  // Reads the SAME storeSafety the rest of the app uses (GET /shopify/status),
  // rather than a separate store-mode endpoint. One authority for "is this a live
  // store?" cannot disagree with itself. `storeSafety.classification` is refined
  // with Shopify's real isDevelopmentStore flag when connected.
  const status = useApi<ShopifyStatus>('/shopify/status');
  const data = status.data;
  const safety = data?.storeSafety ?? null;
  const shop = data?.shop ?? null;

  const isDev = safety?.classification === 'DEVELOPMENT';
  const isLive = safety?.classification === 'LIVE';

  return (
    <Card title="Store safety">
      {status.error !== null ? (
        <Callout tone="warning" title="Store status unavailable">
          {status.error.message}
        </Callout>
      ) : data === null || safety === null ? (
        <p className="muted">Checking Shopify…</p>
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge tone={isDev ? 'info' : isLive ? 'warning' : 'neutral'} dot>
              {isDev ? 'development store' : isLive ? 'LIVE store' : 'store type unknown'}
            </Badge>
            <Badge tone={safety.source === 'shopify' ? 'success' : 'neutral'}>
              {safety.source === 'shopify' ? 'verified with Shopify' : `from ${safety.source}`}
            </Badge>
            {safety.allowLiveStoreWrites && <Badge tone="danger">live writes acknowledged</Badge>}
          </div>

          <p className="muted" style={{ margin: 0 }}>
            {safety.reason}
          </p>

          {/*
            When Shopify's own flag is what classified the store (source
            'shopify'), that is authoritative and overrides the declared mode. A
            store that classifies as LIVE from Shopify while tooling writes are not
            acknowledged is the safe state; the banner elsewhere warns on it.
          */}
          {isLive && !safety.allowLiveStoreWrites && (
            <Callout tone="warning" title="This is a live, customer-facing store">
              Automated tooling (tests, seed and smoke scripts) is refused unless
              <span className="mono"> ALLOW_LIVE_STORE_WRITES=true</span> is set. This does not
              restrict you operating the store from the console.
            </Callout>
          )}

          <KeyValue
            items={[
              { key: 'Store', value: <span className="mono">{data.storeDomain}</span> },
              { key: 'Shopify plan', value: shop?.planDisplayName ?? 'unknown' },
              {
                key: 'Automated tooling writes',
                value: safety.toolingWritesAllowed ? (
                  <Badge tone="warning">permitted</Badge>
                ) : (
                  <Badge tone="success">refused</Badge>
                ),
              },
              {
                key: 'Connected',
                value: data.connected ? (
                  <Badge tone="success">yes</Badge>
                ) : (
                  <Badge tone="danger">no</Badge>
                ),
              },
            ]}
          />
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            &quot;Automated tooling writes&quot; covers test suites, seed and smoke scripts only. It
            does not restrict you operating this store from the console.
          </p>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------- rate limit -- */

function RateLimitCard() {
  const report = useApi<RateLimitReport>('/shopify/rate-limit');
  const data = report.data;
  const throttle = data?.throttle ?? null;

  return (
    <Card
      title="Shopify API capacity"
      actions={
        <button className="btn btn--sm" onClick={report.refetch} disabled={report.loading}>
          Refresh
        </button>
      }
    >
      {report.error !== null ? (
        <Callout tone="warning" title="Capacity unavailable">
          {report.error.message}
        </Callout>
      ) : data === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="stack">
          {data.breaker.state === 'open' && (
            <Callout tone="danger" title="Shopify is being treated as degraded">
              {formatNumber(data.breaker.consecutiveFailures)} consecutive failures
              {data.breaker.lastFailureCode !== null
                ? ` (last: ${data.breaker.lastFailureCode})`
                : ''}
              . Bulk automation writes are paused so they cannot fail halfway through a plan.
              Previews and reads are unaffected.
            </Callout>
          )}

          {throttle === null ? (
            <EmptyState
              title="No capacity data yet"
              description={data.note}
            />
          ) : (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ fontSize: 20 }}>
                  {formatNumber(throttle.currentlyAvailable)} /{' '}
                  {formatNumber(throttle.maximumAvailable)}
                </strong>
                <span className="muted">points available</span>
                {throttle.availablePercentage !== null && (
                  <Badge
                    tone={
                      throttle.availablePercentage > 50
                        ? 'success'
                        : throttle.availablePercentage > 20
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {throttle.availablePercentage}%
                  </Badge>
                )}
              </div>
              <KeyValue
                items={[
                  {
                    key: 'Restore rate',
                    value:
                      throttle.restoreRate === null
                        ? '—'
                        : `${formatNumber(throttle.restoreRate)}/s`,
                  },
                  {
                    key: 'Last query cost',
                    value: `${formatNumber(throttle.lastActualQueryCost)} actual / ${formatNumber(
                      throttle.lastRequestedQueryCost,
                    )} requested`,
                  },
                  {
                    key: 'Circuit breaker',
                    value: (
                      <Badge tone={data.breaker.state === 'closed' ? 'success' : 'danger'}>
                        {data.breaker.state}
                      </Badge>
                    ),
                  },
                ]}
              />
            </>
          )}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {data.note}
          </p>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ automation lock -- */

function AutomationLockCard() {
  // The lock holder is reported by /automation/status as `activeRun`, alongside
  // the Shopify breaker state - there is no separate lock endpoint. Reading them
  // together is also what lets the console say "apply would be refused right now"
  // before an operator builds a preview.
  const status = useApi<AutomationStatus>('/automation/status');
  const data = status.data;
  const run = data?.activeRun ?? null;
  const breaker = data?.shopify ?? null;

  return (
    <Card
      title="Automation lock"
      actions={
        <button className="btn btn--sm" onClick={status.refetch} disabled={status.loading}>
          Refresh
        </button>
      }
    >
      {status.error !== null ? (
        <Callout tone="warning" title="Lock state unavailable">
          {status.error.message}
        </Callout>
      ) : data === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="stack">
          {run !== null ? (
            <>
              <Callout tone="info" title="An automation run is in progress">
                A second run cannot start until this one finishes — two concurrent runs would write
                to overlapping products and the final prices would depend on which finished last.
              </Callout>
              <KeyValue
                items={[
                  { key: 'Started', value: formatDateTime(run.startedAt) },
                  { key: 'Trigger', value: <Badge tone="neutral">{run.trigger}</Badge> },
                  {
                    key: 'Request id',
                    value: <span className="mono">{run.requestId ?? '—'}</span>,
                  },
                ]}
              />
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Free — no automation run is in progress.
            </p>
          )}

          {breaker !== null && breaker.state === 'open' && (
            <Callout tone="danger" title="Shopify is being treated as degraded">
              {formatNumber(breaker.consecutiveFailures)} consecutive failures
              {breaker.lastFailureCode !== null ? ` (last: ${breaker.lastFailureCode})` : ''}. A bulk
              apply would be refused with SHOPIFY_DEGRADED until Shopify recovers; previews still
              work.
            </Callout>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- webhook health -- */

function WebhookHealthCard() {
  const events = useApi<WebhookEventsResponse>('/webhooks/events?limit=25');
  const [busy, setBusy] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<ApiError | null>(null);

  const stats = events.data?.stats ?? null;
  const rows = events.data?.events ?? [];

  const retry = async (id: string) => {
    setBusy(id);
    setRetryError(null);
    try {
      await apiPost<unknown>(`/webhooks/events/${encodeURIComponent(id)}/retry`, {});
      events.refetch();
    } catch (caught) {
      setRetryError(
        caught instanceof ApiError ? caught : new ApiError('UNKNOWN', 'Retry failed.', 0),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Webhook deliveries"
      actions={
        <button className="btn btn--sm" onClick={events.refetch} disabled={events.loading}>
          Refresh
        </button>
      }
    >
      {events.error !== null ? (
        <Callout tone="warning" title="Delivery history unavailable">
          {events.error.message}
        </Callout>
      ) : (
        <div className="stack">
          {stats !== null && (
            <>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Badge tone={stats.workerRunning ? 'success' : 'danger'} dot>
                  worker {stats.workerRunning ? 'running' : 'stopped'}
                </Badge>
                {(['PROCESSED', 'RECEIVED', 'PROCESSING', 'IGNORED', 'FAILED'] as const).map(
                  (state) => (
                    <Badge
                      key={state}
                      tone={state === 'FAILED' && (stats.counts[state] ?? 0) > 0 ? 'danger' : 'neutral'}
                    >
                      {state.toLowerCase()}: {formatNumber(stats.counts[state] ?? 0)}
                    </Badge>
                  ),
                )}
              </div>
              <KeyValue
                items={[
                  {
                    key: 'Last processed',
                    value:
                      stats.lastProcessedAt === null
                        ? 'never'
                        : formatDateTime(stats.lastProcessedAt),
                  },
                  {
                    key: 'Oldest still pending',
                    value:
                      stats.oldestPending === null ? 'none' : formatDateTime(stats.oldestPending),
                  },
                ]}
              />
              {stats.failed > 0 && (
                <Callout tone="danger" title={`${stats.failed} delivery(ies) failed permanently`}>
                  These exhausted their automatic retries and need a decision. Retrying is safe for
                  an idempotent topic; the backend refuses to re-run an already-processed event.
                </Callout>
              )}
            </>
          )}

          {retryError !== null && (
            <Callout tone="danger" title={retryError.code}>
              {retryError.message}
            </Callout>
          )}

          {rows.length === 0 ? (
            <EmptyState
              title="No webhook deliveries recorded"
              description="Either none have arrived, or subscriptions are not registered yet (Settings → webhooks)."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Topic</th>
                    <th>State</th>
                    <th style={{ textAlign: 'right' }}>Attempts</th>
                    <th>Detail</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event) => (
                    <tr key={event._id ?? `${event.receivedAt}-${event.topic}`}>
                      <td>{formatDateTime(event.receivedAt)}</td>
                      <td className="mono">{event.topic}</td>
                      <td>
                        <Badge
                          tone={
                            event.status === 'PROCESSED'
                              ? 'success'
                              : event.status === 'FAILED'
                                ? 'danger'
                                : event.status === 'IGNORED'
                                  ? 'neutral'
                                  : 'info'
                          }
                        >
                          {event.status}
                        </Badge>
                      </td>
                      <td className="table__num">{event.attempts}</td>
                      <td className="muted truncate" style={{ maxWidth: 320 }}>
                        {event.error ?? event.ignoredReason ?? '—'}
                      </td>
                      <td>
                        {event.status === 'FAILED' && event._id !== undefined && (
                          <button
                            className="btn btn--sm"
                            onClick={() => retry(event._id as string)}
                            disabled={busy !== null}
                          >
                            {busy === event._id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- integrity -- */

function IntegrityCard() {
  const report = useApi<IntegrityReport>('/diagnostics/integrity');
  const data = report.data;

  return (
    <Card
      title="Shopify state consistency"
      actions={
        <button className="btn btn--sm" onClick={report.refetch} disabled={report.loading}>
          {report.loading ? 'Checking…' : 'Re-check'}
        </button>
      }
    >
      {report.error !== null ? (
        <Callout tone="warning" title="Check could not run">
          {report.error.message}
        </Callout>
      ) : data === null ? (
        <p className="muted">Scanning the catalogue…</p>
      ) : (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            Scanned {formatNumber(data.productsScanned)} product(s)
            {data.truncated ? ' (stopped at the scan limit)' : ''} at{' '}
            {formatDateTime(data.checkedAt)}. Findings are <strong>reported, never fixed</strong> —
            each has more than one valid explanation, so a human decides.
          </p>

          {data.skipped.length > 0 && (
            <Callout tone="info" title="Some checks did not run">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.skipped.map((entry) => (
                  <li key={entry.check}>
                    <strong>{entry.check}</strong>: {entry.reason}
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {data.findings.length === 0 ? (
            <Callout tone="success" title="No inconsistencies found">
              Product statuses agree with their Online Store publication state, and no stale
              automation tags or orphaned cost overrides were found.
            </Callout>
          ) : (
            <div className="stack">
              {data.findings.map((finding) => (
                <div
                  key={`${finding.code}-${finding.shopifyProductId}`}
                  className="card"
                  style={{ padding: 12 }}
                >
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Badge tone={finding.severity === 'warning' ? 'warning' : 'info'}>
                      {finding.code}
                    </Badge>
                    <strong className="truncate">{finding.title}</strong>
                    {finding.shopifyProductId.startsWith('gid://shopify/Product/') && (
                      <Link
                        className="btn btn--sm"
                        href={`/products/${encodeURIComponent(finding.shopifyProductId)}`}
                        style={{ marginLeft: 'auto' }}
                      >
                        Open
                      </Link>
                    )}
                  </div>
                  <p style={{ margin: '6px 0 0' }}>{finding.detail}</p>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    <strong>Suggested:</strong> {finding.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
