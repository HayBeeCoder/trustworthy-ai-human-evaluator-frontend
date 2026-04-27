import { NextRequest, NextResponse } from "next/server";
import { nextTaskForSession } from "@/lib/store";

export async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get("sessionId") || "anonymous";
    const item = await nextTaskForSession(sessionId);
    return NextResponse.json({ item });
}
