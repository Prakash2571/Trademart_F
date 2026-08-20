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
