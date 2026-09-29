# Demo data

A fictional set of customers, orders and reviews so the admin area at `/admin` has
something to show before the shop has taken a single real order. It exists to be
looked at and clicked through — never to be mistaken for trade.

```bash
npm run db:seed:demo               # shows what would be created; writes nothing
npm run db:seed:demo -- --yes      # creates it
npm run db:clear-demo              # shows what would be removed; removes nothing
npm run db:clear-demo -- --yes     # removes it
```

> **One database.** This project uses a single Neon database for development and
> production. Read [Safety rails](#safety-rails) before running either script with
> `--yes`.

---

## What gets created

| | |
|---|---|
| **8 customers** | 4 with accounts (each with a default address and a small wishlist), 4 guests whose details live on the order only |
| **30 orders** | spread over the last 60 days in Lagos time: 4 awaiting payment, 5 to prepare, 4 ready to ship, 4 shipped, 7 delivered, 4 cancelled, 2 refunded |
| **Payments** | one per order, plus a declined first attempt on one of them |
| **3 refunds** | one paid back in full, one paid back in part, one still waiting |
| **Order timelines** | placed, payment confirmed, being prepared, dispatched, delivered, cancelled, refund asked for and refund completed — whichever apply |
| **15 reviews** | 5 waiting for approval, 8 published, 2 rejected; ratings from 2 to 5 stars; 8 of them verified purchases |

The orders are built from the shop's **real live pieces**, so every line carries a
genuine product name, slug, SKU, colour, size, photograph and price. Totals are
worked out by the same code checkout uses (`src/lib/commerce/delivery.ts` and
`totals.ts`), including the free-delivery threshold in `src/config/policies.ts`, so
the money on a demo order adds up exactly as a real one does.

Five orders are for collection from the studio rather than delivery, and the rest
are delivered to addresses across four states, so more than one delivery zone and
fee appears.

Three orders try the shop's own discount code, if it has one. The code is applied
by the real rules engine (`evaluateCoupon`), so if no active code exists, or the
code doesn't apply to those pieces, those orders simply carry no discount.

Order timelines use the same entry types the rest of the site writes — the
storefront's own (`order_placed`, `payment_confirmed`, `order_released`) and the
admin's (`processing_started`, `order_shipped`, `order_delivered`,
`order_cancelled`, `refund_requested`, `refund_processed`) — so a demo order's
history reads in the admin's own words rather than as a raw type.

**Reviews line up with the orders.** A review only carries the *Verified purchase*
badge when that customer really has an earlier order, containing that very piece,
which finished before the review was written. The rest go out without the badge,
so both kinds appear in moderation. Nothing claims a purchase that never happened,
and no review is dated before the order it points at.

Everything is repeatable: the same plan produces the same store on every run.

### What it is *not*

- **No stock is touched.** Demo orders hold nothing, sell nothing and return
  nothing. Nothing is written to `Inventory` or `InventoryAdjustment`. The
  quantities in the admin area stay true to the shop's real shelves while you look
  around. Demo sales exist for the order screens and the dashboard only.
- **The real order counter is untouched.** Demo orders are numbered
  `DEMO-2026-000001` upwards. The `OrderCounter` table, which allocates real
  `ORD-…` numbers, is never read or written, so the next real order still gets the
  number it should.
- **No discount counter is moved.** A demo order that uses a code writes a
  `CouponUsage` row, so the discount page has something to show, but `usageCount`
  on the code itself is never incremented. A code with a usage limit can therefore
  never be used up by demo data. (While the demo store exists, such a code can't be
  deleted in the admin area — the usage rows count as use. Clear the demo store and
  it can be deleted again.)
- **No email is ever sent.** Nothing here goes near the mail sender, and every
  address is on `example.com`, which is reserved by RFC 2606 and cannot receive
  post.

---

## How everything is marked

Every row is marked in the database, in the same way the admin screens read:

| Row | Mark | Also |
|---|---|---|
| Accounts | `User.isDemo = true` | address is `demo.<name>@example.com` |
| Orders | `Order.isDemo = true` | number is `DEMO-<year>-<six digits>`, id starts `demo_order_` |
| Payments | `Payment.isTest = true` | reference is the order number plus `-P1` / `-P2` |
| Reviews | `Review.isDemo = true` | shown with a **Demo** badge, never as genuine |

Every row also has a readable id beginning `demo_`, so demo data is recognisable by
eye in a database client.

Couriers and tracking numbers are invented (`Demo Couriers`, `DEMO-TRK-…`), and the
street names say "example" or "sample" out loud, so nothing can be dispatched to a
real address by mistake.

---

## What the admin area does with it

**The demo store fills most of the admin area, but not the sales figures.**

The overview's **Sales** panel — revenue, orders, average order, pieces sold and
the chart — deliberately leaves demo orders out (`Order.isDemo = false` in
`src/lib/admin/metrics.ts`), so the shop's real trading figures are never inflated
by pretend money. With only demo data in the database, that panel reads zero.

