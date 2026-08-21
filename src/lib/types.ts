/**
 * Types mirroring the Trademart backend DTOs.
 *
 * Kept hand-written and minimal rather than generated - the frontend only needs
 * the fields it renders.
 */

export interface Money {
  amount: number;
  currencyCode: string;
  raw: string;
}

export type SupplierClassification = 'TRADELLE' | 'OTHER' | 'UNKNOWN';

export interface PageMeta {
  hasNextPage: boolean;
  endCursor: string | null;
  count: number;
  degraded?: string[];
  note?: string;
}

export interface ShopDto {
  shopifyShopId: string;
  name: string;
  myshopifyDomain: string;
  primaryDomainUrl: string | null;
  email: string | null;
  currencyCode: string;
  timezone: string | null;
  weightUnit: string | null;
  planDisplayName: string | null;
  isDevelopmentStore: boolean | null;
  isShopifyPlus: boolean | null;
  country: string | null;
  apiVersion: string;
}

export type ShopifyAuthStrategy = 'CLIENT_CREDENTIALS' | 'STATIC_TOKEN' | 'NONE';

/**
 * Non-secret token status. The backend never sends the token value itself, so
 * there is deliberately no field for it here.
 */
export interface TokenDiagnostics {
  strategy: ShopifyAuthStrategy;
  cached: boolean;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  scopes: string[];
  fetchCount: number;
  lastFetchedAt: string | null;
  lastError: string | null;
}

export interface ShopifyStatus {
  configured: boolean;
  storeDomain: string;
  apiVersion: string;
  graphqlEndpoint: string;
  tokenEndpoint: string;
  authStrategy: ShopifyAuthStrategy;
  hasClientCredentials: boolean;
  hasStaticTokenOverride: boolean;
  hasWebhookSecret: boolean;
  token: TokenDiagnostics | null;
  connected: boolean;
  shop: ShopDto | null;
  /**
   * Store classification, refined with Shopify's real isDevelopmentStore flag
   * when connected. The single authority for "is this a live store?" - the
   * System page reads it from here rather than from a separate endpoint.
   */
  storeSafety?: ShopifyStoreSafety;
  error: { code: string; message: string } | null;
}

export interface ProductVariantDto {
  shopifyVariantId: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: Money | null;
  compareAtPrice: Money | null;
  availableForSale: boolean | null;
  inventoryQuantity: number | null;
  inventoryItemId: string | null;
  inventoryTracked: boolean | null;
  unitCost: Money | null;
}

export interface ProductDto {
  shopifyProductId: string;
  title: string;
  handle: string;
  description: string | null;
  status: string;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  featuredImageUrl: string | null;
  minPrice: Money | null;
  maxPrice: Money | null;
  totalInventory: number | null;
  variants: ProductVariantDto[];
  supplier: SupplierClassification;
  supplierEvidence: string[];
}

export interface OrderLineItemDto {
  shopifyLineItemId: string;
  title: string;
  quantity: number;
  sku: string | null;
  vendor: string | null;
  shopifyVariantId: string | null;
  shopifyProductId: string | null;
  unitPrice: Money | null;
  discountedTotal: Money | null;
  supplier: SupplierClassification;
}

