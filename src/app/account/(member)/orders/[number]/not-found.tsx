import { EmptyState } from "@/components/feedback/empty-state";
import { TextLink } from "@/components/ui/text-link";
import { siteConfig } from "@/config/site";

/**
 * An order this account can't see — someone else's, or one that doesn't exist;
 * the two look the same. Shown inside the account frame, so the way back is right
 * there. The likeliest reason is an order placed with another email address.
 */
export default function AccountOrderNotFound() {
  const { email } = siteConfig.contact;

  return (
    <EmptyState
      as="h1"
      size="sm"
      align="start"
      className="border-t pt-6"
      title="We couldn’t find that *order.*"
      body={
        <>
          It may have been placed with a different email address — sign in with that address to see it. Or email{" "}
          <a href={`mailto:${email}`} className="link-underline-static text-foreground">
            {email}
          </a>{" "}
          quoting the order number, and we&rsquo;ll help.
        </>
      }
      actions={
        <>
          <TextLink href="/account/orders">All your orders</TextLink>
          <TextLink href="/shop">Continue shopping</TextLink>
        </>
      }
    />
  );
}
