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

export interface ShopifyStatus {
  configured: boolean;
  storeDomain: string;
  apiVersion: string;
  graphqlEndpoint: string;
  hasAccessToken: boolean;
  hasWebhookSecret: boolean;
  hasOauthCredentials: boolean;
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
    shopify: { configured: boolean; storeDomain: string; apiVersion: string };
  };
}
