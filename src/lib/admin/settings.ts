import { NIGERIAN_STATES } from "@/config/nigeria";

import type { StatusTone } from "./status";

/*
 * The settings page's words and judgements, kept pure (no server, database or
 * browser APIs) so they can be tested and so every rule lives in one place:
 *
 * - describeIntegrations(): what each connected service is doing, from a
 *   snapshot of booleans and public values. The snapshot is read on the server
 *   (components/admin/settings/integrations-section.tsx); secret values never
 *   enter it, only whether they are set and whether they have the right shape.
 * - Store configuration helpers: placeholder detection and delivery-zone wording.
 * - Activity helpers: an audit entry's action in words and a link to what changed.
 */

/* ── Integrations ───────────────────────────────────────────────────────── */

export type CatalogSourceName = "database" | "seed";
export type CheckoutModeName = "live" | "orders-only" | "unavailable";
/** Where this copy of the site runs: the live store, a hosting preview, or a developer's computer. */
export type DeploymentKind = "production" | "preview" | "development";

/** What the server knows about its configuration. Booleans and public values only — never a secret. */
export interface IntegrationSnapshot {
  /** NODE_ENV is "production" (the live site and hosting previews). The app's own rules key off this. */
  isProduction: boolean;
  deployment: DeploymentKind;
  database: {
    configured: boolean;
    /** Where the storefront reads its catalogue: CATALOG_SOURCE, or the database whenever there is one. */
    catalogSource: CatalogSourceName;
  };
  paystack: {
    secretKeySet: boolean;
    /** Secret key starts with sk_test_. */
    testMode: boolean;
    /** Secret key has the shape of a Paystack secret key (sk_test_… or sk_live_…). */
    keyRecognised: boolean;
    checkoutMode: CheckoutModeName;
  };
  auth: {
    /** AUTH_SECRET (or the older NEXTAUTH_SECRET). */
    secretSet: boolean;
    googleIdSet: boolean;
    googleSecretSet: boolean;
    /** What Auth.js actually switched on (lib/auth/config). */
    googleEnabled: boolean;
    emailEnabled: boolean;
  };
  resend: {
    apiKeySet: boolean;
    /** EMAIL_FROM. Not a secret: it is the From line of every email customers receive. */
    sender: string | null;
  };
  cloudinary: {
    cloudNameSet: boolean;
    apiKeySet: boolean;
    apiSecretSet: boolean;
    /** CLOUDINARY_URL, the single-variable alternative. */
    urlSet: boolean;
  };
  site: {
    /** The site's public address as the app uses it (NEXT_PUBLIC_SITE_URL or the default). */
    url: string;
    /** NEXT_PUBLIC_SITE_URL is set, rather than falling back to the default. */
    envSet: boolean;
  };
}

export type IntegrationId = "database" | "payments" | "accounts" | "email" | "media" | "site";

export interface IntegrationFact {
  label: string;
  value: string;
}

/** A public value the owner needs to paste into another service (never a secret). */
export interface IntegrationCopyValue {
  label: string;
  value: string;
  hint: string;
}

export interface IntegrationReport {
  id: IntegrationId;
  name: string;
  status: { label: string; tone: StatusTone };
  /** One line: what depends on this. */
  affects: string;
  facts: IntegrationFact[];
  /** "fix" when something needs doing; "note" for useful context when nothing is wrong. */
  guidance: { kind: "fix" | "note"; text: string } | null;
  /** Environment variable names involved (names only, as in .env.example). */
  variables: string[];
  /** Values to paste somewhere else, e.g. Paystack's webhook URL. */
  copyValues: IntegrationCopyValue[];
}

const REDEPLOY = "then redeploy the site so the change takes effect";

export const PAYSTACK_WEBHOOK_PATH = "/api/webhooks/paystack";
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
export const RESEND_TEST_SENDER = "onboarding@resend.dev";

