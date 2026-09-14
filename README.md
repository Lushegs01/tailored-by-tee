# Tailored by Tee — storefront

A premium single-brand fashion storefront for a Lagos clothing label. Editorial in presentation, rigorous in commerce: server-priced carts, variant-level inventory, Paystack payments.

> **Status: Phases 1–4 of 12 complete** — design system, homepage, shop / categories / collections with filters and sort, search, product pages with variant selection and size guides, cart drawer. All running on a typed seed catalogue.
> **Next:** checkout, then persistence (PostgreSQL + Prisma) and Paystack. See [Roadmap](#roadmap).

## Stack

| Concern    | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict        |
| Styling    | Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`)            |
| Primitives | Radix UI (`radix-ui`), shadcn/ui-compatible tokens (`components.json`) |
| Motion     | Motion v13 via `LazyMotion` + `m.*`                                    |
| Validation | Zod                                                                    |
| Data       | Seed-backed repository → PostgreSQL + Prisma (planned)                 |
| Payments   | Paystack (planned) · amounts in kobo end-to-end                        |
| Media      | Placeholder Unsplash manifest → Cloudinary (planned)                   |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # typegen + tsc + eslint
npm run build
```

Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs and structured data resolve correctly.

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
| `/api/cart/quote`     | `POST` — prices a bag from `{ variantId, quantity }[]` on the server      |
| `/api/search`         | `GET` — typeahead results                                                 |

Linked but not built yet: `/checkout`, `/account/*`, `/wishlist`, `/about`, `/contact`, `/shipping`, `/returns`, `/privacy`, `/terms`, `/admin/*`.

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
5. Cart page & checkout (validated delivery details, server-side totals & delivery fees)
6. Paystack end-to-end (initialise → verify → webhook → idempotent order confirmation)
7. Authentication & customer accounts, server-side wishlist
8. PostgreSQL / Prisma persistence, Cloudinary media
9. Admin dashboard
10. Inventory, orders, discounts, reviews
11. SEO, accessibility, performance (sitemap, robots, audits)
12. Testing, QA and production hardening

> Payments need somewhere to keep orders: a pending order must exist before Paystack is initialised, and the webhook must find it again. Persistence (step 8) therefore has to land before or together with step 6.

## Image credits

Placeholder photography is from [Unsplash](https://unsplash.com) and credited per image in `src/data/media-credits.md`. Replace it with brand photography before launch.
