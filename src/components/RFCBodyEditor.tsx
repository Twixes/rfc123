"use client";

import { type ReactNode, useState } from "react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

export type RFCBodyEditorMode = "write" | "preview";

interface RFCBodyEditorProps {
  body: string;
  onBodyChange: (next: string) => void;
  /** Rendered to the left of the Write/Preview tabs in the card's header row.
   *  Used by /rfcs/new to host the title input inside the same border. Pass
   *  nothing when the surrounding page renders its own tab toggle. */
  headerSlot?: ReactNode;
  placeholder?: string;
  /** Default 24. */
  rows?: number;
  /** When provided, the editor becomes controlled by the parent and its
   *  internal Write/Preview tab buttons are hidden. The detail-page edit mode
   *  drives the mode from the page-level segmented toggle instead. */
  mode?: RFCBodyEditorMode;
  onModeChange?: (next: RFCBodyEditorMode) => void;
}

export function RFCBodyEditor({
  body,
  onBodyChange,
  headerSlot,
  placeholder = "Write your RFC in Markdown…",
  rows = 24,
  mode,
  onModeChange,
}: RFCBodyEditorProps) {
  const [internalTab, setInternalTab] = useState<RFCBodyEditorMode>("write");
  const isControlled = mode !== undefined;
  const activeTab = isControlled ? mode : internalTab;
  const setActiveTab = (next: RFCBodyEditorMode) => {
    if (isControlled) {
      onModeChange?.(next);
    } else {
      setInternalTab(next);
    }
  };

  const showInternalTabs = !isControlled;
  const showHeader = !!headerSlot || showInternalTabs;

  return (
    <div className="border border-gray-20 rounded-md bg-surface overflow-hidden focus-within:border-gray-30 transition-colors">
      {showHeader && (
        <div className="flex items-center gap-3 px-5 sm:px-6 pt-5 py-4 border-b border-gray-20">
          {headerSlot ? (
            <div className="flex-1 min-w-0">{headerSlot}</div>
          ) : (
            <div className="flex-1" />
          )}
          {showInternalTabs && (
            <div className="flex border border-gray-20 rounded-sm overflow-hidden text-xs shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("write")}
                className={`px-3 py-1 cursor-pointer transition-colors ${
                  activeTab === "write"
                    ? "bg-foreground text-surface"
                    : "bg-surface text-gray-70 hover:bg-gray-5"
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 cursor-pointer transition-colors border-l border-gray-20 ${
                  activeTab === "preview"
                    ? "bg-foreground text-surface"
                    : "bg-surface text-gray-70 hover:bg-gray-5"
                }`}
              >
                Preview
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab === "write" ? (
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          rows={rows}
          spellCheck
          placeholder={placeholder}
          className="block w-full bg-transparent px-5 sm:px-6 py-4 text-sm text-foreground placeholder-gray-50 focus:outline-none font-mono resize-y"
        />
      ) : (
        <div className="px-5 sm:px-6 py-4 min-h-[24rem]">
          {body.trim() ? (
            <MarkdownRenderer content={body} />
          ) : (
            <p className="text-sm text-gray-50">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
