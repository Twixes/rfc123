import { getPostHogServer } from "./src/lib/posthog-server";

export async function register() {
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const posthog = getPostHogServer();
		if (posthog) {
			console.log("PostHog server instrumentation initialized");

			// Shutdown hook to flush events
			process.on("SIGTERM", async () => {
				await posthog.shutdown();
			});
		} else {
			console.warn("PostHog not initialized - missing NEXT_PUBLIC_POSTHOG_KEY");
		}
	}
}

export async function onRequestError(
	err: Error & { digest?: string },
	request: {
		path: string; // URL path
		method: string; // Request method
		headers: { [key: string]: string };
	},
	context: {
		routerKind: "Pages Router" | "App Router"; // Server runtime
		routePath: string; // Path of the route file
		routeType: "render" | "route" | "action" | "middleware"; // Server context in which the error occurred
		renderSource:
			| "react-server-components"
			| "react-server-components-payload"
			| "server-rendering";
		revalidateReason: "on-demand" | "stale" | undefined; // Reason for revalidation
		renderType: "dynamic" | "dynamic-resume"; // Type of rendering
	},
) {
	const posthog = getPostHogServer();

	// Extract distinct_id from PostHog cookies if available
	let distinctId = "anonymous";
	const cookies = request.headers.cookie || "";
	const phCookieMatch = cookies.match(/ph_[^_]+_posthog=([^;]+)/);

	if (phCookieMatch) {
		try {
			const cookieData = JSON.parse(decodeURIComponent(phCookieMatch[1]));
			distinctId = cookieData.distinct_id || "anonymous";
		} catch (_e) {
			// Ignore cookie parsing errors
		}
	}

	// Capture the exception with context if PostHog is available
	if (posthog) {
		posthog.captureException(err, distinctId, {
			$current_url: request.path,
			$request_method: request.method,
			$request_path: request.path,
			digest: err.digest,
			router_kind: context.routerKind,
			route_path: context.routePath,
			route_type: context.routeType,
			render_source: context.renderSource,
			render_type: context.renderType,
			revalidate_reason: context.revalidateReason,
		});
	}

	// Also log to console for development
	console.error("Server error captured by instrumentation:", {
		error: err.message,
		path: request.path,
		method: request.method,
		digest: err.digest,
	});
}
