import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HttpResponse, http } from "msw";
import { within } from "storybook/test";
import type { Comment, RFCDetail } from "@/lib/github";
import {
  CURRENT_USER,
  singleFileComments,
  singleFileRfc,
  twoFilesComments,
  twoFilesRfc,
} from "@/stories/fixtures/rfc-detail";
import RFCDetailClient from "./RFCDetailClient";

/** MSW handlers for everything the scene requests: detail + comments on
 *  mount, commit history only if the diff range picker is opened. */
function sceneHandlers(rfc: RFCDetail, comments: Comment[]) {
  return [
    http.get(`/api/rfcs/${rfc.number}`, () => HttpResponse.json(rfc)),
    http.get(`/api/rfcs/${rfc.number}/comments`, () =>
      HttpResponse.json(comments),
    ),
    http.get(`/api/rfcs/${rfc.number}/commits`, () =>
      HttpResponse.json({
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
      }),
    ),
  ];
}

const meta = {
  title: "Scenes/RFC detail",
  component: RFCDetailClient,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/rfcs/acme/rfcs/42",
      },
    },
    // Let the comment-position cascade (rAF + ResizeObserver push-down
    // layout) settle before Chromatic snapshots.
    chromatic: { delay: 300 },
  },
  args: {
    owner: "acme",
    repo: "rfcs",
    prNumber: 42,
    currentUser: CURRENT_USER.login,
    currentUserAvatar: CURRENT_USER.avatar,
  },
} satisfies Meta<typeof RFCDetailClient>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The common case: a PR with exactly one markdown document. */
export const SingleFile: Story = {
  parameters: {
    msw: { handlers: sceneHandlers(singleFileRfc, singleFileComments) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Markdown rendered…
    await canvas.findByText(/Feature-flagged per producer/);
    // …and inline comments loaded and laid out.
    await canvas.findByText(/jittering Retry-After/);
  },
};

/** A PR carrying a supporting research doc alongside the main RFC (the
 *  PostHog/requests-for-comments-internal#1183 shape). Both documents have an
 *  inline comment on the same line number – each must appear in its own
 *  file's section rather than colliding by line number. */
export const TwoFiles: Story = {
  parameters: {
    msw: { handlers: sceneHandlers(twoFilesRfc, twoFilesComments) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Both documents rendered…
    await canvas.findByText(/Feature-flagged per producer/);
    await canvas.findByText(/stabilizes at 2\.4k req\/s/);
    // …with their same-line-number comments each in the right section.
    await canvas.findByText(/Kafka's blocking default/);
    await canvas.findByText(/spikier than 2k in EU mornings/);
  },
};
