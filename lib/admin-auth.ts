import { NextRequest, NextResponse } from "next/server";

export const ADMIN_AUTH_COOKIE = "admin_access";

function getAdminToken(): string {
    return process.env.ADMIN_TOKEN || "";
}

export function isAdminAuthorized(request: NextRequest): boolean {
    const adminToken = getAdminToken();
    if (!adminToken) {
        return false;
    }

    const cookieToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value || "";
    return cookieToken === adminToken;
}

export function unauthorizedAdminResponse(): NextResponse {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function adminAuthConfigured(): boolean {
    return Boolean(getAdminToken());
}