/** Joins the site's address and a path without doubling slashes: ("https://x.com/", "/a") → "https://x.com/a". */
export function siteAddress(base: string, path: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Whether a Paystack secret key has the expected shape. Takes the key, returns only a yes or no. */
export function isRecognisedPaystackSecretKey(key: string | undefined | null): boolean {
  return /^sk_(test|live)_[A-Za-z0-9]+$/.test((key ?? "").trim());
}

/** Hostnames that only work on the computer or network the site runs on. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  const octets = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!octets) return false;
  const first = Number(octets[1]);
  const second = Number(octets[2]);
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254)
  );
}

export type SiteUrlProblem = "invalid" | "local" | "insecure" | "has_path" | null;

/** What, if anything, is wrong with the site's public address for a live store. */
export function siteUrlProblem(url: string, isProduction: boolean): SiteUrlProblem {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "invalid";
  if (isLocalHostname(parsed.hostname)) return "local";
  if (isProduction && parsed.protocol !== "https:") return "insecure";
  if ((parsed.pathname !== "/" && parsed.pathname !== "") || parsed.search || parsed.hash) return "has_path";
  return null;
}

function describeDatabase(snapshot: IntegrationSnapshot): IntegrationReport {
  const { database } = snapshot;
  const base = {
    id: "database" as const,
    name: "Database",
    affects: "Products, stock, orders, customer accounts and this admin area are all kept in the database.",
    variables: ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "CATALOG_SOURCE"],
    copyValues: [],
  };

  if (!database.configured) {
    return {
      ...base,
      status: { label: "Not connected", tone: "critical" },
      facts: [{ label: "Store catalogue", value: "Built-in sample catalogue" }],
      guidance: {
        kind: "fix",
        text: `Add DATABASE_URL (Neon's pooled connection) and DATABASE_URL_UNPOOLED (the direct connection), ${REDEPLOY}.`,
      },
    };
  }

  if (database.catalogSource === "seed") {
    return {
      ...base,
      status: { label: "Sample catalogue", tone: "attention" },
      facts: [
        { label: "Connection", value: "Connected" },
        { label: "Store catalogue", value: "Built-in sample catalogue, not the database" },
      ],
      guidance: {
        kind: "fix",
        text: `CATALOG_SOURCE is set to "seed", so the store shows sample products, your product changes here don't appear, and checkout is closed. Remove CATALOG_SOURCE (or set it to "database"), ${REDEPLOY}.`,
      },
    };
  }

  return {
    ...base,
    status: { label: "Connected", tone: "positive" },
    facts: [
      { label: "Connection", value: "Connected" },
      { label: "Store catalogue", value: "Read from the database, so your changes here show in the store" },
    ],
    guidance: null,
  };
}

const CHECKOUT_MODE_WORDS: Record<CheckoutModeName, string> = {
  live: "Open: customers pay through Paystack",
  "orders-only": "Test orders without payment (only while developing)",
  unavailable: "Closed: customers can't place orders",
};

