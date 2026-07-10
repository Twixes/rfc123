import type {
  Comment,
  RFCCommitHistory,
  RFCDetail,
  RFCMarkdownFile,
} from "@/lib/github";

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

/** 1-based line number of the (unique) line containing `snippet`, so inline
 *  comment anchors survive edits to the fixture markdown. */
function lineOf(markdown: string, snippet: string): number {
  const index = markdown
    .split("\n")
    .findIndex((line) => line.includes(snippet));
  if (index === -1) {
    throw new Error(`Fixture snippet not found in markdown: "${snippet}"`);
  }
  return index + 1;
}

const MAIN_RFC_MARKDOWN = [
  "# Request queue back-pressure",
  "",
  "We drop webhook deliveries when the ingestion queue is saturated. This RFC",
  "proposes explicit back-pressure so producers slow down instead of us",
  "silently losing events.",
  "",
  "## Problem",
  "",
  "- Bursts above 2k req/s overflow the fixed-size buffer.",
  "- Retries are client-defined, so drops are unrecoverable on our side.",
  "- We only notice via support tickets, not metrics.",
  "",
  "## Proposal",
  "",
  "Signal queue depth back to producers with `Retry-After`:",
  "",
  "```ts",
  "if (queue.depth() > HIGH_WATERMARK) {",
  '  return new Response(null, { status: 429, headers: { "Retry-After": "2" } });',
  "}",
  "```",
  "",
  "| Watermark | Depth | Behavior |",
  "| --------- | ----- | -------------------- |",
  "| High | 80% | 429 + Retry-After |",
  "| Critical | 95% | Shed non-priority |",
  "",
  "## Rollout",
  "",
  "Feature-flagged per producer, starting with internal services.",
].join("\n");

const RESEARCH_MARKDOWN = [
  "# Back-pressure research notes",
  "",
  "Supporting material for the main proposal: what other systems do and what",
  "we measured on our own queues.",
  "",
  "## Prior art",
  "",
  "- Kafka producers block on full buffers by default.",
  "- SQS returns throttling errors and relies on SDK retry policies.",
  "- NATS applies per-connection flow control at the protocol level.",
  "",
  "## Load test findings",
  "",
  "At 3k req/s sustained, the buffer saturates in 40 seconds and drop rate",
  "reaches 12%. With a simulated 429 + retry loop, effective throughput",
  "stabilizes at 2.4k req/s with zero drops.",
].join("\n");

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

/** The TwoFiles scene pins one inline comment per document on the SAME line
 *  number – the regression class multi-file support fixed: each must render
 *  in its own file's section, not collide by line number. */
const MAIN_SAME_LINE = lineOf(MAIN_RFC_MARKDOWN, "Bursts above 2k");
const RESEARCH_SAME_LINE = lineOf(RESEARCH_MARKDOWN, "SQS returns");
if (MAIN_SAME_LINE !== RESEARCH_SAME_LINE) {
  throw new Error(
    "Fixture invariant broken: both documents must carry an inline comment on the same line number",
  );
}

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
    line: lineOf(MAIN_RFC_MARKDOWN, "support tickets"),
  },
  {
    id: 9102,
    nodeId: "C_9102",
    user: "casey",
    userAvatar: AVATARS.casey,
    body: "Part of this work – depth and drop-rate gauges land with the flag.",
    createdAt: "2026-06-25T16:20:00Z",
    path: MAIN_FILE.path,
    line: lineOf(MAIN_RFC_MARKDOWN, "support tickets"),
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
    line: lineOf(MAIN_RFC_MARKDOWN, "status: 429"),
  },
];

/** Inline comments for the two-file scene, including the same-line-number
 *  pair (see MAIN_SAME_LINE / RESEARCH_SAME_LINE above). */
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
    line: RESEARCH_SAME_LINE,
  },
  {
    id: 9202,
    nodeId: "C_9202",
    user: "marek",
    userAvatar: AVATARS.marek,
    body: "Bursts are spikier than 2k in EU mornings – see the load test doc.",
    createdAt: "2026-06-26T07:55:00Z",
    path: MAIN_FILE.path,
    line: MAIN_SAME_LINE,
  },
  {
    id: 9203,
    nodeId: "C_9203",
    user: "june",
    userAvatar: AVATARS.june,
    body: "12% drop rate at 3k req/s is worse than I assumed. Good find.",
    createdAt: "2026-06-26T10:15:00Z",
    path: RESEARCH_FILE.path,
    line: lineOf(RESEARCH_MARKDOWN, "effective throughput"),
  },
];

/** Comment counts derive from the scene's comment fixture so the header
 *  numbers can never contradict the visible comments. */
function buildRfcDetail(
  files: RFCMarkdownFile[],
  comments: Comment[],
): RFCDetail {
  const inlineCount = comments.filter((c) => c.line != null).length;
  return {
    number: 42,
    title: "Request queue back-pressure",
    author: "casey",
    authorAvatar: AVATARS.casey,
    status: "open",
    isDraft: false,
    createdAt: "2026-06-24T09:00:00Z",
    updatedAt: "2026-06-29T15:30:00Z",
    commentCount: comments.length,
    inlineCommentCount: inlineCount,
    regularCommentCount: comments.length - inlineCount,
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
        state: "APPROVED",
        submittedAt: "2026-06-27T10:00:00Z",
      },
      {
        login: "marek",
        avatar: AVATARS.marek,
        yetToReview: true,
        state: "PENDING",
        submittedAt: null,
      },
    ],
    decisionBlocks: [],
    mergeStateStatus: "clean",
    mergeable: true,
    comments: [],
    files,
  };
}

export const singleFileRfc = buildRfcDetail([MAIN_FILE], singleFileComments);

export const twoFilesRfc = buildRfcDetail(
  [RESEARCH_FILE, MAIN_FILE],
  twoFilesComments,
);

/** Only fetched when the commit range picker is opened – not exercised by
 *  snapshots; present so interactive exploration in `storybook dev`
 *  doesn't 404. */
export function commitHistoryFor(rfc: RFCDetail): RFCCommitHistory {
  return {
    base: { sha: "ba5eba5eba5e", ref: "main", label: "main" },
    commits: [
      {
        sha: rfc.headSha,
        message: "Draft RFC",
        summary: "Draft RFC",
        author: rfc.author,
        authorAvatar: rfc.authorAvatar,
        authoredDate: rfc.createdAt,
      },
    ],
  };
}
