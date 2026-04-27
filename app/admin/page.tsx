"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
    targetSampleSize: number;
    sampledTaskCount: number;
    completedResponses: number;
    skippedCount: number;
    uniqueSessions: number;
    remainingResponses: number;
};

export default function AdminPage() {
    const POLL_INTERVAL_MS = 10000;
    const [stats, setStats] = useState<Stats | null>(null);
    const [authState, setAuthState] = useState<"checking" | "locked" | "unlocked">("checking");
    const [passcode, setPasscode] = useState("");
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [target, setTarget] = useState(120);
    const [targetInitialized, setTargetInitialized] = useState(false);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [isSavingTarget, setIsSavingTarget] = useState(false);
    const [message, setMessage] = useState("");

    async function checkAuth() {
        const res = await fetch("/api/admin/auth", { cache: "no-store" });
        if (res.ok) {
            setAuthState("unlocked");
            return true;
        }
        setAuthState("locked");
        return false;
    }

    async function fetchStats() {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (!res.ok) {
            if (res.status === 401) {
                setAuthState("locked");
                setMessage("Enter admin passcode to view dashboard.");
                return;
            }
            setMessage("Failed to fetch live stats.");
            return;
        }
        const data = await res.json();
        setStats(data);
        if (!targetInitialized || !isEditingTarget) {
            setTarget(data.targetSampleSize);
            setTargetInitialized(true);
        }
    }

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (authState !== "unlocked") {
            return;
        }

        fetchStats();

        const intervalId = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                fetchStats();
            }
        }, POLL_INTERVAL_MS);

        function handleVisibilityChange() {
            if (document.visibilityState === "visible") {
                fetchStats();
            }
        }

        function handleFocus() {
            fetchStats();
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleFocus);
        };
    }, [authState]);

    async function unlockAdmin() {
        if (!passcode) {
            setMessage("Enter passcode.");
            return;
        }

        setIsUnlocking(true);
        setMessage("Checking passcode...");
        const res = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passcode })
        });

        if (!res.ok) {
            setMessage("Invalid passcode.");
            setIsUnlocking(false);
            return;
        }

        setAuthState("unlocked");
        setPasscode("");
        setMessage("Access granted.");
        setIsUnlocking(false);
    }

    async function lockAdmin() {
        await fetch("/api/admin/auth", { method: "DELETE" });
        setAuthState("locked");
        setStats(null);
        setMessage("Dashboard locked.");
    }

    async function updateTarget() {
        const previousStats = stats;
        setIsSavingTarget(true);
        setMessage("Saving sample size...");

        if (previousStats) {
            setStats({
                ...previousStats,
                targetSampleSize: target
            });
        }

        const res = await fetch("/api/admin/sample-size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetSampleSize: target })
        });

        if (!res.ok) {
            if (previousStats) {
                setStats(previousStats);
            }
            setMessage("Failed to update sample size.");
            setIsSavingTarget(false);
            return;
        }

        const data = await res.json();

        setStats((current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                targetSampleSize: Number(data.targetSampleSize ?? current.targetSampleSize),
                sampledTaskCount: Number(data.sampledTaskCount ?? current.sampledTaskCount),
                remainingResponses: Math.max(
                    Number(data.sampledTaskCount ?? current.sampledTaskCount) - current.completedResponses,
                    0
                )
            };
        });

        setMessage("Sample size updated.");
        setIsEditingTarget(false);
        setIsSavingTarget(false);
        await fetchStats();
    }

    if (authState === "checking") {
        return (
            <main className="main">
                <div className="card">
                    <h2>Admin Access</h2>
                    <p className="small">Checking access...</p>
                </div>
            </main>
        );
    }

    if (authState === "locked") {
        return (
            <main className="main">
                <div className="topbar">
                    <h1>Admin Dashboard</h1>
                    <Link href="/">Go to Evaluator Page</Link>
                </div>

                <div className="card">
                    <h2>Enter Admin Passcode</h2>
                    <label htmlFor="passcode">Passcode</label>
                    <input
                        id="passcode"
                        type="password"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="Enter admin passcode"
                    />
                    <div className="row" style={{ marginTop: 12 }}>
                        <button className="true" onClick={unlockAdmin} disabled={isUnlocking}>
                            {isUnlocking ? "Unlocking..." : "Unlock Dashboard"}
                        </button>
                    </div>
                    {message ? <p className="small">{message}</p> : null}
                </div>
            </main>
        );
    }

    return (
        <main className="main">
            <div className="topbar">
                <h1>Admin Dashboard</h1>
                <div className="row" style={{ gap: 8 }}>
                    <Link href="/">Go to Evaluator Page</Link>
                    <button className="ghost" onClick={lockAdmin}>Lock</button>
                </div>
            </div>

            <div className="card">
                <h2>Round Settings</h2>
                <label htmlFor="target">Target sample size</label>
                <input
                    id="target"
                    type="number"
                    min={1}
                    value={target}
                    onFocus={() => setIsEditingTarget(true)}
                    onBlur={() => setIsEditingTarget(false)}
                    onChange={(e) => {
                        setIsEditingTarget(true);
                        setTarget(Number(e.target.value));
                    }}
                />
                <p className="small" style={{ marginTop: 8 }}>
                    Saved target: <strong>{stats?.targetSampleSize ?? "-"}</strong>
                </p>
                <div className="row" style={{ marginTop: 12 }}>
                    <button className="true" onClick={updateTarget} disabled={isSavingTarget}>
                        {isSavingTarget ? "Applying..." : "Apply"}
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
                <h2>Progress</h2>
                {stats ? (
                    <>
                        <p>Sampled tasks: <strong>{stats.sampledTaskCount}</strong></p>
                        <p>Responses submitted: <strong>{stats.completedResponses}</strong></p>
                        <p>Tasks skipped: <strong>{stats.skippedCount}</strong></p>
                        <p>Unique sessions: <strong>{stats.uniqueSessions}</strong></p>
                        <p>Remaining responses to complete sample once: <strong>{stats.remainingResponses}</strong></p>
                    </>
                ) : (
                    <p className="small">Loading metrics...</p>
                )}
                {message ? <p className="small">{message}</p> : null}
            </div>
        </main>
    );
}
