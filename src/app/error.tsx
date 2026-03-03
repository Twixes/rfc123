"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export default function Error({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// Capture the error with PostHog
		posthog.captureException(error, {
			digest: error.digest,
			page: "global_error_boundary",
		});

		// Also log to console for development
		console.error("Global error boundary caught:", error);
	}, [error]);

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<div className="max-w-md space-y-4 border border-gray-20 rounded-md shadow-md bg-surface p-8">
				<h2 className="text-2xl font-serif">Something went wrong!</h2>
				<p className="text-gray-70">
					An unexpected error occurred. The error has been logged and we'll look
					into it.
				</p>
				{error.message && (
					<div className="border border-red-300 bg-red-50 rounded-sm p-3">
						<p className="font-mono text-sm text-red-900">{error.message}</p>
					</div>
				)}
				<button
					type="button"
					onClick={() => reset()}
					className="w-full rounded-md bg-cyan px-4 py-2 font-medium text-foreground transition-all hover:opacity-80"
				>
					Try again
				</button>
			</div>
		</div>
	);
}
