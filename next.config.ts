import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

// Rewrite to the assets host matching NEXT_PUBLIC_POSTHOG_HOST so a US
// self-hoster doesn't silently proxy through eu.i.posthog.com.
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = POSTHOG_HOST.startsWith("https://eu.")
  ? "https://eu-assets.i.posthog.com"
  : "https://us-assets.i.posthog.com";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Required for the Docker image: emits a self-contained `.next/standalone`
  // bundle that runs without node_modules in the runtime layer.
  output: "standalone",

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
        destination: `${POSTHOG_ASSETS_HOST}/static/:path*`,
      },
      {
        source: "/ingest/array/:path*",
        destination: `${POSTHOG_ASSETS_HOST}/array/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${POSTHOG_HOST}/:path*`,
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
      host: POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
