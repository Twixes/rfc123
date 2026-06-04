"use server";

import { signIn } from "@/auth";

/**
 * Form action that kicks off GitHub OAuth directly, skipping NextAuth's
 * provider-chooser page. The `callbackUrl` hidden field – passed by the
 * caller form – becomes the post-auth landing target, so a logged-out
 * reader on an RFC ends up back on that same RFC after signing in.
 */
export async function signInWithGitHub(formData: FormData) {
  const callbackUrl = formData.get("callbackUrl");
  await signIn("github", {
    redirectTo:
      typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/",
  });
}
