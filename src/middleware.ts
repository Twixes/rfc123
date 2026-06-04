import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Edge-safe auth wrapper. Must NOT import from `@/auth` – that pulls in the
// full `jwt` callback (Convex + token encryption), which drags `node:crypto`
// into the Edge bundle and breaks deployment.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!(req.auth as { accessToken?: string })?.accessToken;

  // /onboarding is intentionally NOT protected: anonymous visitors can
  // preview the create-repo form and only get bumped to OAuth (in a popup)
  // when they hit submit.
  const isProtectedPath = nextUrl.pathname.startsWith("/rfcs");

  // Don't redirect if already on auth pages
  const isAuthPage = nextUrl.pathname.startsWith("/api/auth");

  if (isProtectedPath && !isAuthenticated && !isAuthPage) {
    // RFC detail and repo-list pages (e.g. /rfcs/owner/repo and
    // /rfcs/owner/repo/123/slug) are let through so the page server
    // component can decide: render the read-only public view when the target
    // repo is public (landing-page showcase clicks), or redirect to /invite
    // when it isn't. Doing the visibility probe in middleware would add a
    // GitHub round-trip to every request on this path.
    const segments = nextUrl.pathname.split("/").filter(Boolean);
    const isRepoScoped = segments[0] === "rfcs" && segments.length >= 3;
    if (isRepoScoped) return NextResponse.next();

    // RFC list (/rfcs): redirect directly to signin
    const signInUrl = new URL("/api/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/rfcs/:path*"],
};
