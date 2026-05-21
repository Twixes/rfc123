import { NextResponse } from "next/server";
import { api, convexClient, secretKey } from "@/lib/convex";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  pkceS256,
  randomToken,
  sha256Hex,
} from "@/lib/mcp-oauth";

// RFC 7636 §4.1 – code_verifier is 43..128 chars of [A-Z a-z 0-9 -._~].
const PKCE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * OAuth 2.1 token endpoint. We only support `grant_type=authorization_code`
 * with PKCE. The flow:
 *
 *   1. Parse the form body (token endpoints use application/x-www-form-urlencoded).
 *   2. Atomically consume the authorization code via Convex.
 *   3. Verify client_id matches, redirect_uri matches, PKCE verifier hashes
 *      to the stored challenge, and (for confidential clients) the secret.
 *   4. Mint an opaque access token, persist, return.
 */
export async function POST(request: Request) {
  let form: URLSearchParams;
  try {
    form = await request.formData().then((fd) => {
      const p = new URLSearchParams();
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") p.set(k, v);
      }
      return p;
    });
  } catch {
    return error("invalid_request", "Body must be form-encoded");
  }

  if (form.get("grant_type") !== "authorization_code") {
    return error(
      "unsupported_grant_type",
      "Only authorization_code is supported",
    );
  }

  const code = form.get("code");
  const redirectUri = form.get("redirect_uri");
  const clientId = form.get("client_id");
  const codeVerifier = form.get("code_verifier");
  const clientSecret = form.get("client_secret");

  if (typeof code !== "string" || !code) {
    return error("invalid_request", "code is required");
  }
  if (typeof redirectUri !== "string" || !redirectUri) {
    return error("invalid_request", "redirect_uri is required");
  }
  if (typeof clientId !== "string" || !clientId) {
    return error("invalid_request", "client_id is required");
  }
  if (
    typeof codeVerifier !== "string" ||
    !PKCE_VERIFIER_RE.test(codeVerifier)
  ) {
    return error("invalid_grant", "code_verifier missing or malformed (PKCE)");
  }

  const client = await convexClient().query(api.mcpOAuth.getClient, {
    secret: secretKey(),
    clientId,
  });
  if (!client) return error("invalid_client", "Unknown client_id");

  if (client.tokenEndpointAuthMethod === "client_secret_post") {
    if (
      typeof clientSecret !== "string" ||
      !client.clientSecretHash ||
      sha256Hex(clientSecret) !== client.clientSecretHash
    ) {
      return error("invalid_client", "Invalid client_secret");
    }
  }

  // Validate-then-consume in a single Convex mutation. A bad client_id /
  // redirect_uri / PKCE no longer burns the code, so a leaked code can't be
  // weaponized for denial-of-service against the legitimate client.
  const result = await convexClient().mutation(api.mcpOAuth.consumeAuthCode, {
    secret: secretKey(),
    code,
    clientId,
    redirectUri,
    codeChallenge: pkceS256(codeVerifier),
  });
  if (result.status !== "ok") {
    const map: Record<Exclude<typeof result.status, "ok">, string> = {
      not_found: "Code is invalid",
      already_consumed: "Code has already been used",
      expired: "Code has expired",
      client_mismatch: "Code was issued to a different client",
      redirect_mismatch: "redirect_uri mismatch",
      pkce_failed: "PKCE verification failed",
    };
    return error("invalid_grant", map[result.status]);
  }

  const token = randomToken(40);
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000;
  await convexClient().mutation(api.mcpOAuth.createAccessToken, {
    secret: secretKey(),
    tokenHash: sha256Hex(token),
    clientId,
    userId: result.row.userId,
    scope: result.row.scope,
    expiresAt,
  });

  return NextResponse.json(
    {
      access_token: token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      scope: result.row.scope ?? "mcp",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

function error(code: string, description: string, status = 400) {
  return NextResponse.json(
    { error: code, error_description: description },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
