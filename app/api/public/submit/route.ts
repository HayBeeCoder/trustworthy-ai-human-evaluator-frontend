import { NextRequest, NextResponse } from "next/server";
import { submitTaskForSession } from "@/lib/store";

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { taskId, sessionId, verdict, note } = body as {
        taskId?: string;
        sessionId?: string;
        verdict?: "true" | "false" | "unsure";
        note?: string;
    };

    if (!taskId || !sessionId || !verdict) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await submitTaskForSession({ taskId, sessionId, verdict, note });
    return NextResponse.json(result);
}
