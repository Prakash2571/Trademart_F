'use client';

/**
 * Warns, prominently, when the connected store is NOT a Shopify development
 * store — meaning every write on the pages behind this banner affects a shop
 * real customers can buy from.
 *
 * Rendered once in the layout rather than per page, because the risk is a
 * property of the connection, not of any single screen, and a warning that
 * appears on some write surfaces but not others trains people to ignore it.
 *
 * Three states, deliberately distinguished:
 *   isDevelopmentStore true   quiet: a dev store is the safe place to work
 *   isDevelopmentStore false  loud danger: writes hit a live storefront
 *   null / unreachable        silent. Shopify withholds the plan field without
 *                             the right access, and crying wolf on a field we
 *                             could not read would make the real warning
 *                             worthless.
 */

import { useApi } from '@/hooks/useApi';
import { Callout } from '@/components/ui';
import type { AutomationStatus, ShopifyStatus } from '@/lib/types';

export function LiveStoreBanner() {
  const status = useApi<ShopifyStatus>('/shopify/status');
  const automation = useApi<AutomationStatus>('/automation/status');

  const shop = status.data?.shop ?? null;
  // Strictly false, never merely falsy: null means "could not determine".
  const isLiveStore = shop !== null && shop.isDevelopmentStore === false;
  if (!isLiveStore) return null;

  const writesEnabled = automation.data?.writesEnabled ?? false;
  const webhookTriggers = automation.data?.webhookTriggersEnabled ?? false;

  return (
    <Callout tone="danger" title="This is a LIVE Shopify store, not a development store">
      <div className="stack">
        <div>
          Changes to <span className="mono">{shop.myshopifyDomain}</span>
          {shop.planDisplayName !== null && <> ({shop.planDisplayName})</>} are visible to real
          customers immediately. Product edits, price changes, stock updates and publishing all
          take effect at once.
        </div>
        <div>
          Automation writes are{' '}
          <strong>{writesEnabled ? 'ENABLED' : 'disabled'}</strong>
          {writesEnabled
            ? ' — an apply will change live prices and visibility.'
            : ' — preview works, but nothing can be written until AUTOMATION_ENABLED=true.'}{' '}
          Webhook-triggered runs are{' '}
          <strong>{webhookTriggers ? 'ON' : 'off'}</strong>
          {webhookTriggers && ' — runs can start without anyone asking.'}
        </div>
        {writesEnabled && (
          <div>
            Keep <span className="mono">maxItemsPerRun</span> low and read every preview before
            applying. New products stay DRAFT by default; approving one publishes it.
          </div>
        )}
      </div>
    </Callout>
  );
}
