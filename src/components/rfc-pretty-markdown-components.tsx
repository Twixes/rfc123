// biome-ignore-all lint/a11y/useKeyWithClickEvents: line anchors use sidebar keyboard path
// biome-ignore-all lint/a11y/noStaticElementInteractions: markdown blocks are comment anchors
"use client";

import { createElement } from "react";
import type { Components } from "react-markdown";
import { ClickableImage } from "@/components/ClickableImage";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import {
  proxyMarkdownImageSrc,
  type RfcMarkdownImageAssets,
} from "@/lib/markdown-assets";
import {
  MARKDOWN_INLINE_CODE_CLASS,
  MARKDOWN_PRE_CLASS,
} from "@/lib/markdown-code";
import { extractMermaidChart } from "@/lib/markdown-mermaid";

export const PROSE_WRAPPER_CLASS =
  "prose prose-zinc max-w-none [&>*:first-child]:mt-0 [&>*:first-child]:pt-0 [&>*:last-child]:mb-0 [&>*:last-child]:pb-0";

const PRETTY_BLOCK_CLASSES = {
  h1: "mb-3 mt-4 py-2 border-b border-gray-20 text-4xl font-serif! font-normal! tracking-tight leading-tight text-foreground",
  h2: "mb-3 mt-3 py-2 border-b border-gray-20 text-3xl font-serif! font-normal! tracking-tight leading-tight text-foreground",
  h3: "mb-2 mt-4 text-xl font-sans! font-semibold! leading-snug text-foreground",
  p: "my-2",
  li: "text-gray-90 leading-relaxed",
  blockquote:
    "my-4 border-l-2 border-l-magenta bg-gray-5 py-2 pl-4 pr-4 italic text-gray-70",
  tr: "border-gray-20",
} as const;

type LineCommentTag = keyof Pick<
  typeof PRETTY_BLOCK_CLASSES,
  "h1" | "h2" | "h3" | "p" | "li" | "blockquote"
>;

export type RfcMarkdownLineProps = {
  "data-line-element"?: number;
  "data-line-end"?: number;
};

type MDProps<T extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<T> & RfcMarkdownLineProps & { node?: unknown };

type LineHandlers = {
  onLineClick: (line: number) => void;
  onMouseEnterLine: (line: number) => void;
  onMouseLeaveLine: () => void;
  lineHasComments: (line: number | undefined) => boolean;
  renderProfilePictures: (line: number | undefined) => React.ReactNode;
};

