/**
 * Per-repo RFC convention, persisted as `.rfc123.json` at the repo root.
 *
 * The file only stores `layout`. Everything else is derivable: `directory`
 * comes from where `.rfc123.json` lives (or the legacy heuristic), and the
 * team set is just the top-level directories in the repo. Persisting either
 * would create drift the moment someone added a team via a normal RFC.
 *
 * Kept pure (no Octokit, no Node-only deps) so the client bundle can import
 * the path helpers without dragging the GitHub SDK along.
 */

export type RfcLayout = "flat" | "multi-directory";

export interface RfcConfig {
  layout: RfcLayout;
  /** Where RFCs live in the repo. Resolved at load time, not persisted. */
  directory: string;
}

export const RFC_CONFIG_PATH = ".rfc123.json";

/** Mirrors GitHub's accepted repo name surface. Shared by the onboarding form
 *  and the create/check-name API routes so all three agree. */
export const VALID_GITHUB_REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
export const VALID_RFC_TEAM_NAME = /^[A-Za-z0-9._-]{1,40}$/;

export function defaultRfcConfig(
  overrides: Partial<RfcConfig> = {},
): RfcConfig {
  return {
    layout: "flat",
    directory: "",
    ...overrides,
  };
}

/** What we write to `.rfc123.json` – just the layout. */
export function serializeRfcConfig(config: RfcConfig): string {
  return `${JSON.stringify({ layout: config.layout }, null, 2)}\n`;
}

export function parseRfcConfig(raw: string): RfcConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultRfcConfig();
  }
  if (!parsed || typeof parsed !== "object") return defaultRfcConfig();
  const obj = parsed as Record<string, unknown>;
  const layout: RfcLayout =
    obj.layout === "multi-directory" ? "multi-directory" : "flat";
  return { layout, directory: "" };
}

/** Compose the full repo-relative path for a new RFC file. */
export function rfcFilePath(
  config: RfcConfig,
  opts: { team?: string | null; slug: string; date: string },
): string {
  const teamSegment = config.layout === "multi-directory" ? opts.team : null;
  const filename = `${opts.date}-${opts.slug}.md`;
  const segments = [config.directory, teamSegment, filename].filter(
    (s): s is string => !!s && s.length > 0,
  );
  return segments.join("/");
}

/** YYYY-MM-DD in UTC; used as the date prefix on new RFC filenames. */
export function todayYmd(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
