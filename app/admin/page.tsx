"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
    roundStatus: "running" | "stopped";
    targetSampleSize: number;
    sampledTaskCount: number;
    completedResponses: number;
    skippedCount: number;
    uniqueSessions: number;
    remainingResponses: number;
    regionFillRates: Array<{
        region: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    quintileFillRates: Array<{
        quintile: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    modelMetrics: Array<{
        model: string;
        sampled: number;
        completedTasks: number;
        remainingTasks: number;
        trueCount: number;
        falseCount: number;
        unsureCount: number;
        agreementPct: number;
    }>;
    queueHealth: Array<{
        region: string;
        quintile: string;
        sampled: number;
        completed: number;
        remaining: number;
        completionPct: number;
    }>;
    filterOptions: {
        regions: string[];
        quintiles: string[];
        models: string[];
    };
    activeFilters: {
        region: string;
        quintile: string;
        model: string;
    };
};

type CatalogEntry = {
    imageId: string;
    imageUrl: string;
    region: string;
    incomeQuintile: string;
    predictions: Array<{
        model: string;
        predicted: string;
    }>;
};

type DashboardTab = "all" | "overview" | "region" | "quintile" | "model" | "queue" | "catalog";
const TAB_KEYS: DashboardTab[] = ["all", "overview", "region", "quintile", "model", "queue", "catalog"];

const TAB_META: Array<{ key: DashboardTab; label: string; description: string }> = [
    {
        key: "all",
        label: "All",
        description: "Compact command view with all dashboard sections visible together."
    },
    {
        key: "overview",
        label: "Overview",
        description: "Quick pulse of total progress, response volume, and remaining work."
    },
    {
        key: "region",
        label: "Region",
        description: "Completion coverage split by geographic region."
    },
    {
        key: "quintile",
        label: "Quintile",
        description: "Completion coverage split by income quintile buckets."
    },
    {
        key: "model",
        label: "Model",
        description: "Model-by-model quality snapshot with verdict distribution."
    },
    {
        key: "queue",
        label: "Queue",
        description: "Most underfilled region and quintile cells to prioritize next."
    },
    {
        key: "catalog",
        label: "Catalog",
        description: "Browse image-by-image and compare predictions from all models on one screen."
    }
];

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
    const [isUpdatingRound, setIsUpdatingRound] = useState(false);
    const [message, setMessage] = useState("");
    const [activeTab, setActiveTab] = useState<DashboardTab>("all");
    const [filterRegion, setFilterRegion] = useState("all");
    const [filterQuintile, setFilterQuintile] = useState("all");
    const [filterModel, setFilterModel] = useState("all");
    const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
    const [catalogIndex, setCatalogIndex] = useState(0);
    const [catalogLoading, setCatalogLoading] = useState(false);

    async function checkAuth() {
        const res = await fetch("/api/admin/auth", { cache: "no-store" });
        if (res.ok) {
            setAuthState("unlocked");
            return true;
        }
        setAuthState("locked");
        return false;
    }

    function buildFilterQuery(): string {
        const query = new URLSearchParams();
        query.set("region", filterRegion);
        query.set("quintile", filterQuintile);
        query.set("model", filterModel);
        return query.toString();
    }

    async function fetchStats() {
        const res = await fetch(`/api/admin/stats?${buildFilterQuery()}`, { cache: "no-store" });
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

    async function fetchCatalog() {
        setCatalogLoading(true);
        const res = await fetch("/api/admin/catalog", { cache: "no-store" });
        if (!res.ok) {
            setMessage("Failed to load prediction catalog.");
            setCatalogLoading(false);
            return;
        }

        const data = await res.json();
        const entries = Array.isArray(data.entries) ? (data.entries as CatalogEntry[]) : [];
        setCatalogEntries(entries);
        setCatalogIndex((current) => {
            if (entries.length === 0) {
                return 0;
            }
            return Math.min(current, entries.length - 1);
        });
        setCatalogLoading(false);
    }

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const currentTab = new URLSearchParams(window.location.search).get("tab");
        if (currentTab && TAB_KEYS.includes(currentTab as DashboardTab)) {
            setActiveTab(currentTab as DashboardTab);
        }
    }, []);

    useEffect(() => {
        if (authState !== "unlocked") {
            return;
        }

        fetchStats();
        fetchCatalog();

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
    }, [authState, filterRegion, filterQuintile, filterModel]);

    function setActiveTabWithUrl(nextTab: DashboardTab) {
        setActiveTab(nextTab);
        if (typeof window === "undefined") {
            return;
        }

        const query = new URLSearchParams(window.location.search);
        query.set("tab", nextTab);
        const nextUrl = `${window.location.pathname}?${query.toString()}`;
        window.history.replaceState({}, "", nextUrl);
    }

    function resetFilters() {
        setFilterRegion("all");
        setFilterQuintile("all");
        setFilterModel("all");
    }

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

    async function updateRoundStatus(action: "start" | "stop") {
        setIsUpdatingRound(true);
        setMessage(action === "start" ? "Starting round..." : "Stopping round...");

        const res = await fetch("/api/admin/round", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action })
        });

        if (!res.ok) {
            setMessage("Failed to update round status.");
            setIsUpdatingRound(false);
            return;
        }

        setMessage(action === "start" ? "Round started." : "Round stopped.");
        setIsUpdatingRound(false);
        await fetchStats();
    }

    function exportActiveTab() {
        const query = new URLSearchParams();
        query.set("table", activeTab === "all" || activeTab === "catalog" ? "overview" : activeTab);
        query.set("region", filterRegion);
        query.set("quintile", filterQuintile);
        query.set("model", filterModel);
        const url = `/api/admin/export?${query.toString()}`;
        window.open(url, "_blank", "noopener,noreferrer");
    }

    const activeCatalogEntry = catalogEntries[catalogIndex] || null;

    function goToCatalogIndex(nextIndex: number) {
        if (catalogEntries.length === 0) {
            return;
        }
        const bounded = Math.max(0, Math.min(nextIndex, catalogEntries.length - 1));
        setCatalogIndex(bounded);
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

            <section className="admin-control-grid">
                <div className="card card-tabs">
                    <h2>Dashboard Tabs</h2>
                    <div className="tab-row">
                        {TAB_META.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`ghost tab-chip ${activeTab === tab.key ? "is-active" : ""}`}
                                onClick={() => setActiveTabWithUrl(tab.key)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <p className="small tab-description">
                        {TAB_META.find((tab) => tab.key === activeTab)?.description}
                    </p>
                    <div className="row" style={{ marginTop: 8 }}>
                        <button className="ghost" onClick={exportActiveTab}>Export Current Tab CSV</button>
                    </div>
                </div>

                <div className="card card-round">
                    <h2>Round Settings</h2>
                    <p className="small">
                        Round status: <strong>{stats?.roundStatus === "stopped" ? "Stopped" : "Running"}</strong>
                    </p>
                    <div className="row" style={{ marginTop: 8 }}>
                        <button
                            className="true"
                            onClick={() => updateRoundStatus("start")}
                            disabled={isUpdatingRound || stats?.roundStatus === "running"}
                        >
                            Start Round
                        </button>
                        <button
                            className="false"
                            onClick={() => updateRoundStatus("stop")}
                            disabled={isUpdatingRound || stats?.roundStatus === "stopped"}
                        >
                            Stop Round
                        </button>
                    </div>
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

                <div className="card card-filters">
                    <h2>Filters</h2>
                    <div className="filters-grid">
                        <div>
                            <label htmlFor="filter-region">Region</label>
                            <select
                                id="filter-region"
                                value={filterRegion}
                                onChange={(e) => setFilterRegion(e.target.value)}
                            >
                                <option value="all">All regions</option>
                                {(stats?.filterOptions.regions || []).map((region) => (
                                    <option key={region} value={region}>{region.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="filter-quintile">Income Quintile</label>
                            <select
                                id="filter-quintile"
                                value={filterQuintile}
                                onChange={(e) => setFilterQuintile(e.target.value)}
                            >
                                <option value="all">All quintiles</option>
                                {(stats?.filterOptions.quintiles || []).map((quintile) => (
                                    <option key={quintile} value={quintile}>{quintile}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="filter-model">Model</label>
                            <select
                                id="filter-model"
                                value={filterModel}
                                onChange={(e) => setFilterModel(e.target.value)}
                            >
                                <option value="all">All models</option>
                                {(stats?.filterOptions.models || []).map((model) => (
                                    <option key={model} value={model}>{model}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                        <button className="ghost" onClick={resetFilters}>Reset Filters</button>
                    </div>
                </div>

                {(activeTab === "overview" || activeTab === "all") ? (
                    <div className="card card-progress">
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
                ) : null}
            </section>

            {stats ? (
                <div className={activeTab === "all" ? "dashboard-panels-grid" : ""}>
                    {(activeTab === "region" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Coverage by Region</h2>
                            {stats.regionFillRates.length === 0 ? (
                                <p className="small">No region metrics yet.</p>
                            ) : (
                                <div className="metric-list">
                                    {stats.regionFillRates.map((entry) => (
                                        <div key={entry.region} className="metric-row">
                                            <div className="metric-row-head">
                                                <strong>{entry.region.toUpperCase()}</strong>
                                                <span className="small">{entry.completed}/{entry.sampled} complete</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div style={{ width: `${entry.completionPct}%` }} />
                                            </div>
                                            <p className="small">Remaining: {entry.remaining} ({entry.completionPct}% complete)</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "quintile" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Coverage by Income Quintile</h2>
                            {stats.quintileFillRates.length === 0 ? (
                                <p className="small">No quintile metrics yet.</p>
                            ) : (
                                <div className="metric-list">
                                    {stats.quintileFillRates.map((entry) => (
                                        <div key={entry.quintile} className="metric-row">
                                            <div className="metric-row-head">
                                                <strong>{entry.quintile}</strong>
                                                <span className="small">{entry.completed}/{entry.sampled} complete</span>
                                            </div>
                                            <div className="progress-bar">
                                                <div style={{ width: `${entry.completionPct}%` }} />
                                            </div>
                                            <p className="small">Remaining: {entry.remaining} ({entry.completionPct}% complete)</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "model" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Model Quality Snapshot</h2>
                            {stats.modelMetrics.length === 0 ? (
                                <p className="small">No model metrics yet.</p>
                            ) : (
                                <div className="table-wrap">
                                    <table className="dashboard-table">
                                        <thead>
                                            <tr>
                                                <th>Model</th>
                                                <th>Sampled</th>
                                                <th>Done</th>
                                                <th>Remaining</th>
                                                <th>True</th>
                                                <th>False</th>
                                                <th>Unsure</th>
                                                <th>Agreement</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.modelMetrics.map((entry) => (
                                                <tr key={entry.model}>
                                                    <td>{entry.model}</td>
                                                    <td>{entry.sampled}</td>
                                                    <td>{entry.completedTasks}</td>
                                                    <td>{entry.remainingTasks}</td>
                                                    <td>{entry.trueCount}</td>
                                                    <td>{entry.falseCount}</td>
                                                    <td>{entry.unsureCount}</td>
                                                    <td>{entry.agreementPct}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {(activeTab === "queue" || activeTab === "all") ? (
                        <div className="card" style={{ marginTop: 16 }}>
                            <h2>Queue Health (Region x Quintile)</h2>
                            {stats.queueHealth.length === 0 ? (
                                <p className="small">No queue health metrics yet.</p>
                            ) : (
                                <div className="table-wrap">
                                    <table className="dashboard-table">
                                        <thead>
                                            <tr>
                                                <th>Region</th>
                                                <th>Quintile</th>
                                                <th>Sampled</th>
                                                <th>Done</th>
                                                <th>Remaining</th>
                                                <th>Completion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.queueHealth.map((entry) => (
                                                <tr key={`${entry.region}-${entry.quintile}`}>
                                                    <td>{entry.region.toUpperCase()}</td>
                                                    <td>{entry.quintile}</td>
                                                    <td>{entry.sampled}</td>
                                                    <td>{entry.completed}</td>
                                                    <td>{entry.remaining}</td>
                                                    <td>{entry.completionPct}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {activeTab === "catalog" ? (
                <div className="card" style={{ marginTop: 16 }}>
                    <h2>Prediction Catalog</h2>
                    <p className="small">
                        {catalogEntries.length > 0
                            ? `Image ${catalogIndex + 1} of ${catalogEntries.length}`
                            : "No catalog entries available."}
                    </p>

                    <div className="row" style={{ marginTop: 8 }}>
                        <button
                            className="ghost"
                            onClick={() => goToCatalogIndex(catalogIndex - 1)}
                            disabled={catalogLoading || catalogEntries.length === 0 || catalogIndex <= 0}
                        >
                            Previous
                        </button>
                        <button
                            className="ghost"
                            onClick={() => goToCatalogIndex(catalogIndex + 1)}
                            disabled={catalogLoading || catalogEntries.length === 0 || catalogIndex >= catalogEntries.length - 1}
                        >
                            Next
                        </button>
                        <button className="ghost" onClick={fetchCatalog} disabled={catalogLoading}>
                            {catalogLoading ? "Refreshing..." : "Refresh Catalog"}
                        </button>
                    </div>

                    {activeCatalogEntry ? (
                        <div className="catalog-split" style={{ marginTop: 12 }}>
                            <div className="catalog-image-wrap">
                                <img src={activeCatalogEntry.imageUrl} alt={activeCatalogEntry.imageId} />
                                <p className="small">Image ID: {activeCatalogEntry.imageId}</p>
                                <p className="small">
                                    {activeCatalogEntry.region.toUpperCase()} | {activeCatalogEntry.incomeQuintile}
                                </p>
                            </div>

                            <div className="table-wrap">
                                <table className="dashboard-table">
                                    <thead>
                                        <tr>
                                            <th>Model</th>
                                            <th>Prediction</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeCatalogEntry.predictions.map((prediction) => (
                                            <tr key={`${activeCatalogEntry.imageId}-${prediction.model}`}>
                                                <td>{prediction.model}</td>
                                                <td>{prediction.predicted || "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <p className="small" style={{ marginTop: 12 }}>
                            {catalogLoading ? "Loading catalog..." : "No entries found."}
                        </p>
                    )}
                </div>
            ) : null}
        </main>
    );
}