function lineAnchorClass(
  lineNumber: number | undefined,
  lineHasComments: (line: number | undefined) => boolean,
  base: string,
): string {
  return [
    base,
    "relative",
    lineNumber ? "cursor-pointer" : "",
    lineNumber && lineHasComments(lineNumber) ? "pr-8" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function LineCommentAnchors({
  lineNumber,
  children,
  handlers,
  profileCorner = "right-[3px] top-[3px]",
}: {
  lineNumber: number | undefined;
  children: React.ReactNode;
  handlers: LineHandlers;
  profileCorner?: string;
}) {
  return (
    <>
      {children}
      <span className={`absolute ${profileCorner}`}>
        {handlers.renderProfilePictures(lineNumber)}
      </span>
    </>
  );
}

function lineHandlersProps(
  lineNumber: number | undefined,
  handlers: LineHandlers,
): Pick<
  React.HTMLAttributes<HTMLElement>,
  "onClick" | "onMouseEnter" | "onMouseLeave"
> {
  return {
    onClick: () => lineNumber && handlers.onLineClick(lineNumber),
    onMouseEnter: () => lineNumber && handlers.onMouseEnterLine(lineNumber),
    onMouseLeave: handlers.onMouseLeaveLine,
  };
}

function lineCommentWrapper(
  tag: LineCommentTag,
  handlers: LineHandlers,
  profileCorner?: string,
) {
  const baseClass = PRETTY_BLOCK_CLASSES[tag];
  return ({ children, ...props }: MDProps<typeof tag>) => {
    const lineNumber = props["data-line-element"];
    return createElement(
      tag,
      {
        className: lineAnchorClass(
          lineNumber,
          handlers.lineHasComments,
          baseClass,
        ),
        ...lineHandlersProps(lineNumber, handlers),
        ...props,
      },
      <LineCommentAnchors
        lineNumber={lineNumber}
        handlers={handlers}
        profileCorner={profileCorner}
      >
        {children}
      </LineCommentAnchors>,
    );
  };
}

function lineInteractiveTr(handlers: LineHandlers) {
  return ({ children, ...props }: MDProps<"tr">) => {
    const lineNumber = props["data-line-element"];
    return (
      <tr
        className={lineAnchorClass(
          lineNumber,
          handlers.lineHasComments,
          PRETTY_BLOCK_CLASSES.tr,
        )}
        {...lineHandlersProps(lineNumber, handlers)}
        {...props}
      >
        {children}
      </tr>
    );
  };
}

function commentablePre(ctx: CommentableMarkdownContext) {
  const handlers = ctx;
  return ({ children, ...props }: MDProps<"pre">) => {
    const lineNumber = props["data-line-element"];
    const chart = extractMermaidChart(children);
    if (chart !== null) {
      return (
        <div
          className={`mermaid-block relative my-4 ${lineNumber ? "cursor-pointer" : ""}`}
          data-line-element={lineNumber}
          data-line-end={props["data-line-end"]}
          onClick={() => lineNumber && handlers.onLineClick(lineNumber)}
          onMouseEnter={() =>
            lineNumber && handlers.onMouseEnterLine(lineNumber)
          }
          onMouseLeave={handlers.onMouseLeaveLine}
        >
          {lineNumber && (
            <span
              data-line={lineNumber}
              style={{
                display: "inline",
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            />
          )}
          <MermaidDiagram chart={chart} />
          <span className="absolute right-2 top-2">
            {handlers.renderProfilePictures(lineNumber)}
          </span>
        </div>
      );
    }
    return (
      <pre
        className={`relative my-4 max-w-full whitespace-pre-wrap ${MARKDOWN_PRE_CLASS}`}
        onClick={(e) => {
          if (!lineNumber) return;
          handlers.onLineClick(
            ctx.findSourceLineFromPre(e.currentTarget, e.clientY, lineNumber),
          );
        }}
        onMouseOver={(e) => {
          if (!lineNumber) return;
          const line = ctx.findSourceLineFromPre(
            e.currentTarget,
            e.clientY,
            lineNumber,
          );
          if (line === ctx.lastHoverLineRef.current) return;
          ctx.lastHoverLineRef.current = line;
          handlers.onMouseEnterLine(line);
        }}
        onMouseLeave={() => {
          ctx.lastHoverLineRef.current = null;
          handlers.onMouseLeaveLine();
        }}
        {...props}
      >
        {children}
        <span className="absolute right-2 top-2">
          {handlers.renderProfilePictures(lineNumber)}
        </span>
      </pre>
    );
  };
}

export interface CommentableMarkdownContext extends LineHandlers {
  assets?: RfcMarkdownImageAssets;
  findSourceLineFromPre: (
    pre: HTMLElement,
    clientY: number,
    fallback: number,
  ) => number;
  lastHoverLineRef: React.MutableRefObject<number | null>;
}

export interface CreateRfcMarkdownComponentsOptions {
  assets?: RfcMarkdownImageAssets;
  commentable?: CommentableMarkdownContext;
}

/** Markdown component map for Pretty read/preview, optionally with line comments. */
export function createRfcMarkdownComponents(
  options: CreateRfcMarkdownComponentsOptions = {},
): Components {
  const assets = options.assets ?? options.commentable?.assets;
  const commentable = options.commentable;

  const components: Components = {
    h1: ({ children }) => (
      <h1 className={PRETTY_BLOCK_CLASSES.h1}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className={PRETTY_BLOCK_CLASSES.h2}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className={PRETTY_BLOCK_CLASSES.h3}>{children}</h3>
    ),
    p: ({ children }) => <p className={PRETTY_BLOCK_CLASSES.p}>{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-foreground underline decoration-cyan underline-offset-2 transition-all hover:decoration-foreground"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    hr: () => <hr className="my-6 border-0 border-t-2 border-gray-20" />,
    ul: ({ children }) => (
      <ul className="my-2 ml-6 list-disc space-y-0.5 text-gray-90">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 ml-6 list-decimal space-y-0.5 text-gray-90">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className={PRETTY_BLOCK_CLASSES.li}>{children}</li>
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className={MARKDOWN_INLINE_CODE_CLASS} {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      const chart = extractMermaidChart(children);
      if (chart !== null) {
        return (
          <div className="mermaid-block my-4">
            <MermaidDiagram chart={chart} />
          </div>
        );
      }
      return (
        <pre
          className={`my-4 max-w-full whitespace-pre-wrap ${MARKDOWN_PRE_CLASS}`}
        >
          {children}
        </pre>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className={PRETTY_BLOCK_CLASSES.blockquote}>
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="min-w-full border border-gray-20 rounded">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-gray-10">{children}</thead>,
    tbody: ({ children }) => (
      <tbody className="divide-y divide-gray-20 bg-surface">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className={PRETTY_BLOCK_CLASSES.tr}>{children}</tr>
    ),
    th: ({ children }) => (
      <th className="border border-gray-20 px-4 py-2 text-left text-sm font-medium text-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-20 px-4 py-2 text-sm text-gray-90">
        {children}
      </td>
    ),
    img: ({ src, alt, ...props }) => (
      <ClickableImage
        src={
          typeof src === "string"
            ? proxyMarkdownImageSrc(src, assets)
            : undefined
        }
        alt={(alt as string) ?? ""}
        {...props}
      />
    ),
  };

  if (!commentable) return components;

  const handlers = commentable;
  return {
    ...components,
    h1: lineCommentWrapper("h1", handlers),
    h2: lineCommentWrapper("h2", handlers),
    h3: lineCommentWrapper("h3", handlers),
    p: lineCommentWrapper("p", handlers),
    li: lineCommentWrapper("li", handlers),
    blockquote: lineCommentWrapper("blockquote", handlers, "right-2 top-2"),
    ul: ({ children, ...props }: MDProps<"ul">) => {
      const { "data-line-element": _line, ...rest } = props;
      return (
        <ul className="my-2 ml-6 list-disc space-y-0.5 text-gray-90" {...rest}>
          {children}
        </ul>
      );
    },
    ol: ({ children, ...props }: MDProps<"ol">) => {
      const { "data-line-element": _line, ...rest } = props;
      return (
        <ol
          className="my-2 ml-6 list-decimal space-y-0.5 text-gray-90"
          {...rest}
        >
          {children}
        </ol>
      );
    },
    pre: commentablePre(commentable),
    table: ({ children, ...props }: MDProps<"table">) => {
      const { "data-line-element": _line, ...rest } = props;
      return (
        <div className="my-4 overflow-x-auto">
          <table className="min-w-full border border-gray-20 rounded" {...rest}>
            {children}
          </table>
        </div>
      );
    },
    tr: lineInteractiveTr(handlers),
  };
}

/** @deprecated Use `createRfcMarkdownComponents({ assets })`. */
export function createRfcPrettyMarkdownComponents(
  assets?: RfcMarkdownImageAssets,
): Components {
  return createRfcMarkdownComponents({ assets });
}

/** @deprecated Use `createRfcMarkdownComponents({ commentable: ctx })`. */
export function createCommentableMarkdownComponents(
  ctx: CommentableMarkdownContext,
): Components {
  return createRfcMarkdownComponents({ assets: ctx.assets, commentable: ctx });
}
