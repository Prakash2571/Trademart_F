'use client';

/**
 * Settings: connection diagnostics only.
 *
 * Shows whether credentials are present as booleans. The access token itself is
 * never sent to the browser by the backend and is never rendered here.
 */

import { Badge, Callout, Card, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import { getApiBaseUrl } from '@/lib/api';
import { NOT_AVAILABLE, formatNumber } from '@/lib/format';
import type { HealthResponse, ShopifyStatus } from '@/lib/types';

function YesNo({ value }: { value: boolean }) {
  return (
    <Badge tone={value ? 'success' : 'warning'}>{value ? 'Yes' : 'No'}</Badge>
  );
}

export default function SettingsPage() {
  const status = useApi<ShopifyStatus>('/shopify/status');
  const health = useApi<HealthResponse>('/health');

  return (
    <>
      <PageHeader
        title="Settings"
        description="Connection status and configuration for the Trademart backend."
        actions={
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              status.refetch();
              health.refetch();
            }}
          >
            Refresh
          </button>
        }
      />

      <div className="stack">
        <Callout tone="info" title="Secrets stay on the server">
          The Shopify access token, client secret and webhook secret live only in the
          backend&apos;s <code>.env</code> file. This page reports whether they are present -
          it never displays their values.
        </Callout>

        <Card title="Shopify connection">
          {status.loading && !status.data ? (
            <div className="stack">
              <Skeleton width="60%" />
              <Skeleton width="45%" />
              <Skeleton width="52%" />
            </div>
          ) : status.error ? (
            <ErrorState error={status.error} onRetry={status.refetch} />
          ) : status.data ? (
            <>
              <div className="kv">
                <div className="kv__key">Status</div>
                <div className="kv__value">
                  {status.data.connected ? (
                    <Badge tone="success" dot>
                      Connected
                    </Badge>
                  ) : status.data.configured ? (
                    <Badge tone="danger" dot>
                      Configured but failing
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      Not configured
                    </Badge>
                  )}
                </div>

                <div className="kv__key">Store domain</div>
                <div className="kv__value mono">{status.data.storeDomain}</div>

                <div className="kv__key">API version</div>
                <div className="kv__value mono">{status.data.apiVersion}</div>

                <div className="kv__key">GraphQL endpoint</div>
                <div className="kv__value mono">{status.data.graphqlEndpoint}</div>

                <div className="kv__key">Access token present</div>
                <div className="kv__value">
                  <YesNo value={status.data.hasAccessToken} />
                </div>

                <div className="kv__key">Webhook secret present</div>
                <div className="kv__value">
                  <YesNo value={status.data.hasWebhookSecret} />
                </div>

                <div className="kv__key">OAuth credentials present</div>
                <div className="kv__value">
                  <YesNo value={status.data.hasOauthCredentials} />
                </div>
              </div>

              {status.data.error && (
                <>
                  <div className="divider" />
                  <Callout tone="danger" title={status.data.error.code}>
                    {status.data.error.message}
                  </Callout>
                </>
              )}

              {status.data.shop && (
                <>
                  <div className="divider" />
                  <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Store details</h3>
                  <div className="kv">
                    <div className="kv__key">Name</div>
                    <div className="kv__value">{status.data.shop.name}</div>
                    <div className="kv__key">myshopify domain</div>
                    <div className="kv__value mono">{status.data.shop.myshopifyDomain}</div>
                    <div className="kv__key">Primary domain</div>
                    <div className="kv__value">
                      {status.data.shop.primaryDomainUrl ?? NOT_AVAILABLE}
                    </div>
                    <div className="kv__key">Contact email</div>
                    <div className="kv__value">{status.data.shop.email ?? NOT_AVAILABLE}</div>
                    <div className="kv__key">Currency</div>
                    <div className="kv__value">{status.data.shop.currencyCode}</div>
                    <div className="kv__key">Timezone</div>
                    <div className="kv__value">{status.data.shop.timezone ?? NOT_AVAILABLE}</div>
                    <div className="kv__key">Plan</div>
                    <div className="kv__value">
                      {status.data.shop.planDisplayName ?? NOT_AVAILABLE}
                      {status.data.shop.isDevelopmentStore ? ' · development store' : ''}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}
        </Card>

        <Card title="Backend">
          {health.loading && !health.data ? (
            <div className="stack">
              <Skeleton width="50%" />
              <Skeleton width="40%" />
            </div>
          ) : health.error ? (
            <ErrorState error={health.error} onRetry={health.refetch} />
          ) : health.data ? (
            <div className="kv">
              <div className="kv__key">Health</div>
              <div className="kv__value">
                <Badge tone={health.data.status === 'ok' ? 'success' : 'danger'}>
                  {health.data.status}
                </Badge>
              </div>
              <div className="kv__key">Service</div>
              <div className="kv__value mono">{health.data.service}</div>
              <div className="kv__key">Environment</div>
              <div className="kv__value">{health.data.environment}</div>
              <div className="kv__key">Uptime</div>
              <div className="kv__value">{formatNumber(health.data.uptimeSeconds)}s</div>
              <div className="kv__key">API base URL</div>
              <div className="kv__value mono">{getApiBaseUrl()}</div>
              <div className="kv__key">Database</div>
              <div className="kv__value">
                {health.data.checks.database.configured ? (
                  <Badge
                    tone={
                      health.data.checks.database.status === 'connected' ? 'success' : 'danger'
                    }
                  >
                    {health.data.checks.database.status}
                  </Badge>
                ) : (
                  <Badge tone="warning">not configured</Badge>
                )}
                {health.data.checks.database.error && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {health.data.checks.database.error}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
