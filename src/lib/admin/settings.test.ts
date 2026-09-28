import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityActorLabel,
  activityEntityKey,
  auditActionLabel,
  auditEntityHref,
  deploymentDescription,
  describeIntegrations,
  describeZoneCoverage,
  integrationsNeedingAttention,
  isLocalHostname,
  isPlaceholderContact,
  isRecognisedPaystackSecretKey,
  siteAddress,
  siteUrlProblem,
  type ActivityLinkLookups,
  type IntegrationId,
  type IntegrationReport,
  type IntegrationSnapshot,
} from "./settings";

/** A fully set-up live store; tests override one part at a time. */
function snapshot(overrides: {
  [K in keyof IntegrationSnapshot]?: IntegrationSnapshot[K] extends object ? Partial<IntegrationSnapshot[K]> : IntegrationSnapshot[K];
} = {}): IntegrationSnapshot {
  const base: IntegrationSnapshot = {
    isProduction: true,
    deployment: "production",
    database: { configured: true, catalogSource: "database" },
    paystack: { secretKeySet: true, testMode: false, keyRecognised: true, checkoutMode: "live" },
    auth: { secretSet: true, googleIdSet: true, googleSecretSet: true, googleEnabled: true, emailEnabled: true },
    resend: { apiKeySet: true, sender: "Tailored by Tee <hello@tailoredbytee.com>" },
    cloudinary: { cloudNameSet: true, apiKeySet: true, apiSecretSet: true, urlSet: false },
    site: { url: "https://tailoredbytee.com", envSet: true },
  };
  return {
    ...base,
    ...(overrides.isProduction !== undefined ? { isProduction: overrides.isProduction } : {}),
    ...(overrides.deployment !== undefined ? { deployment: overrides.deployment } : {}),
    database: { ...base.database, ...overrides.database },
    paystack: { ...base.paystack, ...overrides.paystack },
    auth: { ...base.auth, ...overrides.auth },
    resend: { ...base.resend, ...overrides.resend },
    cloudinary: { ...base.cloudinary, ...overrides.cloudinary },
    site: { ...base.site, ...overrides.site },
  };
}

function report(id: IntegrationId, input: IntegrationSnapshot): IntegrationReport {
  const found = describeIntegrations(input).find((item) => item.id === id);
  assert.ok(found, `no report for ${id}`);
  return found;
}

describe("siteAddress", () => {
  it("joins without doubling or dropping slashes", () => {
    assert.equal(siteAddress("https://x.com", "/api/webhooks/paystack"), "https://x.com/api/webhooks/paystack");
    assert.equal(siteAddress("https://x.com///", "/a"), "https://x.com/a");
    assert.equal(siteAddress(" https://x.com/ ", "a"), "https://x.com/a");
  });
});

describe("isRecognisedPaystackSecretKey", () => {
  it("accepts test and live secret keys only", () => {
    assert.equal(isRecognisedPaystackSecretKey("sk_test_abc123"), true);
    assert.equal(isRecognisedPaystackSecretKey("sk_live_abc123"), true);
    assert.equal(isRecognisedPaystackSecretKey(" sk_live_abc123 "), true);
    assert.equal(isRecognisedPaystackSecretKey("pk_live_abc123"), false);
    assert.equal(isRecognisedPaystackSecretKey('"sk_live_abc123"'), false);
    assert.equal(isRecognisedPaystackSecretKey("sk_test_"), false);
    assert.equal(isRecognisedPaystackSecretKey(""), false);
    assert.equal(isRecognisedPaystackSecretKey(undefined), false);
  });
});

