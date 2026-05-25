"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Checkbox from "@/components/Checkbox";
import HourSelect from "@/components/HourSelect";
import TimezoneSelect from "@/components/TimezoneSelect";

interface SlackLink {
  teamId: string;
  teamName: string;
  slackUserId: string;
  slackUserName?: string;
  isActive: boolean;
}

interface Prefs {
  notifyHour: number;
  timezone: string | null;
  notificationsEnabled: boolean;
}

interface Banner {
  kind: "ok" | "err";
  text: string;
}

const AUTOSAVE_DEBOUNCE_MS = 500;

export default function SettingsClient({
  initialPrefs,
  initialSlackLinks,
  slackBanner,
}: {
  initialPrefs: Prefs;
  initialSlackLinks: SlackLink[];
  slackBanner: Banner | null;
}) {
  // The "default to browser timezone" promise: detect on first render if no
  // timezone has been saved. Server-rendered HTML uses null until hydration.
  const [timezone, setTimezone] = useState<string | null>(
    initialPrefs.timezone,
  );
  const [hour, setHour] = useState(initialPrefs.notifyHour);
  const [enabled, setEnabled] = useState(initialPrefs.notificationsEnabled);
  const [slackLinks, setSlackLinks] = useState(initialSlackLinks);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | { error: string }
  >("idle");
  const [briefingSendStatus, setBriefingSendStatus] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; count: number }
    | { kind: "empty" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!timezone) {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(detected || "UTC");
    }
  }, [timezone]);

  const commitPrefs = useCallback(async () => {
    if (!timezone) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notifyHour: hour,
          timezone,
          notificationsEnabled: enabled,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus({ error: (e as Error).message });
    }
  }, [hour, timezone, enabled]);

  // Debounced auto-save: any change to hour/timezone/enabled triggers a save
  // ~500ms later, restarting the timer on each keystroke-equivalent edit.
  // First render is skipped so we don't write back the values we just read.
  const isFirstRender = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!timezone) return;
    saveTimerRef.current = setTimeout(commitPrefs, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [commitPrefs, timezone]);

  // Fade "Saved" away after a moment so it doesn't sit forever.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const t = setTimeout(() => setSaveStatus("idle"), 1800);
    return () => clearTimeout(t);
  }, [saveStatus]);

  async function handleSetActive(teamId: string) {
    const res = await fetch("/api/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeTeamId: teamId }),
    });
    if (res.ok) {
      setSlackLinks((prev) =>
        prev.map((l) => ({ ...l, isActive: l.teamId === teamId })),
      );
    }
  }

  /**
   * Flush any pending auto-save and commit synchronously before bouncing to
   * Slack – guarantees the user's TZ/hour land in Convex before the OAuth
   * callback auto-enables notifications.
   */
  async function handleConnectSlack(mode: "install" | "link") {
    if (!timezone) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    try {
      await commitPrefs();
    } catch {
      // Non-fatal – proceed to Slack OAuth anyway.
    }
    window.location.href = `/api/slack/install?mode=${mode}`;
  }

  async function handleDisconnect(teamId: string) {
    const res = await fetch("/api/slack/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    if (res.ok) {
      setSlackLinks((prev) => prev.filter((l) => l.teamId !== teamId));
    }
  }

  async function handleSendBriefingNow() {
    setBriefingSendStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/internal/send-briefing-now", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        count?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      if (json.sent) {
        setBriefingSendStatus({ kind: "sent", count: json.count ?? 0 });
      } else {
        setBriefingSendStatus({ kind: "empty" });
      }
    } catch (e) {
      setBriefingSendStatus({ kind: "error", message: (e as Error).message });
    }
  }

  const hasActiveSlack = slackLinks.some((l) => l.isActive);

  return (
    <div className="border border-gray-20 rounded-md bg-surface p-6 sm:p-8">
      <h2 className="text-3xl sm:text-4xl font-serif font-normal text-foreground mb-2">
        Settings
      </h2>
      <p className="mt-2 mb-6 text-gray-70">
        Configure connection to Slack, and a daily nudge there on the RFCs
        waiting on you.
      </p>

      <div className="space-y-6">
        {slackBanner && (
          <Banner kind={slackBanner.kind} text={slackBanner.text} />
        )}

        <section>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Slack workspace
          </h3>
          {slackLinks.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-70">
                Pick a workspace to be DM&rsquo;d in. We&rsquo;ll handle the
                install if needed.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleConnectSlack("install")}
                  className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm text-surface hover:opacity-80 transition"
                >
                  Install RFC123 in Slack
                </button>
                <button
                  type="button"
                  onClick={() => handleConnectSlack("link")}
                  className="inline-flex items-center rounded-md border border-gray-30 px-3 py-1.5 text-sm text-foreground hover:bg-gray-5 transition"
                >
                  Link to an existing install
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {slackLinks.map((link) => (
                <div
                  key={link.teamId}
                  className="flex items-center justify-between border border-gray-20 rounded-md px-3 py-2"
                >
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      {link.teamName}
                    </div>
                    <div className="text-xs text-gray-50">
                      {link.slackUserName
                        ? `@${link.slackUserName}`
                        : link.slackUserId}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {link.isActive ? (
                      <span className="inline-flex items-center rounded-full border border-magenta/30 bg-magenta-light px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-magenta">
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSetActive(link.teamId)}
                        className="text-xs text-gray-70 underline hover:text-foreground transition"
                      >
                        Make active
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDisconnect(link.teamId)}
                      className="text-xs text-magenta hover:underline transition"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => handleConnectSlack("link")}
                className="text-xs text-gray-70 underline hover:text-foreground transition"
              >
                Link another workspace
              </button>
            </div>
          )}
        </section>

        <section>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Daily briefing
          </h3>
          <Checkbox
            checked={enabled}
            onChange={setEnabled}
            disabled={!hasActiveSlack}
            label="DM me a daily briefing of RFCs awaiting my review"
            description={
              hasActiveSlack
                ? "No briefing on weekends or when you have zero RFCs to review."
                : "Connect a Slack workspace above to enable."
            }
            className="mb-4"
          />

          <div className="flex flex-wrap gap-2 items-end">
            <div className="w-32 shrink-0">
              <div className="text-xs text-gray-70 mb-1">Hour</div>
              <HourSelect value={hour} onChange={setHour} />
            </div>
            <div className="flex-1 min-w-[14rem]">
              <div className="text-xs text-gray-70 mb-1">Timezone</div>
              <TimezoneSelect value={timezone} onChange={setTimezone} />
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendBriefingNow}
              disabled={
                !hasActiveSlack || briefingSendStatus.kind === "sending"
              }
              title="DM the briefing to your active Slack workspace right now, bypassing the hour/weekday/idempotency gates."
              className="inline-flex items-center rounded-md border border-gray-30 px-3 py-1.5 text-sm text-foreground hover:bg-gray-5 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {briefingSendStatus.kind === "sending"
                ? "Sending…"
                : "Send briefing now"}
            </button>
            <BriefingSendIndicator
              status={briefingSendStatus}
              hasActiveSlack={hasActiveSlack}
            />{" "}
            <SaveIndicator status={saveStatus} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | { error: string };
}) {
  // Fixed-height row so the form doesn't jump when status appears.
  if (status === "idle") return null;
  return (
    <div className="flex-1 text-right h-4 text-xs">
      {status === "saving" && <span className="text-gray-50">Saving…</span>}
      {status === "saved" && <span className="text-cyan">Saved</span>}
      {typeof status === "object" && "error" in status && (
        <span className="text-magenta">{status.error}</span>
      )}
    </div>
  );
}

