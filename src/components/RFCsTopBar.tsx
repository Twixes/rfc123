import Link from "next/link";
import type { ReactNode } from "react";
import AccountDropdown from "@/components/AccountDropdown";

interface RFCsTopBarProps {
  user?: { name?: string | null; image?: string | null } | null;
  /** Where the RFC123 logo links to. Defaults to `/rfcs`. */
  homeHref?: string;
  /** Optional content rendered below the logo (e.g. a repo selector). */
  subtitle?: ReactNode;
  /** Right-aligned on mobile row 2; action cluster on desktop. */
  secondaryActions?: ReactNode;
  /** Primary CTA on mobile row 1; action cluster on desktop. */
  primaryActions?: ReactNode;
}

export default function RFCsTopBar({
  user,
  homeHref = "/rfcs",
  subtitle,
  secondaryActions,
  primaryActions,
}: RFCsTopBarProps) {
  return (
    <header className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="mb-0 font-serif text-5xl font-normal text-foreground">
            <Link
              href={homeHref}
              className="hover:opacity-70 transition-opacity"
            >
              RFC123
            </Link>
          </h1>
          {(primaryActions || user) && (
            <div className="flex items-center gap-2 sm:hidden">
              {user && <AccountDropdown user={user} />}
              {primaryActions}
            </div>
          )}
        </div>
        {subtitle && <div className="mt-3">{subtitle}</div>}
      </div>
      {(secondaryActions || primaryActions || user) && (
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {secondaryActions}
          {primaryActions && (
            <span className="hidden sm:contents">{primaryActions}</span>
          )}
          {user && (
            <span className="hidden sm:contents">
              <AccountDropdown user={user} />
            </span>
          )}
        </div>
      )}
    </header>
  );
}
