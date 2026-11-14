
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Cpu,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from "lucide-react";

import api from "../services/api";

const numberFormat = new Intl.NumberFormat("en-IN");

function formatNumber(value) {
  return numberFormat.format(Number(value) || 0);
}

function readError(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  return error?.message || "Unable to load AI usage.";
}

function formatDate(value) {
  if (!value) return "";

  const parts = String(value).split("-");

  if (parts.length !== 3) return value;

  const date = new Date(
    Date.UTC(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    ),
  );

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function UsageCard({
  title,
  value,
  detail,
  Icon,
  tone = "orange",
}) {
  return (
    <div className={`gu-card gu-${tone}`}>
      <div className="gu-card-heading">
        <span>{title}</span>
        <div className="gu-card-icon">
          <Icon size={18} />
        </div>
      </div>

      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export default function GeminiUsagePanel({
  accessToken,
  onSessionExpired,
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadUsage = useCallback(
    async (showRefresh = false, signal) => {
      if (!accessToken) {
        setLoading(false);
        onSessionExpired?.();
        return;
      }

      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await api.get(
          "/designs/management/gemini-usage",
          {
            params: { days },
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal,
          },
        );

        if (signal?.aborted) return;

        if (
          response.data?.success !== true ||
          !response.data?.summary ||
          !Array.isArray(response.data?.models) ||
          !Array.isArray(response.data?.daily_usage)
        ) {
          throw new Error(
            "The backend returned an invalid usage response.",
          );
        }

        setData(response.data);
      } catch (err) {
        if (signal?.aborted || err.code === "ERR_CANCELED") {
          return;
        }

        if ([401, 403].includes(err.response?.status)) {
          onSessionExpired?.();
          return;
        }

        setError(readError(err));
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [accessToken, days, onSessionExpired],
  );

  useEffect(() => {
    const controller = new AbortController();

    loadUsage(false, controller.signal);

    return () => controller.abort();
  }, [loadUsage]);

  const summary = data?.summary;

  const models = data?.models || [];

  const dailyUsage = data?.daily_usage || [];

  const maxRequests = useMemo(() => {
    return Math.max(
      1,
      ...dailyUsage.map((item) => Number(item.requests) || 0),
    );
  }, [dailyUsage]);

  const peakDay = useMemo(() => {
    if (!dailyUsage.length) return null;

    return dailyUsage.reduce((best, current) =>
      Number(current.requests) > Number(best.requests)
        ? current
        : best,
    );
  }, [dailyUsage]);

  const latestRefresh = data?.generated_at
    ? new Date(data.generated_at)
    : null;

  return (
    <div className="gu-root">
      <div className="gu-toolbar">
        <div className="gu-toolbar-heading">
          <span className="gu-eyebrow">
            GOOGLE AI MONITORING
          </span>
          <h2>AI API Usage</h2>
          <p>
            Actual requests and token consumption recorded
            by your FastAPI backend.
          </p>
        </div>

        <div className="gu-toolbar-actions">
          <div
            className="gu-range-picker"
            role="group"
            aria-label="Usage period"
          >
            {[7, 30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className={days === value ? "active" : ""}
                onClick={() => setDays(value)}
                aria-pressed={days === value}
              >
                {value}D
              </button>
            ))}
          </div>

          <button
            type="button"
            className="gu-refresh"
            disabled={loading || refreshing}
            onClick={() => loadUsage(true)}
          >
            <RefreshCw
              size={15}
              className={refreshing ? "gu-spin" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="gu-source-note">
        <ShieldCheck size={16} />
        <span>
          Administrator-only statistics from PostgreSQL.
          Data covers requests recorded since usage logging
          was enabled.
        </span>
      </div>

      {error && (
        <div className="gu-error" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Could not refresh AI usage.</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadUsage(true)}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="gu-loading">
          <LoaderCircle size={26} className="gu-spin" />
          <strong>Loading AI statistics...</strong>
          <span>Reading usage records from PostgreSQL.</span>
        </div>
      ) : summary ? (
        <>
          <div className="gu-stats">
            <UsageCard
              title="Total API Requests"
              value={formatNumber(summary.total_requests)}
              detail={`Last ${days} days`}
              Icon={Activity}
              tone="orange"
            />

            <UsageCard
              title="Successful Requests"
              value={formatNumber(summary.successful_requests)}
              detail={`${Number(
                summary.success_rate || 0,
              ).toFixed(2)}% success rate`}
              Icon={CheckCircle2}
              tone="green"
            />

            <UsageCard
              title="Failed Requests"
              value={formatNumber(summary.failed_requests)}
              detail="Includes failed retry attempts"
              Icon={XCircle}
              tone="red"
            />

            <UsageCard
              title="Total Tokens"
              value={formatNumber(summary.total_tokens)}
              detail="Tokens reported by AI"
              Icon={Cpu}
              tone="blue"
            />
          </div>

          <div className="gu-secondary-stats">
            <div>
              <span>Input Tokens</span>
              <strong>
                {formatNumber(summary.input_tokens)}
              </strong>
            </div>

            <div>
              <span>Output Tokens</span>
              <strong>
                {formatNumber(summary.output_tokens)}
              </strong>
            </div>

            <div>
              <span>Average API Duration</span>
              <strong>
                {summary.average_duration_ms == null
                  ? "Unavailable"
                  : `${(
                      Number(summary.average_duration_ms) /
                      1000
                    ).toFixed(2)} s`}
              </strong>
            </div>
          </div>

          <section className="gu-panel">
            <div className="gu-panel-header">
              <div>
                <span className="gu-eyebrow">
                  REQUEST ACTIVITY
                </span>
                <h3>Daily AI Requests</h3>
                <p>
                  Successful and failed API attempts,
                  grouped by UTC date.
                </p>
              </div>

              <div className="gu-legend">
                <span>
                  <i className="gu-legend-success" />
                  Success
                </span>
                <span>
                  <i className="gu-legend-failed" />
                  Failed
                </span>
              </div>
            </div>

            <div className="gu-chart-scroll">
              <div
                className="gu-chart"
                style={{
                  minWidth:
                    days === 90
                      ? "1260px"
                      : days === 30
                        ? "650px"
                        : "100%",
                }}
                role="img"
                aria-label={`Daily API request chart for the last ${days} days`}
              >
                {dailyUsage.map((item) => {
                  const total = Number(item.requests) || 0;
                  const successful =
                    Number(item.successful_requests) || 0;
                  const failed =
                    Number(item.failed_requests) || 0;

                  const heightPercent =
                    (total / maxRequests) * 100;

                  return (
                    <div
                      key={item.date}
                      className="gu-chart-day"
                      title={`${item.date}: ${total} requests, ${successful} successful, ${failed} failed, ${formatNumber(item.total_tokens)} tokens`}
                    >
                      <div className="gu-bar-area">
                        <div
                          className="gu-stacked-bar"
                          style={{
                            height: `${heightPercent}%`,
                          }}
                        >
                          {failed > 0 && (
                            <div
                              className="gu-bar-failed"
                              style={{
                                flex: failed,
                              }}
                            />
                          )}
                          {successful > 0 && (
                            <div
                              className="gu-bar-success"
                              style={{
                                flex: successful,
                              }}
                            />
                          )}
                        </div>
                      </div>

                      <span>
                        {days === 90
                          ? new Date(
                              `${item.date}T00:00:00Z`,
                            ).getUTCDate() === 1
                            ? formatDate(item.date)
                            : ""
                          : days === 30
                            ? new Date(
                                `${item.date}T00:00:00Z`,
                              ).getUTCDate() % 5 === 0
                              ? formatDate(item.date)
                              : ""
                            : formatDate(item.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="gu-chart-footer">
              <span>
                <TrendingUp size={15} />
                Peak day:{" "}
                {peakDay && Number(peakDay.requests) > 0
                  ? `${formatDate(peakDay.date)} (${peakDay.requests} requests)`
                  : "No activity"}
              </span>
              <span>
                <Clock3 size={15} />
                All dates UTC
              </span>
            </div>
          </section>

          <section className="gu-panel">
            <div className="gu-panel-header">
              <div>
                <span className="gu-eyebrow">
                  MODEL BREAKDOWN
                </span>
                <h3>AI Model Usage</h3>
                <p>
                  View the actual API models that handled
                  your requests.
                </p>
              </div>
            </div>

            {models.length ? (
              <div className="gu-table-scroll">
                <table className="gu-table">
                  <thead>
                    <tr>
                      <th>AI Model</th>
                      <th>Requests</th>
                      <th>Success</th>
                      <th>Failed</th>
                      <th>Input Tokens</th>
                      <th>Output Tokens</th>
                      <th>Total Tokens</th>
                    </tr>
                  </thead>

                  <tbody>
                    {models.map((model) => (
                      <tr key={model.model_name}>
                        <td>
                          <span className="gu-model-name">
                            {model.model_name}
                          </span>
                        </td>
                        <td>
                          {formatNumber(model.requests)}
                        </td>
                        <td className="gu-success-text">
                          {formatNumber(
                            model.successful_requests,
                          )}
                        </td>
                        <td className="gu-failed-text">
                          {formatNumber(
                            model.failed_requests,
                          )}
                        </td>
                        <td>
                          {formatNumber(model.input_tokens)}
                        </td>
                        <td>
                          {formatNumber(model.output_tokens)}
                        </td>
                        <td>
                          <strong>
                            {formatNumber(model.total_tokens)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="gu-empty">
                No AI API records were found for
                the selected period.
              </div>
            )}
          </section>

          <div className="gu-footer">
            <Info size={17} />
            <p>
              These are application-recorded statistics.
              Failed requests may not provide token counts,
              and actual Google billing may differ.
              Cost estimates are not displayed until
              model-specific pricing has been configured
              and verified.
            </p>
          </div>

          {latestRefresh &&
            !Number.isNaN(latestRefresh.getTime()) && (
              <div className="gu-updated">
                Last updated:{" "}
                {latestRefresh.toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </div>
            )}
        </>
      ) : (
        <div className="gu-empty">
          No usage data is available yet.
        </div>
      )}

      <style>{GEMINI_USAGE_CSS}</style>
    </div>
  );
}

const GEMINI_USAGE_CSS = `
.gu-root {
  width: 100%;
  color: #18181b;
  font-family: inherit;
}

.gu-root * {
  box-sizing: border-box;
}

.gu-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin: 3px 0 18px;
}

.gu-eyebrow {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.gu-toolbar h2 {
  margin: 7px 0;
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -.4px;
}

.gu-toolbar p,
.gu-panel-header p {
  margin: 0;
  color: #8b8b94;
  font-size: 12px;
  line-height: 1.6;
}

.gu-toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}

.gu-range-picker {
  display: inline-flex;
  gap: 3px;
  padding: 4px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fff;
}

.gu-range-picker button {
  padding: 7px 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #71717a;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.gu-range-picker button.active {
  background: #fff7ed;
  color: #ea580c;
}

.gu-refresh {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 13px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  background: #fff;
  color: #3f3f46;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.gu-refresh:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.gu-source-note,
.gu-footer {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

.gu-source-note {
  margin-bottom: 17px;
}

.gu-source-note svg,
.gu-footer svg {
  flex-shrink: 0;
  color: #16a34a;
}

.gu-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 13px;
  margin-bottom: 15px;
}

.gu-card {
  min-width: 0;
  padding: 17px;
  border: 1px solid #eaeaec;
  border-radius: 14px;
  background: #fff;
}

.gu-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 18px;
}

.gu-card-heading > span {
  color: #71717a;
  font-size: 11px;
  font-weight: 700;
}

.gu-card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  height: 36px;
  border-radius: 10px;
}

.gu-orange .gu-card-icon {
  background: #fff7ed;
  color: #ea580c;
}

.gu-green .gu-card-icon {
  background: #f0fdf4;
  color: #16a34a;
}

.gu-red .gu-card-icon {
  background: #fef2f2;
  color: #dc2626;
}

.gu-blue .gu-card-icon {
  background: #eff6ff;
  color: #2563eb;
}

.gu-card > strong {
  display: block;
  font-size: 29px;
  font-weight: 800;
  letter-spacing: -.8px;
}

.gu-card > small {
  display: block;
  margin-top: 8px;
  color: #a1a1aa;
  font-size: 10px;
  line-height: 1.5;
}

.gu-secondary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin-bottom: 19px;
  border: 1px solid #eaeaec;
  border-radius: 13px;
  background: #eaeaec;
}

.gu-secondary-stats > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px;
  background: #fff;
}

.gu-secondary-stats span {
  color: #71717a;
  font-size: 11px;
}

.gu-secondary-stats strong {
  font-size: 17px;
  color: #27272a;
}

.gu-panel {
  padding: 20px;
  margin-bottom: 18px;
  border: 1px solid #eaeaec;
  border-radius: 15px;
  background: #fff;
}

.gu-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
}

.gu-panel-header h3 {
  margin: 6px 0;
  font-size: 17px;
  font-weight: 800;
}

.gu-legend {
  display: flex;
  align-items: center;
  gap: 12px;
}

.gu-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #71717a;
  font-size: 10px;
}

.gu-legend i {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 3px;
}

.gu-legend-success {
  background: #22c55e;
}

.gu-legend-failed {
  background: #ef4444;
}

.gu-chart-scroll,
.gu-table-scroll {
  overflow-x: auto;
}

.gu-chart {
  display: flex;
  gap: 7px;
  align-items: stretch;
  height: 215px;
  padding: 8px 4px 0;
  border-bottom: 1px solid #f4f4f5;
}

.gu-chart-day {
  display: flex;
  flex: 1 0 0;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.gu-bar-area {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  height: 175px;
  border-bottom: 1px solid #e4e4e7;
}

.gu-stacked-bar {
  display: flex;
  flex-direction: column;
  width: min(100%, 26px);
  min-height: 0;
  overflow: hidden;
  border-radius: 5px 5px 0 0;
}

.gu-bar-success {
  background: #22c55e;
}

.gu-bar-failed {
  background: #ef4444;
}

.gu-chart-day > span {
  min-height: 18px;
  color: #a1a1aa;
  font-size: 9px;
  white-space: nowrap;
}

.gu-chart-footer {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 17px;
}

.gu-chart-footer span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #71717a;
  font-size: 11px;
}

.gu-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  white-space: nowrap;
}

.gu-table th {
  padding: 12px;
  border-bottom: 1px solid #e4e4e7;
  color: #71717a;
  font-size: 10px;
  font-weight: 750;
}

.gu-table td {
  padding: 14px 12px;
  border-bottom: 1px solid #f4f4f5;
  color: #3f3f46;
  font-size: 11px;
}

.gu-table tr:last-child td {
  border-bottom: 0;
}

.gu-model-name {
  display: inline-block;
  padding: 7px 9px;
  border-radius: 7px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 11px;
  font-weight: 700;
}

.gu-success-text {
  color: #16a34a !important;
}

.gu-failed-text {
  color: #dc2626 !important;
}

.gu-footer p {
  margin: 0;
}

.gu-updated {
  padding: 11px 0;
  color: #a1a1aa;
  font-size: 10px;
  text-align: right;
}

.gu-empty,
.gu-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 175px;
  padding: 20px;
  text-align: center;
  color: #a1a1aa;
  font-size: 12px;
}

.gu-loading strong {
  color: #3f3f46;
  font-size: 13px;
}

.gu-error {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  margin-bottom: 15px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
}

.gu-error > svg {
  flex-shrink: 0;
}

.gu-error > div {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.gu-error strong {
  font-size: 12px;
}

.gu-error span {
  font-size: 11px;
}

.gu-error button {
  border: 0;
  background: transparent;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.gu-spin {
  animation: gu-spin .8s linear infinite;
}

@keyframes gu-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1050px) {
  .gu-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .gu-panel {
    padding: 14px;
  }

  .gu-card {
    padding: 13px;
  }

  .gu-card > strong {
    font-size: 24px;
  }

  .gu-secondary-stats {
    grid-template-columns: 1fr;
  }

  .gu-toolbar h2 {
    font-size: 21px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gu-spin {
    animation: none;
  }
}
`;
