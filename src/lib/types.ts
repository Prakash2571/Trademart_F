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


/* ===========================================================================
 * Dropshipping operations
 *
 * Mirrors src/dropshipping/* on the backend. The shapes are deliberately
 * verbose about CONFIDENCE, because the whole point of this module is that an
 * unknown cost is not zero and a total with gaps is not a measurement.
 * ======================================================================== */

/**
 * How much a figure can be trusted.
 *
 *   KNOWN      observed - Shopify told us, or an operator recorded it
 *   ESTIMATED  derived from a configured rule or percentage, not observed
 *   UNKNOWN    genuinely absent. NEVER render as 0.
 */
export type DataConfidence = 'KNOWN' | 'ESTIMATED' | 'UNKNOWN';

/** A single monetary figure that always states how much it can be trusted. */
export interface Figure {
  /** Null if and only if confidence is UNKNOWN. */
  amount: number | null;
  currencyCode: string | null;
  confidence: DataConfidence;
  /** Plain-language provenance. Always populated - show it, do not invent one. */
  source: string;
}

/**
 * A total across several orders, honest about coverage.
 *
 * `amount` is never null: with nothing to include it is a genuine zero across zero
 * orders, which `ordersIncluded: 0` disambiguates. When `ordersExcluded > 0` the
 * total is a LOWER BOUND, not a measurement.
 */
export interface Aggregate {
  amount: number;
  currencyCode: string | null;
  confidence: DataConfidence;
  ordersIncluded: number;
  /** Left out because unknown or in another currency. Their value is NOT zero. */
  ordersExcluded: number;
  source: string;
}

/**
 * Where an order is. `normalizedStatus` reports PROGRESS and never returns
 * DELAYED - lateness is orthogonal and lives on `delayed`. `displayState` on the
 * order is the single collapsed value for a compact badge.
 */
export type DropshipFulfillmentState =
  | 'ORDER_RECEIVED'
  | 'AWAITING_SUPPLIER'
  | 'SUPPLIER_PROCESSING'
  | 'FULFILLED'
  | 'LABEL_CREATED'
  | 'CARRIER_PICKED_UP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELAYED'
  | 'DELIVERY_FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ShipmentTracking {
  company: string | null;
  number: string | null;
  url: string | null;
}

export interface ShipmentEvent {
  status: string | null;
  happenedAt: string | null;
  message: string | null;
}

export interface DropshipShipment {
  normalizedStatus: DropshipFulfillmentState;
  /** Shopify's own words, always retained so a normalisation can be checked. */
  rawShopifyStatus: {
    orderFulfillmentStatus: string | null;
    fulfillmentDisplayStatuses: (string | null)[];
  };
  carrier: string | null;
  trackingNumbers: string[];
  trackingUrls: string[];
  tracking: ShipmentTracking[];
  estimatedDeliveryAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  events: ShipmentEvent[];
  /** Orthogonal to normalizedStatus: an order can be in transit AND late. */
  delayed: boolean;
  delaySignals: string[];
  /** Not the same as "not shipped" - a dispatched order can lack tracking. */
  hasTracking: boolean;
}

/**
 * One order's money.
 *
 * landedCost is what the SUPPLIER is owed (goods + shipping) and is the basis of
 * capital exposure. commercialCost adds fees and allowances and is the basis of
 * contribution. They are separate on purpose - conflating them makes a margin look
 * healthy while the order loses money.
 */
export interface OrderEconomics {
  currencyCode: string | null;
  customerRevenue: Figure;
  supplierProductCost: Figure;
  supplierShippingCost: Figure;
  supplierFulfillmentCost: Figure;
  paymentFees: Figure;
  shopifyFees: Figure;
  advertisingAllowance: Figure;
  otherCommercialCosts: Figure;
  landedCost: Figure;
  commercialCost: Figure;
  estimatedProfit: Figure;
  estimatedMargin: { value: number | null; confidence: DataConfidence };
  confidence: DataConfidence;
  /** Which inputs are missing, so "unknown" is explainable. */
  missingInputs: string[];
  warnings: string[];
}

