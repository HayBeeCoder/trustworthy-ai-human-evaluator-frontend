import { NextRequest, NextResponse } from "next/server";
import { skipTaskForSession } from "@/lib/store";

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { taskId, sessionId } = body as {
        taskId?: string;
        sessionId?: string;
    };

    if (!taskId || !sessionId) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await skipTaskForSession(sessionId, taskId);
    return NextResponse.json({ ok: true });
}
