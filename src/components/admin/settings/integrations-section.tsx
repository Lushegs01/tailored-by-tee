import "server-only";

import { AdminSection, KeyValueList, StatusBadge } from "@/components/admin/ui";
import { siteConfig } from "@/config/site";
import {
  deploymentDescription,
  describeIntegrations,
  integrationsNeedingAttention,
  isRecognisedPaystackSecretKey,
  type DeploymentKind,
  type IntegrationReport,
  type IntegrationSnapshot,
} from "@/lib/admin/settings";
import { enabledSignInMethods } from "@/lib/auth/config";
import { getCatalogSource } from "@/lib/catalog/sources";
import { getCheckoutMode } from "@/lib/commerce/checkout-mode";
import { isDatabaseConfigured } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email/send";
import { isPaystackConfigured, isPaystackTestMode } from "@/lib/payments/paystack";
import { cn } from "@/lib/utils";

import { CopyValue } from "./copy-value";
import { SETTINGS_SECTION_CLASS } from "./settings-skeletons";

export const INTEGRATIONS_SECTION_ID = "services";

// Facts whose values are addresses, which may have no spaces to wrap at on a phone.
const BREAK_ANYWHERE = new Set(["Address", "Sender"]);

const isSet = (value: string | undefined) => Boolean(value && value.trim());

/**
 * What the server knows about its configuration, read per request. Only
 * booleans and public values leave this function: secret keys are tested for
 * presence (and the Paystack key for its shape) and never copied anywhere.
 */
export function readIntegrationSnapshot(): IntegrationSnapshot {
  const env = process.env;
  const deployment: DeploymentKind =
    env.VERCEL_ENV === "preview" ? "preview" : env.NODE_ENV === "production" ? "production" : "development";

  return {
    isProduction: env.NODE_ENV === "production",
    deployment,
    database: {
      configured: isDatabaseConfigured(),
      catalogSource: getCatalogSource(),
    },
    paystack: {
      secretKeySet: isPaystackConfigured(),
      testMode: isPaystackTestMode(),
      keyRecognised: isRecognisedPaystackSecretKey(env.PAYSTACK_SECRET_KEY),
      checkoutMode: getCheckoutMode(),
    },
    auth: {
      secretSet: isSet(env.AUTH_SECRET) || isSet(env.NEXTAUTH_SECRET),
      googleIdSet: isSet(env.AUTH_GOOGLE_ID),
      googleSecretSet: isSet(env.AUTH_GOOGLE_SECRET),
      googleEnabled: enabledSignInMethods.google,
      emailEnabled: enabledSignInMethods.email,
    },
    resend: {
      apiKeySet: isEmailConfigured(),
      sender: env.EMAIL_FROM?.trim() || null,
    },
    cloudinary: {
      cloudNameSet: isSet(env.CLOUDINARY_CLOUD_NAME),
      apiKeySet: isSet(env.CLOUDINARY_API_KEY),
      apiSecretSet: isSet(env.CLOUDINARY_API_SECRET),
      urlSet: isSet(env.CLOUDINARY_URL),
    },
    site: {
      url: siteConfig.url,
      envSet: isSet(env.NEXT_PUBLIC_SITE_URL),
    },
  };
}

/** Connected services: one row each, with its state, what it affects and how to fix it. */
export function IntegrationsSection() {
  const snapshot = readIntegrationSnapshot();
  const reports = describeIntegrations(snapshot);
  const attention = integrationsNeedingAttention(reports);

  return (
    <AdminSection
      id={INTEGRATIONS_SECTION_ID}
      className={SETTINGS_SECTION_CLASS}
      title="Connected services"
      description={
        <>
          {deploymentDescription(snapshot.deployment)} Secret keys are never shown here, only whether they’re set.
          They’re changed in your hosting provider’s environment settings (the names match the site’s .env.example
          file), and the site then needs redeploying.
        </>
      }
      flush
    >
      <div className="border-b px-4 py-3 text-body-sm md:px-5">
        {attention.length === 0 ? (
          <p>Everything is set up.</p>
        ) : (
          <p>
            {attention.length === 1 ? "One service needs" : `${attention.length} services need`} attention:{" "}
            {attention.map((report, index) => (
              <span key={report.id}>
                {index > 0 ? (index === attention.length - 1 ? " and " : ", ") : null}
                <a href={`#service-${report.id}`} className="link-underline-static pb-0.5">
                  {report.name}
                </a>
              </span>
            ))}
            .
          </p>
        )}
      </div>

      <ul className="divide-y">
        {reports.map((report) => (
          <IntegrationRow key={report.id} report={report} />
        ))}
      </ul>
    </AdminSection>
  );
}

function IntegrationRow({ report }: { report: IntegrationReport }) {
  return (
    <li
      id={`service-${report.id}`}
      className="grid scroll-mt-20 gap-x-8 lg:scroll-mt-8 gap-y-4 px-4 py-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:px-5"
    >
      <div className="min-w-0">
        <h3 className="text-body-sm font-medium">
          {report.name}
        </h3>
        <div className="mt-2">
          <StatusBadge tone={report.status.tone}>{report.status.label}</StatusBadge>
        </div>
        <p className="mt-2 text-caption text-muted-foreground">{report.affects}</p>
      </div>

      <div className="min-w-0">
        <KeyValueList
          items={report.facts.map((fact) => ({ ...fact, breakAll: BREAK_ANYWHERE.has(fact.label) }))}
          className="-mt-2.5"
        />

        {report.guidance ? (
          <div
            className={cn(
              "mt-3 border-l-2 py-0.5 pl-3 text-body-sm",
              report.guidance.kind === "fix" ? "border-accent-brand" : "border-border-strong",
            )}
          >
            <p className="text-caption font-medium text-muted-foreground">
              {report.guidance.kind === "fix" ? "How to fix" : "Good to know"}
            </p>
            <p className="mt-0.5">{report.guidance.text}</p>
          </div>
        ) : null}

        {report.copyValues.length > 0 ? (
          <div className="mt-4 space-y-4">
            {report.copyValues.map((item) => (
              <CopyValue key={item.label} label={item.label} value={item.value} hint={item.hint} />
            ))}
          </div>
        ) : null}

        <p className="mt-4 text-caption text-muted-foreground">
          Settings involved:{" "}
          {report.variables.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : null}
              <code className="font-mono break-all text-foreground">{name}</code>
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}
