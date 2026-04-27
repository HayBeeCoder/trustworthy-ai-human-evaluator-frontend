"use client";

import { useEffect, useState } from "react";

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
    const [target, setTarget] = useState(120);
    const [targetInitialized, setTargetInitialized] = useState(false);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [isSavingTarget, setIsSavingTarget] = useState(false);
    const [message, setMessage] = useState("");

    async function fetchStats() {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (!res.ok) {
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
    }, []);

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

    return (
        <main className="main">
            <div className="topbar">
                <h1>Admin Dashboard</h1>
                <a href="/">Go to Evaluator Page</a>
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
