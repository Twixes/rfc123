import type { RFCDetail } from "@/lib/github";

interface RFCMetadataHeaderProps {
  rfc: RFCDetail;
}

export function RFCMetadataHeader({ rfc }: RFCMetadataHeaderProps) {
  console.log('rfc', rfc)
  return (
    <div className="mb-4 border-2 border-black bg-white p-4 sm:p-8">
      <div className="mb-2 flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-baseline gap-2 sm:gap-4 flex-wrap">
          <span className="font-mono text-xs sm:text-sm font-bold tracking-wide text-gray-50">
            RFC {rfc.number}
          </span>
          {rfc.reviewRequested && (
            <span
              className="border-2 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
              style={{
                borderColor: "var(--magenta)",
                backgroundColor: "var(--magenta)",
                color: "black",
              }}
            >
              Review Requested
            </span>
          )}
          <span
            className="border-2 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider"
            style={{
              borderColor:
                rfc.status === "open"
                  ? "var(--cyan)"
                  : rfc.status === "merged"
                    ? "var(--yellow)"
                    : "var(--gray-30)",
              backgroundColor:
                rfc.status === "open"
                  ? "var(--cyan)"
                  : rfc.status === "merged"
                    ? "var(--yellow)"
                    : "var(--gray-10)",
              color: "black",
            }}
          >
            {rfc.status}
          </span>
        </div>
        <a
          href={rfc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 border-2 border-black bg-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold uppercase tracking-wide text-black transition-all hover:bg-black hover:text-white w-full sm:w-auto justify-center"
        >
          View on GitHub
          <svg
            className="h-3 sm:h-4 w-3 sm:w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth={3}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>

      <h1 className="mb-6 text-2xl sm:text-4xl font-bold tracking-tight text-black">
        {rfc.title}
      </h1>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t-2 border-black pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
            Author
          </dt>
          <dd className="flex items-center gap-2">
            <div className="h-6 w-6 border-2 border-black">
              <img
                src={rfc.authorAvatar}
                alt={rfc.author}
                className="h-full w-full"
              />
            </div>
            <span className="text-sm font-medium text-black">{rfc.author}</span>
          </dd>
        </div>

        {rfc.reviewers.length > 0 && (
          <div>
            <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
              Reviewers
            </dt>
            <dd className="flex items-center gap-2 flex-wrap">
              {rfc.reviewers.map((reviewer) => (
                <div
                  key={reviewer.login}
                  className={`h-6 w-6 border-2 border-black ${reviewer.yetToReview ? "border-dashed" : ""}`}
                  title={reviewer.login}
                >
                  <img
                    src={reviewer.avatar}
                    alt={reviewer.login}
                    className="h-full w-full"
                  />
                </div>
              ))}
            </dd>
          </div>
        )}

        <div>
          <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
            Updated
          </dt>
          <dd className="text-sm font-medium text-black">
            {new Date(rfc.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </dd>
        </div>

        <div>
          <dt className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-50">
            Comments total
          </dt>
          <dd className="font-mono text-sm font-bold text-black">
            {rfc.commentCount}
          </dd>
        </div>
      </div>
    </div>
  );
}
