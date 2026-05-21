import type { Comment } from "@/lib/github";

export interface CommentThread {
  id: number;
  comments: Comment[];
}

/** Group a flat list of comments into threads based on `inReplyToId` chains. */
export function groupIntoThreads(comments: Comment[]): CommentThread[] {
  const byId = new Map<number, Comment>();
  for (const c of comments) byId.set(c.id, c);

  function findRoot(c: Comment): number {
    let current = c;
    while (current.inReplyToId && byId.has(current.inReplyToId)) {
      current = byId.get(current.inReplyToId)!;
    }
    return current.id;
  }

  const threadMap = new Map<number, Comment[]>();
  const rootOrder: number[] = [];
  for (const c of comments) {
    const rootId = findRoot(c);
    if (!threadMap.has(rootId)) {
      threadMap.set(rootId, []);
      rootOrder.push(rootId);
    }
    threadMap.get(rootId)!.push(c);
  }

  return rootOrder.map((rootId) => ({
    id: rootId,
    comments: threadMap
      .get(rootId)!
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
  }));
}
