import { Octokit } from "octokit";

const GITHUB_ORG = process.env.GITHUB_ORG!;
const GITHUB_REPO = process.env.GITHUB_REPO!;

export interface RFC {
  number: number;
  title: string;
  author: string;
  authorAvatar: string;
  status: "open" | "merged" | "closed";
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  inlineCommentCount: number;
  regularCommentCount: number;
  url: string;
}

export interface RFCDetail extends RFC {
  body: string;
  markdownContent: string;
  markdownFilePath: string | null;
  reviewers: Array<{ login: string; avatar: string }>;
  comments: Comment[];
}

export interface Comment {
  id: number;
  user: string;
  userAvatar: string;
  body: string;
  createdAt: string;
  path?: string;
  line?: number;
  diffHunk?: string;
}

export async function getOctokit(accessToken: string) {
  return new Octokit({ auth: accessToken });
}

export async function listRFCs(accessToken: string): Promise<RFC[]> {
  const octokit = await getOctokit(accessToken);

  const { data: pulls } = await octokit.rest.pulls.list({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    state: "all",
    sort: "created",
    direction: "desc",
    per_page: 100,
  });

  // Filter PRs that have .md files in /requests-for-comments/ directory
  // and fetch comment counts
  const rfcPulls = await Promise.all(
    pulls.map(async (pr) => {
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number,
      });

      const hasRFCMarkdown = files.some(
        (file) =>
          file.filename.startsWith("requests-for-comments/") &&
          file.filename.endsWith(".md"),
      );

      if (!hasRFCMarkdown) return null;

      // Fetch actual comment counts
      const [{ data: reviewComments }, { data: issueComments }] =
        await Promise.all([
          octokit.rest.pulls.listReviewComments({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            pull_number: pr.number,
          }),
          octokit.rest.issues.listComments({
            owner: GITHUB_ORG,
            repo: GITHUB_REPO,
            issue_number: pr.number,
          }),
        ]);

      return {
        ...pr,
        _inlineCommentCount: reviewComments.length,
        _regularCommentCount: issueComments.length,
      };
    }),
  );

  const filteredPulls = rfcPulls.filter((pr) => pr !== null);

  // Sort: open PRs first, then by created date
  const sortedPulls = filteredPulls.sort((a, b) => {
    if (a.state === "open" && b.state !== "open") return -1;
    if (a.state !== "open" && b.state === "open") return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return sortedPulls.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login || "unknown",
    authorAvatar: pr.user?.avatar_url || "",
    status: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    commentCount: pr._inlineCommentCount + pr._regularCommentCount,
    inlineCommentCount: pr._inlineCommentCount,
    regularCommentCount: pr._regularCommentCount,
    url: pr.html_url,
  }));
}

export async function getRFCDetail(
  accessToken: string,
  prNumber: number,
): Promise<RFCDetail> {
  const octokit = await getOctokit(accessToken);

  // Get PR details
  const { data: pr } = await octokit.rest.pulls.get({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    pull_number: prNumber,
  });

  // Get PR files to find the first markdown file
  const { data: files } = await octokit.rest.pulls.listFiles({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    pull_number: prNumber,
  });

  const markdownFile = files.find(
    (file) =>
      file.filename.startsWith("requests-for-comments/") &&
      file.filename.endsWith(".md"),
  );

  let markdownContent = pr.body || "";

  if (markdownFile) {
    // Fetch the actual content of the markdown file
    try {
      const { data: fileContent } = await octokit.rest.repos.getContent({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        path: markdownFile.filename,
        ref: pr.head.ref,
      });

      if ("content" in fileContent) {
        markdownContent = Buffer.from(fileContent.content, "base64").toString(
          "utf-8",
        );
      }
    } catch (error) {
      console.error("Error fetching markdown file:", error);
    }
  }

  // Get review comments
  const { data: reviewComments } = await octokit.rest.pulls.listReviewComments({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    pull_number: prNumber,
  });

  // Get issue comments
  const { data: issueComments } = await octokit.rest.issues.listComments({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    issue_number: prNumber,
  });

  // Get requested reviewers
  const { data: requestedReviewers } =
    await octokit.rest.pulls.listRequestedReviewers({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber,
    });

  // Get reviews
  const { data: reviews } = await octokit.rest.pulls.listReviews({
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
    pull_number: prNumber,
  });

  const reviewers = [
    ...requestedReviewers.users.map((u) => ({
      login: u.login,
      avatar: u.avatar_url,
    })),
    ...reviews
      .filter((r) => r.user)
      .map((r) => ({
        login: r.user!.login,
        avatar: r.user!.avatar_url,
      })),
  ];

  // Deduplicate reviewers
  const uniqueReviewers = Array.from(
    new Map(reviewers.map((r) => [r.login, r])).values(),
  );

  const comments: Comment[] = [
    ...reviewComments.map((c) => ({
      id: c.id,
      user: c.user?.login || "unknown",
      userAvatar: c.user?.avatar_url || "",
      body: c.body || "",
      createdAt: c.created_at,
      path: c.path,
      line: c.line || c.original_line,
      diffHunk: c.diff_hunk,
    })),
    ...issueComments.map((c) => ({
      id: c.id,
      user: c.user?.login || "unknown",
      userAvatar: c.user?.avatar_url || "",
      body: c.body || "",
      createdAt: c.created_at,
    })),
  ];

  return {
    number: pr.number,
    title: pr.title,
    author: pr.user?.login || "unknown",
    authorAvatar: pr.user?.avatar_url || "",
    status: pr.merged_at ? "merged" : (pr.state as "open" | "closed"),
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    commentCount: pr.comments + pr.review_comments,
    inlineCommentCount: pr.review_comments,
    regularCommentCount: pr.comments,
    url: pr.html_url,
    body: pr.body || "",
    markdownContent,
    markdownFilePath: markdownFile?.filename || null,
    reviewers: uniqueReviewers,
    comments: comments.sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
  };
}

export async function postComment(
  accessToken: string,
  prNumber: number,
  body: string,
  path?: string,
  line?: number,
): Promise<void> {
  const octokit = await getOctokit(accessToken);

  if (path && line) {
    // Post as a review comment on a specific line
    const { data: pr } = await octokit.rest.pulls.get({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber,
    });

    await octokit.rest.pulls.createReviewComment({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      pull_number: prNumber,
      body,
      commit_id: pr.head.sha,
      path,
      line,
    });
  } else {
    // Post as a regular issue comment
    await octokit.rest.issues.createComment({
      owner: GITHUB_ORG,
      repo: GITHUB_REPO,
      issue_number: prNumber,
      body,
    });
  }
}