function BriefingSendIndicator({
  status,
  hasActiveSlack,
}: {
  status:
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent"; count: number }
    | { kind: "empty" }
    | { kind: "error"; message: string };
  hasActiveSlack: boolean;
}) {
  if (status.kind === "idle") {
    if (!hasActiveSlack) {
      return (
        <p className="text-xs text-gray-50">
          Connect a Slack workspace above to enable.
        </p>
      );
    }
    return null;
  }
  return (
    <div className="text-xs">
      {status.kind === "sending" && (
        <span className="text-gray-50">Sending DM…</span>
      )}
      {status.kind === "sent" && (
        <span className="text-magenta">
          Notified you about {status.count} RFC
          {status.count === 1 ? "" : "s"} awaiting your review.
        </span>
      )}
      {status.kind === "empty" && (
        <span className="text-gray-70">
          Zero RFCs to review, did not notify.
        </span>
      )}
      {status.kind === "error" && (
        <span className="text-magenta">{status.message}</span>
      )}
    </div>
  );
}

function Banner({ kind, text }: { kind: "ok" | "err"; text: string }) {
  const cls =
    kind === "ok"
      ? "border-cyan/30 bg-cyan-light text-foreground"
      : "border-magenta/30 bg-magenta-light text-foreground";
  return (
    <div className={`border rounded-md px-3 py-2 text-sm ${cls}`}>{text}</div>
  );
}
