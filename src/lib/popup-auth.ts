"use client";

import { POPUP_SIGNAL, POPUP_START_PATH } from "./popup-auth-protocol";

const POPUP_NAME = "rfc123-github-auth";
const POPUP_WIDTH = 620;
const POPUP_HEIGHT = 720;

type PopupResult = "completed" | "closed";

/**
 * Open the GitHub OAuth flow in a centered popup window. Resolves to
 * `"completed"` when the popup posts the auth-complete signal (via
 * postMessage or storage event), or `"closed"` if the user dismisses the
 * window without finishing. Callers should re-check their session before
 * trusting the result – `"completed"` only means the popup told us it's done.
 *
 * The popup loads `/auth/popup-start` which auto-submits the existing
 * server-action sign-in, so GitHub OAuth fires without NextAuth's chooser
 * page. After GitHub finishes, NextAuth lands on `/api/auth/popup-complete`,
 * which posts the signal and closes the window.
 */
export function openGitHubAuthPopup(): Promise<PopupResult> {
  return new Promise((resolve) => {
    const left =
      window.screenX + Math.max(0, (window.outerWidth - POPUP_WIDTH) / 2);
    const top =
      window.screenY + Math.max(0, (window.outerHeight - POPUP_HEIGHT) / 2);
    const features = [
      `width=${POPUP_WIDTH}`,
      `height=${POPUP_HEIGHT}`,
      `left=${Math.round(left)}`,
      `top=${Math.round(top)}`,
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");

    const popup = window.open(POPUP_START_PATH, POPUP_NAME, features);

    if (!popup) {
      // Popup blocked – fall back to a full-page redirect with the current
      // URL preserved as the post-auth target.
      const fallback = encodeURIComponent(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      window.location.href = `/api/auth/signin?callbackUrl=${fallback}`;
      return;
    }

    let settled = false;
    function settle(result: PopupResult) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      clearInterval(closeWatcher);
      resolve(result);
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (
        typeof event.data === "object" &&
        event.data &&
        (event.data as { type?: unknown }).type === POPUP_SIGNAL
      ) {
        settle("completed");
      }
    }

    function onStorage(event: StorageEvent) {
      if (event.key === POPUP_SIGNAL) settle("completed");
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);

    // Polling fallback for when the user dismisses the popup (no signal fires).
    const closeWatcher = window.setInterval(() => {
      if (popup.closed) settle("closed");
    }, 500);
  });
}