describe("isLocalHostname and siteUrlProblem", () => {
  it("recognises addresses that only work locally", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "10.1.2.3", "192.168.0.4", "172.20.0.1", "[::1]", "studio.local"]) {
      assert.equal(isLocalHostname(host), true, host);
    }
    for (const host of ["tailoredbytee.com", "172.32.0.1", "8.8.8.8", "localhost.example.com"]) {
      assert.equal(isLocalHostname(host), false, host);
    }
  });

  it("judges the site address for the live store", () => {
    assert.equal(siteUrlProblem("https://tailoredbytee.com", true), null);
    assert.equal(siteUrlProblem("https://tailoredbytee.com/", true), null);
    assert.equal(siteUrlProblem("http://localhost:3000", true), "local");
    assert.equal(siteUrlProblem("http://tailoredbytee.com", true), "insecure");
    assert.equal(siteUrlProblem("http://tailoredbytee.com", false), null);
    assert.equal(siteUrlProblem("https://tailoredbytee.com/shop", true), "has_path");
    assert.equal(siteUrlProblem("tailoredbytee.com", true), "invalid");
    assert.equal(siteUrlProblem("ftp://tailoredbytee.com", true), "invalid");
  });
});

describe("describeIntegrations", () => {
  it("reports every service, in the brief's order, and a healthy live store needs nothing", () => {
    const reports = describeIntegrations(snapshot());
    assert.deepEqual(
      reports.map((item) => item.id),
      ["database", "payments", "accounts", "email", "media", "site"],
    );
    assert.deepEqual(integrationsNeedingAttention(reports), []);
    for (const item of reports) {
      assert.ok(item.affects.length > 0, `${item.id} says what it affects`);
      assert.ok(item.variables.length > 0, `${item.id} names its settings`);
    }
  });

  it("gives Paystack's webhook URL from the site address", () => {
    const payments = report("payments", snapshot({ site: { url: "https://tailoredbytee.com/" } }));
    assert.equal(payments.copyValues[0]?.value, "https://tailoredbytee.com/api/webhooks/paystack");
    assert.match(payments.copyValues[0]?.hint ?? "", /Paystack/);
  });

  it("warns that Paystack can't reach a local webhook address", () => {
    const payments = report("payments", snapshot({ isProduction: false, site: { url: "http://localhost:3000" } }));
    assert.match(payments.copyValues[0]?.hint ?? "", /can't reach a local address/);
  });

  it("flags test keys on the live store, but not while developing", () => {
    const live = report("payments", snapshot({ paystack: { testMode: true } }));
    assert.equal(live.status.tone, "attention");
    assert.equal(live.guidance?.kind, "fix");
    const dev = report("payments", snapshot({ isProduction: false, paystack: { testMode: true } }));
    assert.equal(dev.status.tone, "info");
    assert.equal(dev.guidance?.kind, "note");
  });

  it("flags missing and malformed Paystack keys", () => {
    const missing = report("payments", snapshot({ paystack: { secretKeySet: false, checkoutMode: "unavailable" } }));
    assert.equal(missing.status.tone, "critical");
    assert.ok(missing.facts.some((fact) => fact.value.startsWith("Closed")));
    const malformed = report("payments", snapshot({ paystack: { keyRecognised: false } }));
    assert.equal(malformed.status.label, "Check the key");
    assert.match(malformed.guidance?.text ?? "", /sk_test_ or sk_live_/);
  });

  it("explains that Resend's test sender only reaches the account owner", () => {
    const email = report("email", snapshot({ resend: { sender: null } }));
    assert.equal(email.status.label, "Test sender");
    assert.match(email.guidance?.text ?? "", /only delivers to the email address that owns the Resend account/);
    assert.match(email.guidance?.text ?? "", /email sign-in stays off/);
  });

  it("says why each sign-in method is off", () => {
    const noSecret = report(
      "accounts",
      snapshot({ auth: { secretSet: false, googleEnabled: false, emailEnabled: false } }),
    );
    assert.equal(noSecret.status.tone, "critical");
    assert.ok(noSecret.facts.some((fact) => fact.value === "Off: needs AUTH_SECRET"));

    const halfGoogle = report("accounts", snapshot({ auth: { googleSecretSet: false, googleEnabled: false } }));
    assert.equal(halfGoogle.status.tone, "positive");
    assert.ok(halfGoogle.facts.some((fact) => fact.value === "Off: needs AUTH_GOOGLE_SECRET"));
    assert.equal(halfGoogle.copyValues[0]?.value, "https://tailoredbytee.com/api/auth/callback/google");
  });

  it("names the Cloudinary values that are missing", () => {
    const media = report("media", snapshot({ cloudinary: { apiSecretSet: false } }));
    assert.equal(media.status.label, "Incomplete");
    assert.match(media.guidance?.text ?? "", /CLOUDINARY_API_SECRET/);
    assert.equal(report("media", snapshot({ cloudinary: { cloudNameSet: false, apiKeySet: false, apiSecretSet: false, urlSet: true } })).status.label, "Ready");
  });

  it("treats a sample catalogue and a missing database as problems", () => {
    assert.equal(report("database", snapshot({ database: { catalogSource: "seed" } })).status.tone, "attention");
    assert.equal(report("database", snapshot({ database: { configured: false, catalogSource: "seed" } })).status.tone, "critical");
  });

  it("warns about a localhost site address on the live store only", () => {
    const live = report("site", snapshot({ site: { url: "http://localhost:3000", envSet: false } }));
    assert.equal(live.status.tone, "critical");
    assert.ok(live.facts.some((fact) => fact.value === "Not set, so the default is used"));
    assert.equal(report("site", snapshot({ isProduction: false, site: { url: "http://localhost:3000" } })).status.tone, "info");
  });

  it("never puts anything but names and public values in the report", () => {
    const text = JSON.stringify(describeIntegrations(snapshot({ paystack: { testMode: true } })));
    assert.doesNotMatch(text, /sk_(test|live)_[A-Za-z0-9]/);
  });
});

describe("deploymentDescription", () => {
  it("has a sentence for every kind of deployment", () => {
    for (const kind of ["production", "preview", "development"] as const) {
      assert.ok(deploymentDescription(kind).endsWith("."));
    }
  });
});

describe("isPlaceholderContact", () => {
  it("spots the shipped placeholders and obvious dummies", () => {
    assert.equal(isPlaceholderContact("email", "studio@tailoredbytee.com"), true);
    assert.equal(isPlaceholderContact("email", "someone@example.com"), true);
    assert.equal(isPlaceholderContact("email", "tee@tailoredbytee.ng"), false);
    assert.equal(isPlaceholderContact("phone", "+234 800 000 0000"), true);
    assert.equal(isPlaceholderContact("phone", "+234 803 555 1234"), false);
    assert.equal(isPlaceholderContact("address", "Studio 4, Admiralty Way, Lekki Phase 1, Lagos"), true);
    assert.equal(isPlaceholderContact("address", "12 Awolowo Road, Ikoyi, Lagos"), false);
    assert.equal(isPlaceholderContact("address", "  "), true);
  });
});

describe("describeZoneCoverage", () => {
  it("names the states in plain English", () => {
    assert.equal(describeZoneCoverage(["LA"]), "Lagos");
    assert.equal(describeZoneCoverage(["OG", "OY", "OS"]), "Ogun, Oyo and Osun");
    assert.equal(describeZoneCoverage(null), "Every other state");
    assert.equal(describeZoneCoverage([]), "No states");
    assert.equal(describeZoneCoverage(["ZZ"]), "ZZ");
  });
});

describe("auditActionLabel", () => {
  it("turns dotted actions into the owner's words", () => {
    assert.equal(auditActionLabel("admin.grant"), "Admin access given");
    assert.equal(auditActionLabel("admin.revoke"), "Admin access removed");
    assert.equal(auditActionLabel("product.update"), "Product updated");
    assert.equal(auditActionLabel("product.image.add"), "Product photo added");
    assert.equal(auditActionLabel("coupon.create"), "Discount created");
    assert.equal(auditActionLabel("inventory.adjust"), "Stock adjusted");
    assert.equal(auditActionLabel("review.approve"), "Review approved");
    assert.equal(auditActionLabel("product.status"), "Product status changed");
    assert.equal(auditActionLabel("order.tracking"), "Order tracking updated");
    assert.equal(auditActionLabel("color.create"), "Colour created");
  });

  it("keeps unknown words rather than guessing", () => {
    assert.equal(auditActionLabel("product.bundle"), "Product bundle");
    assert.equal(auditActionLabel("stockThreshold"), "Stock threshold");
    assert.equal(auditActionLabel(""), "Change");
    assert.equal(auditActionLabel("..."), "Change");
  });
});

describe("activityActorLabel", () => {
  it("shows the admin's email, or says the change came from outside the admin area", () => {
    assert.equal(activityActorLabel({ email: "tee@example.com", name: "Tee" }), "tee@example.com");
    assert.equal(activityActorLabel(null), "Outside the admin area");
  });
});

describe("auditEntityHref", () => {
  const entry = (entityType: string, entityId: string | null, action = `${entityType.toLowerCase()}.update`, metadata?: unknown) => ({
    action,
    entityType,
    entityId,
    metadata,
  });

  it("links by the entry alone when nothing was looked up", () => {
    assert.equal(auditEntityHref(entry("Product", "clx1")), "/admin/products/clx1");
    assert.equal(auditEntityHref(entry("Product", "clx1", "product.delete")), null);
    assert.equal(auditEntityHref(entry("Coupon", "c1")), "/admin/discounts/c1");
    assert.equal(auditEntityHref(entry("User", "u1", "admin.grant")), "#admin-team");
    assert.equal(auditEntityHref(entry("User", "u1", "customer.update")), "/admin/customers/u1");
    assert.equal(auditEntityHref(entry("Review", "r1")), "/admin/reviews");
    assert.equal(auditEntityHref(entry("Order", "o1", "order.status", { orderNumber: "ORD-2026-001284" })), "/admin/orders/ORD-2026-001284");
    assert.equal(auditEntityHref(entry("Order", "o1", "order.status", { orderNumber: "<script>" })), null);
    assert.equal(auditEntityHref(entry("ProductVariant", "v1", "variant.create", { productId: "p1" })), "/admin/products/p1");
    assert.equal(auditEntityHref(entry("Media", "m1")), null);
    assert.equal(auditEntityHref(entry("Product", "bad id/../x")), null);
  });

  it("trusts the server's lookups when given: only records that still exist are linked", () => {
    const lookups: ActivityLinkLookups = {
      orderNumbers: new Map([
        [activityEntityKey("Order", "o1"), "ORD-2026-000007"],
        [activityEntityKey("Refund", "rf1"), "ORD-2026-000008"],
      ]),
      productIds: new Map([
        [activityEntityKey("Inventory", "v1"), "p1"],
        [activityEntityKey("ProductImage", "i1"), "p2"],
      ]),
      existing: new Set([activityEntityKey("Product", "p1"), activityEntityKey("User", "u1")]),
    };

    assert.equal(auditEntityHref(entry("Product", "p1"), lookups), "/admin/products/p1");
    assert.equal(auditEntityHref(entry("Product", "gone"), lookups), null);
    assert.equal(auditEntityHref(entry("User", "u1", "customer.update"), lookups), "/admin/customers/u1");
    assert.equal(auditEntityHref(entry("Order", "o1", "order.status"), lookups), "/admin/orders/ORD-2026-000007");
    assert.equal(auditEntityHref(entry("Refund", "rf1", "refund.create"), lookups), "/admin/orders/ORD-2026-000008");
    // Metadata is ignored when the order wasn't found (e.g. it was deleted).
    assert.equal(auditEntityHref(entry("Order", "o9", "order.status", { orderNumber: "ORD-2026-000009" }), lookups), null);
    assert.equal(auditEntityHref(entry("Inventory", "v1", "inventory.adjust"), lookups), "/admin/products/p1");
    assert.equal(auditEntityHref(entry("ProductImage", "i1", "product.image.add"), lookups), "/admin/products/p2");
    assert.equal(auditEntityHref(entry("User", "u2", "admin.revoke"), lookups), "#admin-team");
  });
});
