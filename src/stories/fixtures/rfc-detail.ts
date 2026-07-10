import type { Comment, RFCDetail, RFCMarkdownFile } from "@/lib/github";

/** The instant Storybook's clock is frozen at (see .storybook/preview.tsx).
 *  All fixture timestamps are pinned relative to this, so relative times
 *  ("3 days ago") render identically on every visual regression run. */
export const FROZEN_NOW = "2026-07-01T12:00:00Z";

/** Deterministic inline-SVG avatar – no network request, no VRT flake. */
function avatarDataUri(initial: string, background: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">` +
    `<rect width="64" height="64" fill="${background}"/>` +
    `<text x="32" y="42" font-family="sans-serif" font-size="30" fill="white" text-anchor="middle">${initial}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const AVATARS = {
  casey: avatarDataUri("C", "#3990a8"),
  priya: avatarDataUri("P", "#721e3c"),
  marek: avatarDataUri("M", "#8a7a1e"),
  june: avatarDataUri("J", "#444444"),
};

export const CURRENT_USER = { login: "casey", avatar: AVATARS.casey };

const MAIN_RFC_MARKDOWN = [
  "# Request queue back-pressure", // line 1
  "", // 2
  "We drop webhook deliveries when the ingestion queue is saturated. This RFC", // 3
  "proposes explicit back-pressure so producers slow down instead of us", // 4
  "silently losing events.", // 5
  "", // 6
  "## Problem", // 7
  "", // 8
  "- Bursts above 2k req/s overflow the fixed-size buffer.", // 9
  "- Retries are client-defined, so drops are unrecoverable on our side.", // 10
  "- We only notice via support tickets, not metrics.", // 11
  "", // 12
  "## Proposal", // 13
  "", // 14
  "Signal queue depth back to producers with `Retry-After`:", // 15
  "", // 16
  "```ts", // 17
  "if (queue.depth() > HIGH_WATERMARK) {", // 18
  '  return new Response(null, { status: 429, headers: { "Retry-After": "2" } });', // 19
  "}", // 20
  "```", // 21
  "", // 22
  "| Watermark | Depth | Behavior |", // 23
  "| --------- | ----- | -------------------- |", // 24
  "| High | 80% | 429 + Retry-After |", // 25
  "| Critical | 95% | Shed non-priority |", // 26
  "", // 27
  "## Rollout", // 28
  "", // 29
  "Feature-flagged per producer, starting with internal services.", // 30
].join("\n");

const RESEARCH_MARKDOWN = [
  "# Back-pressure research notes", // 1
  "", // 2
  "Supporting material for the main proposal: what other systems do and what", // 3
  "we measured on our own queues.", // 4
  "", // 5
  "## Prior art", // 6
  "", // 7
  "- Kafka producers block on full buffers by default.", // 8
  "- SQS returns throttling errors and relies on SDK retry policies.", // 9
  "- NATS applies per-connection flow control at the protocol level.", // 10
  "", // 11
  "## Load test findings", // 12
  "", // 13
  "At 3k req/s sustained, the buffer saturates in 40 seconds and drop rate", // 14
  "reaches 12%. With a simulated 429 + retry loop, effective throughput", // 15
  "stabilizes at 2.4k req/s with zero drops.", // 16
].join("\n");

const RFC_BASE = {
  number: 42,
  title: "Request queue back-pressure",
  author: "casey",
  authorAvatar: AVATARS.casey,
  status: "open" as const,
  isDraft: false,
  createdAt: "2026-06-24T09:00:00Z",
  updatedAt: "2026-06-29T15:30:00Z",
  commentCount: 5,
  inlineCommentCount: 3,
  regularCommentCount: 2,
  url: "https://github.com/acme/rfcs/pull/42",
  owner: "acme",
  repo: "rfcs",
  reviewRequested: false,
  requestedTeamSlugs: [],
  labels: [],
  reviewDecision: null,
  hasDecision: false,
  body: "RFC for explicit back-pressure on the ingestion queue.",
  headRef: "rfc/queue-back-pressure",
  headSha: "f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed",
  reviewers: [
    {
      login: "priya",
      avatar: AVATARS.priya,
      yetToReview: false,
      state: "APPROVED" as const,
      submittedAt: "2026-06-27T10:00:00Z",
    },
    {
      login: "marek",
      avatar: AVATARS.marek,
      yetToReview: true,
      state: "PENDING" as const,
      submittedAt: null,
    },
  ],
  decisionBlocks: [],
  mergeStateStatus: "clean",
  mergeable: true,
  comments: [],
};

