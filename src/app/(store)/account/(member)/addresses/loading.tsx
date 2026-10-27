import { Skeleton } from "@/components/ui/skeleton";

/** Address book skeleton with the real geometry; fades in after a short delay so quick loads never flash. */
export default function AddressesLoading() {
  return (
    <div
      role="status"
      className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0"
    >
      <span className="sr-only">Loading your addresses</span>
      <div aria-hidden="true">
        <Skeleton className="h-9 w-48 md:h-11 md:w-64" />
        <Skeleton className="mt-6 h-3 w-full max-w-md" />

        <div className="mt-10 flex items-center justify-between gap-6 border-b pb-4 md:mt-14">
          <Skeleton className="h-2.5 w-32" />
          <Skeleton className="h-10 w-36" />
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <li key={index} className="border p-5 sm:p-6">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="mt-6 h-3 w-40" />
              <Skeleton className="mt-2.5 h-3 w-48 max-w-full" />
              <Skeleton className="mt-2.5 h-3 w-32" />
              <Skeleton className="mt-5 h-3 w-36" />
              <div className="mt-8 flex gap-6">
                <Skeleton className="h-2.5 w-10" />
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
