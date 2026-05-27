"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

interface PostHogProviderProps {
  children: React.ReactNode;
  userLogin?: string | null;
  userEmail?: string | null;
  userName?: string | null;
}

export function PostHogProvider({
  children,
  userLogin,
  userEmail,
  userName,
}: PostHogProviderProps) {
  useEffect(() => {
    if (userLogin) {
      posthog.identify(userLogin, {
        github_login: userLogin,
        email: userEmail ?? undefined,
        name: userName ?? undefined,
      });
    }
  }, [userLogin, userEmail, userName]);

  return <>{children}</>;
}