const MAIN_FILE: RFCMarkdownFile = {
  path: "queue/2026-06-24-queue-back-pressure.md",
  content: MAIN_RFC_MARKDOWN,
  sha: "aaaa111laaaa111laaaa111laaaa111laaaa111l",
};

const RESEARCH_FILE: RFCMarkdownFile = {
  path: "queue/2026-06-20-back-pressure-research.md",
  content: RESEARCH_MARKDOWN,
  sha: "bbbb222bbbbb222bbbbb222bbbbb222bbbbb222b",
};

export const singleFileRfc: RFCDetail = {
  ...RFC_BASE,
  files: [MAIN_FILE],
};

export const twoFilesRfc: RFCDetail = {
  ...RFC_BASE,
  files: [RESEARCH_FILE, MAIN_FILE],
};

const GENERAL_COMMENTS: Comment[] = [
  {
    id: 9001,
    nodeId: "C_9001",
    user: "june",
    userAvatar: AVATARS.june,
    body: "Strong +1 on making drops visible before making them impossible.",
    createdAt: "2026-06-25T11:00:00Z",
    reactions: {
      counts: { THUMBS_UP: 2 },
      viewer: [],
      users: { THUMBS_UP: ["priya", "marek"] },
    },
  },
  {
    id: 9002,
    nodeId: "C_9002",
    user: "casey",
    userAvatar: AVATARS.casey,
    body: "Added the rollout section based on feedback from the infra sync.",
    createdAt: "2026-06-26T09:30:00Z",
  },
];

/** Inline comments for the single-file scene: a two-comment thread plus a
 *  standalone comment, all on the main document. */
export const singleFileComments: Comment[] = [
  ...GENERAL_COMMENTS,
  {
    id: 9101,
    nodeId: "C_9101",
    user: "priya",
    userAvatar: AVATARS.priya,
    body: "Do we have a dashboard for queue depth already, or is that part of this work?",
    createdAt: "2026-06-25T14:00:00Z",
    path: MAIN_FILE.path,
    line: 11,
  },
  {
    id: 9102,
    nodeId: "C_9102",
    user: "casey",
    userAvatar: AVATARS.casey,
    body: "Part of this work – depth and drop-rate gauges land with the flag.",
    createdAt: "2026-06-25T16:20:00Z",
    path: MAIN_FILE.path,
    line: 11,
    inReplyToId: 9101,
  },
  {
    id: 9103,
    nodeId: "C_9103",
    user: "marek",
    userAvatar: AVATARS.marek,
    body: "Consider jittering Retry-After so producers don't stampede in sync.",
    createdAt: "2026-06-26T08:45:00Z",
    path: MAIN_FILE.path,
    line: 19,
  },
];

/** Inline comments for the two-file scene. Both documents carry a comment on
 *  the SAME line number (9) – the regression class multi-file support fixed:
 *  each must render in its own file's section, not collide by line number. */
export const twoFilesComments: Comment[] = [
  ...GENERAL_COMMENTS,
  {
    id: 9201,
    nodeId: "C_9201",
    user: "priya",
    userAvatar: AVATARS.priya,
    body: "Kafka's blocking default is the behavior our SDK users will expect.",
    createdAt: "2026-06-25T13:10:00Z",
    path: RESEARCH_FILE.path,
    line: 9,
  },
  {
    id: 9202,
    nodeId: "C_9202",
    user: "marek",
    userAvatar: AVATARS.marek,
    body: "Bursts are spikier than 2k in EU mornings – see the load test doc.",
    createdAt: "2026-06-26T07:55:00Z",
    path: MAIN_FILE.path,
    line: 9,
  },
  {
    id: 9203,
    nodeId: "C_9203",
    user: "june",
    userAvatar: AVATARS.june,
    body: "12% drop rate at 3k req/s is worse than I assumed. Good find.",
    createdAt: "2026-06-26T10:15:00Z",
    path: RESEARCH_FILE.path,
    line: 15,
  },
];
