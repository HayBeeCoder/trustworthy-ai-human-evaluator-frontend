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
    const [stats, setStats] = useState<Stats | null>(null);
    const [target, setTarget] = useState(120);
    const [message, setMessage] = useState("");

    async function fetchStats() {
        const res = await fetch("/api/admin/stats", { cache: "no-store" });
        if (!res.ok) {
            setMessage("Failed to fetch live stats.");
            return;
        }
        const data = await res.json();
        setStats(data);
        setTarget(data.targetSampleSize);
    }

    useEffect(() => {
        fetchStats();

        const intervalId = window.setInterval(() => {
            fetchStats();
        }, 3000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    async function updateTarget() {
        const res = await fetch("/api/admin/sample-size", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetSampleSize: target })
        });

        if (!res.ok) {
            setMessage("Failed to update sample size.");
            return;
        }

        setMessage("Sample size updated.");
        fetchStats();
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
                    onChange={(e) => setTarget(Number(e.target.value))}
                />
                <div className="row" style={{ marginTop: 12 }}>
                    <button className="true" onClick={updateTarget}>Apply</button>
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
