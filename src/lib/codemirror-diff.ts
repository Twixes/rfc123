import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { diffWordsWithSpace } from "diff";

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

function buildDiffDecorations(
  original: string,
  current: string,
): DecorationSet {
  if (original === current) return Decoration.none;

  const { prefix, suffix } = commonAffixes(original, current);
  const originalMid = original.slice(prefix, original.length - suffix);
  const currentMid = current.slice(prefix, current.length - suffix);
  if (originalMid === "" && currentMid === "") return Decoration.none;

  const chunks = diffWordsWithSpace(originalMid, currentMid);
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

const DEBOUNCE_MS = 200;

/**
 * CodeMirror extension that overlays a word-level diff between `original`
 * and the live document. Added/changed word ranges get a green mark;
 * removed text appears in place as inline strikethrough widgets so the
 * user can keep editing while seeing what changed.
 *
 * Why word-level instead of sentence-level: jsdiff's sentence tokenizer
 * requires `[.!?]` followed by whitespace to break a sentence, so a
 * half-typed token like "dddd" glues onto the next real sentence into one
 * giant token. The diff then reports the whole "dddd + next sentence" as
 * added and the original sentence as removed — even though only "dddd"
 * actually changed. Word tokens don't have this failure mode.
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