function describePayments(snapshot: IntegrationSnapshot): IntegrationReport {
  const { paystack, isProduction, site } = snapshot;
  const localSite = siteUrlProblem(site.url, isProduction) === "local";

  const checkout =
    paystack.checkoutMode === "live" && paystack.testMode
      ? "Open: test payments only, no real money"
      : CHECKOUT_MODE_WORDS[paystack.checkoutMode];

  const base = {
    id: "payments" as const,
    name: "Payments (Paystack)",
    affects:
      "Taking payment at checkout. An order only counts as paid once Paystack confirms the payment to the store.",
    variables: ["PAYSTACK_SECRET_KEY", "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"],
    copyValues: [
      {
        label: "Webhook URL",
        value: siteAddress(site.url, PAYSTACK_WEBHOOK_PATH),
        hint: localSite
          ? "Paystack can't reach a local address, so this only works once the site is online with its real address."
          : "Paste this into Paystack → Settings → API Keys & Webhooks → Webhook URL, for the mode you use (test or live). It lets Paystack tell the store about a payment even if the customer closes the page.",
      },
    ],
  };

  if (!paystack.secretKeySet) {
    return {
      ...base,
      status: { label: "Not set up", tone: isProduction ? "critical" : "attention" },
      facts: [
        { label: "Keys", value: "Not set" },
        { label: "Checkout", value: checkout },
      ],
      guidance: {
        kind: "fix",
        text: `Copy the secret and public keys from Paystack → Settings → API Keys & Webhooks into PAYSTACK_SECRET_KEY and NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, ${REDEPLOY}.`,
      },
    };
  }

  if (!paystack.keyRecognised) {
    return {
      ...base,
      status: { label: "Check the key", tone: isProduction ? "critical" : "attention" },
      facts: [
        { label: "Keys", value: "Set, but not in the usual Paystack format" },
        { label: "Checkout", value: checkout },
      ],
      guidance: {
        kind: "fix",
        text: `Paystack secret keys start with sk_test_ or sk_live_, and payments will fail with anything else. Copy the secret key again from Paystack → Settings → API Keys & Webhooks into PAYSTACK_SECRET_KEY (with no spaces or quotes around it), ${REDEPLOY}.`,
      },
    };
  }

  if (paystack.testMode) {
    return {
      ...base,
      status: { label: "Test mode", tone: isProduction ? "attention" : "info" },
      facts: [
        { label: "Keys", value: "Test keys: no real money moves" },
        { label: "Checkout", value: checkout },
      ],
      guidance: isProduction
        ? {
            kind: "fix",
            text: `Customers can't really pay while test keys are in use. Before launch, put the live keys (starting sk_live_ and pk_live_) into PAYSTACK_SECRET_KEY and NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, ${REDEPLOY}.`,
          }
        : { kind: "note", text: "Test keys are right for trying things out. The live site needs the live keys." },
    };
  }

  return {
    ...base,
    status: { label: "Live", tone: "positive" },
    facts: [
      { label: "Keys", value: "Live keys: real payments" },
      { label: "Checkout", value: checkout },
    ],
    guidance: isProduction
      ? null
      : {
          kind: "note",
          text: "Live keys take real money. While developing, use test keys (starting sk_test_) instead.",
        },
  };
}

function describeAccounts(snapshot: IntegrationSnapshot): IntegrationReport {
  const { auth, resend, database, isProduction, site } = snapshot;
  const anyOn = auth.googleEnabled || auth.emailEnabled;
  const localSite = siteUrlProblem(site.url, isProduction) === "local";

  const blocker = !auth.secretSet ? "needs AUTH_SECRET" : !database.configured ? "needs the database" : null;

  const emailWhy = blocker
    ? `Off: ${blocker}`
    : !resend.apiKeySet
      ? "Off: needs RESEND_API_KEY"
      : isProduction && !resend.sender
        ? "Off: needs EMAIL_FROM on the live site"
        : "Off";

  const googleWhy = blocker
    ? `Off: ${blocker}`
    : !auth.googleIdSet && !auth.googleSecretSet
      ? "Off: needs AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET"
      : !auth.googleIdSet
        ? "Off: needs AUTH_GOOGLE_ID"
        : !auth.googleSecretSet
          ? "Off: needs AUTH_GOOGLE_SECRET"
          : "Off";

  const facts: IntegrationFact[] = [
    { label: "Session secret", value: auth.secretSet ? "Set" : "Not set" },
    { label: "Email link sign-in", value: auth.emailEnabled ? "On" : emailWhy },
    { label: "Google sign-in", value: auth.googleEnabled ? "On" : googleWhy },
  ];

  let guidance: IntegrationReport["guidance"] = null;
  if (!auth.secretSet) {
    guidance = {
      kind: "fix",
      text: `Set AUTH_SECRET to a long random value (run "npx auth secret" to make one), ${REDEPLOY}.`,
    };
  } else if (!anyOn) {
    guidance = {
      kind: "fix",
      text: `Switch on at least one way to sign in: RESEND_API_KEY and EMAIL_FROM for email links, or AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET for Google, ${REDEPLOY}.`,
    };
  } else if (!auth.emailEnabled) {
    guidance = {
      kind: "note",
      text: "Customers without a Google account can only sign in by email link. Set up email (below) to offer it.",
    };
  } else if (!auth.googleEnabled) {
    guidance = {
      kind: "note",
      text: `To offer Google sign-in too, create an OAuth client in Google Cloud Console → APIs & Services → Credentials and add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, ${REDEPLOY}.`,
    };
  }

  return {
    id: "accounts",
    name: "Customer accounts",
    status: anyOn ? { label: "On", tone: "positive" } : { label: "Off", tone: "critical" },
    affects:
      "Signing in: customer accounts, saved addresses and wishlists, and access to this admin area. Guest checkout works either way.",
    facts,
    guidance,
    variables: ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
    copyValues: [
      {
        label: "Google redirect address",
        value: siteAddress(site.url, GOOGLE_CALLBACK_PATH),
        hint: localSite
          ? "For Google sign-in while developing. The live site needs its real address added too."
          : "In Google Cloud Console → Credentials → your OAuth client, add this under Authorised redirect URIs.",
      },
    ],
  };
}

