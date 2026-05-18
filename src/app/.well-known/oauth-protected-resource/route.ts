import { NextResponse } from "next/server";
import { issuerUrl, resourceUrl, SUPPORTED_SCOPES } from "@/lib/mcp-oauth";

/**
 * RFC 9728 Protected-Resource metadata. The MCP client fetches this after
 * receiving a 401 from /mcp, learns which Authorization Server(s) to talk to,
 * and then proceeds with the standard OAuth 2.1 dance.
 *
 * We are simultaneously the resource and the authorization server – the
 * `authorization_servers` array therefore points back at our own origin.
 */
export function GET() {
  const iss = issuerUrl();
  return NextResponse.json(
    {
      resource: resourceUrl(),
      authorization_servers: [iss],
      bearer_methods_supported: ["header"],
      scopes_supported: SUPPORTED_SCOPES,
      resource_documentation: `${iss}/mcp`,
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