export interface DropshipOrderItem {
  shopifyLineItemId: string;
  title: string;
  quantity: number;
  sku: string | null;
  shopifyProductId: string | null;
  shopifyVariantId: string | null;
  lineRevenue: number | null;
  unitCost: number | null;
  /** Which cost source won, in plain language. */
  unitCostSource: string;
  /** Null means UNKNOWN, never free. */
  unitShippingCost: number | null;
  supplier: SupplierClassification;
  supplierEvidence: string[];
  fulfillmentService: string | null;
}

export interface DropshipOrder {
  shopifyOrderId: string;
  orderName: string;
  createdAt: string;
  paymentStatus: string | null;
  fulfillmentStatus: string | null;
  /** TRADELLE only where evidence exists. */
  supplier: SupplierClassification;
  supplierEvidence: string[];
  items: DropshipOrderItem[];
  /** Null when protected customer data is not approved - WITHHELD, not absent. */
  customerRegion: {
    countryCode: string | null;
    country: string | null;
    provinceCode: string | null;
    province: string | null;
    city: string | null;
  } | null;
  economics: OrderEconomics;
  shipment: DropshipShipment;
  /** DELAYED when late, else the progress state. For a single badge. */
  displayState: DropshipFulfillmentState;
  warnings: string[];
}

export interface DropshipStateCounts {
  awaitingFulfillment: number;
  processing: number;
  shipped: number;
  inTransit: number;
  outForDelivery: number;
  delivered: number;
  deliveryFailed: number;
  cancelled: number;
  unknown: number;
  /** Deliberately overlaps the progress buckets above. */
  delayed: number;
}

export interface AttentionBucket {
  code: string;
  label: string;
  /** What a human should do. Never performed automatically. */
  action: string;
  severity: 'critical' | 'warning' | 'info';
  count: number;
  examples: { shopifyOrderId: string; orderName: string }[];
}

/** "How much cash do I need available to keep these orders moving?" */
export interface CapitalExposure {
  paidCustomerOrders: Aggregate;
  /** Landed cost of paid, non-cancelled orders - the total supplier bill. */
  supplierCommitments: Aggregate;
  alreadyFulfilled: Aggregate;
  /** Committed but not yet dispatched: the cash still required. */
  outstanding: Aggregate;
  /** Paid orders in NONE of the totals above, because their cost is unknown. */
  ordersWithUnknownCost: number;
  warnings: string[];
}

export interface DropshipDashboard {
  currencyCode: string | null;
  generatedAt: string;
  ordersConsidered: number;
  ordersToday: number;
  ordersThisWeek: number;
  counts: DropshipStateCounts;
  revenue: Aggregate;
  /** Landed cost: what suppliers are owed. */
  supplierCost: Aggregate;
  /** Commercial cost: landed + fees + allowances. */
  commercialCost: Aggregate;
  estimatedProfit: Aggregate;
  estimatedMarginPercentage: number | null;
  exposure: CapitalExposure;
  attention: AttentionBucket[];
  warnings: string[];
}

/** GET /api/dropshipping/settings - the thresholds the figures were computed with. */
export interface DropshipSettings {
  cost: {
    includeSupplierShipping: boolean;
    includePaymentFees: boolean;
    includeShopifyFees: boolean;
    includeAdvertisingAllowance: boolean;
    paymentFeePercentage: number;
    shopifyFeePercentage: number;
    advertisingAllowancePercentage: number;
    otherCommercialCostPerOrder: number;
    minimumMarginPercentage: number;
    minimumProfitAmount: number;
  };
  sla: {
    processingWarningHours: number;
    trackingWarningHours: number;
    deliveryDelayDays: number;
  };
}


/* ===========================================================================
 * Pricing settings (PUT /api/dropshipping/settings)
 * ======================================================================== */

/**
 * PriceRounding is declared once, further up, for the automation rules. The pricing
 * policy uses the same three strategies deliberately - charm pricing must mean the same
 * thing whether automation applies it or Research recommends it - so it is reused rather
 * than redeclared.
 */
export type PricingStrategy = 'TARGET_MARGIN' | 'MARKUP_MULTIPLIER' | 'FIXED_UPLIFT';

