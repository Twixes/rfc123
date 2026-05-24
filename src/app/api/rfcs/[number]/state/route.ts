import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  ForbiddenError,
  RFC_STATE_ACTIONS,
  type RfcStateAction,
  setRfcState,
} from "@/lib/github";

const VALID_ACTIONS = new Set<RfcStateAction>(RFC_STATE_ACTIONS);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ number: string }> },
) {
  const session = await auth();
  if (!(session as { accessToken?: string })?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { number } = await params;
  const prNumber = Number.parseInt(number, 10);
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  if (!owner || !repo || !Number.isFinite(prNumber)) {
    return NextResponse.json({ error: "Missing owner/repo" }, { status: 400 });
  }

  const { action } = (await request.json()) as { action?: string };
  if (!action || !VALID_ACTIONS.has(action as RfcStateAction)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const result = await setRfcState(
      (session as unknown as { accessToken: string }).accessToken,
      owner,
      repo,
      prNumber,
      action as RfcStateAction,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Only the RFC author can change its state." },
        { status: 403 },
      );
    }
    console.error("Error setting RFC state:", error);
    return NextResponse.json(
      { error: "Failed to update RFC state" },
      { status: 500 },
    );
  }
}
