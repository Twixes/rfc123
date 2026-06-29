import type { LineDiffEntry } from "@/lib/line-diff";
import { type RfcMarkdownAssets, RfcPrettyMarkdown } from "./RfcPrettyMarkdown";

interface RfcPrettyDiffViewProps {
  entries: LineDiffEntry[];
  assets: RfcMarkdownAssets;
  /** Override for the "no changes" state. Edit Preview prefers "matches the
   *  saved revision" wording; View mode uses the default. */
  noChangesMessage?: string;
}

/** Block-level diff over rendered markdown. Consecutive lines of the same
 *  kind are grouped and rendered like the Pretty view, with red + strikethrough
 *  for removed blocks and a green hairline for added blocks. */
export function RfcPrettyDiffView({
  entries,
  assets,
  noChangesMessage = "No changes between these revisions.",
}: RfcPrettyDiffViewProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-50">No diff to show yet.</p>;
  }
  if (entries.every((e) => e.kind === "context")) {
    return <p className="text-sm text-gray-50">{noChangesMessage}</p>;
  }
  const blocks: { kind: LineDiffEntry["kind"]; text: string }[] = [];
  for (const entry of entries) {
    const last = blocks[blocks.length - 1];
    if (last && last.kind === entry.kind) {
      last.text += `\n${entry.text}`;
    } else {
      blocks.push({ kind: entry.kind, text: entry.text });
    }
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, idx) => {
        if (block.kind === "context") {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff blocks have no stable identity; the list re-renders on every edit
            <div key={idx}>
              <RfcPrettyMarkdown content={block.text} assets={assets} />
            </div>
          );
        }
        const isAdded = block.kind === "added";
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: diff blocks have no stable identity; the list re-renders on every edit
            key={idx}
            className={`relative rounded-sm pl-3 pr-2 py-1 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 ${
              isAdded
                ? "bg-green-50 dark:bg-green-950/40 before:bg-green-400 dark:before:bg-green-500"
                : "bg-red-50 dark:bg-red-950/40 line-through decoration-red-400/70 [&_*]:decoration-red-400/70 before:bg-red-400 dark:before:bg-red-500"
            }`}
          >
            <span
              aria-hidden
              className={`absolute right-2 top-1 font-mono text-[10px] uppercase tracking-[0.12em] no-underline ${
                isAdded
                  ? "text-green-700 dark:text-green-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {isAdded ? "Added" : "Removed"}
            </span>
            <RfcPrettyMarkdown content={block.text} assets={assets} />
          </div>
        );
      })}
    </div>
  );
}

interface RfcMonoDiffViewProps {
  entries: LineDiffEntry[];
}

/** Monospace, git-style line diff. Mirrors the CodeMirror editor's font and
 *  line height so this can also be embedded inside the Write tab. */
export function RfcMonoDiffView({ entries }: RfcMonoDiffViewProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-50 px-6 py-5">No diff to show yet.</p>
    );
  }
  if (entries.every((e) => e.kind === "context")) {
    return (
      <p className="text-sm text-gray-50 px-6 py-5">
        No changes between these revisions.
      </p>
    );
  }
  let beforeLine = 0;
  let afterLine = 0;
  const rows = entries.map((entry) => {
    if (entry.kind === "context") {
      beforeLine++;
      afterLine++;
      return {
        kind: entry.kind,
        text: entry.text,
        before: beforeLine,
        after: afterLine,
      };
    }
    if (entry.kind === "removed") {
      beforeLine++;
      return {
        kind: entry.kind,
        text: entry.text,
        before: beforeLine,
        after: null,
      };
    }
    afterLine++;
    return {
      kind: entry.kind,
      text: entry.text,
      before: null,
      after: afterLine,
    };
  });
  return (
    <div className="font-mono text-sm leading-relaxed text-gray-90 py-5">
      {rows.map((row, idx) => {
        const bg =
          row.kind === "added"
            ? "bg-green-50 dark:bg-green-950/40"
            : row.kind === "removed"
              ? "bg-red-50 dark:bg-red-950/40"
              : "";
        const accent =
          row.kind === "added"
            ? "text-green-700 dark:text-green-400"
            : row.kind === "removed"
              ? "text-red-700 dark:text-red-400"
              : "text-gray-40";
        const symbol =
          row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: diff rows have no stable identity; the list re-renders on every edit
            key={idx}
            className={`flex whitespace-pre-wrap break-words ${bg}`}
          >
            <span className="select-none w-8 shrink-0 pr-1 text-right text-xs text-gray-40 tabular-nums leading-relaxed">
              {row.before ?? ""}
            </span>
            <span className="select-none w-8 shrink-0 pr-2 text-right text-xs text-gray-40 tabular-nums leading-relaxed">
              {row.after ?? ""}
            </span>
            <span
              className={`select-none w-4 shrink-0 text-center ${accent}`}
              aria-hidden
            >
              {symbol}
            </span>
            <span className="flex-1 min-w-0 pr-6">{row.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}
