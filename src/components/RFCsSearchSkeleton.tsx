/** Visual stand-in for the `/rfcs` search input, used by `loading.tsx`.
 *  Mirrors the real input in `RFCsPageClient` so the layout doesn't shift
 *  when the client component hydrates. Non-interactive on purpose - the
 *  real search state lives in the client. */
export default function RFCsSearchSkeleton() {
  return (
    <div aria-hidden className="mb-3 relative select-none">
      <svg
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-50 pointer-events-none"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <title>Search</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
        />
      </svg>
      <div className="w-full border border-gray-20 bg-surface rounded-md pl-9 pr-24 py-2 text-sm text-gray-50">
        Search RFCs by title or description…
      </div>
    </div>
  );
}
