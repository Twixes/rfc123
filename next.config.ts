import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Map GitHub-style PR URLs (/:owner/:repo/pull/:number) to our RFC routes
  // so people can swap github.com for rfc123.com and land on the right page.
  async redirects() {
    return [
      {
        source: "/:owner/:repo/pull/:number(\\d+)",
        destination: "/rfcs/:owner/:repo/:number",
        permanent: false,
      },
      {
        source: "/:owner/:repo/pull/:number(\\d+)/:rest*",
        destination: "/rfcs/:owner/:repo/:number",
        permanent: false,
      },
    ];
  },

  // Rewrites to support PostHog ingestion endpoints
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },

  // Required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

// Only upload source maps when a personal API key is present (i.e. on Vercel
// deploys). Local `pnpm build` runs are no-ops, which keeps dev unblocked.
export default process.env.POSTHOG_PERSONAL_API_KEY
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY,
      projectId: process.env.POSTHOG_PROJECT_ID ?? "",
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com",
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
