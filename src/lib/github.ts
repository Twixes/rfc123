import { Octokit } from "octokit"
import { getCachedJsonData, setCachedJsonData } from "./cache"
import { captureServerException } from "./posthog-server"

export interface RepoOption {
    owner: string
    name: string
    fullName: string
}

export interface RFC {
    number: number
    title: string
    author: string
    authorAvatar: string
    status: "open" | "merged" | "closed"
    createdAt: string
    updatedAt: string
    commentCount: number
    inlineCommentCount: number
    regularCommentCount: number
    url: string
    owner: string
    repo: string
    reviewRequested: boolean
}

export interface RFCDetail extends RFC {
    body: string
    markdownContent: string
    markdownFilePath: string | null
    reviewers: Array<{ login: string; avatar: string; yetToReview: boolean }>
    comments: Comment[]
}

export interface Comment {
    id: number
    user: string
    userAvatar: string
    body: string
    createdAt: string
    path?: string
    line?: number
    diffHunk?: string
}

export async function getOctokit(accessToken: string) {
    return new Octokit({ auth: accessToken })
}

function cleanTitle(title: string) {
    return title.replace(/(^RFC - |^RFC:? |^Add RFC for |^\[RFC\] | RFC$)/i, "")
}

export async function listReposWithRFCs(accessToken: string): Promise<RepoOption[]> {
    try {
        const octokit = await getOctokit(accessToken)

        // Get all repos the user has access to (personal + orgs)
        const cachedReposWithRFCs = await getCachedJsonData<RepoOption[]>(`repos_with_rfcs:${accessToken}`)
        if (cachedReposWithRFCs) {
            return cachedReposWithRFCs
        }

        const data = await octokit.rest.repos.listForAuthenticatedUser({
            per_page: 100,
            sort: "updated",
            affiliation: "owner,organization_member",
        })
        const repos = data.data.map((repo) => ({
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
        }))

        // Check all repos in parallel for /requests-for-comments/ directory
        const checks = repos.map(async (repo) => {
            let rfcsDirectory = await getCachedJsonData(`repo_rfcs_dir:${repo.owner}:${repo.name}`)
            if (rfcsDirectory != null) {
                return rfcsDirectory ? repo : null
            }
            // Try to get the contents of the requests-for-comments directory
            const [variantFull, variantShort] = await Promise.allSettled([
                octokit.rest.repos.getContent({
                    owner: repo.owner,
                    repo: repo.name,
                    path: "requests-for-comments",
                }),
                octokit.rest.repos.getContent({
                    owner: repo.owner,
                    repo: repo.name,
                    path: "RFCs",
                }),
            ])
            rfcsDirectory = false
            if (variantFull.status === "fulfilled") {
                rfcsDirectory = "requests-for-comments"
            } else if (variantShort.status === "fulfilled") {
                rfcsDirectory = "RFCs"
            }
            // If successful, this repo has the directory
            await setCachedJsonData(`repo_rfcs_dir:${repo.owner}:${repo.name}`, rfcsDirectory, 600)
            return repo
        })

        const results = await Promise.all(checks)
        const reposWithRFCs = results.filter((repo): repo is RepoOption => repo !== null)
        await setCachedJsonData(`repos_with_rfcs:${accessToken}`, reposWithRFCs, 600)
        return reposWithRFCs
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "listReposWithRFCs",
            context: "fetching_repos_with_rfcs",
        })
        throw error
    }
}

