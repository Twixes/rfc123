import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  type CommentReactions,
  getOctokit,
  REACTION_CONTENTS,
  type ReactionContent,
} from "@/lib/github";
import {
  REACTION_GROUPS_FRAGMENT,
  reactionGroupsToCommentReactions,
} from "@/lib/reactions";

/**
 * Toggle a reaction on a comment. Both review (inline) comments and issue
 * (general) comments are addressed by their GraphQL node ID, which the
 * comments listing already returns – so the body shape is the same regardless
 * of which kind of comment it is.
 */

interface ReactionBody {
  commentNodeId?: unknown;
  content?: unknown;
}

function parseBody(body: ReactionBody): {
  commentNodeId: string;
  content: ReactionContent;
} | null {
  if (typeof body.commentNodeId !== "string" || !body.commentNodeId)
    return null;
  if (typeof body.content !== "string") return null;
  if (!REACTION_CONTENTS.includes(body.content as ReactionContent)) return null;
  return {
    commentNodeId: body.commentNodeId,
    content: body.content as ReactionContent,
  };
}

async function readSession() {
  const session = await auth();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken;
  return accessToken ?? null;
}

interface MutationResp {
  subject: {
    reactionGroups: Array<{
      content: string;
      viewerHasReacted: boolean;
      reactors: {
        totalCount: number;
        nodes?: Array<{ login?: string | null } | null> | null;
      };
    }>;
  };
}

function toJson(resp: MutationResp): CommentReactions {
  return reactionGroupsToCommentReactions(resp.subject.reactionGroups);
}

export async function POST(request: NextRequest) {
  const accessToken = await readSession();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = parseBody((await request.json()) as ReactionBody);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing or invalid commentNodeId / content" },
      { status: 400 },
    );
  }
  try {
    const octokit = await getOctokit(accessToken);
    const resp = await octokit.graphql<{ addReaction: MutationResp }>(
      `mutation($input: AddReactionInput!) {
        addReaction(input: $input) {
          subject {
            ... on Reactable {
              ${REACTION_GROUPS_FRAGMENT}
            }
          }
        }
      }`,
      {
        input: {
          subjectId: parsed.commentNodeId,
          content: parsed.content,
        },
      },
    );
    return NextResponse.json({ reactions: toJson(resp.addReaction) });
  } catch (error) {
    console.error("Error adding reaction:", error);
    return NextResponse.json(
      { error: "Failed to add reaction" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const accessToken = await readSession();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = parseBody((await request.json()) as ReactionBody);
  if (!parsed) {
    return NextResponse.json(
      { error: "Missing or invalid commentNodeId / content" },
      { status: 400 },
    );
  }
  try {
    const octokit = await getOctokit(accessToken);
    const resp = await octokit.graphql<{ removeReaction: MutationResp }>(
      `mutation($input: RemoveReactionInput!) {
        removeReaction(input: $input) {
          subject {
            ... on Reactable {
              ${REACTION_GROUPS_FRAGMENT}
            }
          }
        }
      }`,
      {
        input: {
          subjectId: parsed.commentNodeId,
          content: parsed.content,
        },
      },
    );
    return NextResponse.json({ reactions: toJson(resp.removeReaction) });
  } catch (error) {
    console.error("Error removing reaction:", error);
    return NextResponse.json(
      { error: "Failed to remove reaction" },
      { status: 500 },
    );
  }
}
