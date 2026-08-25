import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Edge-safe slice of the NextAuth config. The middleware imports this (not
 * the full `@/auth`) so its bundle stays clear of node-only modules like
 * `node:crypto`, which sneak in via the full `jwt` callback's dynamic imports
 * (`@/lib/convex` → octokit, `@/lib/token-crypto` → jose's node entry).
 *
 * Anything that runs in the Edge runtime must live here. Anything that needs
 * Node APIs (Convex mutations, token encryption) lives in `auth.ts` and only
 * runs from non-edge contexts (sign-in, server actions, API routes).
 */
export default {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      // GitHub turned on RFC 9207, so its callback now carries
      // `iss=https://github.com/login/oauth`. Auth.js only defaults the issuer
      // to the `https://authjs.dev` placeholder, so oauth4webapi rejects the
      // mismatch and every login dies as `/api/auth/error?error=Configuration`.
      // @auth/core 0.41.3 sets this itself, but next-auth 5.0.0-beta.29 pins
      // @auth/core 0.40.0, so we set it here.
      issuer: "https://github.com/login/oauth",
      authorization: {
        params: {
          scope: "read:user user:email repo read:org",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      (session as { accessToken?: unknown }).accessToken = token.accessToken;
      (session as { githubLogin?: unknown }).githubLogin = token.githubLogin;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return `${baseUrl}/rfcs`;
    },
  },
} satisfies NextAuthConfig;