export async function listRFCs(
    accessToken: string,
    owner: string,
    repo: string,
    currentUserLogin: string
): Promise<RFC[]> {
    try {
        const octokit = await getOctokit(accessToken)

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
              reviewRequests(first: 10) {
                nodes {
                  requestedReviewer {
                    ... on User {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

        // Check cache first
        const cacheKey = `rfcs:${owner}:${repo}:graphql`
        let pulls: any[] = []
        const cachedPulls = await getCachedJsonData<any[]>(cacheKey)

        if (cachedPulls) {
            pulls = cachedPulls
        } else {
            const response: any = await octokit.graphql(query, {
                owner,
                repo,
            })
            pulls = response.repository.pullRequests.nodes
            await setCachedJsonData(cacheKey, pulls, 300) // Cache for 5 minutes
        }

        // Filter PRs that have .md files in /requests-for-comments/ directory
        const rfcPulls = pulls.filter((pr: any) =>
            pr.files.nodes.some(
                (file: any) => (file.path.startsWith("requests-for-comments/") || file.path.toLowerCase().startsWith("rfcs/")) && file.path.endsWith(".md")
            )
        )

        // Fetch review comment counts using HEAD requests (much faster than fetching all comments)
        const rfcPullsWithCounts = await Promise.all(
            rfcPulls.map(async (pr: any) => {
                // Check cache for review comment count
                const commentCountCacheKey = `rfc:${owner}:${repo}:${pr.number}:review_comments_count`
                let reviewCommentCount = 0
                const cachedCount = await getCachedJsonData<number>(commentCountCacheKey)

                if (cachedCount != null) {
                    reviewCommentCount = cachedCount
                } else {
                    // Use per_page=1 and check pagination headers for total count
                    const response = await octokit.rest.pulls.listReviewComments({
                        owner,
                        repo,
                        pull_number: pr.number,
                        per_page: 1,
                    })

                    // Extract total count from link header or data length
                    reviewCommentCount = response.data.length
                    const linkHeader = response.headers.link
                    if (linkHeader) {
                        const lastPageMatch = linkHeader.match(/page=(\d+)>; rel="last"/)
                        if (lastPageMatch) {
                            reviewCommentCount = Number.parseInt(lastPageMatch[1], 10)
                        }
                    }

                    await setCachedJsonData(commentCountCacheKey, reviewCommentCount, 300) // Cache for 5 minutes
                }

                // Check if current user is a requested reviewer
                const reviewRequested = pr.reviewRequests?.nodes?.some(
                    (req: any) => req.requestedReviewer?.login === currentUserLogin
                )

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
                    _reviewRequested: reviewRequested || false,
                }
            })
        )

        const filteredPulls = rfcPullsWithCounts

        // Sort: review requested first within each status, then open PRs, then by created date
        const sortedPulls = filteredPulls.sort((a: any, b: any) => {
            // First, sort by status (open > merged > closed)
            if (a.state === "open" && b.state !== "open") return -1
            if (a.state !== "open" && b.state === "open") return 1

            // Within same status, review requested comes first
            if (a._reviewRequested && !b._reviewRequested) return -1
            if (!a._reviewRequested && b._reviewRequested) return 1

            // Finally, sort by created date
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

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
            owner,
            repo,
            reviewRequested: pr._reviewRequested,
        }))
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "listRFCs",
            owner,
            repo,
            context: "fetching_rfcs",
        })
        throw error
    }
}

export async function listAllRFCs(accessToken: string, currentUserLogin: string): Promise<RFC[]> {
    try {
        // Get all repos with RFC directories
        const repos = await listReposWithRFCs(accessToken)

        // Fetch RFCs from all repos in parallel
        const allRFCsArrays = await Promise.all(
            repos.map((repo) => listRFCs(accessToken, repo.owner, repo.name, currentUserLogin))
        )

        // Flatten the arrays and sort: review requested first within each status, then open PRs, then by created date
        const allRFCs = allRFCsArrays.flat()

        return allRFCs.sort((a, b) => {
            // First, sort by status (open > merged > closed)
            if (a.status === "open" && b.status !== "open") return -1
            if (a.status !== "open" && b.status === "open") return 1

            // Within same status, review requested comes first
            if (a.reviewRequested && !b.reviewRequested) return -1
            if (!a.reviewRequested && b.reviewRequested) return 1

            // Finally, sort by created date
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "listAllRFCs",
            context: "fetching_all_rfcs",
        })
        throw error
    }
}