export interface PricingPolicy {
  strategy: PricingStrategy;
  targetMarginPercentage: number;
  markupMultiplier: number;
  fixedUplift: number;
  paymentFeePercentage: number;
  shopifyFeePercentage: number;
  advertisingAllowancePercentage: number;
  otherCostPerOrder: number;
  minimumMarginPercentage: number;
  minimumProfitAmount: number;
  rounding: PriceRounding;
}

/**
 * What PUT /api/dropshipping/settings returns.
 *
 * `stored` distinguishes settings an operator actually saved from the documented
 * defaults. Without it the screen cannot tell "you configured this" from "nobody has
 * configured anything", which are different situations.
 */
export interface EffectiveSettings extends DropshipSettings {
  pricing: Partial<PricingPolicy>;
  stored: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** The policy these settings produce, echoed so the consequence is visible. */
  effectivePricingPolicy: PricingPolicy;
}

/* ===========================================================================
 * Product research
 * ======================================================================== */

export type Freshness = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

export type ScoreFactorKey =
  | 'demand'
  | 'trend'
  | 'profitability'
  | 'storeFit'
  | 'competition'
  | 'shipping'
  | 'seasonality'
  | 'fulfillmentQuality';

export type Recommendation =
  | 'STRONG_CANDIDATE'
  | 'GOOD_CANDIDATE'
  | 'WATCH'
  | 'WEAK'
  | 'REJECT';

export type CandidateStatus =
  | 'NEW'
  | 'ANALYZED'
  | 'WATCHING'
  | 'SELECTED'
  | 'PUSHED_TO_SHOPIFY'
  | 'REJECTED';

export type SeasonState =
  | 'EARLY'
  | 'RISING'
  | 'PEAK'
  | 'FALLING'
  | 'OFF_SEASON'
  | 'UNKNOWN';

export type CandidateSource =
  | 'MANUAL'
  | 'TRADELLE'
  | 'SHOPIFY_PERFORMANCE'
  | 'GOOGLE_ADS'
  | 'GOOGLE_TRENDS';

/** One figure behind a score, with where it came from and how old it is. */
export interface EvidenceItem {
  code: string;
  label: string;
  source: string;
  observedAt: string | null;
  fetchedAt: string | null;
  freshness: Freshness;
  value: string | null;
  confidence: DataConfidence;
}

/**
 * One factor's contribution.
 *
 * `value` null means the factor was NOT scored and was EXCLUDED from the average. It
 * does not mean zero, and the UI must never render it as one.
 */
export interface FactorScore {
  factor: ScoreFactorKey;
  value: number | null;
  confidence: DataConfidence;
  reasons: string[];
  risks: string[];
  evidence: EvidenceItem[];
}

export interface TargetMarket {
  countryCode: string;
  region: string | null;
  horizonDays: number;
}

export interface CandidateCommercials {
  supplierCost: number | null;
  supplierCurrency: string | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  shippingDays: number | null;
  expectedSellingPrice: number | null;
  expectedSellingCurrency: string | null;
  costObservedAt: string | null;
}

/** Market figures an operator READ elsewhere and typed in. */
export interface ManualResearchEntry {
  averageMonthlySearches: number | null;
  momentumPercentage: number | null;
  competitionIndex: number | null;
  competitorCount: number | null;
  seasonState: SeasonState;
  peakMonths: number[] | null;
  geography: { countryCode: string | null; region: string | null };
  /** When they READ the figure, which is what freshness ages from. */
  observedAt: string | null;
  sourceNote: string | null;
}

export interface ScoreHistoryEntry {
  at: string;
  overallScore: number;
  confidenceScore: number;
  recommendation: Recommendation;
  note: string | null;
}

/* --------------------------------------------------------- sourceability -- */

export type SupplierAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
export type SupplierAvailabilitySource = 'SHOPIFY_BRIDGE' | 'MANUAL' | 'DIRECT_API';
export type SupplierProvider = 'TRADELLE' | 'OTHER' | 'UNKNOWN';
export type VariantCoverage = 'FULL' | 'PARTIAL' | 'NONE' | 'UNKNOWN';

