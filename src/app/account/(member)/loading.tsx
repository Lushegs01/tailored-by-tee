import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown in the content column while an account page loads — the greeting and
 * navigation stay put around it. Fades in after a short delay (pure CSS via
 * @starting-style), so quick navigations never flash a skeleton.
 */
export default function AccountLoading() {
  return (
    <div
      role="status"
      className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0"
    >
      <span className="sr-only">Loading</span>

      <div aria-hidden="true">
        <div className="border-t pt-6">
          <Skeleton className="h-2.5 w-28" />
          <ul className="mt-4 border-b [&>li+li]:border-t">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="flex items-start gap-4 py-5">
                <Skeleton className="aspect-4/5 w-12 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between gap-4">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="mt-2.5 h-2.5 w-40 max-w-full" />
                  <Skeleton className="mt-3 h-2.5 w-24" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-14 grid gap-x-10 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="border-t pt-6">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="mt-5 h-3 w-40 max-w-full" />
              <Skeleton className="mt-2.5 h-3 w-48 max-w-full" />
              <Skeleton className="mt-2.5 h-3 w-32" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
