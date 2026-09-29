import { Skeleton } from "@/components/ui/skeleton";

/** Profile skeleton with the real geometry; fades in after a short delay so quick loads never flash. */
export default function ProfileLoading() {
  return (
    <div
      role="status"
      className="transition-opacity delay-150 duration-700 ease-editorial starting:opacity-0"
    >
      <span className="sr-only">Loading your profile</span>
      <div aria-hidden="true">
        <Skeleton className="h-9 w-40 md:h-11 md:w-56" />
        <Skeleton className="mt-6 h-3 w-full max-w-sm" />

        <div className="mt-10 grid max-w-xl gap-6 md:mt-14">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-12 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-10 h-14 w-44" />
      </div>
    </div>
  );
}
