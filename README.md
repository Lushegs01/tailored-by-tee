# Tailored by Tee — storefront

A premium single-brand fashion storefront for a Lagos clothing label. Editorial in presentation, rigorous in commerce: server-priced carts, variant-level inventory, Paystack payments.

> **Status: Phase 1 of 10** — design system, storefront shell, navigation, search, cart drawer and homepage, running on a typed seed catalogue.

## Stack

| Concern    | Choice                                                               |
| ---------- | -------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict      |
| Styling    | Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`)          |
| Primitives | Radix UI (`radix-ui`), shadcn/ui-compatible tokens (`components.json`) |
| Motion     | Motion v13 via `LazyMotion` + `m.*` (≈15 kB)                         |
| Data       | Seed-backed repository → PostgreSQL + Prisma (Phase 8)               |
| Payments   | Paystack (Phase 5) · amounts in kobo end-to-end                      |
| Media      | Placeholder Unsplash manifest → Cloudinary (Phase 8)                 |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run check      # typegen + tsc + eslint
npm run build
```

Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs and structured data resolve correctly.

## Architecture

```
src/
  app/                      routes, API route handlers, server actions
  config/
    site.ts                 brand name, wordmark, contact, navigation, footer, commerce rules
    homepage.ts             ordered homepage content blocks (editable without touching components)
  lib/
    catalog/types.ts        domain model — mirrors the future Prisma schema
    catalog/repository.ts   the ONLY data access surface for UI (server-only)
    media/                  image manifest access + MediaAsset type
    content/types.ts        homepage block types
    format.ts, motion.ts    money formatting, motion vocabulary
  components/
    ui/                     primitives: Button, IconButton, Sheet, Dialog, Input, MediaImage, Price…
    layout/ home/ product/ cart/ search/ wishlist/ motion/ brand/ seo/
  data/
    media.json              placeholder photography (see media-credits.md)
```

### Principles baked into the code

- **The client is never trusted with money.** The cart stores only `{ variantId, quantity }`; every price, total and stock figure comes from `POST /api/cart/quote`, which re-validates input and recomputes on the server.
- **Inventory is per variant** (colour × size), with `onHand`, `reserved` and a low-stock threshold. Size systems (`apparel`, `waist`, `belt`, `one-size`) keep trousers and accessories honest.
- **Money is integer kobo** — the same minor unit Paystack uses — so no floating-point arithmetic touches a price.
- **One data contract.** Components code against `repository.ts`; Phase 8 swaps its internals for Prisma without UI changes.
- **Photography is rendered one way** — `<MediaImage>` — guaranteeing fixed frames, dominant-colour grounds and blur placeholders.

## Design system

Tokens live in `src/app/globals.css` in three layers: raw palette → semantic roles → Tailwind theme.

- **Palette** — paper `#F4F1EA`, ink `#161513`, stone `#6E6A63`, hairline `#D9D3C7`, a single restrained accent (tobacco `#7A6850`). Add `theme-ink` to any section to flip it dark; everything built on semantic tokens follows.
- **Type** — Instrument Sans for interface and body; Instrument Serif reserved for editorial headlines. Write `*emphasis*` in any content string to set it in italic serif.
- **Utilities** — `text-eyebrow`, `text-label`, `text-display-{xs…xl}`, `link-underline`, `link-underline-static`, `px-(--gutter)`, `ease-editorial`.
- **Shape** — square corners, hairlines, no shadows, no glass, no decorative gradients.
- **Motion** — low amplitude, unhurried, `prefers-reduced-motion` respected globally.

## Rebranding

1. Edit `src/config/site.ts` (name, wordmark, tagline, contact, navigation, delivery threshold).
2. Replace the typeset wordmark in `src/components/brand/wordmark.tsx` with an SVG logo if needed.
3. Adjust the raw palette at the top of `globals.css`.
4. Replace `src/data/media.json` with brand photography (Phase 8 moves this to Cloudinary + admin).

## Roadmap

1. **Design system & storefront shell** ← current
2. Homepage & product browsing (shop, categories, collections, filters, search page)
3. Product detail pages & variant selection, size guide
4. Cart & checkout
5. Paystack integration (initialise → verify → webhook → stock deduction)
6. Authentication & customer accounts
7. Admin dashboard
8. PostgreSQL / Prisma, Cloudinary
9. Inventory & order management
10. SEO, accessibility, performance, testing, production hardening

## Image credits

Placeholder photography is from [Unsplash](https://unsplash.com) and credited per image in `src/data/media-credits.md`. Replace it with brand photography before launch.
