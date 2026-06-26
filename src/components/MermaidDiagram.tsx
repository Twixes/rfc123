"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
}

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const mermaid = (await import("mermaid")).default;

      // Re-initialize each render so a theme switch re-themes the diagram.
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === "dark" ? "dark" : "neutral",
        fontFamily: "inherit",
      });

      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render diagram",
          );
          setSvg(null);
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart, resolvedTheme]);

  if (error) {
    return (
      <div className="my-4 border border-red-300 dark:border-red-900/50 rounded bg-red-50 dark:bg-red-950/40 p-4">
        <p className="text-sm text-red-600 dark:text-red-400">
          Mermaid rendering error: {error}
        </p>
        <pre className="mt-2 text-xs text-gray-50 whitespace-pre-wrap">
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 border border-gray-20 rounded bg-gray-5 p-4 text-sm text-gray-50">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 overflow-x-auto [&>svg]:max-w-full"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid renders SVG it generated from the diagram source, not arbitrary user HTML
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
