import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";
import { buildDiffDecorations } from "./codemirror-diff";

const PARA = [
  "We considered three options before settling on this approach.",
  "The first was to keep the existing pipeline and bolt a new stage on top of it.",
  "That would have been the fastest path but would have made the eventual rewrite much harder.",
  "The second was to start fresh from the data warehouse layer up to the agent surface.",
  "We decided against that because it required coordinating with two other teams and a separate review cycle.",
  "The third option, which we picked, splits the work into a backbone change plus opt-in adapters per consumer.",
].join(" ");

function makeDoc(paragraphs: number): string {
  const blocks: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    blocks.push(`## Section ${i}`);
    blocks.push(PARA);
    blocks.push(`A short closing remark for section ${i}.`);
  }
  return blocks.join("\n\n");
}

// 100 paragraphs ≈ a hefty RFC. Doc length is ~100k chars.
const PARAGRAPH_COUNT = 100;
const ORIGINAL = makeDoc(PARAGRAPH_COUNT);

function singleCharEdit(doc: string): string {
  const at = Math.floor(doc.length / 2);
  return `${doc.slice(0, at)}X${doc.slice(at)}`;
}
function singleWordSwap(doc: string): string {
  const at = doc.indexOf("pipeline", Math.floor(doc.length / 2));
  return at < 0
    ? doc
    : `${doc.slice(0, at)}PIPELINE${doc.slice(at + "pipeline".length)}`;
}
function paragraphRewrite(doc: string): string {
  const marker = `## Section ${Math.floor(PARAGRAPH_COUNT / 2)}\n\n`;
  const at = doc.indexOf(marker);
  if (at < 0) return doc;
  const bodyStart = at + marker.length;
  const bodyEnd = doc.indexOf("\n\n", bodyStart);
  const replacement = [
    "After more thought we landed somewhere different from the initial framing.",
    "The trigger was a conversation with the platform team about how their roadmap shifts the cost model.",
    "Under the new model the bolt-on stage is cheaper than starting fresh, by a wide margin.",
    "So we are reframing this as a staged migration rather than a green-field rewrite.",
    "Concretely: ship the bolt-on first, run both side by side for a sprint, then cut over once metrics agree.",
  ].join(" ");
  return doc.slice(0, bodyStart) + replacement + doc.slice(bodyEnd);
}
function scatteredEdits(doc: string): string {
  let out = doc;
  out = out.replace("Section 10\n", "Section TEN\n");
  out = out.replace("Section 30\n", "Section THIRTY\n");
  out = out.replace("Section 50\n", "Section FIFTY\n");
  out = out.replace("Section 70\n", "Section SEVENTY\n");
  out = out.replace("Section 90\n", "Section NINETY\n");
  return out;
}
function wholeDocRewrite(doc: string): string {
  return doc.split(" ").reverse().join(" ");
}

function measure(label: string, fn: () => unknown, iters: number) {
  for (let i = 0; i < Math.min(2, iters); i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? samples.at(-1) ?? 0;
  const min = samples[0];
  // Format as a single-line JSON record so consumers (humans + agents
  // comparing strategies) can parse without regex gymnastics.
  console.log(`[PERF] ${JSON.stringify({ label, median, p95, min, iters })}`);
}

describe(`buildDiffDecorations perf (doc=${ORIGINAL.length.toLocaleString()} chars, ${PARAGRAPH_COUNT} paragraphs)`, () => {
  it("measures realistic edit scenarios", () => {
    const cases: { name: string; current: string; iters: number }[] = [
      { name: "identical", current: ORIGINAL, iters: 10 },
      {
        name: "single-char insert",
        current: singleCharEdit(ORIGINAL),
        iters: 10,
      },
      {
        name: "single-word swap",
        current: singleWordSwap(ORIGINAL),
        iters: 10,
      },
      {
        name: "paragraph rewrite",
        current: paragraphRewrite(ORIGINAL),
        iters: 10,
      },
      {
        name: "5 scattered edits",
        current: scatteredEdits(ORIGINAL),
        iters: 5,
      },
      {
        name: "whole-doc rewrite",
        current: wholeDocRewrite(ORIGINAL),
        iters: 2,
      },
    ];
    for (const c of cases) {
      measure(c.name, () => buildDiffDecorations(ORIGINAL, c.current), c.iters);
    }
  }, 600_000);
});
