"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Item = {
    task_id: string;
    image_id: string;
    image_url: string;
    model: string;
    region: string;
    income_quintile: string;
    predicted: string;
};

function getSessionId(): string {
    const key = "human_eval_session";
    let session = localStorage.getItem(key);
    if (!session) {
        session = crypto.randomUUID();
        localStorage.setItem(key, session);
    }
    return session;
}

export default function HomePage() {
    const [item, setItem] = useState<Item | null>(null);
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [imageLoaded, setImageLoaded] = useState(false);

    const sessionId = useMemo(() => (typeof window === "undefined" ? "" : getSessionId()), []);

    async function loadNext() {
        if (!sessionId) return;
        setLoading(true);
        setMessage("");
        const res = await fetch(`/api/public/next?sessionId=${sessionId}`);
        const data = await res.json();
        setItem(data.item ?? null);
        setLoading(false);
    }

    useEffect(() => {
        loadNext();
    }, [sessionId]);

    useEffect(() => {
        setImageLoaded(false);
    }, [item?.task_id]);

    async function submit(verdict: "true" | "false" | "unsure") {
        if (!item || !sessionId) return;
        setLoading(true);
        const res = await fetch("/api/public/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: item.task_id, sessionId, verdict, note })
        });

        if (!res.ok) {
            setMessage("Submission failed. Please try again.");
            setLoading(false);
            return;
        }

        setNote("");
        setMessage("Saved.");
        await loadNext();
        setLoading(false);
    }

    async function skipCurrent() {
        if (!item || !sessionId) return;
        setLoading(true);
        const res = await fetch("/api/public/skip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId: item.task_id, sessionId })
        });

        if (!res.ok) {
            setMessage("Skip failed. Please try again.");
            setLoading(false);
            return;
        }

        setMessage("Task skipped.");
        await loadNext();
        setLoading(false);
    }

    return (
        <main className="main">
            <div className="topbar">
                <h1><Link href="/">Prediction Review Studio</Link></h1>
                <Link href="/admin">Admin Dashboard</Link>
            </div>

            <p className="small">Welcome. Review each prediction and choose True, False, or Unsure.</p>

            {loading && <p className="small">Loading...</p>}
            {message && <p className="small">{message}</p>}

            {!item && !loading ? (
                <div className="card">
                    <h2>No more tasks in your current sample.</h2>
                    <p className="small">Ask admin to increase sample size or start a new round.</p>
                </div>
            ) : null}

            {item ? (
                <div className="card">
                    <p className="small meta">Task {item.task_id} | {item.model} | {item.region} | {item.income_quintile}</p>
                    <div className="task-split">
                        <div className="image-container">
                            <img
                                className={`eval-image ${imageLoaded ? "is-loaded" : ""}`}
                                src={item.image_url}
                                alt={item.image_id}
                                loading="lazy"
                                onLoad={() => setImageLoaded(true)}
                            />
                        </div>

                        <div className="task-details">
                            <p><strong>Prediction:</strong> {item.predicted}</p>

                            <label htmlFor="note">Optional note</label>
                            <textarea
                                id="note"
                                rows={3}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Any context or ambiguity you noticed"
                            />

                            <div className="row action-row">
                                <button className="true" onClick={() => submit("true")}>True</button>
                                <button className="false" onClick={() => submit("false")}>False</button>
                                <button className="unsure" onClick={() => submit("unsure")}>Unsure / Ambiguous</button>
                                <button className="ghost" onClick={skipCurrent}>Skip</button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
