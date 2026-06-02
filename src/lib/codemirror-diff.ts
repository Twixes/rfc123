import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { diffSentences } from "diff";

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

function buildDiffDecorations(
  original: string,
  current: string,
): DecorationSet {
  if (original === current) return Decoration.none;

  const chunks = diffSentences(original, current);
  const ranges: ReturnType<typeof addedMark.range>[] = [];
  let pos = 0;
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

/**
 * CodeMirror extension that overlays a sentence-level diff between
 * `original` and the live document. Added/changed sentences get a green
 * mark; removed sentences appear in place as inline strikethrough widgets
 * so the user can keep editing while seeing what changed.
 */
export function diffHighlight(original: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDiffDecorations(
          original,
          view.state.doc.toString(),
        );
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDiffDecorations(
            original,
            update.view.state.doc.toString(),
          );
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}