/**
 * The current, freshness-aware sourceability verdict. Distinct from `availability`, which
 * is the historically recorded value - a check can be AVAILABLE yet NEEDS_RECHECK if stale.
 */
export type CurrentSourceability =
  | 'SOURCEABLE'
  | 'PARTIALLY_SOURCEABLE'
  | 'NEEDS_RECHECK'
  | 'NOT_SOURCEABLE'
  | 'UNVERIFIED';

export interface SupplierVariantAvailability {
  supplierVariantId: string | null;
  sku: string | null;
  title: string;
  optionValues: Record<string, string>;
  availability: SupplierAvailability;
  stockKnown: boolean;
  cost: number | null;
  currencyCode: string | null;
  checkedAt: string | null;
}

export interface SupplierEvidence {
  source: string;
  value: string;
}

/** The supplier verification stored on a candidate. Evidence, never a live fetch. */
export interface SupplierInfo {
  provider: SupplierProvider;
  supplierProductId: string | null;
  sourceUrl: string | null;
  availability: SupplierAvailability;
  availabilitySource: SupplierAvailabilitySource;
  checkedAt: string | null;
  observedAt: string | null;
  note: string | null;
  stockKnown: boolean;
  productAvailable: boolean | null;
  productCost: number | null;
  productCurrency: string | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  shippingDays: number | null;
  variants: SupplierVariantAvailability[];
  evidence: SupplierEvidence[];
}

/** The freshness-aware sourceability verdict returned by the backend. */
export interface SourceabilityResult {
  provider: SupplierProvider;
  availability: SupplierAvailability;
  availabilitySource: SupplierAvailabilitySource;
  checkedAt: string | null;
  freshness: Freshness;
  current: CurrentSourceability;
  variantCoverage: VariantCoverage;
  stockKnown: boolean;
  supplierProductId: string | null;
  sourceUrl: string | null;
  productCost: number | null;
  productCurrency: string | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  shippingDays: number | null;
  variants: SupplierVariantAvailability[];
  reasons: string[];
  pushEligible: boolean;
  block: 'SUPPLIER_UNAVAILABLE' | 'SUPPLIER_AVAILABILITY_UNKNOWN' | 'SUPPLIER_AVAILABILITY_STALE' | null;
  confidencePenalty: number;
}

/** The per-candidate sourceability summary in the shortlist meta. */
export interface SourceabilitySummary {
  provider: SupplierProvider;
  availability: SupplierAvailability;
  current: CurrentSourceability;
  freshness: Freshness;
  variantCoverage: VariantCoverage;
  finalRecommendation: Recommendation | null;
}

export interface ProductCandidate {
  id: string;
  source: CandidateSource;
  sourceProductId: string | null;
  sourceUrl: string | null;
  title: string;
  category: string | null;
  imageUrl: string | null;
  keywords: string[];
  market: TargetMarket;
  commercials: CandidateCommercials;
  manualResearch: ManualResearchEntry;
  /** Recorded supplier verification: whether this product can actually be sourced. Null = never recorded. */
  supplier: SupplierInfo | null;
  factors: FactorScore[];
  /**
   * How good the OPPORTUNITY looks. Null means not scored - never a low score.
   *
   * Kept strictly separate from confidenceScore. The two are never blended, because a
   * single number cannot distinguish a mediocre product from a possibly-excellent one
   * nobody has data for.
   */
  overallScore: number | null;
  /** How much the DATA behind the opinion can be trusted. */
  confidenceScore: number | null;
  recommendation: Recommendation | null;
  seasonState: SeasonState;
  reasons: string[];
  risks: string[];
  evidence: EvidenceItem[];
  freshness: Freshness;
  status: CandidateStatus;
  /**
   * The push lifecycle, ORTHOGONAL to status. Read this - not status - to know whether a
   * push may begin. Mirrors the backend's PushState.
   *
   *   IDLE             nothing in flight
   *   IN_PROGRESS      a push holds the claim right now; a second must not start
   *   SUCCEEDED        a draft was created
   *   SAFETY_INCIDENT  a product exists that could not be verified hidden - needs a human
   */
  pushState: PushState;
  /** Set once a Shopify DRAFT exists. Never implies it is published. */
  pushedShopifyProductId: string | null;
  /** Why the last push ended in SAFETY_INCIDENT. Null in every other state. */
  pushSafetyReason: string | null;
  watchUntil: string | null;
  scoreHistory: ScoreHistoryEntry[];
  notes: string | null;
  createdAt: string;
  analyzedAt: string | null;
  updatedAt: string;
}

