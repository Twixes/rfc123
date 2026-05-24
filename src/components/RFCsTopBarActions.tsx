import Link from "next/link";
import ConnectAgentButton from "@/components/ConnectAgentButton";

/** Build the "Start an RFC" URL, prefilled with a repo when one is known so
 *  authoring in the same repo is one click. */
export function newRfcHref(repo?: { owner: string; name: string } | null) {
  if (!repo) return "/rfcs/new";
  return `/rfcs/new?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`;
}

interface RFCsTopBarActionsProps {
  repo?: { owner: string; name: string } | null;
}

export default function RFCsTopBarActions({
  repo,
}: RFCsTopBarActionsProps = {}) {
  return (
    <>
      <ConnectAgentButton variant="secondary" label="Connect agent" />
      <Link
        href={newRfcHref(repo)}
        className="rounded-md bg-foreground px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium text-surface transition-all hover:opacity-80 cursor-pointer flex items-center gap-1.5"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <title>New</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        New RFC
      </Link>
    </>
  );
}
