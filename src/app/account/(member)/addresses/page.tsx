import type { Metadata } from "next";

import { AddressBook } from "@/components/account/address-book";
import { listAddresses, MAX_ADDRESSES } from "@/lib/account/addresses";
import { getProfile } from "@/lib/account/profile";
import { requireUser } from "@/lib/auth/session";
import { formatNigerianPhone } from "@/lib/commerce/phone";

export const metadata: Metadata = {
  title: "Addresses",
  robots: { index: false, follow: false },
};

export default async function AddressesPage() {
  // The layout checks too, but layouts and pages render in parallel.
  const user = await requireUser("/account/addresses");
  const [addresses, profile] = await Promise.all([listAddresses(user.id), getProfile(user.id)]);

  return (
    <div>
      <header className="max-w-2xl">
        <h1 className="font-display text-display-sm">Addresses</h1>
        <p className="mt-5 text-body text-muted-foreground">
          Save the places your pieces go. Your default address is filled in for you at checkout.
        </p>
      </header>

      <AddressBook
        className="mt-10 md:mt-14"
        addresses={addresses}
        maxAddresses={MAX_ADDRESSES}
        defaults={{
          fullName: profile?.name ?? user.name ?? "",
          phone: profile?.phone ? formatNigerianPhone(profile.phone) : "",
        }}
      />
    </div>
  );
}
