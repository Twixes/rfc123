"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Dialog,
  DialogBackdrop,
  DialogPanel,
} from "@headlessui/react";
import { useCallback, useMemo, useState } from "react";
import { ConnectAgentSetup } from "@/components/ConnectAgentButton";

interface DiscussWithAgentButtonProps {
  owner: string;
  repo: string;
  prNumber: number;
  title: string;
  author: string;
}

/**
 * Build the per-RFC copy-paste prompt. Assumes the user has the RFC123 MCP
 * server connected to their agent, but NOT that they have the rfc123-skills
 * plugin installed — so we inline everything the agent needs to know.
 *
 * Mirrors the canonical `discuss-rfc` skill in `skills/discuss-rfc/SKILL.md`.
 */
function buildPrompt({
  owner,
  repo,
  prNumber,
  title,
  author,
}: DiscussWithAgentButtonProps): string {
  return `You have access to the RFC123 MCP server, which lets you read and discuss engineering RFCs (markdown pull requests) on GitHub.

I'd like your help thinking through this RFC with me:

- Repo: ${owner}/${repo}
- Number: #${prNumber}
- Title: ${title}
- Author: ${author}

Please do the following in order:

1. **Read the proposal and its discussion.**
   - Call \`rfc123_get_rfc\` with owner="${owner}", repo="${repo}", number=${prNumber} to get the body, metadata, and reviewers.
   - Call \`rfc123_get_rfc_comments\` to get the general discussion.
   - Call \`rfc123_list_review_threads\` to see inline threads, who started each, and which are still unresolved.
   Skim all three before forming an opinion.

2. **Ground the conversation in the codebase.** If this RFC proposes changes to code, locate the relevant files / modules / APIs in this repo (or any repos the proposal touches). Read enough to know the *current* state, not just the proposed state. If the RFC is non-code (process, policy, organizational), skip this step.

3. **Compare proposal vs reality and list gaps.** Be specific:
   - Files / modules / APIs the proposal omits but would have to change
   - Edge cases the author didn't address
   - Claims in the proposal that the code contradicts
   - Work already done that the proposal can be tightened around
   - Things that are harder than the proposal implies, given current structure
   - Existing inline threads that already raise (or contradict) any of the above

4. **Hand the conversation back to me.** Don't summarize the RFC at length — I'm reading it. Ask what I want to focus on: push back, brainstorm alternatives, dig into a section, or understand something specific. Whenever you need a choice or clarification from me — here or anywhere later in the conversation — prefer your structured question-asking tool (e.g. \`AskUserQuestion\` in Claude Code) over a plain prose question, so I can answer with one click. Use free-text questions only if no such tool is available.

5. **Post only when I explicitly ask.** When I say "comment this", "reply to that thread", or similar, use the matching \`rfc123_*\` tool (post_general_comment, post_inline_comment, reply_to_comment, submit_review). RFC123 appends a "— via Claude on RFC123" footer automatically; don't add it yourself. Don't post speculatively.

Start with step 1 now.`;
}

function MessageIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <title>Discuss</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

export function DiscussWithAgentButton(props: DiscussWithAgentButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(() => buildPrompt(props), [props]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context); the textarea is selectable.
    }
  }, [prompt]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-gray-20 bg-surface px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] text-foreground transition-colors hover:bg-gray-5 cursor-pointer"
      >
        <MessageIcon />
        Discuss with agent
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="relative z-50"
      >
        <DialogBackdrop className="fixed inset-0 bg-black/30" />
        <div className="fixed inset-0 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <DialogPanel className="w-full max-w-2xl rounded-md border border-gray-20 bg-surface shadow-lg my-8">
            <div className="border-b border-gray-20 px-5 py-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gray-50 mb-1.5 flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
                    aria-hidden
                  />
                  Discuss with agent
                </p>
                <h2 className="font-serif text-2xl text-foreground leading-tight">
                  Talk this RFC through with your AI sidekick
                </h2>
                <p className="mt-2 text-sm text-gray-70">
                  Hand this RFC to Claude, ChatGPT, or any agent with the
                  RFC123 MCP server. It will read the proposal, ground itself
                  in the codebase, and surface gaps before waiting on your
                  lead.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-gray-50 hover:text-foreground text-2xl leading-none -mt-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <section>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-50 mb-2">
                  Step 1 · Connect your agent
                </p>
                <Disclosure>
                  {({ open: isOpen }) => (
                    <div className="rounded-md border border-gray-20 bg-gray-5">
                      <DisclosureButton className="group flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left cursor-pointer">
                        <p className="text-sm text-gray-70">
                          One-time MCP setup.{" "}
                          <span className="text-gray-50">
                            Skip if your agent is already connected.
                          </span>
                        </p>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-foreground">
                          {isOpen ? "Hide" : "Show steps"}
                          <svg
                            className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <title>Toggle</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </span>
                      </DisclosureButton>
                      <DisclosurePanel className="border-t border-gray-20 bg-surface px-3.5 py-3.5 rounded-b-md">
                        <ConnectAgentSetup showSkills={false} />
                      </DisclosurePanel>
                    </div>
                  )}
                </Disclosure>
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-50">
                    Step 2 · Run this prompt
                  </p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-all hover:opacity-85 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <title>Copied</title>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <title>Copy</title>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy prompt
                      </>
                    )}
                  </button>
                </div>
              <p className="text-[11px] mb-3">
                Paste this into your agent.<br/>It will pull this RFC, compare it
                against the codebase, and wait for you before posting anything
                back via the MCP server.
              </p>
                <textarea
                  readOnly
                  value={prompt}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-72 resize-y rounded-md border border-gray-20 bg-gray-5 p-3 font-mono text-[12px] leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-cyan/20 focus:border-cyan"
                />
              </section>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