function describeEmail(snapshot: IntegrationSnapshot): IntegrationReport {
  const { resend, isProduction } = snapshot;
  const base = {
    id: "email" as const,
    name: "Email (Resend)",
    affects: "Order confirmations, dispatch updates and sign-in links sent to customers.",
    variables: ["RESEND_API_KEY", "EMAIL_FROM"],
    copyValues: [],
  };

  if (!resend.apiKeySet) {
    return {
      ...base,
      status: { label: "Not set up", tone: isProduction ? "critical" : "attention" },
      facts: [{ label: "Sending", value: "Off: no emails are sent" }],
      guidance: {
        kind: "fix",
        text: `Create an API key at resend.com → API Keys and put it in RESEND_API_KEY. Verify your domain in Resend and set EMAIL_FROM to an address on it (for example "Tailored by Tee <hello@yourdomain.com>"), ${REDEPLOY}.`,
      },
    };
  }

  if (!resend.sender) {
    return {
      ...base,
      status: { label: "Test sender", tone: "attention" },
      facts: [
        { label: "Sending", value: "On" },
        { label: "Sender", value: `Resend's test sender (${RESEND_TEST_SENDER})` },
      ],
      guidance: {
        kind: "fix",
        text: `Resend's test sender only delivers to the email address that owns the Resend account, so customers receive nothing${
          isProduction ? " and email sign-in stays off" : ""
        }. Verify your domain in Resend, set EMAIL_FROM to an address on it, ${REDEPLOY}.`,
      },
    };
  }

  return {
    ...base,
    status: { label: "Ready", tone: "positive" },
    facts: [
      { label: "Sending", value: "On" },
      { label: "Sender", value: resend.sender },
    ],
    guidance: {
      kind: "note",
      text: "The sender's domain must stay verified in Resend, or Resend refuses the emails.",
    },
  };
}

function describeMedia(snapshot: IntegrationSnapshot): IntegrationReport {
  const { cloudinary } = snapshot;
  const parts = [
    ["CLOUDINARY_CLOUD_NAME", cloudinary.cloudNameSet],
    ["CLOUDINARY_API_KEY", cloudinary.apiKeySet],
    ["CLOUDINARY_API_SECRET", cloudinary.apiSecretSet],
  ] as const;
  const setCount = parts.filter(([, set]) => set).length;
  const configured = cloudinary.urlSet || setCount === parts.length;

  const base = {
    id: "media" as const,
    name: "Photos (Cloudinary)",
    affects: "Uploading product and collection photos from your phone or computer. Cloudinary stores and resizes them.",
    variables: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"],
    copyValues: [],
  };

  if (configured) {
    return {
      ...base,
      status: { label: "Ready", tone: "positive" },
      facts: [{ label: "Uploads", value: "On" }],
      guidance: null,
    };
  }

  if (setCount > 0) {
    const missing = parts.filter(([, set]) => !set).map(([name]) => name);
    return {
      ...base,
      status: { label: "Incomplete", tone: "attention" },
      facts: [{ label: "Uploads", value: `Off: missing ${joinWords(missing)}` }],
      guidance: {
        kind: "fix",
        text: `All three Cloudinary values are needed together. Add ${joinWords(missing)} from the Cloudinary dashboard, ${REDEPLOY}.`,
      },
    };
  }

  return {
    ...base,
    status: { label: "Not set up", tone: "neutral" },
    facts: [{ label: "Uploads", value: "Off: photos are added by their web address" }],
    guidance: {
      kind: "fix",
      text: `Until Cloudinary is set up, photos can only be added by their web address. To upload, create a Cloudinary account and add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, ${REDEPLOY}.`,
    },
  };
}

