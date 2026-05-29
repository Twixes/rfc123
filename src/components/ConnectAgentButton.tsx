"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { useState } from "react";
import { MarketingButton } from "@/components/MarketingButton";

const MCP_URL = "https://rfc123.com/mcp";
const SKILLS_REPO = "Twixes/rfc-123";

interface Platform {
  id: string;
  label: string;
  /** How the user actually adds the server. Mix of CLI + JSON + GUI steps. */
  body: () => React.ReactNode;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be blocked (e.g. insecure context). Failing
          // silently is fine – the snippet is right there to select manually.
        }
      }}
      className="absolute top-2 right-2 rounded border border-gray-20 bg-surface px-2 py-0.5 text-xs text-gray-70 transition-colors hover:bg-gray-5"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Snippet({
  children,
  language,
}: {
  children: string;
  language?: string;
}) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded border border-gray-20 px-3 py-2.5 text-xs leading-relaxed text-foreground">
        {language && (
          <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-50">
            {language}
          </div>
        )}
        <code className="font-mono whitespace-pre">{children}</code>
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

const platforms: Platform[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    body: () => (
      <>
        <p className="text-sm text-foreground">Run this in your terminal:</p>
        <Snippet>{`claude mcp add --transport http rfc123 ${MCP_URL}`}</Snippet>
        <p className="text-sm text-foreground">
          The first tool call opens your browser to authorize with GitHub.
          Verify with <code>/mcp</code> inside Claude Code.
        </p>
      </>
    ),
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    body: () => (
      <>
        <ol className="list-decimal pl-5 text-sm text-foreground space-y-1.5">
          <li>
            Open <strong>Settings → Connectors → Add custom connector</strong>.
          </li>
          <li>
            Paste this URL:
            <Snippet>{MCP_URL}</Snippet>
          </li>
          <li>
            Click <strong>Connect</strong> and authorize with GitHub.
          </li>
        </ol>
      </>
    ),
  },
  {
    id: "cursor",
    label: "Cursor",
    body: () => (
      <>
        <p className="text-sm text-foreground">
          Add to <code>~/.cursor/mcp.json</code> (or a project-local{" "}
          <code>.cursor/mcp.json</code>):
        </p>
        <Snippet language="json">
          {`{
  "mcpServers": {
    "rfc123": {
      "url": "${MCP_URL}"
    }
  }
}`}
        </Snippet>
      </>
    ),
  },
  {
    id: "vscode",
    label: "VS Code",
    body: () => (
      <>
        <p className="text-sm text-foreground">
          Requires VS Code 1.101+ with Copilot Chat. Add to{" "}
          <code>.vscode/mcp.json</code>:
        </p>
        <Snippet language="json">
          {`{
  "servers": {
    "rfc123": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`}
        </Snippet>
      </>
    ),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    body: () => (
      <>
        <p className="text-sm text-foreground">
          Add to <code>~/.codeium/windsurf/mcp_config.json</code>:
        </p>
        <Snippet language="json">
          {`{
  "mcpServers": {
    "rfc123": {
      "serverUrl": "${MCP_URL}"
    }
  }
}`}
        </Snippet>
      </>
    ),
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    body: () => (
      <>
        <p className="text-sm text-foreground">
          On a Plus, Pro, or Business plan, open{" "}
          <strong>Settings → Connectors → Create</strong> and use:
        </p>
        <Snippet>{MCP_URL}</Snippet>
        <p className="text-xs text-gray-70">
          Pick <em>OAuth</em> as the auth method; RFC123 hosts its own
          authorization server.
        </p>
      </>
    ),
  },
];

/**
 * The platform-tabs + skills snippet body. Exported so it can also live inline
 * in other surfaces (e.g. the Discuss-with-agent modal) without nesting a
 * second dialog on top of an existing one.
 */
export function ConnectAgentSetup({
  showSkills = true,
}: {
  showSkills?: boolean;
}) {
  return (
    <>
      <TabGroup>
        <TabList className="flex flex-wrap gap-1 border-b border-gray-20 mb-4">
          {platforms.map((p) => (
            <Tab
              key={p.id}
              className="relative px-3 py-1.5 text-sm text-gray-70 outline-none cursor-pointer data-selected:text-foreground data-selected:font-medium border-b-2 border-transparent data-selected:border-cyan -mb-px"
            >
              {p.label}
            </Tab>
          ))}
        </TabList>
        <TabPanels>
          {platforms.map((p) => (
            <TabPanel key={p.id} className="space-y-3 outline-none">
              {p.body()}
            </TabPanel>
          ))}
        </TabPanels>
      </TabGroup>

      {showSkills && (
        <div className="mt-6 pt-4 border-t border-gray-20">
          <h3 className="text-sm font-medium text-foreground mb-2">
            Optional: install the skills
          </h3>
          <p className="text-sm text-gray-70 mb-2">
            Skills teach the agent how to help you <em>review</em> an RFC –
            pressure-testing claims, comparing against the codebase,
            synthesizing discussion – without writing the prose for you. You
            still type every word that lands on GitHub.
          </p>
          <Snippet>
            {`/plugin marketplace add ${SKILLS_REPO}\n/plugin install rfc123-skills`}
          </Snippet>
          <p className="text-xs text-gray-70 mt-2">
            For agents without a plugin manager, clone the <code>skills/</code>{" "}
            directory from the repo into your agent's skills location.
          </p>
        </div>
      )}
    </>
  );
}

export default function ConnectAgentButton({
  variant = "primary",
  label = "Connect your agent",
}: {
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <MarketingButton
        type="button"
        variant={variant}
        onClick={() => setOpen(true)}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <title>Connect</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        {label}
      </MarketingButton>

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
                <h2 className="font-serif text-2xl text-foreground leading-none mb-2">
                  Connect your agent
                </h2>
                <p className="text-sm text-gray-70">
                  Point your AI agent at RFC123's MCP server.
                  <br />
                  Your agent helps you think and review, but{" "}
                  <strong>you still write what lands on the RFC</strong>.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-gray-50 hover:text-foreground text-2xl leading-none -mt-1"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4">
              <ConnectAgentSetup />
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
