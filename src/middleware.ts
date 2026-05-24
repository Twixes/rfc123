import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!(req.auth as { accessToken?: string })?.accessToken;

  // Paths that require authentication
  const isProtectedPath =
    nextUrl.pathname.startsWith("/rfcs") ||
    nextUrl.pathname.startsWith("/onboarding");

  // Don't redirect if already on auth pages
  const isAuthPage = nextUrl.pathname.startsWith("/api/auth");

  if (isProtectedPath && !isAuthenticated && !isAuthPage) {
    // RFC detail pages (e.g. /rfcs/owner/repo/123/slug): show welcoming invite page first
    const segments = nextUrl.pathname.split("/").filter(Boolean);
    const isRFCDetail = segments[0] === "rfcs" && segments.length >= 4;

    if (isRFCDetail) {
      const inviteUrl = new URL("/invite", nextUrl.origin);
      inviteUrl.searchParams.set("callbackUrl", nextUrl.pathname);
      return NextResponse.redirect(inviteUrl);
    }

    // RFC list (/rfcs): redirect directly to signin
    const signInUrl = new URL("/api/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/rfcs/:path*", "/onboarding/:path*"],
};
