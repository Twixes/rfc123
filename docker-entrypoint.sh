#!/bin/sh
# Push Convex schema + functions on first boot, then exec the Next.js server.
# Skips the push for Convex Cloud users (where CONVEX_SELF_HOSTED_* are unset).
set -e

if [ -n "$CONVEX_SELF_HOSTED_URL" ] && [ -n "$CONVEX_SELF_HOSTED_ADMIN_KEY" ]; then
  # docker-compose's depends_on already waits for backend health; this short
  # loop is just a safety net for non-compose deploys where ordering is loose.
  i=0
  until curl -fsS "$CONVEX_SELF_HOSTED_URL/version" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 10 ]; then
      echo "[entrypoint] Convex backend not reachable at $CONVEX_SELF_HOSTED_URL." >&2
      break
    fi
    sleep 1
  done

  echo "[entrypoint] Pushing Convex schema + functions ..."
  if ! convex deploy --yes; then
    echo "[entrypoint] convex deploy failed; starting Next.js anyway." >&2
  fi

  # Convex functions read process.env inside the backend, not the Next.js
  # container. Mirror the two values the hourly briefing needs, but only when
  # they've actually changed: every `env set` triggers a deployment bump.
  mirror_env() {
    name=$1
    desired=$2
    current=$(convex env get "$name" 2>/dev/null || true)
    if [ "$current" != "$desired" ]; then
      convex env set "$name" "$desired" >/dev/null 2>&1 || \
        echo "[entrypoint] warning: failed to mirror $name to Convex." >&2
    fi
  }
  [ -n "$SECRET_KEY" ] && mirror_env SECRET_KEY "$SECRET_KEY"
  [ -n "$NEXTAUTH_URL" ] && mirror_env NEXTAUTH_URL "$NEXTAUTH_URL"
fi

exec "$@"
