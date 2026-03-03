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

        // Check all repos in parallel for RFC content
        const checks = repos.map(async (repo) => {
            let hasRFCs = await getCachedJsonData(`repo_has_rfcs:${repo.owner}:${repo.name}`)
            if (hasRFCs != null) {
                return hasRFCs ? repo : null
            }
            // Check if repo name suggests it's an RFC repo
            const nameLower = repo.name.toLowerCase()
            if (nameLower.includes("rfc") || nameLower.includes("requests-for-comments")) {
                hasRFCs = true
                await setCachedJsonData(`repo_has_rfcs:${repo.owner}:${repo.name}`, hasRFCs, 600)
                return repo
            }
            // Otherwise check for known RFC directories
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
            hasRFCs = variantFull.status === "fulfilled" || variantShort.status === "fulfilled"
            await setCachedJsonData(`repo_has_rfcs:${repo.owner}:${repo.name}`, hasRFCs, 600)
            return hasRFCs ? repo : null
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

        // Filter PRs that have .md files (RFC content can be in any directory)
        const rfcPulls = pulls.filter((pr: any) =>
            pr.files.nodes.some((file: any) => file.path.endsWith(".md"))
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
        const t0 = performance.now()
        const octokit = await getOctokit(accessToken)

        // Check cache for RFC content (PR details + markdown + reviewers)
        const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content`
        interface CachedRFCContent {
            pr: any
            files: any[]
            markdownContent: string
            markdownFilePath: string | null
            reviewers: RFCDetail["reviewers"]
            reviewRequested: boolean
        }
        const tContentCache = performance.now()
        const cachedContent = await getCachedJsonData<CachedRFCContent>(contentCacheKey)
        console.log(`[getRFCDetail] content cache lookup took ${(performance.now() - tContentCache).toFixed(0)}ms (${cachedContent ? "HIT" : "MISS"})`)

        let pr: any
        let files: any[]
        let markdownContent: string
        let markdownFilePath: string | null
        let reviewers: RFCDetail["reviewers"]
        let reviewRequested: boolean

        // Check for reviewers in cache to handle old cache entries without reviewer data
        if (cachedContent && cachedContent.reviewers !== undefined) {
            pr = cachedContent.pr
            files = cachedContent.files
            markdownContent = cachedContent.markdownContent
            markdownFilePath = cachedContent.markdownFilePath
            reviewers = cachedContent.reviewers
            reviewRequested = cachedContent.reviewRequested
        } else {
            const tFetch = performance.now()

            // Fetch PR details, files, reviewers, and reviews in parallel
            const [prResponse, filesResponse, requestedReviewersRes, reviewsRes] = await Promise.all([
                octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number: prNumber,
                }),
                octokit.rest.pulls.listFiles({
                    owner,
                    repo,
                    pull_number: prNumber,
                }),
                octokit.rest.pulls.listRequestedReviewers({
                    owner,
                    repo,
                    pull_number: prNumber,
                }),
                octokit.rest.pulls.listReviews({
                    owner,
                    repo,
                    pull_number: prNumber,
                }),
            ])

            pr = prResponse.data
            files = filesResponse.data

            const markdownFile = files.find((file) => file.filename.endsWith(".md"))

            markdownContent = pr.body || ""
            markdownFilePath = markdownFile?.filename || null

            if (markdownFile) {
                // Fetch the actual content of the markdown file
                try {
                    const tMd = performance.now()
                    const { data: fileContent } = await octokit.rest.repos.getContent({
                        owner,
                        repo,
                        path: markdownFile.filename,
                        ref: pr.head.ref,
                    })
                    console.log(`[getRFCDetail] repos.getContent() for markdown took ${(performance.now() - tMd).toFixed(0)}ms`)

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

            // Build reviewers list
            const reviewersAlreadyAccountedFor: Set<string> = new Set()
            reviewers = []
            for (const review of reviewsRes.data) {
                if (review.user && !reviewersAlreadyAccountedFor.has(review.user.login)) {
                    reviewers.push({
                        login: review.user.login,
                        avatar: review.user.avatar_url,
                        yetToReview: false,
                    })
                    reviewersAlreadyAccountedFor.add(review.user.login)
                }
            }
            for (const requestedReviewer of requestedReviewersRes.data.users) {
                if (!reviewersAlreadyAccountedFor.has(requestedReviewer.login)) {
                    reviewers.push({
                        login: requestedReviewer.login,
                        avatar: requestedReviewer.avatar_url,
                        yetToReview: true,
                    })
                }
            }

            reviewRequested = requestedReviewersRes.data.users.some((user) => user.login === currentUserLogin)

            console.log(`[getRFCDetail] content fetch (all GH calls) took ${(performance.now() - tFetch).toFixed(0)}ms`)
            // Cache content + reviewers together
            await setCachedJsonData(contentCacheKey, { pr, files, markdownContent, markdownFilePath, reviewers, reviewRequested }, 300) // Cache for 5 minutes
        }

        console.log(`[getRFCDetail] total took ${(performance.now() - t0).toFixed(0)}ms`)

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
            comments: [], // Comments are loaded progressively by the client
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

interface CurrentUser {
    login: string
    avatarUrl: string
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
    try {
        const t0 = performance.now()
        const userCacheKey = `user_info:${accessToken}`
        const cached = await getCachedJsonData<CurrentUser>(userCacheKey)

        if (cached) {
            console.log(`[getCurrentUser] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`)
            return cached
        }

        // Also check the legacy login-only cache key to avoid an extra GH call during migration
        const legacyCacheKey = `user:${accessToken}`
        const cachedLogin = await getCachedJsonData<string>(legacyCacheKey)

        const octokit = await getOctokit(accessToken)
        const { data: user } = await octokit.rest.users.getAuthenticated()
        const currentUser: CurrentUser = { login: user.login, avatarUrl: user.avatar_url }
        await setCachedJsonData(userCacheKey, currentUser, 3600) // Cache for 1 hour
        // Also update legacy key so getCurrentUserLogin callers benefit
        if (!cachedLogin) {
            await setCachedJsonData(legacyCacheKey, user.login, 3600)
        }
        console.log(`[getCurrentUser] cache MISS, fetched from GH, took ${(performance.now() - t0).toFixed(0)}ms`)
        return currentUser
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "getCurrentUser",
            context: "fetching_current_user",
        })
        throw error
    }
}

export async function getCurrentUserLogin(accessToken: string): Promise<string> {
    try {
        const t0 = performance.now()
        // Check the login-only cache key first (fast path)
        const legacyCacheKey = `user:${accessToken}`
        const cachedLogin = await getCachedJsonData<string>(legacyCacheKey)

        if (cachedLogin) {
            console.log(`[getCurrentUserLogin] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`)
            return cachedLogin
        }

        // Fall through to getCurrentUser which caches both
        const user = await getCurrentUser(accessToken)
        console.log(`[getCurrentUserLogin] resolved via getCurrentUser, took ${(performance.now() - t0).toFixed(0)}ms`)
        return user.login
    } catch (error) {
        captureServerException(error as Error, undefined, {
            function: "getCurrentUserLogin",
            context: "fetching_current_user",
        })
        throw error
    }
}

export async function getRFCTitle(
    accessToken: string,
    owner: string,
    repo: string,
    prNumber: number,
): Promise<string | null> {
    try {
        const t0 = performance.now()
        // Try the same cache key that getRFCDetail uses
        const contentCacheKey = `rfc:${owner}:${repo}:${prNumber}:content`
        const cached = await getCachedJsonData<{ pr: { title: string } }>(contentCacheKey)
        if (cached) {
            console.log(`[getRFCTitle] cache HIT, took ${(performance.now() - t0).toFixed(0)}ms`)
            return cached.pr.title
        }

        // Cache miss — fetch just the PR title
        const octokit = await getOctokit(accessToken)
        const { data: pr } = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
        })
        console.log(`[getRFCTitle] cache MISS, fetched from GH, took ${(performance.now() - t0).toFixed(0)}ms`)
        return pr.title
    } catch {
        return null
    }
}
