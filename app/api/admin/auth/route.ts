import { NextRequest, NextResponse } from "next/server";
import { ADMIN_AUTH_COOKIE, adminAuthConfigured, isAdminAuthorized } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
    if (!adminAuthConfigured()) {
        return NextResponse.json({ error: "ADMIN_TOKEN is not configured" }, { status: 500 });
    }

    if (!isAdminAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
    const adminToken = process.env.ADMIN_TOKEN || "";
    if (!adminToken) {
        return NextResponse.json({ error: "ADMIN_TOKEN is not configured" }, { status: 500 });
    }

    const body = await request.json();
    const passcode = String(body?.passcode || "");
    if (!passcode || passcode !== adminToken) {
        return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
        name: ADMIN_AUTH_COOKIE,
        value: adminToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7
    });
    return response;
}

export async function DELETE() {
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
        name: ADMIN_AUTH_COOKIE,
        value: "",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0
    });
    return response;
}
