import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { WishlistSkeleton } from "@/components/wishlist/wishlist-skeleton";

export default function WishlistLoading() {
  return (
    <Container className="pt-8 pb-24 md:pt-12 md:pb-32">
      <Skeleton className="h-9 w-40 md:h-11 md:w-52" />
      <WishlistSkeleton className="mt-10 md:mt-14" />
    </Container>
  );
}
