"use client";
import { useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { AiLabel } from "../ui";
import { api, errorMessage } from "@/lib/client/api";
import type { FilterValue } from "./Filters";

/** "Summarize": the server recomputes the KPIs for these filters and the AI writes 3–5 bullets from them. */
export function AiSummary({ filters }: { filters: FilterValue }) {
  const [bullets, setBullets] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ bullets: string[] }>("/ai/summary", { body: filters });
      setBullets(res.bullets);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="d-flex align-items-center gap-2">
          <IconSparkles size={18} className="text-primary" /> AI Summary
        </h5>
        <button className="btn btn-primary btn-sm" onClick={run} disabled={busy}>
          {busy ? "Summarizing..." : bullets ? "Refresh" : "Summarize"}
        </button>
      </div>
      <div className="card-body">
        {!bullets && !error && !busy && <p className="mb-0 fs-13">Click Summarize to get 3–5 insights written from the numbers on this dashboard (current filters).</p>}
        {busy && (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && <div className="alert alert-warning fs-13 mb-0">{error}</div>}
        {bullets && !busy && (
          <div className="ai-summary">
            <AiLabel />
            <ul className="mb-0 ps-3">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
