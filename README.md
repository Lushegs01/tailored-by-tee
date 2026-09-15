# Tailored by Tee — storefront

A premium single-brand fashion storefront for a Lagos clothing label. Editorial in presentation, rigorous in commerce: server-priced carts, variant-level inventory, Paystack payments.

> **Status: Phases 1–4 of 12 complete** — design system, homepage, shop / categories / collections with filters and sort, search, product pages with variant selection and size guides, cart drawer. All running on a typed seed catalogue.
> **Also in:** Neon PostgreSQL + Prisma persistence ([Database](#database-neon--prisma)), checkout ([Checkout](#checkout)) and Paystack payments ([Payments](#payments-paystack)). **Next:** accounts. See [Roadmap](#roadmap).

## Stack

| Concern    | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict        |
| Styling    | Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`)            |
| Primitives | Radix UI (`radix-ui`), shadcn/ui-compatible tokens (`components.json`) |
| Motion     | Motion v13 via `LazyMotion` + `m.*`                                    |
| Validation | Zod                                                                    |
| Data       | PostgreSQL on Neon + Prisma 7 (Neon driver adapter); seed catalogue when no database is configured |
| Payments   | Paystack (planned) · amounts in kobo end-to-end                        |
| Media      | Placeholder Unsplash manifest → Cloudinary (planned)                   |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # typegen + tsc + eslint
npm test           # unit tests for the commerce rules (node:test via tsx)
npm run build
```

Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs and structured data resolve correctly.

## Database (Neon + Prisma)

The storefront runs without a database — it falls back to the typed seed catalogue — so a fresh clone works immediately. To run it on PostgreSQL:

1. **Connection strings.** Copy `.env.example` to `.env.local` and fill in both Neon URLs from the Neon console (*Connect → Prisma*):
   - `DATABASE_URL` — the **pooled** string (host contains `-pooler`), used by the running app.
   - `DATABASE_URL_UNPOOLED` — the **direct** string, used by migrations and the seed script.
2. **Create the tables:** `npm run db:deploy` applies `prisma/migrations` (tables, indexes, and CHECK constraints that stop negative stock, overselling and inconsistent totals).
3. **Load the demo catalogue:** `npm run db:seed`. Safe to re-run: content is updated, but stock is only set for new variants, so it never resets a trading store's inventory.
4. Restart `npm run dev`. With `DATABASE_URL` set, the catalogue now comes from Neon (override with `CATALOG_SOURCE=seed|database`).

| Script              | Does                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `npm run db:migrate`| Create a new migration after editing `prisma/schema.prisma` (development) |
| `npm run db:deploy` | Apply pending migrations (CI / production)                           |
| `npm run db:seed`   | Load or refresh the demo catalogue                                   |
| `npm run db:studio` | Browse the data in Prisma Studio                                     |

How it fits together: `prisma/schema.prisma` is the data model; `src/lib/db.ts` is the one client (Neon adapter, pooled URL); `src/lib/catalog/sources/` loads the catalogue from the database or the seed files into one snapshot shape, cached under the `catalog` tag (refreshed every 5 minutes, or at once with `revalidateTag("catalog")`). **Stock that decides a purchase is never read from that cache** — cart quotes read live inventory.

## Checkout

Guest checkout: contact details, delivery to a Nigerian address (priced by state from `config/policies.ts`) or collection from the studio, an optional discount code, and a summary that is always the server's answer.

- **Priced on the server.** Every change re-quotes the bag with live stock, re-checks the discount code against its stored rules (dates, limits, per-customer use, minimum spend, category/product restrictions) and quotes delivery. The order is created from a fresh quote — nothing the browser displayed is trusted.
- **One transaction per order.** Stock is held with a conditional `UPDATE … WHERE onHand − reserved ≥ quantity` per line (so two shoppers can't both take the last piece), the order number comes from a locked per-year counter (`ORD-2026-000001`), the discount use is counted against its limit, and the order is written with immutable line snapshots, a stock audit trail and a timeline. Any failure rolls it all back.
- **Holds expire.** Unpaid orders hold stock for `siteConfig.commerce.reservationMinutes` (30). Lapsed holds are released before each new order and, at most once a minute, after bag and checkout requests (via `after()`), so abandoned checkouts go back on sale without delaying anyone.
- **Safe to retry.** A double click or retried submission returns the same order; a new checkout from the same browser replaces its older unpaid one.
- **Private order pages.** Order numbers are guessable, so an order opens only with a random secret in its link; the database stores only its SHA-256.
- **Modes** (`lib/commerce/checkout-mode.ts`): *live* with a database and Paystack keys; *orders-only* with a database but no keys (development only — clearly labelled test orders, nothing charged); otherwise checkout stays closed with a clear message.

## Payments (Paystack)

1. **Start.** Placing an order starts a Paystack transaction for the order's stored total (kobo, NGN) with a fresh reference, and sends the shopper to Paystack's hosted checkout. Card details never touch this site.
2. **Return.** Paystack sends the shopper to `/api/payments/paystack/return`, which verifies the transaction with Paystack's API and only then updates the order, before showing its private page. The redirect alone proves nothing.
3. **Webhook.** `POST /api/webhooks/paystack` does the same independently, so an order is confirmed even if the shopper closes the tab. The HMAC-SHA512 signature must match; each delivery is recorded once; the body is only a trigger — the payment is re-verified with the API before anything changes.
4. **Confirm once.** A payment confirms only on an exact match (our reference, NGN, the exact amount). The first of return, webhook or retry to claim it does the work: held stock becomes sold stock, the order becomes `PAID`, and the timeline records it. A hold guarantees stock, not a payment deadline: a payment completing after the deadline while the order still holds its pieces (not yet swept) is accepted, since no one else could have bought them. Once a hold has been *released*, a late payment keeps the sale only if every piece is still free; otherwise — and for a second successful payment on a paid order — the order is flagged for a refund.
5. **Try again.** If payment fails or is abandoned, the order keeps its hold and its private page offers *Pay with Paystack* until the hold ends.

**Setup**

- Add `PAYSTACK_SECRET_KEY` and `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` to `.env.local` and to Vercel. Test keys (`sk_test_…`) run in Paystack's sandbox: checkout and order pages say so, and payments are stored with `isTest`.
- In the Paystack dashboard (*Settings → API Keys & Webhooks*), set the webhook URL to `https://<your-domain>/api/webhooks/paystack`.
- Locally, Paystack can't reach your machine's webhook, so the return link confirms payments. To try it: place an order, pay on Paystack's page with one of the test cards from Paystack's documentation, and you'll land back on the order page, confirmed.
- Refunds are issued from the Paystack dashboard for now; the admin phase adds them to the order screen.

**On Vercel:** add the Neon integration (or set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` yourself). `postinstall` runs `prisma generate`. Apply migrations deliberately with `npm run db:deploy` against production rather than on every build, so preview deployments can never alter the production schema.

## Routes

| Route                 | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `/`                   | Editorial homepage, composed from `src/config/homepage.ts`                |
| `/shop`               | Every piece: filter rail (desktop) / drawer (mobile), sort, pagination    |
| `/shop/[category]`    | A category, or the derived listings `new-arrivals` and `sale`             |
| `/collections`        | Collection index                                                          |
| `/collections/[slug]` | Editorial collection: campaign hero, gallery, curated pieces (sort only)  |
| `/product/[slug]`     | Product page: gallery, colour/size selection, size guide, related pieces  |
| `/search?q=`          | Full search results (the header overlay is the typeahead)                 |
| `/size-guide`         | Every size chart                                                          |
| `/cart`               | The bag as a full page                                                    |
| `/checkout`           | Contact, delivery (by state) or studio collection, discount code, summary |
| `/checkout/complete/[number]?key=` | An order's private page — opens only with the secret in its link |
| `/api/cart/quote`     | `POST` — prices a bag from `{ variantId, quantity }[]` on the server      |
| `/api/search`         | `GET` — typeahead results                                                 |

Linked but not built yet: `/account/*`, `/wishlist`, `/about`, `/contact`, `/shipping`, `/returns`, `/privacy`, `/terms`, `/admin/*`.

## Architecture

```
src/
  app/                      routes, API route handlers, server actions
  config/
    site.ts                 brand, contact, navigation, footer, commerce limits
    homepage.ts             ordered homepage blocks (editable without touching components)
    shop.ts                 listing copy, sort options, price bands, size-group labels
    policies.ts             delivery zones & fees, pickup, returns   ⚠ placeholder terms
    size-guides.ts          size charts by size system / category   ⚠ placeholder measurements
  lib/
    catalog/types.ts        domain model — mirrors the future Prisma schema
    catalog/repository.ts   the ONLY data-access surface for UI (server-only)
    catalog/query.ts        filtering, facet counts, sorting, pagination (pure)
    catalog/listing-params.ts  the listing URL contract, shared by server and client
    catalog/purchase.ts     variant selection model for the product page (pure)
    catalog/quote.ts        server-side cart pricing (pure)
    catalog/inventory.ts    stock rules (pure)
    seo/metadata.ts         one helper for every route's metadata
    media/                  image manifest access + MediaAsset type
    format.ts, motion.ts    money formatting, motion vocabulary
  components/
    ui/                     primitives: Button, IconButton, Sheet, Dialog, Input, MediaImage, Price…
    listing/                filter rail/drawer, sort, active filters, pagination
    product/ collection/ cart/ search/ wishlist/ layout/ home/ motion/ brand/ seo/
  data/
    media.json              placeholder photography (see media-credits.md)
```

### Principles baked into the code

- **The client is never trusted with money.** The cart stores only `{ variantId, quantity }`; every price, total and stock figure comes from `POST /api/cart/quote`, which re-validates input and recomputes on the server.
- **Inventory is per variant** (colour × size), with `onHand`, `reserved` and a low-stock threshold. Size systems (`apparel`, `waist`, `belt`, `one-size`) keep trousers and accessories honest. Unavailable combinations are disabled on the product page and never reach the bag.
- **Money is integer kobo** — the same minor unit Paystack uses — so no floating-point arithmetic touches a price.
- **Listings are URLs.** Filters, sort and page live in the query string (`/shop/shirts?size=m&color=olive&sort=price-asc`), are parsed tolerantly on the server, and rendered there. Client controls only build the next URL; `useOptimistic` keeps them instant while results load.
- **Facet counts never lie.** Each filter option counts against every *other* active filter, so an option never promises pieces it can't deliver.
- **One data contract.** Components code against `repository.ts`; the Prisma phase swaps its internals without UI changes.
- **Photography is rendered one way** — `<MediaImage>` — guaranteeing fixed frames, dominant-colour grounds and blur placeholders.

## Design system

Tokens live in `src/app/globals.css` in three layers: raw palette → semantic roles → Tailwind theme.

- **Palette** — paper `#F4F1EA`, ink `#161513`, stone `#6A665F` (the lightest permitted text colour, 5:1 on paper), hairline `#D9D3C7`, one restrained accent (tobacco `#7A6850`). Add `theme-ink` to any section to flip it dark.
- **Type** — Instrument Sans for interface and body; Instrument Serif for editorial headlines and product titles. Write `*emphasis*` in any content string to set it in italic serif.
- **Utilities** — `text-eyebrow`, `text-label`, `text-display-{xs…xl}`, `link-underline`, `link-underline-static`, `px-(--gutter)`, `ease-editorial`.
- **Shape** — square corners, hairlines, no shadows, no glass, no decorative gradients.
- **Motion** — low amplitude, unhurried, `prefers-reduced-motion` respected globally.

## ⚠ Before launch: replace placeholder content

These are deliberately obvious stand-ins. None of them should reach production as-is.

| What                  | Where                               | Notes                                                                   |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Photography           | `src/data/media.json`               | Unsplash placeholders, credited in `media-credits.md`                   |
| Delivery & returns    | `src/config/policies.ts`            | Fees, zones, times and return rules are illustrative (`isPlaceholder`)  |
| Size charts           | `src/config/size-guides.ts`         | Typical body measurements, not the studio's own                         |
| Contact details       | `src/config/site.ts` → `contact`    | Email, phone and address are placeholders                               |
| Social links          | `src/config/site.ts` → `social`     | Point at platform homepages                                             |
| Catalogue             | `src/lib/catalog/seed/*`            | 25 demo pieces with seeded (deterministic) stock                        |

## Rebranding

1. Edit `src/config/site.ts` (name, wordmark, tagline, contact, navigation, delivery threshold).
2. Replace the typeset wordmark in `src/components/brand/wordmark.tsx` with an SVG logo if needed.
3. Adjust the raw palette at the top of `globals.css`.
4. Replace `src/data/media.json` with brand photography.

## Roadmap

1. ~~Audit & design system / storefront shell~~
2. ~~Homepage & visual refinement~~
3. ~~Shop, categories, collections, filtering, search~~
4. ~~Product details, variants, size guide~~
5. ~~Cart page & checkout (validated delivery details, server-side totals & delivery fees)~~ — orders and stock holds work; payment is step 6
6. ~~Paystack end-to-end (initialise → verify → webhook → idempotent order confirmation)~~
7. Authentication & customer accounts, server-side wishlist
8. PostgreSQL / Prisma persistence, Cloudinary media
9. Admin dashboard
10. Inventory, orders, discounts, reviews
11. SEO, accessibility, performance (sitemap, robots, audits)
12. Testing, QA and production hardening

> Payments need somewhere to keep orders: a pending order must exist before Paystack is initialised, and the webhook must find it again. Persistence (step 8) therefore has to land before or together with step 6.

## Image credits

Placeholder photography is from [Unsplash](https://unsplash.com) and credited per image in `src/data/media-credits.md`. Replace it with brand photography before launch.
