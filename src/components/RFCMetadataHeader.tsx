import type { RFCDetail } from "@/lib/github";
import { ProfilePictures } from "@/components/ProfilePictures";

interface RFCMetadataHeaderProps {
  rfc: RFCDetail;
}

export function RFCMetadataHeader({ rfc }: RFCMetadataHeaderProps) {
  return (
    <div className="mb-4 border border-gray-20 rounded-md bg-surface p-4 sm:p-8">
      <div className="mb-2 flex flex-col sm:flex-row items-start sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-baseline gap-2 sm:gap-4 flex-wrap">
          <span className="text-xs sm:text-sm font-medium tracking-widest text-gray-40 uppercase">
            RFC {rfc.number}
          </span>
          {rfc.reviewRequested && (
            <span
              className="border rounded-sm px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium uppercase tracking-wider"
              style={{
                borderColor: "var(--magenta)",
                backgroundColor: "var(--magenta-light)",
                color: "var(--foreground)",
              }}
            >
              Review Requested
            </span>
          )}
          <span
            className="border rounded-sm px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium uppercase tracking-wider"
            style={{
              borderColor:
                rfc.status === "open"
                  ? "var(--cyan)"
                  : rfc.status === "merged"
                    ? "var(--yellow)"
                    : "var(--gray-30)",
              backgroundColor:
                rfc.status === "open"
                  ? "var(--cyan-light)"
                  : rfc.status === "merged"
                    ? "var(--yellow-light)"
                    : "var(--gray-5)",
              color: "var(--foreground)",
            }}
          >
            {rfc.status}
          </span>
        </div>
        <a
          href={rfc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md border border-gray-20 bg-surface px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-foreground transition-all hover:bg-gray-5 w-full sm:w-auto justify-center"
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
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </div>

      <h1 className="mb-6 text-2xl sm:text-4xl font-serif font-normal text-foreground">
        {rfc.title}
      </h1>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-gray-20 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-40">
            Author
          </dt>
          <dd className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full overflow-hidden border border-gray-20">
              <img
                src={rfc.authorAvatar}
                alt={rfc.author}
                className="h-full w-full"
              />
            </div>
            <span className="text-sm font-medium text-foreground">{rfc.author}</span>
          </dd>
        </div>

        {rfc.reviewers.length > 0 && (
          <div>
            <dt className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-40">
              Reviewers
            </dt>
            <dd>
              <ProfilePictures
                users={rfc.reviewers.map((r) => ({
                  name: r.login,
                  avatar: r.avatar,
                }))}
              />
            </dd>
          </div>
        )}

        <div>
          <dt className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-40">
            Updated
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {new Date(rfc.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </dd>
        </div>

        <div>
          <dt className="mb-2 text-xs font-medium uppercase tracking-widest text-gray-40">
            Comments total
          </dt>
          <dd className="text-sm font-medium text-foreground">
            {rfc.commentCount}
          </dd>
        </div>
      </div>
    </div>
  );
}
