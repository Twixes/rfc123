import { readFileSync } from "node:fs";
import path from "node:path";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import MarketingDocPage from "@/components/MarketingDocPage";

export const metadata = { title: "Manifesto" };

const manifestoMarkdown = readFileSync(
  path.join(process.cwd(), "src/content/manifesto.md"),
  "utf8",
);

export default function ManifestoPage() {
  return (
    <MarketingDocPage eyebrow="Product" title="Manifesto">
      <article className="text-[17px] leading-[1.7] text-gray-90">
        <MarkdownRenderer content={manifestoMarkdown} />

        <div className="flex flex-col items-end pr-4 mt-6">
          <p
            className="font-serif italic text-foreground"
            style={{
              fontSize: "2.25rem",
              lineHeight: 1,
              letterSpacing: "-0.04em",
              transform: "skewX(-8deg) rotate(-3deg)",
              transformOrigin: "right center",
              display: "inline-block",
            }}
          >
            Michael Matloka
          </p>
          <p className="mt-5 border-t border-gray-30 pt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-gray-50">
            Creator of RFC123
          </p>
        </div>
      </article>
    </MarketingDocPage>
  );
}
