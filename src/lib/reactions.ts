/** Shared helpers for GitHub reaction handling – content/emoji mapping and
 *  the GraphQL queries that enrich comments with viewer reaction state.
 *
 *  Client-safe by design: no imports from `@/lib/github` (which transitively
 *  pulls in `posthog-node`). The runtime mutation helpers below only use
 *  octokit through an injected client, so they tree-shake out of client
 *  bundles. Types and constants live here; `@/lib/github` re-exports them. */

/** GitHub's eight supported reaction kinds (matches GraphQL `ReactionContent`). */
export type ReactionContent =
  | "THUMBS_UP"
  | "THUMBS_DOWN"
  | "LAUGH"
  | "HOORAY"
  | "CONFUSED"
  | "HEART"
  | "ROCKET"
  | "EYES";

export const REACTION_CONTENTS: ReactionContent[] = [
  "THUMBS_UP",
  "THUMBS_DOWN",
  "LAUGH",
  "HOORAY",
  "CONFUSED",
  "HEART",
  "ROCKET",
  "EYES",
];

export interface CommentReactions {
  /** Total count per reaction kind. Missing key == 0. */
  counts: Partial<Record<ReactionContent, number>>;
  /** Reaction kinds the viewer has already applied (toggle target). */
  viewer: ReactionContent[];
  /** Up to `REACTORS_PER_GROUP` reactor logins per kind; full count is in `counts`. */
  users: Partial<Record<ReactionContent, string[]>>;
}

export const REACTORS_PER_GROUP = 10;

/** Canonical display emoji for each GitHub reaction kind. */
export const REACTION_EMOJI: Record<ReactionContent, string> = {
  THUMBS_UP: "👍",
  THUMBS_DOWN: "👎",
  LAUGH: "😄",
  HOORAY: "🎉",
  CONFUSED: "😕",
  HEART: "❤️",
  ROCKET: "🚀",
  EYES: "👀",
};

/** Short human label for accessibility / tooltips. */
export const REACTION_LABEL: Record<ReactionContent, string> = {
  THUMBS_UP: "+1",
  THUMBS_DOWN: "-1",
  LAUGH: "Laugh",
  HOORAY: "Hooray",
  CONFUSED: "Confused",
  HEART: "Heart",
  ROCKET: "Rocket",
  EYES: "Eyes",
};

/** GraphQL reaction-group node we read from the `node(id:)` query. */
interface ReactionGroupNode {
  content: string;
  viewerHasReacted: boolean;
  reactors: {
    totalCount: number;
    nodes?: Array<{ login?: string | null } | null> | null;
  };
}

/** Convert a GraphQL `reactionGroups` array into our flat `CommentReactions`. */
export function reactionGroupsToCommentReactions(
  groups: ReactionGroupNode[] | null | undefined,
): CommentReactions {
  const counts: Partial<Record<ReactionContent, number>> = {};
  const viewer: ReactionContent[] = [];
  const users: Partial<Record<ReactionContent, string[]>> = {};
  if (!groups) return { counts, viewer, users };
  for (const group of groups) {
    if (!REACTION_CONTENTS.includes(group.content as ReactionContent)) continue;
    const content = group.content as ReactionContent;
    const total = group.reactors?.totalCount ?? 0;
    if (total > 0) counts[content] = total;
    if (group.viewerHasReacted) viewer.push(content);
    const logins = (group.reactors?.nodes ?? []).flatMap((n) =>
      n?.login ? [n.login] : [],
    );
    if (logins.length > 0) users[content] = logins;
  }
  return { counts, viewer, users };
}

/** GraphQL fragment used by both bulk-fetch and single-comment refresh. */
export const REACTION_GROUPS_FRAGMENT = `
  reactionGroups {
    content
    viewerHasReacted
    reactors(first: ${REACTORS_PER_GROUP}) {
      totalCount
      nodes { ... on Actor { login } }
    }
  }
`;

/**
 * Pull reaction counts + viewer state for a batch of comment node IDs in a
 * single GraphQL call. GitHub's `node(id:)` query handles mixed types, so we
 * inline-fragment both `IssueComment` and `PullRequestReviewComment`.
 */
/** Minimal shape we need from an Octokit instance – kept structural so callers
 *  don't need to import the augmented Octokit type. */
type GraphQLClient = {
  // biome-ignore lint/suspicious/noExplicitAny: matches octokit.graphql's overloaded signature
  graphql: (q: string, vars?: Record<string, unknown>) => Promise<any>;
};

export async function fetchReactionsForCommentNodes(
  octokit: GraphQLClient,
  nodeIds: string[],
): Promise<Map<string, CommentReactions>> {
  const result = new Map<string, CommentReactions>();
  if (nodeIds.length === 0) return result;

  const query = `
    query($ids: [ID!]!) {
      nodes(ids: $ids) {
        __typename
        ... on IssueComment {
          id
          ${REACTION_GROUPS_FRAGMENT}
        }
        ... on PullRequestReviewComment {
          id
          ${REACTION_GROUPS_FRAGMENT}
        }
      }
    }
  `;

  interface NodeResp {
    nodes: Array<
      | (null & { id?: never })
      | { id: string; reactionGroups: ReactionGroupNode[] }
    >;
  }

  // Batch in chunks: GitHub's node() query accepts arbitrarily large lists,
  // but very large payloads can trip secondary rate limits. 100 is comfortable.
  const CHUNK = 100;
  for (let i = 0; i < nodeIds.length; i += CHUNK) {
    const chunk = nodeIds.slice(i, i + CHUNK);
    const resp = (await octokit.graphql(query, { ids: chunk })) as NodeResp;
    for (const node of resp.nodes) {
      if (!node || !("id" in node) || !node.id) continue;
      result.set(
        node.id,
        reactionGroupsToCommentReactions(node.reactionGroups),
      );
    }
  }
  return result;
}
