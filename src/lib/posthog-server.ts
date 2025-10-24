import { PostHog } from "posthog-node"

let posthogInstance: PostHog | null = null

export function getPostHogServer(): PostHog  | null{
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        return null
    }
    if (!posthogInstance) {
        posthogInstance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
            host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        })
    }
    return posthogInstance as PostHog
}

export function captureServerException(error: Error, userLogin: string | undefined, context?: Record<string, any>): void {
    try {
        const posthog = getPostHogServer()
        // Use provided userLogin or fallback to "server" for system errors
        posthog?.captureException(error, userLogin, context)
    } catch (captureError) {
        // Fallback to console if PostHog fails
        console.error("Failed to capture exception with PostHog:", captureError)
        console.error("Original error:", error)
    }
}