function describeSite(snapshot: IntegrationSnapshot): IntegrationReport {
  const { site, isProduction } = snapshot;
  const problem = siteUrlProblem(site.url, isProduction);
  const base = {
    id: "site" as const,
    name: "Site address",
    affects:
      "Links in emails and sign-in links, where Paystack returns customers after paying, and how the store appears in search results.",
    variables: ["NEXT_PUBLIC_SITE_URL"],
    copyValues: [],
  };
  const facts: IntegrationFact[] = [
    { label: "Address", value: site.url },
    { label: "Where it comes from", value: site.envSet ? "NEXT_PUBLIC_SITE_URL" : "Not set, so the default is used" },
  ];
  const rebuild =
    "This value is built into the site, so it needs a new deployment (not just a restart) after you change it.";

  if (problem === "invalid") {
    return {
      ...base,
      status: { label: "Not a valid address", tone: "critical" },
      facts,
      guidance: {
        kind: "fix",
        text: `Set NEXT_PUBLIC_SITE_URL to the store's full address, like https://tailoredbytee.com. ${rebuild}`,
      },
    };
  }

  if (problem === "local") {
    return isProduction
      ? {
          ...base,
          status: { label: "Points at a local address", tone: "critical" },
          facts,
          guidance: {
            kind: "fix",
            text: `Links in emails, sign-in links and Paystack's return to the store will not work. Set NEXT_PUBLIC_SITE_URL to the store's real address, like https://tailoredbytee.com. ${rebuild}`,
          },
        }
      : {
          ...base,
          status: { label: "Local", tone: "info" },
          facts,
          guidance: { kind: "note", text: "A local address is fine while developing. The live site needs its real address." },
        };
  }

  if (problem === "insecure") {
    return {
      ...base,
      status: { label: "Not secure (http)", tone: "attention" },
      facts,
      guidance: {
        kind: "fix",
        text: `Use the https:// address in NEXT_PUBLIC_SITE_URL, so customers' details and sign-in links stay private. ${rebuild}`,
      },
    };
  }

  if (problem === "has_path") {
    return {
      ...base,
      status: { label: "Check the address", tone: "attention" },
      facts,
      guidance: {
        kind: "fix",
        text: `NEXT_PUBLIC_SITE_URL should be just the address, with nothing after the domain (like https://tailoredbytee.com). ${rebuild}`,
      },
    };
  }

  return { ...base, status: { label: "Set", tone: "positive" }, facts, guidance: null };
}

/** One report per service, in the order the settings page shows them. */
export function describeIntegrations(snapshot: IntegrationSnapshot): IntegrationReport[] {
  return [
    describeDatabase(snapshot),
    describePayments(snapshot),
    describeAccounts(snapshot),
    describeEmail(snapshot),
    describeMedia(snapshot),
    describeSite(snapshot),
  ];
}

/** Reports whose status needs the owner (or their developer) to do something. */
export function integrationsNeedingAttention(reports: readonly IntegrationReport[]): IntegrationReport[] {
  return reports.filter((report) => report.status.tone === "critical" || report.status.tone === "attention");
}

/** A calm line about where this copy of the site runs, for the top of the services list. */
export function deploymentDescription(deployment: DeploymentKind): string {
  switch (deployment) {
    case "production":
      return "These are the settings of the live store.";
    case "preview":
      return "This is a preview copy of the store, so some settings may differ from the live site.";
    case "development":
      return "This is a development copy of the store running on a computer, not the live site.";
  }
}

/* ── Store configuration ────────────────────────────────────────────────── */

/**
 * The contact details the site shipped with (config/site.ts marks them as
 * placeholders). Still showing one of these means it hasn't been replaced.
 */
export const SHIPPED_PLACEHOLDER_CONTACT = {
  email: "studio@tailoredbytee.com",
  phone: "+234 800 000 0000",
  address: "Studio 4, Admiralty Way, Lekki Phase 1, Lagos",
} as const;

export type ContactField = keyof typeof SHIPPED_PLACEHOLDER_CONTACT;

