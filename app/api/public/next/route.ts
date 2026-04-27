import { NextRequest, NextResponse } from "next/server";
import { nextTaskForSession, nextTasksForSession } from "@/lib/store";

export async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get("sessionId") || "anonymous";
    const countParam = Number(request.nextUrl.searchParams.get("count") || "1");
    const count = Number.isFinite(countParam) ? countParam : 1;

    if (count <= 1) {
        const item = await nextTaskForSession(sessionId);
        return NextResponse.json({ item, items: item ? [item] : [] });
    }

    const items = await nextTasksForSession(sessionId, count);
    return NextResponse.json({ item: items[0] || null, items });
}
