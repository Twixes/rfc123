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
			<div className="max-w-md space-y-4 border-4 border-black bg-white p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
				<h2 className="text-2xl font-bold">Something went wrong!</h2>
				<p className="text-gray-700">
					An unexpected error occurred. The error has been logged and we'll look
					into it.
				</p>
				{error.message && (
					<div className="border-2 border-red-500 bg-red-50 p-3">
						<p className="font-mono text-sm text-red-900">{error.message}</p>
					</div>
				)}
				<button
					type="button"
					onClick={() => reset()}
					className="w-full border-4 border-black bg-cyan px-4 py-2 font-bold transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none"
				>
					Try again
				</button>
			</div>
		</div>
	);
}
