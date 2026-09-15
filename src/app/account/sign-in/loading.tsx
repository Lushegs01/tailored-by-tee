import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The sign-in pages' skeleton: the same narrow column as the form, never the shop
 * grid. Fades in after a short delay (pure CSS via @starting-style), so quick
 * navigations never flash it.
 */
export default function SignInLoading() {
  return (
    <Container className="pt-12 pb-24 md:pt-20 md:pb-32">
      <div
        role="status"
        className="mx-auto max-w-md transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0"
      >
        <span className="sr-only">Loading</span>
        <div aria-hidden="true">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-4 h-10 w-40 md:h-12" />
          <Skeleton className="mt-5 h-3 w-full" />
          <Skeleton className="mt-2.5 h-3 w-4/5" />
          <Skeleton className="mt-10 h-14 w-full" />
          <Skeleton className="mt-8 h-3 w-12" />
          <Skeleton className="mt-2 h-12 w-full" />
          <Skeleton className="mt-5 h-14 w-full" />
        </div>
      </div>
    </Container>
  );
}