/** Whether a contact detail still looks like a placeholder rather than the studio's real one. */
export function isPlaceholderContact(field: ContactField, value: string): boolean {
  const text = value.trim();
  if (text === "") return true;
  if (text.toLowerCase() === SHIPPED_PLACEHOLDER_CONTACT[field].toLowerCase()) return true;
  if (field === "phone") return /0{6,}/.test(text.replace(/\D/g, ""));
  if (field === "email") return /@(example\.(com|org|net)|test\.com|email\.com)$/i.test(text);
  return /lorem ipsum|placeholder/i.test(text);
}

/** "Lagos" / "Ogun, Oyo, Osun, Ondo and Ekiti" / "Every other state". */
export function describeZoneCoverage(states: readonly string[] | null): string {
  if (states === null) return "Every other state";
  if (states.length === 0) return "No states";
  return joinWords(states.map((code) => NIGERIAN_STATES.find((state) => state.code === code)?.name ?? code));
}

/** "a", "a and b", "a, b and c". */
function joinWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ── Activity ───────────────────────────────────────────────────────────── */

const SPECIAL_ACTIONS: Record<string, string> = {
  "admin.grant": "Admin access given",
  "admin.revoke": "Admin access removed",
};

const NOUNS: Record<string, string> = {
  admin: "admin access",
  account: "account",
  announcement: "announcement",
  category: "category",
  categories: "categories",
  collection: "collection",
  collections: "collections",
  color: "colour",
  colour: "colour",
  coupon: "discount",
  customer: "customer",
  demo: "demo data",
  discount: "discount",
  image: "photo",
  images: "photos",
  inventory: "stock",
  media: "photo",
  order: "order",
  photo: "photo",
  product: "product",
  products: "products",
  refund: "refund",
  review: "review",
  settings: "settings",
  size: "size",
  sizes: "sizes",
  stock: "stock",
  tracking: "tracking",
  user: "account",
  variant: "variant",
  variants: "variants",
};

const VERBS: Record<string, string> = {
  activate: "switched on",
  add: "added",
  adjust: "adjusted",
  approve: "approved",
  archive: "archived",
  attach: "added",
  cancel: "cancelled",
  clear: "cleared",
  create: "created",
  deactivate: "switched off",
  delete: "deleted",
  deliver: "marked delivered",
  detach: "removed",
  disable: "switched off",
  duplicate: "duplicated",
  edit: "edited",
  enable: "switched on",
  feature: "featured",
  grant: "given",
  hide: "hidden",
  images: "photos changed",
  import: "imported",
  link: "linked",
  move: "moved",
  note: "note added",
  price: "price changed",
  process: "processed",
  publish: "published",
  refund: "refunded",
  reject: "rejected",
  remove: "removed",
  reorder: "reordered",
  replace: "replaced",
  restore: "restored",
  revoke: "removed",
  save: "saved",
  seed: "added",
  seo: "search listing changed",
  set: "set",
  ship: "marked shipped",
  show: "shown",
  status: "status changed",
  threshold: "low-stock level changed",
  tracking: "tracking updated",
  unarchive: "restored",
  unfeature: "no longer featured",
  unlink: "unlinked",
  unpublish: "unpublished",
  update: "updated",
  upload: "uploaded",
};

