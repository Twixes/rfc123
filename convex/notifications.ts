import { internalAction } from "./_generated/server";

/**
 * Hourly trigger. We delegate all real work (GitHub + Slack + cache) to the
 * Next.js `/api/internal/run-briefing` endpoint, because that's where the
 * Octokit, Upstash cache, and PR-fetching logic already live. Convex is the
 * data store and the scheduler – this action is just a kick.
 */
export const runHourlyBriefing = internalAction({
  args: {},
  handler: async () => {
    const baseUrl = process.env.NEXTAUTH_URL;
    const secret = process.env.SECRET_KEY;
    if (!baseUrl || !secret) {
      throw new Error("NEXTAUTH_URL and SECRET_KEY must be set on Convex.");
    }
    const res = await fetch(`${baseUrl}/api/internal/run-briefing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `run-briefing returned ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    return null;
  },
});

// To run on demand for testing:
//   npx convex run notifications:runHourlyBriefing
