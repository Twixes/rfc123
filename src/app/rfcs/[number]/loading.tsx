import Link from "next/link";

export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-360 px-8 py-12">
      <nav className="mb-6">
        <Link
          href="/rfcs"
          className="border-2 border-black bg-white px-4 py-2 text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white"
        >
          ← Back to RFCs
        </Link>
      </nav>

      {/* RFCMetadataHeader Skeleton */}
      <div className="mb-4 border-2 border-black bg-white p-8">
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="flex items-baseline gap-4">
            <div className="h-5 w-20 animate-pulse bg-gray-20" />
            <div className="h-7 w-16 animate-pulse border-2 border-gray-30 bg-gray-10" />
          </div>
          <div className="h-10 w-40 animate-pulse border-2 border-black bg-gray-20" />
        </div>

        <div className="mb-6 h-10 w-3/4 animate-pulse bg-gray-20" />

        <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t-2 border-black pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-2 h-3 w-16 animate-pulse bg-gray-20" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
              <div className="h-4 w-24 animate-pulse bg-gray-20" />
            </div>
          </div>

          <div>
            <div className="mb-2 h-3 w-20 animate-pulse bg-gray-20" />
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
              <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
              <div className="h-6 w-6 animate-pulse border-2 border-black bg-gray-20" />
            </div>
          </div>

          <div>
            <div className="mb-2 h-3 w-16 animate-pulse bg-gray-20" />
            <div className="h-4 w-28 animate-pulse bg-gray-20" />
          </div>

          <div>
            <div className="mb-2 h-3 w-28 animate-pulse bg-gray-20" />
            <div className="h-4 w-8 animate-pulse bg-gray-20" />
          </div>
        </div>
      </div>

      {/* Markdown Content Skeleton */}
      <div className="border-2 border-black bg-white p-8">
        <div className="space-y-4">
          <div className="h-6 w-full animate-pulse bg-gray-20" />
          <div className="h-6 w-5/6 animate-pulse bg-gray-20" />
          <div className="h-6 w-full animate-pulse bg-gray-20" />
          <div className="h-6 w-4/5 animate-pulse bg-gray-20" />

          <div className="py-4" />

          <div className="h-6 w-full animate-pulse bg-gray-20" />
          <div className="h-6 w-full animate-pulse bg-gray-20" />
          <div className="h-6 w-3/4 animate-pulse bg-gray-20" />

          <div className="py-4" />

          <div className="h-32 w-full animate-pulse border-2 border-gray-30 bg-gray-10" />

          <div className="py-4" />

          <div className="h-6 w-full animate-pulse bg-gray-20" />
          <div className="h-6 w-5/6 animate-pulse bg-gray-20" />
          <div className="h-6 w-full animate-pulse bg-gray-20" />
        </div>
      </div>

      {/* General Comments Section Skeleton */}
      <div className="mt-8 border-2 border-black bg-white p-8">
        <div className="mb-6 h-8 w-48 animate-pulse bg-gray-20" />

        <div className="space-y-6">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="border-b-2 border-gray-20 pb-6 last:border-0">
              <div className="mb-4 flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse border-2 border-black bg-gray-20" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-32 animate-pulse bg-gray-20" />
                  <div className="h-3 w-24 animate-pulse bg-gray-20" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse bg-gray-20" />
                <div className="h-4 w-5/6 animate-pulse bg-gray-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