Everything else does show it:

| Where | Shows demo data? |
|---|---|
| Overview → **Needs attention** | Yes — to prepare, ready to ship, awaiting payment, refunds due, reviews to approve |
| Overview → **Latest orders** | Yes, tagged **Demo** and **Test** |
| Overview → **Sales** and the chart | **No, by design** |
| Overview → **Stock to watch** | Real stock only (demo orders move none) |
| Orders list and each order's page | Yes |
| Reviews | Yes |
| Discounts → uses | Yes, for the orders that carried a code |
| Customers | Yes |
| Products, stock, collections, categories, settings | Unaffected — demo data creates none of these |

After seeding you should see, among other things: 5 orders to prepare, 4 ready to
ship, 2 awaiting payment with the hold still live, 2 refunds due (one of which is
already under way) and 5 reviews waiting for approval.

---

## Safety rails

Both scripts:

1. **Print the database host first** — just the host, e.g.
   `ep-steep-king-a56b5vnm.us-east-2.aws.neon.tech`, never the password or the full
   connection string. Read it before going further.
2. **Write nothing without `--yes`.** Run either one with no flags to see what it
   would do.
3. **Refuse an unknown flag** rather than reading it as agreement.
4. **Do all their work in one transaction**, so a failure leaves nothing half-made.

`seed-demo` also:

- **refuses when `NODE_ENV=production`** unless `--allow-production` is passed as
  well;
- **stops before writing** if any of the demo addresses already belongs to a real
  account, if any `DEMO-…` order number is already taken by a real order, or if a
  demo account has been given admin access;
- **stops** if the shop has no live pieces to sell, pointing you at
  `npm run db:seed`;
- **replaces** an earlier demo store rather than adding a second one: running it
  twice gives you one demo store, not two.

`clear-demo` also:

- **leaves alone** an order marked as demo whose number isn't a `DEMO-…` number,
  and says so. Something unexpected made it, and a person should look first.
- **leaves alone** a demo account that has since been given admin access, so
  clearing the demo store can never lock you out of `/admin`. Remove the access
  first (`npm run admin:grant -- <email> --revoke --yes`), then clear again.

---

## What `clear-demo` removes

In one transaction, in this order:

1. demo reviews (`Review.isDemo`)
2. for every demo order (`Order.isDemo` with a `DEMO-…` number): its discount-code
   uses, refunds, timeline entries, payments and lines — then the order itself
3. for every demo account (`User.isDemo`, excluding any that is now an admin): its
   wishlist, bag, addresses, sign-in sessions and linked sign-in accounts — then the
   account itself

It prints a count of each. Real orders, products, stock, discount codes, media and
settings are never selected for deletion at all.

Reviews go first on purpose: `Review.orderId` is set to null when an order is
deleted, so clearing orders first would quietly detach a demo review from its demo
order before it could be recognised.

---

## Where the data is defined

| File | What's in it |
|---|---|
| `src/lib/admin/demo-fixtures.ts` | The whole plan: the customers, the 30 orders, the 15 reviews, the timings, the money and the marks. Pure — no database, no environment — and covered by `demo-fixtures.test.ts`. |
| `scripts/lib/demo-data.ts` | The part that needs a database: reading the real catalogue, turning the plan into rows, and removing every demo row again. |
| `scripts/seed-demo.ts` | The `db:seed:demo` command. |
| `scripts/clear-demo.ts` | The `db:clear-demo` command. |

To change the wording of a review, the mix of order statuses or a customer's
details, edit `demo-fixtures.ts` alone. `npm test` checks the plan stays coherent
(phone numbers checkout would accept, real state codes, every status covered,
timelines that run forwards, nothing dated in the future, no verified review
without an earlier purchase behind it) before it can reach a database.

If you mark a review `verified: true` for a customer whose first order came later,
`npm test` fails and names the review. Either move the review nearer to today or
leave it unverified.

---

## Troubleshooting

**"The database is missing the admin tables."**
Run `npm run db:deploy` first. Demo data uses `Order.isDemo`, `User.isDemo`,
`trackingNumber`, `carrier` and the `Refund` table, all of which arrive with the
admin migration.

**"The shop has no live pieces to sell yet."**
Demo orders are built from real products. Run `npm run db:seed` to load the
catalogue, or make a product live in the admin area, then try again.

**"These addresses already belong to real accounts."**
Someone has registered a `demo.…@example.com` address for real. Rename or remove
that account, or change the customer keys in `demo-fixtures.ts`.

**"A demo account has been given admin access."**
Take the access away first: `npm run admin:grant -- <email> --revoke --yes`.

**The dashboard's sales figures are still zero.**
That is correct — see [What the admin area does with it](#what-the-admin-area-does-with-it).
Demo orders never count as revenue.
