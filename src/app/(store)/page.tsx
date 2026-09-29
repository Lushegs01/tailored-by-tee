import { HomeSections } from "@/components/home/home-sections";
import { homepageBlocks } from "@/config/homepage";

export default function HomePage() {
  return <HomeSections blocks={homepageBlocks} />;
}
