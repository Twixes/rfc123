import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

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
        // Best-effort — auth must never fail because Convex is down.
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
            await convexClient().mutation(api.users.upsertFromGithub, {
              secret: secretKey(),
              githubUserId: ghProfile.id,
              githubLogin: ghProfile.login,
              githubAccessToken: account.access_token,
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
