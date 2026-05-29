"use client";

const RFCS_SEARCH_INPUT_CLASS =
  "w-full border border-gray-20 bg-surface rounded-md pl-9 pr-2 py-2 text-sm placeholder:text-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent";

function RFCsSearchIcon() {
  return (
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
  );
}

export function RFCsSearchInput({
  value = "",
  onChange,
  isSearching = false,
  searchRateLimited = false,
  skeleton = false,
}: {
  value?: string;
  onChange?: (value: string) => void;
  isSearching?: boolean;
  searchRateLimited?: boolean;
  skeleton?: boolean;
}) {
  return (
    <div
      className={`mb-3 relative${skeleton ? " select-none" : ""}`}
      aria-hidden={skeleton || undefined}
    >
      <RFCsSearchIcon />
      {skeleton ? (
        <div className={`${RFCS_SEARCH_INPUT_CLASS} text-gray-50`}>
          Search RFCs by title or description…
        </div>
      ) : (
        <>
          <input
            type="search"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder="Search RFCs by title or description…"
            className={RFCS_SEARCH_INPUT_CLASS}
          />
          <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-gray-50">
            {isSearching && <span>Searching…</span>}
            {searchRateLimited && !isSearching && (
              <span title="GitHub search rate limit reached – falling back to title-only matching.">
                Rate limited
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
