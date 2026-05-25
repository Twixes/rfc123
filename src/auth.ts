import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/** Pulls the GitHub OAuth token off the session if present. The token is
 *  grafted onto the session in the `session` callback below; NextAuth's stock
 *  Session type doesn't reflect that, hence the unchecked cast. Returns null
 *  when unauthenticated so route handlers can short-circuit cleanly. */
export function getAccessToken(session: unknown): string | null {
  const token = (session as { accessToken?: unknown } | null)?.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo read:org",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        // On a fresh sign-in we know we have a token + profile; persist the
        // user to Convex so the daily-briefing cron can use the token.
        // Best-effort – auth must never fail because Convex is down.
        const ghProfile = profile as
          | { id?: number; login?: string }
          | undefined;
        if (
          account.access_token &&
          ghProfile &&
          typeof ghProfile.id === "number" &&
          typeof ghProfile.login === "string"
        ) {
          try {
            const { api, convexClient, secretKey } = await import(
              "@/lib/convex"
            );
            const { encryptToken } = await import("@/lib/token-crypto");
            await convexClient().mutation(api.users.upsertFromGithub, {
              secret: secretKey(),
              githubUserId: ghProfile.id,
              githubLogin: ghProfile.login,
              // Convex only ever sees ciphertext. A Convex breach yields
              // unusable bytes without the separately-held TOKEN_ENCRYPTION_KEY.
              githubAccessToken: await encryptToken(account.access_token),
            });
          } catch (e) {
            console.error("[auth] Convex upsert failed:", e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).accessToken = token.accessToken;
      return session;
    },
    async redirect({ url, baseUrl }) {
      // If url is provided and is a relative path or belongs to the same origin, use it
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      if (url.startsWith(baseUrl)) {
        return url;
      }
      // Default to /rfcs if no valid callback URL
      return `${baseUrl}/rfcs`;
    },
  },
});
