"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RelativeTime } from "@/components/RelativeTime";
import type { RfcLayout, WritableRepo } from "@/lib/github";
import { useAdoptionStatusPoll } from "@/lib/use-adoption-status-poll";

const SEARCH_LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 200;

export interface PendingAdoptionInfo {
  owner: string;
  name: string;
  fullName: string;
  layout: RfcLayout;
  pr: {
    number: number;
    url: string;
  };
}

interface AddExistingRepoModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful adopt so the parent can refresh its repo list. */
  onAdopted: (repo: { owner: string; name: string; fullName: string }) => void;
  /**
   * When set, the modal opens directly into the pending state for this repo
   * – used to resume a PR-based adoption from the repo picker on any device.
   */
  initialPending?: PendingAdoptionInfo | null;
}

// Pending state is carried by `pending !== null`, not by `status`, so the two
// can never disagree about which branch of the UI is showing.
type AdoptStatus = "idle" | "submitting" | "error";

export default function AddExistingRepoModal({
  open,
  onClose,
  onAdopted,
  initialPending,
}: AddExistingRepoModalProps) {
  const [results, setResults] = useState<WritableRepo[] | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<WritableRepo | null>(null);
  const [layout, setLayout] = useState<RfcLayout>("flat");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdoptStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAdoptionInfo | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("idle");
    setErrorMessage(null);
    setSelected(null);
    setSearch("");
    setResults(null);
    setIsSearching(false);
    if (initialPending) {
      setPending(initialPending);
      setLayout(initialPending.layout);
    } else {
      setPending(null);
      setLayout("flat");
      // Focus on the next tick so Headless UI's initial focus doesn't fight us.
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, initialPending]);

  // Server-side search. Skipped while a PR is pending – the picker isn't
  // mounted then. Debounced so each keystroke doesn't fire a request, but
  // `q=""` (initial load) goes through immediately. Aborts in-flight requests
  // when the user keeps typing so out-of-order responses can't overwrite a
  // newer result.
  useEffect(() => {
    if (!open || pending) return;
    setResultsError(null);
    const trimmed = search.trim();
    const delay = trimmed.length === 0 ? 0 : SEARCH_DEBOUNCE_MS;
    const handle = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      setIsSearching(true);
      const params = new URLSearchParams({
        filter: "adoptable",
        limit: String(SEARCH_LIMIT),
      });
      if (trimmed) params.set("q", trimmed);
      fetch(`/api/writable-repos?${params.toString()}`, {
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as WritableRepo[];
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults(data);
          setIsSearching(false);
          // Drop the previously selected repo if it's no longer in the result
          // set – otherwise the submit button stays enabled targeting a repo
          // the user can't see anymore.
          setSelected((prev) =>
            prev && data.some((r) => r.fullName === prev.fullName)
              ? prev
              : null,
          );
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          console.error("Failed to search writable repos", e);
          setResultsError("Couldn't load your repositories. Try again.");
          setIsSearching(false);
        });
    }, delay);
    return () => {
      clearTimeout(handle);
      searchAbortRef.current?.abort();
    };
  }, [open, search, pending]);

  const pollList = useMemo(
    () =>
      pending
        ? [
            {
              owner: pending.owner,
              name: pending.name,
              fullName: pending.fullName,
            },
          ]
        : [],
    [pending],
  );
  useAdoptionStatusPoll({
    pending: pollList,
    enabled: open,
    onResolved: ({ owner, name, fullName, status: outcome }) => {
      if (outcome === "closed") {
        setPending(null);
        setStatus("error");
        setErrorMessage(
          "The adoption PR was closed without merging. Pick a repo to try again.",
        );
        return;
      }
      // adopted | missing → treat as adopted (missing means another device
      // already finalized the row).
      onAdopted({ owner, name, fullName });
      onClose();
    },
  });

  async function handleSubmit() {
    if (!selected || status === "submitting") return;
    setStatus("submitting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/repos/adopt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: selected.owner,
          name: selected.name,
          layout,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus("error");
        setErrorMessage(data.error ?? "Failed to add this repo.");
        return;
      }
      const data = (await res.json()) as
        | {
            status: "adopted";
            owner: string;
            name: string;
            fullName: string;
            alreadyAdopted: boolean;
          }
        | {
            status: "pending";
            owner: string;
            name: string;
            fullName: string;
            pr: { number: number; url: string };
          };
      if (data.status === "pending") {
        setPending({
          owner: data.owner,
          name: data.name,
          fullName: data.fullName,
          layout,
          pr: data.pr,
        });
        setStatus("idle");
        return;
      }
      onAdopted({
        owner: data.owner,
        name: data.name,
        fullName: data.fullName,
      });
      onClose();
    } catch (e) {
      console.error("Adopt repo error", e);
      setStatus("error");
      setErrorMessage((e as Error).message || "Something went wrong.");
    }
  }

  const headline = pending
    ? `Waiting for ${pending.fullName}`
    : "Add existing RFCs repo";

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (status !== "submitting") onClose();
      }}
      className="relative z-50"
    >
      <DialogBackdrop className="fixed inset-0 bg-black/30" />
      <div className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto">
        <DialogPanel className="w-full max-w-lg rounded-md border border-gray-20 bg-surface shadow-lg my-8">
          <div className="px-6 py-5 border-b border-gray-20">
            <DialogTitle className="text-xl font-serif font-normal text-foreground">
              {headline}
            </DialogTitle>
            {pending ? (
              <p className="mt-1 text-sm text-gray-70">
                This repo requires changes to land through a pull request, so we
                opened one for you. We'll keep checking, and the repo will pop
                into RFC123 shortly after the PR is merged.
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-70">
                Pick a repo you can push to. We'll commit{" "}
                <code className="font-mono text-xs">.rfc123.json</code> to its
                default branch. Once it's in there, the repo shows up in RFC123.
              </p>
            )}
          </div>

          {pending ? (
            <PendingBody pending={pending} />
          ) : (
            <div className="px-6 py-5 space-y-4">
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label
                    htmlFor="add-existing-repo-search"
                    className="text-sm font-medium text-foreground"
                  >
                    Repository
                  </label>
                  <span className="text-xs text-gray-50">
                    Most recently active first
                  </span>
                </div>
                <input
                  id="add-existing-repo-search"
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search owner/name…"
                  className="w-full border border-gray-30 rounded-sm bg-surface px-3 py-2 text-sm text-foreground hover:border-gray-40 focus:outline-none focus:ring-2 focus:ring-cyan focus:border-transparent transition-colors"
                />
                <div className="relative mt-2 border border-gray-20 rounded-sm overflow-hidden">
                  <div
                    aria-hidden={!isSearching}
                    className={`pointer-events-none absolute top-0 left-0 right-0 h-1 overflow-hidden bg-transparent transition-opacity duration-150 z-10 ${
                      isSearching ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <div className="h-full w-1/2 bg-cyan animate-indeterminate-bar" />
                  </div>
                  <div className="max-h-56 overflow-y-auto">
                    {results === null && !resultsError && (
                      <div className="p-4 text-center text-sm text-gray-50">
                        Loading your repositories…
                      </div>
                    )}
                    {resultsError && (
                      <div className="p-4 text-center text-sm text-magenta">
                        {resultsError}
                      </div>
                    )}
                    {results !== null &&
                      !resultsError &&
                      results.length === 0 && (
                        <div className="p-4 text-center text-sm text-gray-50">
                          {search.trim()
                            ? "No repositories match."
                            : "Every repo you can push to already has .rfc123.json."}
                        </div>
                      )}
                    {results?.map((repo) => {
                      const isSelected =
                        selected?.owner === repo.owner &&
                        selected?.name === repo.name;
                      return (
                        <button
                          key={repo.fullName}
                          type="button"
                          onClick={() => setSelected(repo)}
                          className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-20 last:border-b-0 hover:bg-yellow-light transition-colors flex items-center justify-between gap-3 ${
                            isSelected ? "bg-gray-5 font-medium" : ""
                          }`}
                        >
                          <span className="truncate">{repo.fullName}</span>
                          {repo.pushedAt && (
                            <span className="shrink-0 text-xs text-gray-50 tabular-nums">
                              <RelativeTime date={repo.pushedAt} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-foreground mb-1.5">
                  Layout
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <LayoutOption
                    selected={layout === "flat"}
                    onClick={() => setLayout("flat")}
                    title="Flat"
                    hint="RFC .md files detected at repo root"
                  />
                  <LayoutOption
                    selected={layout === "multi-directory"}
                    onClick={() => setLayout("multi-directory")}
                    title="Multi-directory"
                    hint="RFC .md files detected in directories"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-50">
                  Only affects where <em>new</em> RFCs land – existing files
                  stay put.
                  <br />
                  You can edit this{" "}
                  <code className="font-mono text-[11px]">.rfc123.json</code>{" "}
                  later.
                </p>
              </div>

              {errorMessage && (
                <div className="border border-magenta bg-magenta-light text-foreground rounded-sm px-3 py-2 text-sm">
                  {errorMessage}
                </div>
              )}
            </div>
          )}

          <div className="px-6 py-4 border-t border-gray-20 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={status === "submitting"}
              className="rounded-md border border-gray-20 bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-gray-5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {pending ? "Close" : "Cancel"}
            </button>
            {pending ? (
              <a
                href={pending.pr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80"
              >
                View PR #{pending.pr.number}
              </a>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selected || status === "submitting"}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-surface transition-all hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                {status === "submitting" ? "Adding…" : "Add repo"}
              </button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

function PendingBody({ pending }: { pending: PendingAdoptionInfo }) {
  return (
    <div className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 text-sm text-foreground">
        <div className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
        <span>
          Waiting for{" "}
          <a
            href={pending.pr.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline decoration-dotted underline-offset-2"
          >
            PR #{pending.pr.number}
          </a>{" "}
          to merge.
        </span>
      </div>
      <p className="text-xs text-gray-50">
        You can close this dialog – we'll keep watching the PR and surface it
        again from the repo picker.
      </p>
    </div>
  );
}

function LayoutOption({
  selected,
  onClick,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-md border px-3 py-2 transition-all cursor-pointer ${
        selected
          ? "border-cyan bg-cyan-light"
          : "border-gray-20 bg-surface hover:bg-gray-5"
      }`}
    >
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs text-gray-50">{hint}</div>
    </button>
  );
}
