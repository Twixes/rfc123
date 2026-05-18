import Link from "next/link";
import type { ReactNode } from "react";
import AccountDropdown from "@/components/AccountDropdown";

interface RFCsTopBarProps {
  user?: { name?: string | null; image?: string | null } | null;
  /** Where the RFC123 logo links to. Defaults to `/rfcs`. */
  homeHref?: string;
  /** Optional content rendered below the logo (e.g. a repo selector). */
  subtitle?: ReactNode;
  /** Optional controls rendered to the left of the account dropdown. */
  actions?: ReactNode;
}

export default function RFCsTopBar({
  user,
  homeHref = "/rfcs",
  subtitle,
  actions,
}: RFCsTopBarProps) {
  const hasRight = actions || user;
  return (
    <header className="mb-8 flex flex-col sm:flex-row items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl sm:text-5xl font-serif font-normal text-foreground">
          <Link href={homeHref} className="hover:opacity-70 transition-opacity">
            RFC123
          </Link>
        </h1>
        {subtitle && <div className="mt-3">{subtitle}</div>}
      </div>
      {hasRight && (
        <div className="flex items-center gap-3">
          {actions}
          {user && <AccountDropdown user={user} />}
        </div>
      )}
    </header>
  );
}
