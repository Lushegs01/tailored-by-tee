"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { MenuIcon } from "@/components/icons";
import { Container } from "@/components/ui/container";
import { IconButton } from "@/components/ui/icon-button";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { DesktopNav } from "./desktop-nav";
import { HeaderActions } from "./header-actions";
import { isOverlayRoute } from "./header-config";
import { MobileNav } from "./mobile-nav";
import type { HeaderNavData } from "./types";
import { useHeaderScroll } from "./use-header-scroll";

interface HeaderShellProps {
  nav: HeaderNavData;
  /** Server-rendered announcement strip, or null for none. */
  announcement: React.ReactNode;
}

function isFocusVisible(element: EventTarget) {
  return element instanceof Element && element.matches(":focus-visible");
}

/**
 * Owns header state: overlay vs. solid, hide on scroll, the open desktop panel and
 * the mobile drawer.
 *
 * On overlay routes the header is fixed and transparent over the hero, turning
 * solid once scrolled, while a panel is open, or while a mouse or keyboard focus is
 * inside it. Elsewhere it is sticky and solid; the announcement scrolls away on its
 * own because the header sticks at minus its height.
 */
export function HeaderShell({ nav, announcement }: HeaderShellProps) {
  const pathname = usePathname();
  const overlay = isOverlayRoute(pathname);
  const hasAnnouncement = announcement !== null;

  const [panel, setPanel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [announcementFocused, setAnnouncementFocused] = useState(false);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Close everything when the route changes (adjusting state during render, not in an effect).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPanel("");
    setMenuOpen(false);
  }

  const { scrolled, hidden } = useHeaderScroll(panel !== "" || menuOpen || focusInside);

  const solid = !overlay || scrolled || panel !== "" || pointerInside || focusInside || menuOpen;
  // Only a fixed header needs moving to tuck the announcement away; a sticky one scrolls past it.
  const tuckAnnouncement = overlay && hasAnnouncement && scrolled && !announcementFocused;

  return (
    <header
      className={cn(
        "inset-x-0 top-0 z-40 border-b",
        "transition-[translate,background-color,color,border-color,backdrop-filter] duration-[400ms] ease-editorial",
        overlay ? "fixed" : "sticky",
        !overlay && hasAnnouncement && "-top-(--announcement-height)",
        solid
          ? "border-border bg-background/85 text-foreground backdrop-blur-lg"
          : "border-transparent bg-transparent text-paper [--ring:var(--paper)]",
        hidden ? "-translate-y-full" : tuckAnnouncement && "-translate-y-(--announcement-height)",
      )}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setPointerInside(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setPointerInside(false);
      }}
      onFocus={(event) => {
        // React bubbles focus out of the portalled drawer too; only the header's own DOM counts.
        if (!event.currentTarget.contains(event.target)) return;
        // Keyboard focus only: a mouse click on Search or Bag should not pin the header.
        setFocusInside(isFocusVisible(event.target));
        setAnnouncementFocused(announcementRef.current?.contains(event.target) ?? false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusInside(false);
          setAnnouncementFocused(false);
        }
      }}
    >
      {announcement ? <div ref={announcementRef}>{announcement}</div> : null}

      <Container className="grid h-(--header-height) grid-cols-[1fr_auto_1fr] items-center gap-x-4">
        <IconButton
          label="Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="col-start-1 row-start-1 -ml-3 justify-self-start lg:hidden"
        >
          <MenuIcon />
        </IconButton>

        <Link
          href="/"
          aria-label={siteConfig.name}
          aria-current={pathname === "/" ? "page" : undefined}
          className="col-start-2 row-start-1 inline-flex min-h-11 items-center justify-self-center text-[0.8125rem] md:text-sm lg:col-start-1 lg:justify-self-start xl:text-[0.9375rem]"
        >
          <Wordmark />
        </Link>

        <DesktopNav
          nav={nav}
          pathname={pathname}
          value={panel}
          onValueChange={setPanel}
          className="col-start-2 row-start-1 hidden lg:block"
        />

        <HeaderActions className="col-start-3 row-start-1 -mr-3 justify-self-end" />
      </Container>

      <MobileNav open={menuOpen} onOpenChange={setMenuOpen} nav={nav} pathname={pathname} />
    </header>
  );
}
