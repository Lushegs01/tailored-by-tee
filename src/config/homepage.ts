import type { HomeBlock } from "@/lib/content/types";

/**
 * Homepage composition — an editorial rhythm, not a stack of product grids:
 * campaign → statement → products → story → categories → collection → products
 * → brand → journal.
 */
export const homepageBlocks: HomeBlock[] = [
  {
    type: "hero",
    eyebrow: "Collection 04 — Harmattan ’26",
    headline: "Made to be worn, *then worn again.*",
    body: "Washed cottons, dry linens and tropical wool, cut for Lagos heat and the long evenings after.",
    primaryCta: { label: "Explore the collection", href: "/collections/harmattan-26" },
    secondaryCta: { label: "Shop new arrivals", href: "/shop/new-arrivals" },
    image: "editorial:hero",
    mobileImage: "editorial:heroMobile",
    caption: { label: "Look 01 — The Cropped Twill Jacket in Ink", href: "/product/cropped-twill-jacket" },
  },
  {
    type: "statement",
    eyebrow: "The studio",
    text: "We make fewer garments, and make them slowly — in cloth chosen for how it wears in *year three,* not week one.",
    link: { label: "Our approach", href: "/about" },
  },
  {
    type: "productShelf",
    id: "new-arrivals",
    eyebrow: "Just in",
    title: "New arrivals",
    description: "Recently finished in the studio, ready for the dry season.",
    source: { kind: "newArrivals" },
    limit: 8,
    layout: "grid",
    cta: { label: "View all", href: "/shop/new-arrivals" },
  },
  {
    type: "splitStory",
    eyebrow: "Wardrobe essentials",
    title: "The pieces you *reach for first.*",
    body: "Built around shapes that hold their line, move naturally and stay relevant long after the season that introduced them.",
    image: "editorial:essentials",
    imageSide: "left",
    items: [
      { label: "The structured overshirt", href: "/product/structured-overshirt" },
      { label: "The straight-leg trouser", href: "/product/straight-leg-trousers" },
      { label: "The heavyweight tee", href: "/product/heavyweight-boxy-tee" },
      { label: "The band-collar shirt", href: "/product/poplin-band-collar-shirt" },
    ],
    cta: { label: "Explore essentials", href: "/collections/studio-essentials" },
  },
  {
    type: "categoryIndex",
    eyebrow: "Categories",
    title: "Shop the *wardrobe.*",
    categories: [
      "shirts",
      "trousers",
      "outerwear",
      "knitwear",
      "tailoring",
      "t-shirts",
      "denim",
      "accessories",
    ],
  },
  {
    type: "collectionSpread",
    collectionSlug: "harmattan-26",
    eyebrow: "Collection 04",
    title: "Harmattan",
    body: "When the dust settles over Lagos, the palette turns to clay, tobacco and dry grass. Layers that breathe by day and hold a little warmth when the evening cools.",
    cta: { label: "Explore the collection", href: "/collections/harmattan-26" },
    images: ["editorial:collectionMain", "editorial:collectionSecondaryA", "editorial:collectionSecondaryB"],
    theme: "ink",
  },
  {
    type: "productShelf",
    id: "most-worn",
    eyebrow: "Best sellers",
    title: "Most worn",
    description: "The pieces our clients come back for, season after season.",
    source: { kind: "bestsellers" },
    limit: 10,
    layout: "carousel",
    cta: { label: "View all", href: "/shop" },
  },
  {
    type: "brandStory",
    eyebrow: "Our approach",
    title: "Designed for the *everyday.*",
    body: "Every piece begins on the cutting table in our Lagos studio. We draft our own patterns, wear-test each sample for weeks, and only then decide whether it earns a place in the collection.",
    principles: [
      {
        title: "Cloth",
        body: "Natural fibres from mills we know by name — linen, long-staple cotton, tropical wool.",
      },
      {
        title: "Cut",
        body: "Patterns drafted in-house and refined on real bodies, not mannequins.",
      },
      {
        title: "Care",
        body: "Finished by hand and made to be repaired, not replaced.",
      },
    ],
    image: "editorial:story",
    detailImage: "editorial:storyDetail",
    cta: { label: "Discover our approach", href: "/about" },
  },
  {
    type: "newsletter",
    eyebrow: "The Journal",
    title: "Letters from *the studio.*",
    body: "New collections, studio notes and the occasional early release. Once or twice a month, never more.",
    image: "editorial:journal",
  },
];