export type PushState = 'IDLE' | 'IN_PROGRESS' | 'SUCCEEDED' | 'SAFETY_INCIDENT';

/**
 * One yes/no decision about an action, with the operator-facing reason when it is no.
 *
 * Computed by the backend (candidate.transitions.ts) and sent down so the UI does not keep
 * a second copy of the transition rules that could drift from the routes that enforce them.
 */
export interface ActionDecision {
  allowed: boolean;
  reason: string | null;
}

/** What the backend currently permits for a candidate. Keyed the same as the buttons. */
export interface AllowedActions {
  watch: ActionDecision;
  select: ActionDecision;
  reject: ActionDecision;
  push: ActionDecision;
  analyze: ActionDecision;
}

/* --------------------------------------------------------------- pricing -- */

export type PricingScenarioName = 'CONSERVATIVE' | 'BALANCED' | 'PREMIUM';

export interface PricingBreakdownEntry {
  key: string;
  label: string;
  amount: number;
  provided: boolean;
}

export interface PricingScenario {
  name: PricingScenarioName;
  label: string;
  /** Why an operator would choose this position. */
  intent: string;
  price: number;
  marginPercentage: number | null;
  contribution: number;
  returnOnCostPercentage: number | null;
  /** False when a commercial floor is breached. Shown anyway, marked. */
  viable: boolean;
  guardBreaches: string[];
  minimumViablePrice: number | null;
  reasons: string[];
  breakdown: PricingBreakdownEntry[];
}

export interface PriceRecommendation {
  currencyCode: string | null;
  landedCost: number | null;
  shippingIncluded: boolean;
  policy: PricingPolicy;
  scenarios: PricingScenario[];
  recommended: PricingScenarioName | null;
  blockedReason: string | null;
  warnings: string[];
  notes: string[];
}

/* ------------------------------------------------------------- providers -- */

export type ResearchCapability =
  | 'demand'
  | 'trend'
  | 'competition'
  | 'seasonality'
  | 'storePerformance'
  | 'fulfillmentHistory'
  | 'supplierCommercials';

export interface CapabilityAvailability {
  capability: ResearchCapability;
  available: boolean;
  providers: string[];
  /** Why it is unavailable, in each provider's own words. */
  limitations: string[];
}

export type TradelleProviderMode = 'SHOPIFY_BRIDGE' | 'MANUAL' | 'DIRECT_API_UNAVAILABLE';

export interface ResearchIntegrationDescriptor {
  key: string;
  displayName: string;
  status: 'IMPLEMENTED' | 'PLACEHOLDER';
  requiredEnv: string[];
  documentation: string;
}

/** GET /api/intelligence/capabilities */
export interface ResearchCapabilitiesReport {
  capabilities: CapabilityAvailability[];
  tradelle: {
    mode: TradelleProviderMode;
    modes: Record<TradelleProviderMode, string>;
    documentation: string;
  };
  unbuiltIntegrations: ResearchIntegrationDescriptor[];
}

export interface SignalProvenance {
  capability: ResearchCapability;
  providerName: string;
  supplied: boolean;
  reason: string | null;
}

/** POST /api/intelligence/candidates/:id/analyze */
export interface AnalyzeResult {
  candidate: ProductCandidate;
  pricing: PriceRecommendation;
  provenance: SignalProvenance[];
  /** Capabilities nothing could supply. */
  unavailable: ResearchCapability[];
  warnings: string[];
  capabilities: CapabilityAvailability[];
  /**
   * The hash the operator must send back with a push.
   *
   * It binds the exact decision they reviewed. If the recommendation or price moves before
   * they push, the backend refuses with RECOMMENDATION_CHANGED rather than creating a
   * product on a decision nobody approved.
   */
  decisionHash: string;
  /** Whether the stored score no longer matches the candidate's current inputs. */
  scoreIsStale: boolean;
  /** The supplier sourceability verdict at analysis time (analyze meta). */
  sourceability?: SourceabilityResult;
}

