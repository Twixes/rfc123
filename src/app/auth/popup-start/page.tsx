"use client";

import { useEffect, useRef } from "react";
import { signInWithGitHub } from "@/lib/auth-actions";
import { POPUP_COMPLETE_PATH } from "@/lib/popup-auth-protocol";

export default function PopupStartPage() {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <div className="grid place-items-center min-h-screen">
      <p className="text-sm text-gray-50">Redirecting to GitHub…</p>
      <form ref={formRef} action={signInWithGitHub} className="hidden">
        <input type="hidden" name="callbackUrl" value={POPUP_COMPLETE_PATH} />
        <button type="submit">Continue to GitHub</button>
      </form>
    </div>
  );
}
