"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { openGitHubAuthPopup } from "@/lib/popup-auth";

/**
 * Banner CTA shown to anonymous viewers of public RFCs. The button funnels
 * curious readers into the onboarding flow – they can preview the form
 * before committing to GitHub login. Onboarding handles the actual sign-in
 * step in popup mode.
 */
export function AnonymousSignInCTA({
  variant = "card",
  message,
}: {
  variant?: "card" | "inline";
  message?: string;
}) {
  if (variant === "inline") {
    return (
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 text-xs text-gray-50 hover:text-foreground underline decoration-gray-30 underline-offset-2"
      >
        {message ?? "Get started with RFC123"}
      </Link>
    );
  }

  return (
    <div className="rounded-md border border-dashed border-gray-30 bg-gray-5 px-4 py-4 text-sm text-gray-70 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <span className="flex-1">
        {message ??
          "You're reading this RFC publicly. Try RFC123 on a repo of your own – no commitments, no full account setup just to look around."}
      </span>
      <Link
        href="/onboarding"
        className="inline-flex items-center justify-center rounded-md bg-foreground px-3.5 py-1.5 text-xs font-medium text-surface transition-opacity hover:opacity-85"
      >
        Get started
      </Link>
    </div>
  );
}

/**
 * Compact "Sign in with GitHub" button for the topbar slot on the anonymous
 * render path. Opens GitHub OAuth in a popup so the user doesn't lose the
 * page state; on successful auth we reload to pick up the new session.
 */
export function AnonymousSignInButton({
  label = "Sign in with GitHub",
}: {
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await openGitHubAuthPopup();
    if (result === "completed") {
      // Refresh so the page picks up the new session and re-renders as the
      // authenticated user (full editing/commenting affordances unlock).
      window.location.reload();
      return;
    }
    setBusy(false);
  }, [busy]);

  // Re-enable the button if the page is restored from bfcache after a fallback
  // full-page redirect (which can leave the button stuck in the busy state).
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) setBusy(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center justify-center rounded-md bg-foreground px-3.5 py-1.5 text-sm font-medium text-surface transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
    >
      {busy ? "Signing in…" : label}
    </button>
  );
}