export interface FulfillmentDto {
  id: string;
  status: string | null;
  createdAt: string | null;
  trackingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export interface OrderDto {
  shopifyOrderId: string;
  name: string;
  createdAt: string;
  processedAt: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currencyCode: string;
  customer: {
    shopifyCustomerId: string | null;
    displayName: string | null;
    email: string | null;
  } | null;
  subtotal: Money | null;
  totalDiscounts: Money | null;
  totalShipping: Money | null;
  totalTax: Money | null;
  total: Money | null;
  shippingLine: { title: string | null; carrier: string | null; price: Money | null } | null;
  lineItems: OrderLineItemDto[];
  fulfillments: FulfillmentDto[];
  supplier: SupplierClassification;
}

export interface CustomerDto {
  shopifyCustomerId: string;
  createdAt: string;
  updatedAt: string;
  state: string | null;
  ordersCount: number | null;
  amountSpent: Money | null;
  tags: string[];
  displayName: string | null;
  email: string | null;
  location: string | null;
}

export interface InventoryItemDto {
  inventoryItemId: string;
  sku: string | null;
  tracked: boolean | null;
  unitCost: Money | null;
  shopifyVariantId: string | null;
  shopifyProductId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  available: number | null;
  levels: {
    locationId: string | null;
    locationName: string | null;
    quantities: Record<string, number>;
  }[];
}

export interface DashboardSummary {
  shopify: {
    configured: boolean;
    storeDomain: string;
    apiVersion: string;
    connected: boolean;
    shop: ShopDto | null;
  };
  database: { configured: boolean; status: string };
  counts: { products: number | null; orders: number | null; customers: number | null };
  revenue: {
    currencyCode: string | null;
    total: number;
    averageOrderValue: number | null;
    window: AnalyticsWindow;
  } | null;
  pendingFulfillmentCount: number | null;
  errors: { source: string; code: string; message: string }[];
}

export interface AnalyticsWindow {
  orderCount: number;
  from: string | null;
  to: string | null;
  basedOn: string;
  truncated: boolean;
}

export interface AnalyticsOverview {
  window: AnalyticsWindow;
  currencyCode: string | null;
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number | null;
  totalDiscounts: number;
  totalShipping: number;
  totalTax: number;
  pendingFulfillmentCount: number;
  financialStatusBreakdown: Record<string, number>;
  fulfillmentStatusBreakdown: Record<string, number>;
  ordersByDay: { date: string; orders: number; revenue: number }[];
  topProducts: {
    shopifyProductId: string | null;
    title: string;
    unitsSold: number;
    revenue: number;
  }[];
  estimatedMargin: { available: false; reason: string };
  notes: string[];
}

export interface TrafficAvailability {
  available: false;
  reason: string;
  requiredScope: string;
  documentation: string;
}

export interface PricingBreakdownEntry {
  key: string;
  label: string;
  amount: number;
  provided: boolean;
}

export interface PricingResult {
  sellingPrice: number;
  totalCost: number;
  grossProfit: number;
  profitMarginPercentage: number | null;
  returnOnCostPercentage: number | null;
  breakdown: PricingBreakdownEntry[];
  isEstimate: boolean;
  missingInputs: string[];
  notes: string[];
}

export interface SuggestedPriceResult {
  suggestedPrice: number;
  absoluteCosts: number;
  percentageCosts: number;
  desiredMarginPercentage: number;
  projection: PricingResult;
  isEstimate: boolean;
  missingInputs: string[];
  notes: string[];
}

export interface HealthResponse {
  status: string;
  service: string;
  environment: string;
  uptimeSeconds: number;
  checks: {
    database: { configured: boolean; status: string; error: string | null };
    shopify: {
      configured: boolean;
      authStrategy: ShopifyAuthStrategy;
      storeDomain: string;
      apiVersion: string;
    };
  };
}


/** Response from GET /api/operator/me - the frontend's auth-state source. */
export interface OperatorMe {
  authenticated: boolean;
  username: string | null;
  method: 'SESSION' | 'API_KEY' | null;
  /** False means nobody can sign in until the server is configured. */
  loginConfigured: boolean;
  operatorConfigured: boolean;
  /** When true, read endpoints need a session too, not just writes. */
  readsProtected: boolean;
  csrfHeader: string;
  csrfCookie: string;
}

/** Response from POST /api/operator/login. */
export interface OperatorLogin {
  username: string;
  method: 'SESSION';
  expiresInSeconds: number;
  csrfHeader: string;
  csrfCookie: string;
}


/* ----------------------------------------------------------- automation -- */

export type PricingMode = 'margin' | 'multiplier' | 'fixed_uplift';
export type SelectionMode = 'all' | 'tagged' | 'vendor';
export type NewProductPolicy = 'leave' | 'draft' | 'activate';
export type PriceRounding = 'none' | 'charm99' | 'integer';

export interface AutomationPriceRules {
  enabled: boolean;
  pricingMode: PricingMode;
  multiplier: number;
  fixedUplift: number;
  targetMarginPercentage: number;
  minMarginPercentage: number;
  paymentFeePercentage: number;
  shopifyFeePercentage: number;
  advertisingCost: number;
  otherCosts: number;
  rounding: PriceRounding;
  maxIncreasePercentage: number;
  maxDecreasePercentage: number;
  minChangeAmount: number;
  requireKnownCost: boolean;
}

export interface AutomationVisibilityRules {
  enabled: boolean;
  hideOutOfStock: boolean;
  restoreWhenBackInStock: boolean;
  hideBelowMinMargin: boolean;
  hideUnknownCost: boolean;
}

export interface AutomationSelectionRules {
  mode: SelectionMode;
  includeTags: string[];
  includeVendors: string[];
  newProductPolicy: NewProductPolicy;
}

export interface AutomationRules {
  visibility: AutomationVisibilityRules;
  price: AutomationPriceRules;
  selection: AutomationSelectionRules;
  exemptTags: string[];
  maxItemsPerRun: number;
}

/** The cost-source hierarchy, most to least authoritative. */
export type CostSourceName = 'SUPPLIER_API' | 'SHOPIFY_UNIT_COST' | 'MANUAL' | 'UNKNOWN';

export interface CostResolutionTier {
  source: CostSourceName;
  description: string;
  /** False when no registered provider can supply this tier at all. */
  available: boolean;
  requiresScope: string | null;
}

export interface SupplierCostSupport {
  providerName: string;
  supplierCostApi: boolean;
  shopifyIntegration: boolean;
  /** Why supplierCostApi is false. Null when it is true. */
  limitation: string | null;
}

/**
 * How a product's cost is resolved.
 *
 * Replaces the old single `costSource` field, which described Shopify's
 * unitCost as though it were the only source - true of the original MVP, and
 * misleading once the supplier registry and manual costs existed.
 */
export interface CostResolution {
  order: CostSourceName[];
  manualCostSupported: boolean;
  /** e.g. SKIP_AUTOMATIC_PRICING - an unknown cost is never treated as 0. */
  unknownCostPolicy: string;
  tiers: CostResolutionTier[];
  suppliers: SupplierCostSupport[];
}

export interface AutomationStatus {
  writesEnabled: boolean;
  storeDomain: string;
  effectiveRules: AutomationRules;
  ruleProblems: string[];
  costResolution: CostResolution;
  writeScopeRequired: string;
  webhookTriggersEnabled: boolean;
  note: string;
}

export interface AutomationRulesResponse {
  stored: Partial<AutomationRules> | null;
  effective: AutomationRules;
  problems: string[];
  source: 'defaults' | 'stored';
}

/** One planned/applied action from a preview or run. */
export interface AutomationAction {
  type: 'visibility' | 'price';
  shopifyProductId: string;
  shopifyVariantId?: string | null;
  title: string;
  variantTitle?: string;
  from: string | number;
  to: string | number;
  currencyCode?: string;
  currentMarginPercentage?: number | null;
  projectedMarginPercentage?: number | null;
  costSource?: string;
  clamped?: boolean;
  reasons: string[];
}

export interface AutomationSkipped {
  shopifyProductId: string;
  shopifyVariantId: string | null;
  title: string;
  reasons: string[];
}

export interface AutomationSummary {
  productsConsidered: number;
  visibilityChanges: number;
  priceChanges: number;
  priceIncreases: number;
  priceDecreases: number;
  clamped: number;
  skipped: number;
  truncated: boolean;
  applied?: number;
  failed?: number;
}

export interface AutomationReport {
  dryRun: boolean;
  shopDomain: string;
  rules: AutomationRules;
  plan: {
    actions: AutomationAction[];
    skipped: AutomationSkipped[];
    summary: AutomationSummary;
  };
  actions: {
    type: 'visibility' | 'price';
    shopifyProductId: string;
    shopifyVariantId: string | null;
    title: string;
    fromValue: string;
    toValue: string;
    currencyCode: string | null;
    reasons: string[];
    status: 'planned' | 'applied' | 'failed';
    error: string | null;
  }[];
  degraded: string[];
  summary: AutomationSummary;
  auditRunId: string | null;
  notes: string[];
}

export interface AutomationRun {
  _id?: string;
  startedAt: string;
  finishedAt: string | null;
  dryRun: boolean;
  trigger: string;
  summary: AutomationSummary | null;
}


/* ------------------------------------------------- Shopify capabilities --- */

/**
 * Why a feature is or is not usable against the connected store.
 *
 * The distinction is the point: SCOPE_MISSING is fixed by re-authorising with
 * the scope, NOT_IMPLEMENTED cannot be fixed by granting anything. The UI must
 * never tell someone to grant a permission that would not help.
 */
export type CapabilityStatus =
  | 'AVAILABLE'
  | 'SCOPE_MISSING'
  | 'NOT_IMPLEMENTED'
  | 'SCOPES_UNKNOWN';

export interface CapabilityFeature {
  key: string;
  group: string;
  action: string;
  title: string;
  requiredScopes: string[];
  implemented: boolean;
  operations: string[];
  routes: string[];
  note?: string;
  status: CapabilityStatus;
  available: boolean;
  missingScopes: string[];
}

export interface ShopifyCapabilities {
  configured: boolean;
  storeDomain: string;
  authStrategy: ShopifyAuthStrategy | string;
  /**
   * group -> action -> granted. `null` means undeterminable (a static token
   * does not report its scopes), which is not the same as false.
   */
  capabilities: Record<string, Record<string, boolean | null>>;
  features: CapabilityFeature[];
  scopes: {
    required: string[];
    requested: string[];
    granted: string[] | null;
    missing: string[];
    notRequested: string[];
    unused: string[];
  };
  scopesKnown: boolean;
  note: string;
}

/* ----------------------------------------------------- storefront/themes -- */

export interface ThemeDto {
  id: string;
  name: string;
  role: string | null;
  live: boolean;
  updatedAt?: string | null;
  previewUrl?: string | null;
}

export interface StorefrontStatus {
  liveTheme: ThemeDto | null;
  liveThemeError: string | null;
  requiredScope: string;
  capabilities: {
    listThemes: boolean;
    readThemeFiles: boolean;
    editLiveTheme: boolean;
    editDraftTheme: boolean;
    publishTheme: boolean;
  };
  writeStatus: string;
  note: string;
}

export interface ThemeFileDto {
  filename: string;
  body: string | null;
  size?: number | null;
  contentType?: string | null;
}

/* ---------------------------------------------------------- suppliers ----- */

export interface SupplierCapabilityFlags {
  identifyProduct: boolean;
  shopifyIntegration: boolean;
  searchProducts: boolean;
  getProduct: boolean;
  getSupplierCost: boolean;
  getShippingQuote: boolean;
  getInventory: boolean;
  createOrder: boolean;
  cancelOrder: boolean;
  getOrder: boolean;
  getTracking: boolean;
}

export interface SupplierProviderDto {
  providerName: string;
  capabilities: SupplierCapabilityFlags;
  /** Why a false capability is false, keyed by capability name. */
  limitations: Partial<Record<keyof SupplierCapabilityFlags, string>>;
}

/* -------------------------------------------------------- manual costs ---- */

export interface ManualCostRecord {
  shopifyProductId: string;
  shopifyVariantId: string | null;
  provider: string;
  amount: number;
  /** Supplier shipping cost, or null when not entered. */
  shippingCost: number | null;
  currencyCode: string;
  costSource: string;
  /** True when this value beats Shopify's cost per item. */
  override: boolean;
  note: string | null;
  updatedAt: string | null;
}

/* ----------------------------------------------------------- inventory ---- */

export interface LocationDto {
  id: string;
  name: string;
  active?: boolean | null;
  shipsInventory?: boolean | null;
  address?: {
    city?: string | null;
    country?: string | null;
  } | null;
}

export interface InventorySetResult {
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  /** Present when Shopify reported the resulting on-hand value. */
  applied?: boolean;
}

/* ------------------------------------------------------ product creation --- */

/** A created variant, enough to map a form row to the real Shopify variant. */
export interface CreatedVariant {
  shopifyVariantId: string;
  sku: string | null;
  optionValues: { name: string; value: string }[];
}

/**
 * POST /api/automation/approve response. Activation and publication are
 * distinct Shopify operations reported separately, so an ACTIVE-but-unpublished
 * outcome is explicit rather than hidden behind a blanket success flag.
 */
export interface ApproveResult {
  shopifyProductId: string;
  activated: boolean;
  tagsRemoved: string[];
  published: boolean;
  publications: { publicationId: string; name: string; isPublished: boolean }[];
  publishError: string | null;
}

/**
 * POST /api/shopify/products response. Deliberately NOT a full ProductDto - it
 * is the create result plus enough variant identity (id + sku + optionValues)
 * to persist per-variant manual costs without assuming variant order.
 */
export interface ProductCreateResult {
  shopifyProductId: string;
  title: string;
  /** What Shopify reports NOW - DRAFT unless publish was requested AND verified. */
  status: string;
  /** What the caller asked for, so a divergence from `status` is visible. */
  desiredStatus: string;
  variantsCreated: number;
  mediaAttached: number;
  /** True only when publication was requested and verified by read-back. */
  published: boolean;
  /** Set when publish was requested but failed; product left DRAFT. */
  publishError: string | null;
  publications: { publicationId: string; name: string; isPublished: boolean }[];
  variants: CreatedVariant[];
  /**
   * The ONLY field that may be shown as "customers can see it". Requires a
   * verified ACTIVE status AND a verified publication - never inferred from
   * `status`, which is wrong in both directions.
   */
  visibleToCustomers: boolean;
  /**
   * True when the product EXISTS but did not reach the requested end state
   * (most commonly: publish failed and it was left a safe DRAFT). The HTTP
   * response is 207 in this case - see ApiResult.status.
   */
  partialSuccess: boolean;
  /** Ordered, human-readable account of what did not go to plan. */
  warnings: string[];
}

/* ===========================================================================
 * Operations surface: publication visibility, audit, diagnostics, system
 *
 * These mirror the REAL backend responses. Where an earlier draft assumed
 * endpoints that were consolidated (a standalone /automation/lock, a separate
 * /diagnostics/store-mode), the types follow what the backend actually serves:
 * the automation lock is reported by GET /automation/status as `activeRun`, and
 * store classification by GET /shopify/status as `storeSafety`.
 * ======================================================================== */

/**
 * A product's real customer visibility, from
 * GET /api/shopify/products/:id/publications.
 *
 * Visibility is a CONJUNCTION: ACTIVE status AND published to the Online Store.
 * ACTIVE alone does not mean visible (it may be published nowhere), and published
 * alone does not mean visible (it may be DRAFT). `visibleToCustomers` is the only
 * field that answers "can a customer find this?", and `reason` always explains it.
 */
export interface ProductVisibility {
  shopifyProductId: string;
  status: string | null;
  publications: PublicationChannelState[];
  onlineStore: PublicationChannelState | null;
  /** Published to at least one channel - NOT the same as visible. */
  publishedAnywhere: boolean;
  visibleToCustomers: boolean;
  reason: string;
}

export interface PublicationChannelState {
  publicationId: string;
  name: string;
  isPublished: boolean;
  publishDate: string | null;
}

/* ---------------------------------------------------------------- audit ---- */

export interface AuditEntry {
  _id?: string;
  shopDomain: string;
  actor: string;
  authMethod: string | null;
  at: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  requestId: string | null;
  /**
   * PARTIAL is real: a bulk apply that changed 37 of 40 products is neither a
   * success nor a failure, and the trail must not round it to either.
   */
  result: 'SUCCESS' | 'PARTIAL' | 'FAILURE';
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
}

/* -------------------------------------------------------------- webhooks --- */

export type WebhookEventState =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'IGNORED';

export interface WebhookEventDto {
  _id?: string;
  shopDomain: string;
  topic: string;
  webhookId: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: WebhookEventState;
  attempts: number;
  nextAttemptAt: string | null;
  error: string | null;
  errorCode: string | null;
  ignoredReason: string | null;
  requestId: string | null;
}

export interface WebhookQueueStats {
  counts: Partial<Record<WebhookEventState, number>>;
  oldestPending: string | null;
  lastProcessedAt: string | null;
  failed: number;
  workerRunning: boolean;
}

export interface WebhookEventsResponse {
  events: WebhookEventDto[];
  stats: WebhookQueueStats;
}

/* ------------------------------------------------------------ integrity ---- */

export interface IntegrityFinding {
  code: string;
  severity: 'warning' | 'info';
  shopifyProductId: string;
  shopifyVariantId: string | null;
  title: string;
  detail: string;
  /** Never performed automatically - every finding has more than one cause. */
  recommendedAction: string;
}

export interface IntegrityReport {
  shopDomain: string;
  checkedAt: string;
  productsInspected: boolean;
  productsScanned: number;
  truncated: boolean;
  publicationChecked: boolean;
  findings: IntegrityFinding[];
  counts: Record<string, number>;
  /** Checks that could not run, and why. Never silently omitted. */
  skipped: { check: string; reason: string }[];
}

/* --------------------------------------------------------- shopify status -- */

/**
 * Store classification, nested under GET /api/shopify/status as `storeSafety`.
 *
 * There is deliberately no standalone endpoint for this: one authority for
 * "is this a live store?" is safer than two that can disagree.
 */
export interface ShopifyStoreSafety {
  classification: 'DEVELOPMENT' | 'LIVE' | 'UNKNOWN';
  source: 'shopify' | 'config' | 'unknown';
  /** Whether automated tooling (tests, seed/smoke scripts) may write. */
  toolingWritesAllowed: boolean;
  allowLiveStoreWrites: boolean;
  reason: string;
}

/* ------------------------------------------------------- rate limit / breaker */

export interface BreakerSnapshot {
  state: 'closed' | 'open';
  consecutiveFailures: number;
  lastFailureCode: string | null;
  lastFailureAt: string | null;
  /** The consecutive-failure count at which the breaker opens. */
  threshold: number;
}

export interface RateLimitReport {
  throttle: {
    currentlyAvailable: number | null;
    maximumAvailable: number | null;
    restoreRate: number | null;
    availablePercentage: number | null;
    lastRequestedQueryCost: number | null;
    lastActualQueryCost: number | null;
  } | null;
  breaker: BreakerSnapshot;
  /** Where the numbers came from - never a live probe of Shopify. */
  source: 'last-shopify-response' | 'none';
  note: string;
}

/* ----------------------------------------------------------- automation ---- */

/**
 * The apply lock holder, reported by GET /api/automation/status as `activeRun`.
 * Null when no run is in progress.
 */
export interface ActiveAutomationRun {
  startedAt: string;
  trigger: string;
  requestId: string | null;
}

/** GET /api/automation/status - the fields the console reads for lock/breaker. */
export interface AutomationStatus {
  writesEnabled: boolean;
  storeDomain: string;
  activeRun: ActiveAutomationRun | null;
  shopify: BreakerSnapshot;
}

/* -------------------------------------------------------------- version ---- */

export interface VersionInfo {
  version: string;
  gitSha: string;
  gitShaShort: string;
  buildTime: string | null;
  nodeVersion: string;
  uptimeSeconds: number;
  startedAt: string;
}

/* ------------------------------------------------ automation preview token -- */

/**
 * The single-use preview token from POST /api/automation/preview (in the response
 * `meta.preview`). Sent back as `previewId` on apply so the server can prove the
 * applied plan is the one that was reviewed, and reject it as PREVIEW_STALE
 * otherwise.
 */
export interface PreviewToken {
  previewId: string;
  rulesHash: string;
  planHash: string;
  storeDomain: string;
  generatedAt: string;
  expiresAt: string;
}
