"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		// Initialize PostHog if not already initialized
		if (typeof window !== "undefined" && !posthog.__loaded) {
			posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
				api_host: "/ingest",
				ui_host: "https://us.posthog.com",
				person_profiles: "identified_only",
				capture_pageview: true,
				capture_pageleave: true,
			});
		}
	}, []);

	return <>{children}</>;
}
