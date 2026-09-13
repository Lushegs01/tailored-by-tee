import { siteConfig } from "@/config/site";
import { getCategorySummaries, getCollections } from "@/lib/catalog/repository";

import { AnnouncementBar } from "./header/announcement-bar";
import { HeaderShell } from "./header/header-shell";
import { buildHeaderNav } from "./header/nav-data";

/**
 * Site header. Reads navigation data on the server and hands the interactive shell
 * only names, hrefs, counts and a few images. The announcement renders here as a
 * server component and passes through the shell as a slot.
 */
export async function SiteHeader() {
  const [categories, collections] = await Promise.all([getCategorySummaries(), getCollections()]);
  const nav = buildHeaderNav(categories, collections);
  const { announcement } = siteConfig;

  return <HeaderShell nav={nav} announcement={announcement ? <AnnouncementBar {...announcement} /> : null} />;
}
