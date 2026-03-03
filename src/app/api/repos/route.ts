import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listReposWithRFCs } from "@/lib/github";

export async function GET() {
  const session = await auth();

  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = (session as unknown as { accessToken: string })
      .accessToken;
    const repos = await listReposWithRFCs(accessToken);
    return NextResponse.json(repos);
  } catch (error) {
    console.error("Error fetching repos:", error);
    return NextResponse.json(
      { error: "Failed to fetch repos" },
      { status: 500 },
    );
  }
}
