import {
  ALL_STATUSES,
  STATUS_BORDER_CLASSES,
  STATUS_PILL_CLASSES,
} from "@/lib/rfc-status";

function Chevron() {
  return (
    <svg
      aria-hidden
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <title>Toggle</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

/** Visual stand-in for the `/rfcs` filter row, used by `loading.tsx`. Mirrors
 *  the default state of `RFCsPageClient` (only "open" selected, "All
 *  repositories", "All authors") so the bar doesn't shift when the real
 *  filters mount. Non-interactive on purpose - filter state lives in the
 *  client component. */
export default function RFCsFilterBarSkeleton() {
  return (
    <div
      aria-hidden
      className="mb-6 flex flex-wrap items-center gap-3 select-none"
    >
      <div className="flex items-center gap-1.5">
        {ALL_STATUSES.map((status) => {
          const colorClasses =
            status === "open"
              ? STATUS_PILL_CLASSES[status]
              : `bg-transparent opacity-40 ${STATUS_BORDER_CLASSES[status]}`;
          return (
            <span
              key={status}
              className={`border rounded-sm px-2 py-1 text-xs font-medium uppercase tracking-wider text-foreground ${colorClasses}`}
            >
              {status}
            </span>
          );
        })}
      </div>

      <div className="h-5 w-px bg-gray-20" />

      <span className="text-sm font-medium text-gray-50 flex items-center gap-2">
        All repositories
        <Chevron />
      </span>

      <span className="text-sm text-gray-50 flex items-center gap-2">
        All authors
        <Chevron />
      </span>
    </div>
  );
}
