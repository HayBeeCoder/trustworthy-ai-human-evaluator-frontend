import { NextResponse } from "next/server";
import { readRuntime } from "@/lib/store";

export async function GET() {
    const runtime = await readRuntime();
    const uniqueSessions = new Set(runtime.responses.map((response) => response.sessionId)).size;

    return NextResponse.json({
        targetSampleSize: runtime.targetSampleSize,
        sampledTaskCount: runtime.sampledTaskIds.length,
        completedResponses: runtime.responses.length,
        skippedCount: runtime.skipped.length,
        uniqueSessions,
        remainingResponses: Math.max(runtime.sampledTaskIds.length - runtime.responses.length, 0)
    });
}
