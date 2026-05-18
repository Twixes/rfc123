import type { RFC } from "./github";
import { humanTimeSince } from "./human-time";

/**
 * Wall-clock hour, minute, weekday, and YMD ("2026-05-17") for a given
 * UTC instant in a specific IANA timezone. Uses Intl with `en-CA` locale
 * for an ISO-shaped date.
 */
export function localClock(
  date: Date,
  timezone: string,
): { hour: number; minute: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  // `hour` may come back as "24" at midnight in some zones; normalize.
  const hourStr = get("hour");
  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(get("minute"), 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[get("weekday")] ?? 0;

  return {
    hour,
    minute,
    weekday,
    ymd: `${year}-${month}-${day}`,
  };
}

export interface BriefingDecision {
  shouldSend: boolean;
  reason?: string;
}

/**
 * Decide whether to send a briefing for a user *right now*. The hourly cron
 * fires us with the current UTC hour; we re-derive the local clock and skip
 * when:
 *   - we already sent for today's local YMD
 *   - it's the weekend in their timezone
 *   - the local hour doesn't match their preferred hour
 *
 * Caller is responsible for pre-filtering to enabled users with an active
 * Slack link – that's done in the Convex query.
 */
export function decideShouldSend(
  user: {
    notifyHour: number;
    timezone: string;
    lastSentYmdLocal?: string;
  },
  now: Date,
): BriefingDecision {
  const local = localClock(now, user.timezone);
  if (local.weekday === 0 || local.weekday === 6) {
    return { shouldSend: false, reason: "weekend" };
  }
  if (local.hour !== user.notifyHour) {
    return { shouldSend: false, reason: "wrong_hour" };
  }
  if (user.lastSentYmdLocal === local.ymd) {
    return { shouldSend: false, reason: "already_sent" };
  }
  return { shouldSend: true };
}

/**
 * Build the Slack DM blocks for a user's daily briefing.
 */
export function formatBriefingBlocks(rfcs: RFC[]): unknown[] {
  const header = {
    type: "header",
    text: {
      type: "plain_text",
      emoji: true,
      text:
        rfcs.length === 1
          ? "👀 1 RFC awaiting your review today"
          : `👀 ${rfcs.length} RFCs awaiting your review today`,
    },
  };

  const items = rfcs.map((rfc) => {
    const openFor = humanTimeSince(rfc.createdAt);
    const repoUrl = `https://github.com/${rfc.owner}/${rfc.repo}`;
    const authorUrl = `https://github.com/${rfc.author}`;
    return {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<${rfc.url}|${escapeSlack(rfc.title)}>*\n<${repoUrl}|${rfc.owner}/${rfc.repo}> · by <${authorUrl}|@${rfc.author}> · open for ${openFor}`,
      },
    };
  });

  return [header, { type: "divider" }, ...items];
}

export function formatBriefingFallback(rfcs: RFC[]): string {
  const lines = rfcs.map((rfc) => `• ${rfc.title} – ${rfc.url}`);
  return `${rfcs.length === 1 ? "1 RFC is" : `${rfcs.length} RFCs are`} waiting on your eyes 👀\n${lines.join("\n")}`;
}

function escapeSlack(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
