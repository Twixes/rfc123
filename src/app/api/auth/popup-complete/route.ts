import { POPUP_SIGNAL } from "@/lib/popup-auth-protocol";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Signed in</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; }
    body { display: grid; place-items: center; }
    p { font-size: 14px; color: #555; }
  </style>
</head>
<body>
  <p>Signed in. You can close this window.</p>
  <script>
    (function () {
      var SIGNAL = ${JSON.stringify(POPUP_SIGNAL)};
      try {
        if (window.opener) {
          window.opener.postMessage({ type: SIGNAL }, location.origin);
        }
      } catch (e) {}
      try {
        // Storage events cross window contexts even when postMessage is
        // blocked (e.g. some Safari configurations).
        window.localStorage.setItem(SIGNAL, String(Date.now()));
      } catch (e) {}
      window.close();
    })();
  </script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
