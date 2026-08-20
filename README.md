# Trademart Frontend

Next.js dashboard for Trademart. Displays Shopify store data and provides the
pricing calculator.

The browser talks **only** to the Trademart backend:

```
Next.js  ->  Trademart backend  ->  Shopify Admin API
```

It never calls Shopify directly, and it holds **no credentials of any kind**.

---

## Requirements

| Requirement | Version / notes |
| --- | --- |
| Node.js | **20 or newer** (22 LTS recommended) |
| npm | Ships with Node. Don't switch package managers. |
| Trademart backend | Must be running — see *Backend dependency* below |

### Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript
- Plain CSS design tokens in `src/app/globals.css` — **no UI library**, no CSS framework
- Hand-rolled `fetch` wrapper and data hook — no data-fetching library

---

## Environment variables

```bash
cp .env.example .env.local
```

| Variable | Default | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000/api` | Base URL of the Trademart backend API |

That is the only variable, and it is the only one that may ever be added here.

> **Next.js exposes every `NEXT_PUBLIC_*` variable to the browser.** Never put a
> Shopify Admin API token, client secret, webhook secret, database URI, Meta or
> Google Ads token, payment credential or Tradelle credential in this project.
> Secrets belong in the backend `.env`.

Note: the prefix is `NEXT_PUBLIC_`, not `VITE_` — this is a Next.js app, so
`VITE_*` variables are ignored.

---

## Install

```bash
npm install
```

## Run the development server

```bash
npm run dev
```

Then open <http://localhost:3000> — `/` redirects to `/dashboard`.

Other scripts:

```bash
npm run build      # production build
npm start          # serve the production build
npm run typecheck  # tsc --noEmit
```

---

## Backend dependency

Every page reads from the backend, so start it first:

```bash
cd ../trademart-backend
npm install
cp .env.example .env     # add SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET
npm run dev              # http://localhost:4000
```

Two things must line up:

1. `NEXT_PUBLIC_API_BASE_URL` here points at the backend (`http://localhost:4000/api`).
2. `FRONTEND_URL` in the backend `.env` is `http://localhost:3000`, since CORS is
   restricted to that single origin.

If the backend is not running, pages show a **`BACKEND_UNREACHABLE`** state with
the URL that was attempted rather than an empty screen.

The pricing page works with no Shopify credentials at all. Product, order,
customer and inventory pages need `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET`
set in the backend, which then obtains and refreshes the access token
automatically; without them the pages show a clear `SHOPIFY_NOT_CONFIGURED`
message instead of failing silently.

The **Settings** page shows the live auth strategy, when the cached token
expires, and the scopes Shopify actually granted — the token value itself is
never sent to the browser.

---

## Routes

| Route | Shows |
| --- | --- |
| `/dashboard` | Connection status, product/order/customer counts, revenue, pending fulfillments, API errors |
| `/products` | Title, status, supplier, price, SKU, inventory, supplier cost and estimated margin; row opens variant detail |
| `/orders` | Order number, customer, date, amount, payment + fulfillment status, supplier; row opens line items, totals, shipping and tracking |
| `/customers` | Read-only list — orders count, total spent, location, state |
| `/analytics` | Revenue, AOV, status breakdowns, revenue-by-day, top products, plus explicit unavailability for margin and traffic |
| `/pricing` | Margin calculator and suggested-price calculator |
| `/settings` | Shopify connection, store domain, API version, backend health |
| `/login` | Operator sign-in |

`/` redirects to `/dashboard`.

---

## Operator authentication

Endpoints that change the store require a signed-in operator on the backend. The
frontend handles this with:

- **`OperatorProvider`** (`src/lib/operator.tsx`) — loads `GET /api/operator/me`
  once and shares auth state via `useOperator()`.
- **`/login`** — posts credentials to the backend, which sets an **HttpOnly**
  session cookie. No token is ever stored in JavaScript.
- **Topbar control** (`OperatorMenu`) — shows the signed-in operator and a sign
  out button, or a "Sign in" link.
- **`AuthGate`** — blocks the console only when the backend has
  `OPERATOR_PROTECT_READS=true` and nobody is signed in; otherwise reads render
  as before and individual writes prompt for sign-in on `UNAUTHORIZED`.

The API client (`src/lib/api.ts`) sends every request with
`credentials:'include'` and echoes the CSRF cookie in `X-CSRF-Token` on
mutations. There is **no auth-related frontend env var** — the cookie is managed
by the browser. See the backend's `docs/OPERATOR_AUTH.md`.

---

## How data is displayed

Three rules the UI follows consistently:

1. **Missing data shows an em dash (—), never `0`.** A product with no inventory
   permission is visibly unknown, not visibly zero.
2. **Estimates are labelled.** Pricing results carry an estimate warning listing
   which inputs were missing. Analytics figures always state the window they were
   computed over, so a sampled total is never mistaken for an all-time total.
3. **Errors are surfaced, not swallowed.** Each error state shows the backend
   error code plus a specific remedy — `SHOPIFY_SCOPE_MISSING` and
   `BACKEND_UNREACHABLE` need different fixes, so the UI never blurs them.

The Settings page reports whether credentials are present as booleans. The access
token is never sent to the browser by the backend and is never rendered.

---

## Structure

```
src/
├── app/
│   ├── layout.tsx        shell: sidebar + top bar + connection pill
│   ├── globals.css       design tokens and all component styles
│   ├── page.tsx          redirects to /dashboard
│   └── dashboard|products|orders|customers|analytics|pricing|settings/
├── components/
│   ├── Sidebar.tsx       navigation with active-route highlighting
│   ├── ConnectionPill.tsx live Shopify status in the top bar
│   ├── DataTable.tsx     generic table: loading / error / empty / populated
│   └── ui.tsx            Card, PageHeader, StatCard, Badge, Callout,
│                         Skeletons, EmptyState, ErrorState, Modal, KeyValue
├── hooks/useApi.ts       fetch + loading/error/refetch, cancels stale requests
└── lib/
    ├── api.ts            the only network layer; typed ApiError
    ├── types.ts          DTOs mirroring the backend
    └── format.ts         money/date/number formatting
```

Reusable components live in `ui.tsx` and `DataTable.tsx` so tables, stat cards,
loading skeletons, error states, empty states and modals stay consistent across
pages.

---

## Responsive behaviour

Desktop-first. Below 900px the sidebar collapses to a horizontal scrolling nav,
tables scroll horizontally, and key/value grids stack. Animation is limited to
skeleton shimmer, which respects `prefers-reduced-motion`.
