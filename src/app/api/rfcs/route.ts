import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listRFCs } from "@/lib/github";

export async function GET(request: Request) {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo parameter" },
      { status: 400 },
    );
  }

  try {
    const rfcs = await listRFCs(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
    );
    return NextResponse.json(rfcs);
  } catch (error) {
    console.error("Error fetching RFCs:", error);
    return NextResponse.json(
      { error: "Failed to fetch RFCs" },
      { status: 500 },
    );
  }
}
