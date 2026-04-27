import { NextRequest, NextResponse } from "next/server";
import { reseedSample } from "@/lib/store";

export async function POST(request: NextRequest) {
    const body = await request.json();
    const targetSampleSize = Number(body?.targetSampleSize ?? 0);

    if (!Number.isFinite(targetSampleSize) || targetSampleSize < 1) {
        return NextResponse.json({ error: "Invalid targetSampleSize" }, { status: 400 });
    }

    const state = await reseedSample(targetSampleSize);
    return NextResponse.json({ ok: true, targetSampleSize: state.targetSampleSize, sampledTaskCount: state.sampledTaskIds.length });
}
