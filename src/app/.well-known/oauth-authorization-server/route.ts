import { NextResponse } from "next/server";
import { issuerUrl, SUPPORTED_SCOPES } from "@/lib/mcp-oauth";

/**
 * RFC 8414 Authorization-Server metadata. MCP clients use this to discover
 * the registration / authorization / token endpoints without hard-coding
 * paths. We support PKCE (S256) only, the authorization_code grant, and DCR
 * (RFC 7591).
 */
export function GET() {
  const iss = issuerUrl();
  return NextResponse.json(
    {
      issuer: iss,
      authorization_endpoint: `${iss}/api/mcp-oauth/authorize`,
      token_endpoint: `${iss}/api/mcp-oauth/token`,
      registration_endpoint: `${iss}/api/mcp-oauth/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: SUPPORTED_SCOPES,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

export function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
