export interface DiffRange {
  baseSha: string;
  compareSha: string;
}

/** GitHub uses `<sha>...<sha>` for compare URLs; we mirror that as `?diff=`.
 *  Accepts 7-40 char hex so short permalinks work too. */
export const DIFF_PARAM = "diff";

const SHORT_SHA_LEN = 7;
const DIFF_RANGE_RE = /^([0-9a-f]{7,40})\.\.\.([0-9a-f]{7,40})$/i;

/** Truncate a commit SHA to the conventional short form. Shared so the picker,
 *  the URL serializer, and the content-cache key all stay consistent. */
export function shortSha(sha: string): string {
  return sha.slice(0, SHORT_SHA_LEN);
}

export function parseDiffRange(raw: string | null): DiffRange | null {
  if (!raw) return null;
  const m = raw.match(DIFF_RANGE_RE);
  return m ? { baseSha: m[1], compareSha: m[2] } : null;
}

export function formatDiffRange(range: DiffRange): string {
  return `${shortSha(range.baseSha)}...${shortSha(range.compareSha)}`;
}