/** POST /api/intelligence/candidates/:id/supplier-verification body. */
export interface SupplierVerificationInput {
  provider: SupplierProvider;
  supplierProductId: string | null;
  sourceUrl: string | null;
  availability: SupplierAvailability;
  observedAt: string | null;
  productCost: number | null;
  productCurrency: string | null;
  shippingCost: number | null;
  shippingCurrency: string | null;
  shippingDays: number | null;
  stockKnown: boolean;
  variants: {
    supplierVariantId: string | null;
    sku: string | null;
    title: string;
    availability: SupplierAvailability;
    cost: number | null;
    currencyCode: string | null;
  }[];
  note: string | null;
}

/**
 * The verified Shopify state of a pushed product.
 *
 * `visibleToCustomers` is the ONLY field that means a customer could see it - read back
 * from Shopify, never inferred from `status`.
 */
export interface ShopifyProductState {
  status: string | null;
  published: boolean;
  visibleToCustomers: boolean;
}

/**
 * GET /api/intelligence/candidates/:id/decision - the current decision and its hash.
 *
 * Read immediately before a push. Computes a fresh analysis and PERSISTS NOTHING, so
 * opening the confirmation dialog cannot move the stored score. The summary shown to the
 * operator and the `decisionHash` sent with the push come from this one response, so what
 * they confirm is provably what the hash covers.
 */
export interface CandidateDecision {
  decisionHash: string;
  candidate: ProductCandidate;
  recommendation: Recommendation | null;
  overallScore: number | null;
  confidenceScore: number | null;
  recommendationDowngraded: boolean;
  pricing: PriceRecommendation;
  policy: PricingPolicy;
  warnings: string[];
  actions: AllowedActions;
  /** The supplier verdict this decision was computed against (from the same analysis). */
  sourceability: SourceabilityResult;
  /** The FINAL, supplier-gated recommendation the operator is approving. */
  finalRecommendation: Recommendation | null;
}

/* ------------------------------------------------------------ duplicates -- */

export type DuplicateStrength = 'EXACT' | 'LIKELY' | 'POSSIBLE';

export interface DuplicateMatch {
  target: 'SHOPIFY_PRODUCT' | 'CANDIDATE';
  id: string;
  title: string;
  strength: DuplicateStrength;
  reason: string;
  /** True when this would stop a push unless explicitly overridden. */
  blocking: boolean;
}

export interface DuplicateReport {
  matches: DuplicateMatch[];
  blocking: DuplicateMatch[];
  summary: string | null;
}

/* ------------------------------------------------------------------ push -- */

/**
 * POST /api/intelligence/candidates/:id/push - creates a DRAFT, never publishes.
 *
 * Mirrors the backend orchestrator's PushAsDraftResult. `outcome` distinguishes a fresh
 * create from a reconciliation of a product a crashed earlier attempt had already made;
 * `listedPrice` is null on a reconcile because nothing was priced. `productState` carries
 * the VERIFIED visibility, and `safetyIncident` is set when the product could not be
 * confirmed hidden - which the API also signals with a RESEARCH_PUSH_SAFETY error, so this
 * field is really for the audit-style display.
 */
export interface PushAsDraftResult {
  candidate: ProductCandidate;
  outcome: 'CREATED' | 'RECONCILED';
  shopifyProductId: string;
  productState: ShopifyProductState;
  duplicates: DuplicateReport;
  listedPrice: { amount: number; currencyCode: string | null; source: string } | null;
  /** True when the candidate's supplier cost reached the new variant. */
  costRecorded: boolean;
  /** Set only when the product could not be verified hidden. Never an ordinary success. */
  safetyIncident: string | null;
  warnings: string[];
}
