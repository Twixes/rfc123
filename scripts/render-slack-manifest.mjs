#!/usr/bin/env node
// Render slack-app-manifest.template.json and print it to stdout. Paste the
// output into "Create app from manifest" on https://api.slack.com/apps.
//
// Usage:
//   NEXTAUTH_URL=https://rfc.example.com node scripts/render-slack-manifest.mjs
//   node --env-file=.env.local scripts/render-slack-manifest.mjs
//
// To register multiple redirect URLs (e.g. prod + a local ngrok tunnel), edit
// the rendered output by hand before pasting it into Slack.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = resolve(here, "..", "slack-app-manifest.template.json");

const nextAuthUrl = process.env.NEXTAUTH_URL;
if (!nextAuthUrl) {
  console.error("NEXTAUTH_URL is not set. Either export it or run with");
  console.error("  node --env-file=.env.local scripts/render-slack-manifest.mjs");
  process.exit(1);
}

if (!/^https?:\/\//.test(nextAuthUrl)) {
  console.error(`NEXTAUTH_URL must start with http:// or https://, got: ${nextAuthUrl}`);
  process.exit(1);
}

const trimmed = nextAuthUrl.replace(/\/+$/, "");
const template = await readFile(templatePath, "utf8");
const rendered = template.replaceAll("${NEXTAUTH_URL}", trimmed);

process.stdout.write(rendered);
