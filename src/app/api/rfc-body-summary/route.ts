import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Generates the PR description from the RFC's markdown body. The format is
 * fixed; the LLM only fills in the bracketed sections. We post-process to
 * gracefully degrade if the model trims or omits a section.
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, rfcBody, rfcUrl } = (await request.json()) as {
    title?: string;
    rfcBody?: string;
    rfcUrl?: string;
  };

  if (!title?.trim() || !rfcBody?.trim()) {
    return NextResponse.json(
      { error: "title and rfcBody are required" },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    // Soft failure: return a minimal body without the AI summary so RFC
    // creation still works even when the OpenAI key is missing.
    return NextResponse.json({
      body: fallbackBody(title, rfcUrl),
      generated: false,
    });
  }

  try {
    const { text } = await generateText({
      model: openai("gpt-5.5-mini"),
      system:
        "You summarize engineering RFCs (Requests for Comments) into terse, factual GitHub PR descriptions. Never invent details that aren't in the RFC. Keep bullets to one sentence each.",
      prompt: `Summarize the following RFC titled "${title}" into three sections, exactly in this format:

TL_DR: <one-sentence summary of what the RFC proposes>

PROPOSES:
- <bullet>
- <bullet>
- <bullet>

OPEN_QUESTIONS:
- <bullet>
- <bullet>

If the RFC doesn't surface any explicit open questions, write "- None yet" under OPEN_QUESTIONS. Aim for 2–4 PROPOSES bullets and 0–3 OPEN_QUESTIONS bullets. Keep each bullet under 20 words.

RFC content:
"""
${rfcBody.slice(0, 8000)}
"""`,
    });

    const body = formatBody({
      raw: text,
      rfcUrl,
    });

    return NextResponse.json({ body, generated: true });
  } catch (error) {
    console.error("Error generating RFC summary:", error);
    return NextResponse.json({
      body: fallbackBody(title, rfcUrl),
      generated: false,
    });
  }
}

function formatBody({ raw, rfcUrl }: { raw: string; rfcUrl?: string }): string {
  const tldr = extractSection(raw, "TL_DR") ?? "";
  const proposes = extractBulletSection(raw, "PROPOSES");
  const openQuestions = extractBulletSection(raw, "OPEN_QUESTIONS");

  const proposesBlock = proposes.length
    ? proposes.map((b) => `- ${b}`).join("\n")
    : "- _Summary unavailable._";

  const openQuestionsBlock = openQuestions.length
    ? openQuestions.map((b) => `- ${b}`).join("\n")
    : "- None yet";

  const linkLine = rfcUrl
    ? `Read and comment inline on **[RFC123](${rfcUrl})**.`
    : "Read and comment inline on **RFC123**.";

  return `> ✨ Auto-generated summary

**TL;DR:** ${tldr || "_Summary unavailable._"}

**What this RFC proposes:**
${proposesBlock}

**Open questions to resolve:**
${openQuestionsBlock}

---

${linkLine}`;
}

function extractSection(raw: string, label: string): string | null {
  const re = new RegExp(`${label}:\\s*([^\\n]+)`, "i");
  const match = raw.match(re);
  return match ? match[1].trim() : null;
}

function extractBulletSection(raw: string, label: string): string[] {
  const re = new RegExp(`${label}:\\s*\\n([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`, "i");
  const match = raw.match(re);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0);
}

function fallbackBody(title: string, rfcUrl?: string): string {
  const linkLine = rfcUrl
    ? `Read and comment inline on **[RFC123](${rfcUrl})**.`
    : "Read and comment inline on **RFC123**.";
  return `**RFC:** ${title}

---

${linkLine}`;
}
