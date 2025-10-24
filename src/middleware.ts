import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthenticated = !!(req.auth as { accessToken?: string })?.accessToken;

  // Paths that require authentication
  const isProtectedPath = nextUrl.pathname.startsWith("/rfcs");

  // Don't redirect if already on auth pages
  const isAuthPage = nextUrl.pathname.startsWith("/api/auth");

  if (isProtectedPath && !isAuthenticated && !isAuthPage) {
    // Redirect to signin with the current path as callbackUrl
    const signInUrl = new URL("/api/auth/signin", nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/rfcs/:path*"],
};