export async function getRFCDetail(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    currentUserLogin: string
): Promise<RFCDetail> {
    try {
        const octokit = await getOctokit(accessToken)

        // Check cache for RFC content (PR details + markdown)
        const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content`
        interface CachedRFCContent {
            pr: any
            files: any[]
            markdownContent: string
            markdownFilePath: string | null
        }
        let cachedContent = await getCachedJsonData<CachedRFCContent>(contentCacheKey)

        let pr: any
        let files: any[]
        let markdownContent: string
        let markdownFilePath: string | null

        if (cachedContent) {
            pr = cachedContent.pr
            files = cachedContent.files
            markdownContent = cachedContent.markdownContent
            markdownFilePath = cachedContent.markdownFilePath
        } else {
            // Get PR details
            const prResponse = await octokit.rest.pulls.get({
                owner,
                repo,
                pull_number: prNumber,
            })
            pr = prResponse.data

            // Get PR files to find the first markdown file
            const filesResponse = await octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: prNumber,
            })
            files = filesResponse.data

            const markdownFile = files.find(
                (file) => (file.filename.startsWith("requests-for-comments/") || file.filename.toLowerCase().startsWith("rfcs/")) && file.filename.endsWith(".md")
            )

            markdownContent = pr.body || ""
            markdownFilePath = markdownFile?.filename || null

            if (markdownFile) {
                // Fetch the actual content of the markdown file
                try {
                    const { data: fileContent } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: markdownFile.filename,
                        ref: pr.head.ref,
                    })

                    if ("content" in fileContent) {
                        markdownContent = Buffer.from(fileContent.content, "base64").toString("utf-8")
                    }
                } catch (error) {
                    console.error("Error fetching markdown file:", error)
                    captureServerException(error as Error, undefined, {
                        function: "getRFCDetail",
                        subfunction: "fetch_markdown_content",
                        owner,
                        repo,
                        prNumber,
                        markdownFile: markdownFile.filename,
                    })
                }
            }

            // Cache the content
            await setCachedJsonData(contentCacheKey, { pr, files, markdownContent, markdownFilePath }, 60) // Cache for 60 seconds
        }

        // Get review comments
        const { data: reviewComments } = await octokit.rest.pulls.listReviewComments({
            owner,
            repo,
            pull_number: prNumber,
        })

        // Get issue comments
        const { data: issueComments } = await octokit.rest.issues.listComments({
            owner,
            repo,
            issue_number: prNumber,
        })

        // Get requested reviewers
        const { data: requestedReviewers } = await octokit.rest.pulls.listRequestedReviewers({
            owner,
            repo,
            pull_number: prNumber,
        })

        // Get reviews
        const { data: reviews } = await octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: prNumber,
        })

        const reviewersAlreadyAccountedFor: Set<string> = new Set()
        const reviewers: RFCDetail["reviewers"] = []
        for (const review of reviews) {
            if (review.user && !reviewersAlreadyAccountedFor.has(review.user.login)) {
                reviewers.push({
                    login: review.user.login,
                    avatar: review.user.avatar_url,
                    yetToReview: false,
                })
                reviewersAlreadyAccountedFor.add(review.user.login)
            }
        }
        for (const requestedReviewer of requestedReviewers.users) {
            if (!reviewersAlreadyAccountedFor.has(requestedReviewer.login)) {
                reviewers.push({
                    login: requestedReviewer.login,
                    avatar: requestedReviewer.avatar_url,
                    yetToReview: true,
                })
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
        ]

        // Check if current user is a requested reviewer
        const reviewRequested = requestedReviewers.users.some((user) => user.login === currentUserLogin)

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
            owner,
            repo,
            body: pr.body || "",
            markdownContent,
            markdownFilePath,
            reviewers,
            reviewRequested: reviewRequested || false,
            comments: comments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "getRFCDetail",
            owner,
            repo,
            prNumber,
            context: "fetching_rfc_detail",
        })
        throw error
    }
}

export async function postComment(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    path?: string,
    line?: number
): Promise<void> {
    try {
        const octokit = await getOctokit(accessToken)

        if (path && line) {
            // Post as a review comment on a specific line
            const { data: pr } = await octokit.rest.pulls.get({
                owner,
                repo,
                pull_number: prNumber,
            })

            await octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: prNumber,
                body,
                commit_id: pr.head.sha,
                path,
                line,
            })
        } else {
            // Post as a regular issue comment
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body,
            })
        }
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "postComment",
            owner,
            repo,
            prNumber,
            path,
            line,
            context: "posting_comment",
        })
        throw error
    }
}

export async function getCurrentUserLogin(accessToken: string) {
    try {
        // Get current user's login (with caching)
        const userCacheKey = `user:${accessToken}`
        let currentUserLogin: string
        const cachedLogin = await getCachedJsonData<string>(userCacheKey)

        if (cachedLogin) {
            currentUserLogin = cachedLogin
        } else {
            const octokit = await getOctokit(accessToken)
            const { data: user } = await octokit.rest.users.getAuthenticated()
            currentUserLogin = user.login
            await setCachedJsonData(userCacheKey, currentUserLogin, 3600) // Cache for 1 hour
        }

        return currentUserLogin
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "getCurrentUserLogin",
            context: "fetching_current_user",
        })
        throw error
    }
}
