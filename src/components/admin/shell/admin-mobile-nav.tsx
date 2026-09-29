"use client";

import { useState } from "react";

import type { AdminNavCounts } from "@/components/admin/admin-nav-config";
import { MenuIcon } from "@/components/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";

import { AdminAccount } from "./admin-account";
import { AdminNav } from "./admin-nav";

/** The menu button of the phone top bar, opening the admin navigation in a sheet from the left. */
export function AdminMobileNav({
  counts,
  email,
}: {
  counts: Promise<AdminNavCounts | null> | AdminNavCounts | null;
  email: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        label="Open admin menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </IconButton>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="left"
        title="Admin"
        className="max-w-[20rem]"
        bodyClassName="py-2"
        footer={<AdminAccount email={email} className="border-t-0" />}
      >
        <AdminNav counts={counts} onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