/** "stockThreshold" / "stock_threshold" / "stock-threshold" → ["stock", "threshold"]. */
function words(segment: string): string[] {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

function capitalise(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

/**
 * An audit action in plain words: "product.update" → "Product updated",
 * "product.image.add" → "Product photo added", "coupon.create" → "Discount created".
 * Unknown verbs keep their words: "product.bundle" → "Product bundle".
 */
export function auditActionLabel(action: string): string {
  const key = action.trim();
  if (SPECIAL_ACTIONS[key]) return SPECIAL_ACTIONS[key];

  const segments = key.split(".").filter(Boolean);
  if (segments.length === 0) return "Change";

  const [entity, ...rest] = segments;
  const entityWords = words(entity).map((word) => NOUNS[word] ?? word);
  if (rest.length === 0) return capitalise(entityWords.join(" ")) || "Change";

  const verbSegment = rest[rest.length - 1];
  const middle = rest.slice(0, -1).flatMap(words).map((word) => NOUNS[word] ?? word);
  const verbWords = words(verbSegment);
  const verb = verbWords.length === 1 && VERBS[verbWords[0]] ? VERBS[verbWords[0]] : verbWords.join(" ");

  return capitalise([...entityWords, ...middle, verb].filter(Boolean).join(" ")) || "Change";
}

/** Who made a change, for the activity list. A missing actor is a command-line change or a since-deleted account. */
export function activityActorLabel(actor: { email: string; name: string | null } | null): string {
  if (!actor) return "Outside the admin area";
  return actor.email;
}

export interface AuditEntryLinkInput {
  action: string;
  entityType: string;
  entityId: string | null;
  metadata?: unknown;
}

/**
 * What the server looked up about the records an activity list mentions. When
 * given, it is trusted over the entries' metadata: only records found here are
 * linked, so a deleted product or order never becomes a link to a "not found" page.
 * Keys are activityEntityKey(entityType, entityId).
 */
export interface ActivityLinkLookups {
  /** "Order:<id or number>" or "Refund:<id>" → the order's number. */
  orderNumbers: ReadonlyMap<string, string>;
  /** "ProductVariant:<id>", "Inventory:<variantId>" or "ProductImage:<id>" → the product's id. */
  productIds: ReadonlyMap<string, string>;
  /** "Product:<id>", "Collection:<id>", "Category:<id>", "Coupon:<id>", "User:<id>" for records that still exist. */
  existing: ReadonlySet<string>;
}

/** The key an entity is looked up under: "Product:clx…". */
export function activityEntityKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** Entity types whose records are checked for existence before linking. */
export const ACTIVITY_DETAIL_TYPES = ["Product", "Collection", "Category", "Coupon", "User"] as const;

const DETAIL_ROUTES: Record<(typeof ACTIVITY_DETAIL_TYPES)[number], string> = {
  Product: "/admin/products",
  Collection: "/admin/collections",
  Category: "/admin/categories",
  Coupon: "/admin/discounts",
  User: "/admin/customers",
};

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,191}$/;
const ORDER_NUMBER = /^[A-Z]{2,5}-\d{4}-\d{3,10}$/;

function metadataString(metadata: unknown, keys: readonly string[]): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  for (const key of keys) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function isDetailType(type: string): type is (typeof ACTIVITY_DETAIL_TYPES)[number] {
  return (ACTIVITY_DETAIL_TYPES as readonly string[]).includes(type);
}

/**
 * The admin page for an audit entry's subject, or null when there isn't one (or
 * it was deleted). Without `lookups` it goes by the entry alone (its metadata and
 * whether it was a deletion); with them, only records the server found are linked.
 */
export function auditEntityHref(entry: AuditEntryLinkInput, lookups?: ActivityLinkLookups): string | null {
  const verb = entry.action.split(".").at(-1)?.toLowerCase();
  const id = entry.entityId && SAFE_ID.test(entry.entityId) ? entry.entityId : null;
  const key = id ? activityEntityKey(entry.entityType, id) : null;

  if (entry.entityType === "User" && entry.action.startsWith("admin.")) return "#admin-team";
  if (entry.entityType === "Review") return "/admin/reviews";

  if (isDetailType(entry.entityType)) {
    if (!id || !key) return null;
    if (lookups ? !lookups.existing.has(key) : verb === "delete") return null;
    return `${DETAIL_ROUTES[entry.entityType]}/${encodeURIComponent(id)}`;
  }

  switch (entry.entityType) {
    case "Order":
    case "Refund": {
      const number = lookups
        ? key
          ? (lookups.orderNumbers.get(key) ?? null)
          : null
        : metadataString(entry.metadata, ["orderNumber", "number"]);
      return number && ORDER_NUMBER.test(number) ? `/admin/orders/${encodeURIComponent(number)}` : null;
    }
    case "ProductVariant":
    case "Inventory":
    case "ProductImage": {
      const productId = lookups
        ? key
          ? (lookups.productIds.get(key) ?? null)
          : null
        : metadataString(entry.metadata, ["productId"]);
      return productId && SAFE_ID.test(productId) ? `/admin/products/${encodeURIComponent(productId)}` : null;
    }
    default:
      return null;
  }
}
