import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchRFCsByText } from "@/lib/github";

export interface RFCSearchResponseItem {
  owner: string;
  repo: string;
  number: number;
  matchedIn: "title" | "description";
}

export async function GET(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json([] as RFCSearchResponseItem[]);
  }

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    const hits = await searchRFCsByText({ accessToken, query: q, limit: 50 });
    const body: RFCSearchResponseItem[] = hits.map((h) => ({
      owner: h.owner,
      repo: h.repo,
      number: h.number,
      matchedIn: h.matchedIn,
    }));
    return NextResponse.json(body);
  } catch (error) {
    // GitHub returns 403 with `rate limit` in the message when search quota
    // is exhausted (30/min for authenticated users). Surface that as 429 so
    // the client can degrade gracefully without a generic "server error"
    // banner.
    const status = (error as { status?: number })?.status;
    if (status === 403 || status === 422) {
      return NextResponse.json(
        { error: "Search rate limit hit" },
        { status: 429 },
      );
    }
    console.error("Error searching RFCs:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
