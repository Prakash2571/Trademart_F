'use client';

/**
 * Headless storefront channel status, for the operator console.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This is not the public store. It is the operational view of a public store that
 * lives elsewhere: a custom Shopify headless storefront, deployed as its own
 * application. Nothing here renders customer-facing content.
 *
 * REPORTS EACH PRECONDITION SEPARATELY
 * ------------------------------------
 * "The headless store is not ready" is useless on its own, because the four ways it
 * can fail have four different fixes - set an env var, correct an id, grant
 * read_publications, grant write_publications. The backend resolves which one it is
 * and this renders that answer verbatim rather than re-deriving it here. Every place
 * the rule is re-derived is a place the console and the API can disagree.
 *
 * DOES NOT OVERCLAIM
 * ------------------
 * `publicationReady` means the Shopify-side preconditions hold. The Storefront API
 * access token belongs to the storefront application, which this backend cannot see,
 * so a green badge here deliberately does NOT say "the shop is live". Saying so
 * would be a green light that means nothing, and the one thing an operator would
 * most reasonably read into it.
 */

import { Badge, Callout, Card, ErrorState, KeyValue } from '@/components/ui';
import { useApi } from '@/hooks/useApi';
import type { HeadlessChannelStatus } from '@/lib/types';

export function HeadlessStorefrontCard() {
  const { data, loading, error, refetch } = useApi<HeadlessChannelStatus>(
    '/shopify/publications/headless',
  );

  if (loading && data === null) {
    return (
      <Card title="Headless storefront channel">
        <p className="muted">Loading…</p>
      </Card>
    );
  }
  if (error !== null) {
    return (
      <Card title="Headless storefront channel">
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  }
  if (data === null) return null;

  return (
    <Card title="Headless storefront channel">
      <div className="stack">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <ChannelBadge
            label="Configured"
            ok={data.channelConfigured}
            failLabel="Not configured"
          />
          <ChannelBadge
            label="Found on shop"
            ok={data.channelResolved}
            failLabel="Not found"
          />
          <ChannelBadge
            label="Readable"
            ok={data.canReadPublications}
            failLabel="read_publications missing"
          />
          <ChannelBadge
            label="Publishable"
            ok={data.canPublish}
            failLabel="write_publications missing"
          />
        </div>

        <KeyValue
          items={[
            {
              key: 'Configured as',
              value:
                data.configuredAs === null ? (
                  <span className="muted">nothing set</span>
                ) : (
                  <span className="mono">{data.configuredAs}</span>
                ),
            },
            {
              key: 'Resolved channel',
              value:
                data.channel === null ? (
                  <span className="muted">unresolved</span>
                ) : (
                  <>
                    <strong>{data.channel.name}</strong>{' '}
                    <span className="mono">{data.channel.id}</span>
                  </>
                ),
            },
            {
              key: 'Publication preconditions',
              value: (
                <Badge tone={data.publicationReady ? 'success' : 'warning'} dot>
                  {data.publicationReady ? 'satisfied' : 'not satisfied'}
                </Badge>
              ),
            },
          ]}
        />

        {/*
          The backend's own sentence, not a re-derived one. It already knows which
          precondition failed and names the next action.
        */}
        <Callout tone={data.publicationReady ? 'info' : 'warning'} title="What this means">
          {data.reason}
        </Callout>

        {data.scopesKnown === false && (
          <Callout tone="info" title="Granted scopes are unknown">
            The active token strategy does not report its scopes, so the two scope badges
            above are assumptions rather than facts. A real Shopify call still fails
            loudly if a scope is genuinely missing.
          </Callout>
        )}

        {/*
          Stated because a satisfied publication precondition is the single most
          likely thing to be misread as "the customer-facing store works".
        */}
        <p className="muted">
          Publication is only the Shopify half. This page cannot verify the storefront
          application&rsquo;s own Storefront API token or deployment — that runs
          separately and holds its own credentials, which never reach this console.
        </p>
      </div>
    </Card>
  );
}

function ChannelBadge({
  label,
  ok,
  failLabel,
}: {
  label: string;
  ok: boolean;
  failLabel: string;
}) {
  return (
    <Badge tone={ok ? 'success' : 'warning'} dot={ok}>
      {ok ? label : failLabel}
    </Badge>
  );
}
