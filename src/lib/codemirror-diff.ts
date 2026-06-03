import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { diffArrays, diffWordsWithSpace } from "diff";

class RemovedTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: RemovedTextWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-diff-removed";
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

const addedMark = Decoration.mark({ class: "cm-diff-added" });

/**
 * Find the length of the common character prefix and suffix shared by two
 * strings. Used to shrink the diff input — for an RFC where the user is
 * editing one paragraph of a thousand-line doc, the trimmed middle is tiny.
 */
export function commonAffixes(
  a: string,
  b: string,
): { prefix: number; suffix: number } {
  const minLen = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < minLen && a.charCodeAt(prefix) === b.charCodeAt(prefix)) {
    prefix++;
  }
  let suffix = 0;
  const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
  while (
    suffix < maxSuffix &&
    a.charCodeAt(a.length - 1 - suffix) === b.charCodeAt(b.length - 1 - suffix)
  ) {
    suffix++;
  }
  return { prefix, suffix };
}

type DiffChunk = { added?: boolean; removed?: boolean; value: string };

/** Longest common chunk that an edit storm is allowed to swallow before
 *  the storm is forced to end. Anything longer is treated as real shared
 *  structure (multiple words the user kept on purpose). */
const MAX_ABSORBABLE_COMMON = 24;

function isHardBoundary(text: string): boolean {
  // Paragraph breaks and sentence-ending punctuation followed by whitespace
  // mark semantic divides we don't want to swallow even if they're short —
  // collapsing across them would smear two unrelated rewrites together.
  return text.includes("\n\n") || /[.!?]\s/.test(text);
}

/**
 * Coalesce dense alternating add/remove runs from `diffWordsWithSpace`
 * into one removed + one added pair. Without this, rewriting a paragraph
 * where the user happens to keep "the", "and", or just spaces produces a
 * red/green word salad. With this, the whole run renders as one widget
 * (old text, strikethrough) followed by one green span (new text).
 *
 * Long common chunks (> MAX_ABSORBABLE_COMMON) and chunks that contain a
 * sentence-ending or paragraph break always split runs.
 */
export function collapseRuns(chunks: ReadonlyArray<DiffChunk>): DiffChunk[] {
  // Precompute the last index that contains an edit. Lets the inner loop
  // tell in O(1) whether a common chunk it's considering absorbing has
  // any more edits ahead — otherwise it's a trailing context chunk and
  // should be emitted as-is rather than swallowed into the widget.
  let lastEditIdx = -1;
  for (let j = chunks.length - 1; j >= 0; j--) {
    if (chunks[j].added || chunks[j].removed) {
      lastEditIdx = j;
      break;
    }
  }

  const out: DiffChunk[] = [];
  let i = 0;
  while (i < chunks.length) {
    const chunk = chunks[i];
    if (!chunk.added && !chunk.removed) {
      out.push(chunk);
      i++;
      continue;
    }
    let removed = "";
    let added = "";
    while (i < chunks.length) {
      const c = chunks[i];
      if (c.added) {
        added += c.value;
        i++;
      } else if (c.removed) {
        removed += c.value;
        i++;
      } else {
        const moreEditsAhead = i < lastEditIdx;
        if (
          !moreEditsAhead ||
          c.value.length > MAX_ABSORBABLE_COMMON ||
          isHardBoundary(c.value)
        ) {
          break;
        }
        removed += c.value;
        added += c.value;
        i++;
      }
    }
    if (removed) out.push({ removed: true, value: removed });
    if (added) out.push({ added: true, value: added });
  }
  return out;
}

/** Bail out of jsdiff's O(n·d) word-level Myers once the edit distance gets
 *  this big. Used as a safety net per paragraph cluster (see
 *  `diffByParagraph`) so pathological single-paragraph rewrites can't pin
 *  the editor. */
const MAX_EDIT_LENGTH = 1500;

/** Split by `\n\n` while preserving the separator on every token but the
 *  last, so `tokens.join("") === input`. That invariant keeps decoration
 *  positions byte-accurate after the paragraph-level diff round-trips. */
function splitParagraphs(s: string): string[] {
  if (s === "") return [];
  const parts = s.split("\n\n");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(`${parts[i]}\n\n`);
  }
  out.push(parts[parts.length - 1]);
  return out;
}

/** Word-level diff with the maxEditLength safety net. On bailout (a single
 *  paragraph rewritten past 1500 edits) emit one removed + one added — at
 *  paragraph scope this is the right visual story anyway. */
function wordDiffBounded(a: string, b: string): DiffChunk[] {
  const chunks = diffWordsWithSpace(a, b, {
    maxEditLength: MAX_EDIT_LENGTH,
  }) as DiffChunk[] | undefined;
  if (chunks != null) return chunks;
  const out: DiffChunk[] = [];
  if (a) out.push({ removed: true, value: a });
  if (b) out.push({ added: true, value: b });
  return out;
}

