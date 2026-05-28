function rowClassName(index: number): string {
  return `block border-b border-gray-20 px-4 sm:px-6 py-4 sm:py-5 ${index === 0 ? "border-t border-gray-20" : ""}`;
}

function SkeletonRowContent() {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <div className="mb-2 flex items-baseline gap-3">
          <div className="h-7 w-96 animate-pulse rounded bg-gray-20" />
          <div className="h-6 w-16 animate-pulse rounded-sm border border-gray-20 bg-gray-5" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 animate-pulse rounded-full bg-gray-20" />
            <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
          </div>
          <div className="h-4 w-12 animate-pulse rounded bg-gray-20" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-20" />
        </div>
      </div>
    </div>
  );
}

export default function RFCListSkeleton({
  entry = false,
}: {
  entry?: boolean;
}) {
  return (
    <div className={`space-y-0${entry ? " skeleton-entry" : ""}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className={rowClassName(index)}>
          <SkeletonRowContent />
        </div>
      ))}
    </div>
  );
}
