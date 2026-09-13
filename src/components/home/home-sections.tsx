import { Fragment, type ReactNode } from "react";

import { siteConfig } from "@/config/site";
import type { HomeBlock } from "@/lib/content/types";

import { BrandStory } from "./brand-story";
import { CategoryIndex } from "./category-index";
import { CollectionSpread } from "./collection-spread";
import { resolveCategoryIndex, resolveMedia, resolveShelfProducts, warnMissing } from "./data";
import { Hero } from "./hero";
import { Newsletter } from "./newsletter";
import { ProductShelf } from "./product-shelf";
import { SplitStory } from "./split-story";
import { Statement } from "./statement";

/**
 * Renders the homepage's content blocks in order. Every block resolves its data
 * in parallel; a block whose content is missing (or fails to load) is skipped,
 * so one bad reference never takes the front page down.
 */
export async function HomeSections({ blocks }: { blocks: HomeBlock[] }) {
  const sections = await Promise.all(blocks.map((block, index) => renderBlock(block, index)));
  const hasHero = blocks.some((block) => block.type === "hero");

  return (
    <>
      {/* The hero headline is the page's h1; keep one even if the hero is removed. */}
      {hasHero ? null : <h1 className="sr-only">{siteConfig.name}</h1>}
      {sections.map((section, index) => (
        <Fragment key={index}>{section}</Fragment>
      ))}
    </>
  );
}

async function renderBlock(block: HomeBlock, index: number): Promise<ReactNode> {
  const headingId = `home-${index}-heading`;

  try {
    switch (block.type) {
      case "hero": {
        const image = resolveMedia(block.image, "hero");
        const mobileImage = resolveMedia(block.mobileImage, "hero");
        return (
          <Hero
            block={block}
            image={image ?? mobileImage}
            mobileImage={image ? mobileImage : null}
            headingId={headingId}
          />
        );
      }

      case "statement":
        return <Statement block={block} headingId={headingId} />;

      case "productShelf": {
        const products = await resolveShelfProducts(block.source, block.limit);
        if (products.length === 0) {
          warnMissing(`productShelf "${block.id}": no products for source "${block.source.kind}"`);
          return null;
        }
        return <ProductShelf block={block} products={products} headingId={`${block.id}-heading`} />;
      }

      case "splitStory": {
        const image = resolveMedia(block.image, "splitStory");
        return image ? <SplitStory block={block} image={image} headingId={headingId} /> : null;
      }

      case "categoryIndex": {
        const entries = await resolveCategoryIndex(block.categories);
        if (entries.length === 0) {
          warnMissing("categoryIndex: no categories to show");
          return null;
        }
        return <CategoryIndex block={block} entries={entries} headingId={headingId} />;
      }

      case "collectionSpread": {
        const [leadKey, supportingKey, detailKey] = block.images;
        const lead = resolveMedia(leadKey, "collectionSpread");
        if (!lead) return null;
        return (
          <CollectionSpread
            block={block}
            lead={lead}
            supporting={resolveMedia(supportingKey, "collectionSpread")}
            detail={resolveMedia(detailKey, "collectionSpread")}
            headingId={headingId}
          />
        );
      }

      case "brandStory": {
        const image = resolveMedia(block.image, "brandStory");
        if (!image) return null;
        return (
          <BrandStory
            block={block}
            image={image}
            detailImage={resolveMedia(block.detailImage, "brandStory")}
            headingId={headingId}
          />
        );
      }

      case "newsletter":
        return (
          <Newsletter block={block} image={resolveMedia(block.image, "newsletter")} headingId={headingId} />
        );

      default: {
        const unknown: never = block;
        warnMissing(`unknown block ${JSON.stringify(unknown)}`);
        return null;
      }
    }
  } catch (error) {
    console.error(`[home] block ${index} (${block.type}) could not be rendered`, error);
    return null;
  }
}
