import ConnectAgentButton from "@/components/ConnectAgentButton";
import { MarketingButtonLink } from "@/components/MarketingButton";

/** Build the "Start an RFC" URL, prefilled with a repo when one is known so
 *  authoring in the same repo is one click. */
export function newRfcHref(repo?: { owner: string; name: string } | null) {
  if (!repo) return "/rfcs/new";
  return `/rfcs/new?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.name)}`;
}

export function NewRfcPlusIcon({
  className = "w-4 h-4",
}: {
  className?: string;
}) {
  return (
    <svg
      className={className}
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
  );
}

export function RFCsTopBarSecondaryActions() {
  return <ConnectAgentButton variant="secondary" label="Connect agent" />;
}

export function RFCsTopBarPrimaryAction({
  repo,
}: {
  repo?: { owner: string; name: string } | null;
}) {
  return (
    <MarketingButtonLink href={newRfcHref(repo)} variant="primary">
      <NewRfcPlusIcon />
      New RFC
    </MarketingButtonLink>
  );
}
