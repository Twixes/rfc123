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
  reviewers: Array<{ login: string; avatar: string, yetToReview: boolean }>;
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

function cleanTitle(title: string) {
  return title.replace(/(^RFC:? |^Add RFC for |^\[RFC\] | RFC$)/i, "");
}

export async function listRFCs(accessToken: string): Promise<RFC[]> {
  const octokit = await getOctokit(accessToken);

  // GraphQL query to fetch all PRs with files and comment counts in one request
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: 100, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
          nodes {
            number
            title
            state
            createdAt
            updatedAt
            mergedAt
            url
            author {
              login
              avatarUrl
            }
            files(first: 100) {
              nodes {
                path
              }
            }
            comments {
              totalCount
            }
          }
        }
      }
    }
  `;

  const response: any = await octokit.graphql(query, {
    owner: GITHUB_ORG,
    repo: GITHUB_REPO,
  });

  const pulls = response.repository.pullRequests.nodes;

  // Filter PRs that have .md files in /requests-for-comments/ directory
  const rfcPulls = pulls.filter((pr: any) =>
    pr.files.nodes.some(
      (file: any) =>
        file.path.startsWith("requests-for-comments/") &&
        file.path.endsWith(".md"),
    ),
  );

  // Fetch review comment counts using HEAD requests (much faster than fetching all comments)
  const rfcPullsWithCounts = await Promise.all(
    rfcPulls.map(async (pr: any) => {
      // Use per_page=1 and check pagination headers for total count
      const response = await octokit.rest.pulls.listReviewComments({
        owner: GITHUB_ORG,
        repo: GITHUB_REPO,
        pull_number: pr.number,
        per_page: 1,
      });

      // Extract total count from link header or data length
      let reviewCommentCount = response.data.length;
      const linkHeader = response.headers.link;
      if (linkHeader) {
        const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (lastPageMatch) {
          reviewCommentCount = Number.parseInt(lastPageMatch[1], 10);
        }
      }

      return {
        number: pr.number,
        title: pr.title,
        state: pr.state.toLowerCase(),
        merged_at: pr.mergedAt,
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        html_url: pr.url,
        user: pr.author
          ? {
              login: pr.author.login,
              avatar_url: pr.author.avatarUrl,
            }
          : null,
        _inlineCommentCount: reviewCommentCount,
        _regularCommentCount: pr.comments.totalCount,
      };
    }),
  );

  const filteredPulls = rfcPullsWithCounts;

  // Sort: open PRs first, then by created date
  const sortedPulls = filteredPulls.sort((a: any, b: any) => {
    if (a.state === "open" && b.state !== "open") return -1;
    if (a.state !== "open" && b.state === "open") return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return sortedPulls.map((pr: any) => ({
    number: pr.number,
    title: cleanTitle(pr.title),
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

  const reviewersAlreadyAccountedFor: Set<string> = new Set();
  const reviewers:RFCDetail['reviewers'] = []
  for (const review of reviews) {
    if (review.user && !reviewersAlreadyAccountedFor.has(review.user.login)) {
      reviewers.push({
        login: review.user.login,
        avatar: review.user.avatar_url,
        yetToReview: false,
      });
      reviewersAlreadyAccountedFor.add(review.user.login);
    }
  }
  for (const requestedReviewer of requestedReviewers.users) {
    if (!reviewersAlreadyAccountedFor.has(requestedReviewer.login)) {
      reviewers.push({
        login: requestedReviewer.login,
        avatar: requestedReviewer.avatar_url,
        yetToReview: true,
      });
    }
  }

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
    title: cleanTitle(pr.title),
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
    reviewers,
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
