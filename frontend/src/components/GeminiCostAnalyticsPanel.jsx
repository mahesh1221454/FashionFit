
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, CalendarDays, CheckCircle2,
  ChevronLeft, ChevronRight, Coins, Filter, RefreshCw,
  TrendingUp, XCircle
} from "lucide-react";
import api from "../services/api";

const ENDPOINT =
  "/designs/management/generation-history/analytics/requests";

const initialFilters = {
  days: "30",
  request_status: "",
  model: "",
  job_id: "",
  date_from: "",
  date_to: "",
};

const count = (v) =>
  new Intl.NumberFormat("en-IN").format(Number(v) || 0);

const rupees = (v) =>
  v == null || !Number.isFinite(Number(v))
    ? "Unavailable"
    : "₹" + new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(Number(v));

function formatDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function getError(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((x) => x.msg).join(", ");
  return error.message || "Unable to load AI analytics.";
}

function Stat({ icon: Icon, label, value, detail }) {
  return (
    <article className="gca-stat">
      <div className="gca-stat-head">
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function GeminiCostAnalyticsPanel({
  accessToken,
  onSessionExpired,
}) {
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAction, setFilterAction] = useState("idle");
  const [selectedDay, setSelectedDay] = useState("");

  const load = useCallback(async (signal) => {
    if (!accessToken) {
      setError("Admin session is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = {
        days: Number(filters.days),
        page,
        page_size: 25,
      };

      for (const key of [
        "request_status", "model", "job_id",
        "date_from", "date_to"
      ]) {
        if (filters[key]) params[key] = filters[key];
      }

      const response = await api.get(ENDPOINT, {
        params,
        signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = response.data;

      if (
        !result?.success ||
        !Array.isArray(result.requests) ||
        !Array.isArray(result.daily) ||
        !Array.isArray(result.daily_jobs)
      ) {
        throw new Error("Invalid analytics response.");
      }

      if (signal.aborted) return;
      setData(result);
      setFilterAction((current) =>
        current === "applying"
          ? "applied"
          : current === "clearing"
            ? "cleared"
            : current
      );
      setModels(result.available_models || []);
    } catch (err) {
      if (signal.aborted || err.code === "ERR_CANCELED") return;
      if ([401, 403].includes(err.response?.status)) {
        onSessionExpired?.();
        return;
      }
      setError(getError(err));
      setData(null);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [
    accessToken, filters, page, reload, onSessionExpired
  ]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = data?.summary;
  const requests = data?.requests || [];
  const days = data?.daily || [];
  const dailyJobs = data?.daily_jobs || [];

  const activeDay =
    days.some((d) => d.date === selectedDay)
      ? selectedDay
      : days.at(-1)?.date || "";

  const jobsForDay = useMemo(
    () => dailyJobs
      .filter((j) => j.date === activeDay)
      .sort(
        (a, b) =>
          Number(b.known_cost_inr) - Number(a.known_cost_inr)
      ),
    [dailyJobs, activeDay]
  );

  const maxCost = Math.max(
    0,
    ...days.map((d) => Number(d.known_cost_inr) || 0)
  );

  const pages = Math.max(
    1, Math.ceil(Number(data?.total || 0) / 25)
  );

  function updateFilter(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function apply(event) {
    event.preventDefault();

    if (
      draft.date_from &&
      draft.date_to &&
      draft.date_from > draft.date_to
    ) {
      setError("From date must not exceed To date.");
      return;
    }

    if (
      draft.job_id &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(draft.job_id.trim())
    ) {
      setError("Enter a full, valid job UUID.");
      return;
    }

    setFilterAction("applying");
    setPage(1);
    setSelectedDay("");
    setFilters({
      ...draft,
      job_id: draft.job_id.trim(),
    });
    setReload((v) => v + 1);
  }

  function clearFilters() {
    setFilterAction("clearing");
    setDraft({ ...initialFilters });
    setFilters({ ...initialFilters });
    setPage(1);
    setSelectedDay("");
    setReload((v) => v + 1);
  }

  const hasPendingChanges =
    JSON.stringify(draft) !== JSON.stringify(filters);

  return (
    <section className="gca-root">
      <header className="gca-heading">
        <div>
          <span className="gca-eyebrow">
            AI API MONITORING
          </span>
          <h2>AI API Usage & Cost</h2>
          <p>
            Track API requests, individual costs, token
            consumption and daily generation spending.
          </p>
        </div>
        <button
          className="gca-btn"
          type="button"
          disabled={loading}
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <p className="gca-disclaimer">
        Estimated costs are calculated from recorded AI
        usage and configured rates, not official billed amounts.
      </p>

      <form className="gca-panel" onSubmit={apply}>
        <div className="gca-panel-title">
          <h3><Filter size={18} /> Filters</h3>
        </div>

        <div className="gca-filters">
          <label>
            Period
            <select
              value={draft.days}
              onChange={(e) => updateFilter("days", e.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
              <option value="0">All history</option>
            </select>
          </label>

          <label>
            Request status
            <select
              value={draft.request_status}
              onChange={(e) =>
                updateFilter("request_status", e.target.value)
              }
            >
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </label>

          <label>
            Model
            <select
              value={draft.model}
              onChange={(e) => updateFilter("model", e.target.value)}
            >
              <option value="">All models</option>
              {models.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>

          <label>
            Job ID
            <input
              placeholder="Full job UUID"
              value={draft.job_id}
              onChange={(e) => updateFilter("job_id", e.target.value)}
            />
          </label>

          <label>
            From date (UTC)
            <input
              type="date"
              value={draft.date_from}
              onChange={(e) =>
                updateFilter("date_from", e.target.value)
              }
            />
          </label>

          <label>
            To date (UTC)
            <input
              type="date"
              value={draft.date_to}
              onChange={(e) =>
                updateFilter("date_to", e.target.value)
              }
            />
          </label>
        </div>

        <div className="gca-actions">
          <button className={`gca-primary ${
      filterAction === "applied" && !hasPendingChanges
        ? "gca-applied"
        : ""
    } ${hasPendingChanges ? "gca-pending" : ""}`} type="submit">
            {filterAction === "applying"
              ? "Applying..."
              : filterAction === "applied" && !hasPendingChanges
                ? "Applied"
                : "Apply Filters"}
          </button>
          <button
            className="gca-btn"
            type="button"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>
      
        <div
          className="gca-filter-feedback"
          role="status"
          aria-live="polite"
        >
          {hasPendingChanges
            ? "Filter changes are not applied yet"
            : filterAction === "applying"
              ? "Applying filters..."
              : filterAction === "applied"
                ? "Filters applied successfully"
                : filterAction === "clearing"
                  ? "Resetting filters..."
                  : filterAction === "cleared"
                    ? "Filters reset successfully"
                    : "Choose filters and click Apply Filters"}
        </div>
      </form>

      {error && (
        <div className="gca-error" role="alert">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <div className="gca-stats">
        <Stat
          icon={Activity}
          label="API Requests"
          value={summary ? count(summary.total_requests) : "—"}
          detail="All matching requests"
        />
        <Stat
          icon={CheckCircle2}
          label="Successful"
          value={summary ? count(summary.successful_requests) : "—"}
          detail="Successful API attempts"
        />
        <Stat
          icon={Coins}
          label="Known Estimated Cost"
          value={summary ? rupees(summary.known_cost_inr) : "—"}
          detail={
            summary?.unknown_cost_requests
              ? `${count(summary.unknown_cost_requests)} requests unpriced`
              : "For the selected period"
          }
        />
        <Stat
          icon={XCircle}
          label="Failed"
          value={summary ? count(summary.failed_requests) : "—"}
          detail="Failed API attempts"
        />
      </div>

      <section className="gca-panel">
        <div className="gca-panel-title">
          <div>
            <span className="gca-eyebrow">REQUEST LEDGER</span>
            <h3>Individual API Requests</h3>
            <p>Every recorded request, including retry attempts.</p>
          </div>
          <strong>{count(data?.total)} requests</strong>
        </div>

        <div className="gca-table-scroll">
          <table className="gca-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Job ID</th>
                <th>View</th>
                <th>Model</th>
                <th>Attempt</th>
                <th>Status</th>
                <th>Input</th>
                <th>Output</th>
                <th>Image</th>
                <th>Thinking</th>
                <th>Duration</th>
                <th>Cost (INR)</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.created_at)}</td>
                  <td title={r.job_id || "Unlinked"}>
                    <code>
                      {r.job_id?.slice(0, 8) || "Unlinked"}
                    </code>
                  </td>
                  <td>{r.view_name || "—"}</td>
                  <td>{r.model_name}</td>
                  <td>{r.attempt_number ?? "—"}</td>
                  <td>
                    <span className={`gca-status ${r.status}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>{r.input_tokens == null ? "—" : count(r.input_tokens)}</td>
                  <td>{r.output_tokens == null ? "—" : count(r.output_tokens)}</td>
                  <td>{r.image_output_tokens == null ? "—" : count(r.image_output_tokens)}</td>
                  <td>{r.thinking_tokens == null ? "—" : count(r.thinking_tokens)}</td>
                  <td>
                    {r.duration_ms == null
                      ? "—"
                      : `${(r.duration_ms / 1000).toFixed(2)} s`}
                  </td>
                  <td className="gca-money">
                    {rupees(r.estimated_cost?.total_inr)}
                  </td>
                </tr>
              ))}

              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={12} className="gca-empty">
                    No API records found for these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="gca-pages">
          <span>Page {page} of {pages}</span>
          <div>
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <button
              type="button"
              disabled={page >= pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      <section className="gca-panel">
        <div className="gca-panel-title">
          <div>
            <span className="gca-eyebrow">COST TREND</span>
            <h3><TrendingUp size={19} /> Day-wise API Cost</h3>
            <p>
              Select a bar to see the jobs contributing
              to that day's estimated spending.
            </p>
          </div>
          <CalendarDays size={21} />
        </div>

        {days.length ? (
          <div className="gca-chart-scroll">
            <div
              className="gca-chart"
              style={{
                minWidth: Math.max(500, days.length * 60),
              }}
            >
              {days.map((day) => {
                const cost = Number(day.known_cost_inr) || 0;
                const height = maxCost > 0
                  ? (cost / maxCost) * 100
                  : 0;

                return (
                  <button
                    key={day.date}
                    type="button"
                    className={
                      activeDay === day.date
                        ? "gca-bar-item selected"
                        : "gca-bar-item"
                    }
                    onClick={() => setSelectedDay(day.date)}
                    title={`${day.date} — ${rupees(cost)}`}
                  >
                    <span>{rupees(cost)}</span>
                    <span className="gca-track">
                      <span
                        className="gca-bar"
                        style={{ height: `${height}%` }}
                      />
                    </span>
                    <small>{day.date.slice(5)}</small>
                    {day.unknown_cost_requests > 0 && (
                      <em>Partial</em>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="gca-empty">
            No daily cost data available.
          </div>
        )}
        <p className="gca-footnote">
          Dates are UTC. Daily amounts sum known estimates only;
          days with unpriced requests are marked Partial.
        </p>
      </section>

      <section className="gca-panel">
        <div className="gca-panel-title">
          <div>
            <span className="gca-eyebrow">JOB COSTS</span>
            <h3>Job-wise Cost Breakdown</h3>
            <p>
              {activeDay
                ? `Jobs with API activity on ${activeDay} (UTC)`
                : "Select a day in the chart"}
            </p>
          </div>
          <Coins size={20} />
        </div>

        <div className="gca-table-scroll">
          <table className="gca-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>API Requests</th>
                <th>Known Estimated Cost</th>
                <th>Cost Coverage</th>
              </tr>
            </thead>
            <tbody>
              {jobsForDay.map((job, i) => (
                <tr key={`${job.job_id || "unlinked"}-${i}`}>
                  <td>
                    <code>
                      {job.job_id || "Unlinked API usage"}
                    </code>
                  </td>
                  <td>{count(job.requests)}</td>
                  <td className="gca-money">
                    {rupees(job.known_cost_inr)}
                  </td>
                  <td>
                    {job.complete
                      ? "Complete"
                      : `${count(job.unknown_cost_requests)} unpriced`}
                  </td>
                </tr>
              ))}

              {!jobsForDay.length && (
                <tr>
                  <td colSpan={4} className="gca-empty">
                    No job cost details for this day.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <style>{CSS}</style>
    </section>
  );
}

const CSS = `
.gca-root{display:grid;gap:20px;width:100%;color:#18181b;font-family:inherit}
.gca-root *{box-sizing:border-box}
.gca-heading,.gca-panel-title{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.gca-heading h2{font-size:25px;margin:7px 0}
.gca-heading p,.gca-panel-title p{font-size:13px;color:#85858e;margin:5px 0;line-height:1.6}
.gca-eyebrow{font-size:10px;letter-spacing:1.2px;font-weight:800;color:#ea580c}
.gca-disclaimer{font-size:12px;color:#64748b;margin:0}
.gca-panel,.gca-stat{background:#fff;border:1px solid #e7e7ed;border-radius:16px;padding:20px}
.gca-panel-title{align-items:center;margin-bottom:18px}
.gca-panel-title h3{font-size:19px;margin:6px 0;display:flex;gap:8px;align-items:center}
.gca-panel-title>strong{font-size:12px;color:#71717a}
.gca-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.gca-filters label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:700;color:#52525b;min-width:0}
.gca-filters input,.gca-filters select{width:100%;height:43px;padding:0 12px;border:1px solid #e4e4e7;border-radius:9px;background:#fff;color:#18181b;font:inherit;outline:none}
.gca-filters input:focus,.gca-filters select:focus{border-color:#f97316}
.gca-actions{display:flex;gap:10px;margin-top:17px}
.gca-btn,.gca-primary{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 15px;border-radius:9px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.gca-btn{background:white;color:#52525b;border:1px solid #e4e4e7}
.gca-primary{background:#f97316;color:white;border:1px solid #f97316}
.gca-btn:disabled{opacity:.5;cursor:not-allowed}
.gca-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.gca-stat{min-width:0}
.gca-stat-head{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#71717a}
.gca-stat strong{display:block;font-size:24px;margin:15px 0 8px;overflow-wrap:anywhere}
.gca-stat small{color:#a1a1aa;font-size:11px}
.gca-table-scroll{overflow-x:auto}
.gca-table{border-collapse:collapse;width:100%;text-align:left;font-size:12px}
.gca-table th{background:#fafafa;color:#71717a;white-space:nowrap;padding:12px;border-bottom:1px solid #e4e4e7}
.gca-table td{padding:12px;border-bottom:1px solid #f0f0f2;white-space:nowrap}
.gca-table code{font-size:11px;color:#52525b}
.gca-status{font-size:11px;font-weight:700;border-radius:20px;padding:5px 9px;text-transform:capitalize;background:#f4f4f5}
.gca-status.success{color:#15803d;background:#dcfce7}
.gca-status.failed{color:#b91c1c;background:#fee2e2}
.gca-money{font-weight:800;color:#15803d}
.gca-empty{text-align:center;padding:30px!important;color:#a1a1aa}
.gca-error{display:flex;align-items:center;gap:10px;padding:14px;border-radius:10px;color:#b91c1c;background:#fef2f2}
.gca-pages{display:flex;justify-content:space-between;align-items:center;margin-top:15px;font-size:12px;color:#71717a;gap:12px}
.gca-pages>div{display:flex;gap:8px}
.gca-pages button{display:flex;align-items:center;gap:5px;border:1px solid #e4e4e7;border-radius:8px;padding:8px;background:white;font:inherit;cursor:pointer}
.gca-pages button:disabled{opacity:.4;cursor:not-allowed}
.gca-chart-scroll{overflow-x:auto;padding:10px 0}
.gca-chart{display:flex;gap:12px;height:260px;border-bottom:1px solid #e4e4e7}
.gca-bar-item{flex:1;min-width:45px;border:none;background:none;display:flex;align-items:center;flex-direction:column;gap:6px;padding:0;cursor:pointer;font:inherit}
.gca-bar-item>span:first-child{font-size:10px;color:#71717a;white-space:nowrap}
.gca-track{flex:1;width:100%;max-width:36px;display:flex;align-items:flex-end}
.gca-bar{width:100%;background:linear-gradient(#fb923c,#f97316);border-radius:6px 6px 0 0;transition:height .25s}
.gca-bar-item.selected .gca-bar{background:linear-gradient(#fdba74,#c2410c)}
.gca-bar-item small{font-size:10px;color:#71717a}
.gca-bar-item em{font-size:10px;color:#b45309;font-style:normal}
.gca-footnote{color:#a1a1aa;font-size:11px;margin:10px 0 0}
@media(max-width:1100px){.gca-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.gca-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:650px){.gca-heading{flex-direction:column}.gca-filters{grid-template-columns:1fr}.gca-panel,.gca-stat{padding:14px}.gca-stat strong{font-size:20px}.gca-pages{flex-wrap:wrap}}

/* gca-interaction-v1 */

.gca-primary,
.gca-btn {
  transition:
    background-color .22s ease,
    border-color .22s ease,
    box-shadow .22s ease,
    transform .18s ease,
    color .22s ease;
}

.gca-primary:hover:not(:disabled) {
  background: #ea580c;
  border-color: #ea580c;
  box-shadow: 0 7px 18px rgba(249,115,22,.27);
  transform: translateY(-2px);
}

.gca-btn:hover:not(:disabled) {
  background: #fff7ed;
  border-color: #fb923c;
  color: #c2410c;
  box-shadow: 0 5px 14px rgba(249,115,22,.13);
  transform: translateY(-2px);
}

.gca-primary:active:not(:disabled),
.gca-btn:active:not(:disabled) {
  transform: translateY(1px) scale(.97);
  box-shadow: 0 1px 4px rgba(0,0,0,.12);
}

.gca-primary:focus-visible,
.gca-btn:focus-visible {
  outline: 3px solid rgba(249,115,22,.4);
  outline-offset: 3px;
}

.gca-primary.gca-applied {
  background: #15803d;
  border-color: #15803d;
  color: #fff;
  box-shadow: 0 3px 12px rgba(21,128,61,.17);
}

.gca-primary.gca-applied:hover {
  background: #166534;
  border-color: #166534;
  box-shadow: 0 7px 18px rgba(21,128,61,.25);
}

.gca-primary.gca-pending {
  box-shadow: 0 0 0 3px rgba(249,115,22,.15);
}

.gca-filter-feedback {
  margin-top: 12px;
  color: #71717a;
  font-size: 12px;
  font-weight: 600;
  min-height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .gca-primary,
  .gca-btn {
    transition: none;
  }
}

/* filter-symbol-fix-v1 */

/* Filter action button spacing fix */
.gca-actions {
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px !important;
}

.gca-actions button {
  min-height: 43px;
  min-width: 110px;
  white-space: nowrap;
  flex-shrink: 0;
}

.gca-filter-feedback {
  display: block;
  margin-top: 14px;
  line-height: 1.6;
}
`;
