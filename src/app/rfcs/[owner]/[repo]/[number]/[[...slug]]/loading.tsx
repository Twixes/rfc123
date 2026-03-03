import Link from "next/link";

export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-360 px-8 py-12">
      <nav className="mb-6">
        <Link
          href="/rfcs"
          className="rounded-md border border-gray-20 bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-gray-5"
        >
          ← Back to RFCs
        </Link>
      </nav>

      {/* RFCMetadataHeader Skeleton */}
      <div className="mb-4 border border-gray-20 rounded-md shadow-sm bg-surface p-8">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <div className="h-5 w-20 animate-pulse rounded bg-gray-20" />
            <div className="h-7 w-16 animate-pulse rounded-sm border border-gray-20 bg-gray-5" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-md border border-gray-20 bg-gray-10" />
        </div>

        <div className="mb-6 h-10 w-3/4 animate-pulse rounded bg-gray-20" />

        <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-gray-20 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-20" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
            </div>
          </div>

          <div>
            <div className="mb-2 h-3 w-20 animate-pulse rounded bg-gray-20" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-20" />
            </div>
          </div>

          <div>
            <div className="mb-2 h-3 w-16 animate-pulse rounded bg-gray-20" />
            <div className="h-4 w-28 animate-pulse rounded bg-gray-20" />
          </div>

          <div>
            <div className="mb-2 h-3 w-28 animate-pulse rounded bg-gray-20" />
            <div className="h-4 w-8 animate-pulse rounded bg-gray-20" />
          </div>
        </div>
      </div>

      {/* Markdown Content Skeleton */}
      <div className="border border-gray-20 rounded-md shadow-sm bg-surface p-8">
        <div className="space-y-4">
          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-5/6 animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-4/5 animate-pulse rounded bg-gray-20" />

          <div className="py-4" />

          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-3/4 animate-pulse rounded bg-gray-20" />

          <div className="py-4" />

          <div className="h-32 w-full animate-pulse rounded border border-gray-20 bg-gray-5" />

          <div className="py-4" />

          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-5/6 animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-full animate-pulse rounded bg-gray-20" />
        </div>
      </div>

      {/* General Comments Section Skeleton */}
      <div className="mt-8 border border-gray-20 rounded-md shadow-sm bg-surface p-8">
        <div className="mb-6 h-8 w-48 animate-pulse rounded bg-gray-20" />

        <div className="space-y-6">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="border-b border-gray-20 pb-6 last:border-0"
            >
              <div className="mb-4 flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-full bg-gray-20" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-32 animate-pulse rounded bg-gray-20" />
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-gray-20" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-gray-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