/**
 * Paragraph-aware diff. Splits both sides by `\n\n` and runs `diffArrays`
 * on the paragraph token arrays first. Unchanged paragraph runs cost
 * nothing — they're emitted verbatim as one common chunk. Each
 * removed+added paragraph cluster is then handed to `wordDiffBounded` so
 * we only pay word-level Myers on the paragraphs the user actually
 * rewrote, not the whole doc. Crucially, single-character changes inside
 * one paragraph stay precise even when the user has accumulated lots of
 * other edits elsewhere — each paragraph is diffed independently.
 */
function diffByParagraph(original: string, current: string): DiffChunk[] {
  if (original === "") {
    return current === "" ? [] : [{ added: true, value: current }];
  }
  if (current === "") return [{ removed: true, value: original }];

  const origParas = splitParagraphs(original);
  const currParas = splitParagraphs(current);

  // Single-paragraph on both sides — no benefit from paragraph splitting.
  if (origParas.length <= 1 && currParas.length <= 1) {
    return wordDiffBounded(original, current);
  }

  const arrChunks = diffArrays(origParas, currParas) as Array<{
    added?: boolean;
    removed?: boolean;
    value: string[];
  }>;

  const out: DiffChunk[] = [];
  for (let i = 0; i < arrChunks.length; i++) {
    const c = arrChunks[i];
    if (!c.added && !c.removed) {
      const joined = c.value.join("");
      if (joined) out.push({ value: joined });
      continue;
    }
    let removedJoined = "";
    let addedJoined = "";
    if (c.removed) {
      removedJoined = c.value.join("");
      const next = arrChunks[i + 1];
      if (next?.added) {
        addedJoined = next.value.join("");
        i++;
      }
    } else {
      addedJoined = c.value.join("");
    }

    if (removedJoined && addedJoined) {
      for (const wc of wordDiffBounded(removedJoined, addedJoined))
        out.push(wc);
    } else if (removedJoined) {
      out.push({ removed: true, value: removedJoined });
    } else if (addedJoined) {
      out.push({ added: true, value: addedJoined });
    }
  }
  return out;
}

export function buildDiffDecorations(
  original: string,
  current: string,
): DecorationSet {
  if (original === current) return Decoration.none;

  const { prefix, suffix } = commonAffixes(original, current);
  const originalMid = original.slice(prefix, original.length - suffix);
  const currentMid = current.slice(prefix, current.length - suffix);
  if (originalMid === "" && currentMid === "") return Decoration.none;

  const chunks = collapseRuns(diffByParagraph(originalMid, currentMid));
  const ranges: ReturnType<typeof addedMark.range>[] = [];
  let pos = prefix;
  let pendingRemoved = "";

  const flushPendingRemoved = () => {
    if (!pendingRemoved) return;
    ranges.push(
      Decoration.widget({
        widget: new RemovedTextWidget(pendingRemoved),
        side: -1,
      }).range(pos),
    );
    pendingRemoved = "";
  };

  for (const chunk of chunks) {
    if (chunk.added) {
      flushPendingRemoved();
      const end = pos + chunk.value.length;
      ranges.push(addedMark.range(pos, end));
      pos = end;
    } else if (chunk.removed) {
      pendingRemoved += chunk.value;
    } else {
      flushPendingRemoved();
      pos += chunk.value.length;
    }
  }
  flushPendingRemoved();
  return Decoration.set(ranges, true);
}

const DEBOUNCE_MS = 500;

/**
 * CodeMirror extension that overlays a word-level diff between `original`
 * and the live document. Added/changed word ranges get a green mark;
 * removed text appears in place as inline strikethrough widgets so the
 * user can keep editing while seeing what changed.
 *
 * The raw word diff is run through `collapseRuns` so that paragraph
 * rewrites — which would otherwise render as alternating red/green word
 * fragments — show up as a single widget + single green span. Hard
 * boundaries (sentence ends, paragraph breaks) and long common stretches
 * still split runs.
 *
 * Recompute is debounced and skips the common character prefix/suffix, so
 * typing in a large RFC doesn't run a full-doc diff per keystroke.
 */
export function diffHighlight(original: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      private timer: ReturnType<typeof setTimeout> | null = null;
      private readonly view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
        this.scheduleRecompute(0);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) this.scheduleRecompute(DEBOUNCE_MS);
      }

      destroy() {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      }

      private scheduleRecompute(delay: number) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.decorations = buildDiffDecorations(
            original,
            this.view.state.doc.toString(),
          );
          // Nudge the view to re-read `decorations`. An empty transaction
          // does not re-enter our update branch (docChanged is false), so
          // this can't loop.
          this.view.dispatch({});
        }, delay);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
