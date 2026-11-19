
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import api from "../services/api";

const VIEWS = ["front", "left", "right", "back"];

const numberFormatter = new Intl.NumberFormat("en-IN");

const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function number(value) {
  return value == null
    ? "—"
    : numberFormatter.format(Number(value));
}

function money(value) {
  if (value == null || value === "") {
    return "Unavailable";
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? moneyFormatter.format(amount)
    : "Unavailable";
}

function dateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function errorMessage(error) {
  return (
    error?.response?.data?.detail ||
    error?.message ||
    "Unable to load generation history."
  );
}

function CostCard({ label, value, description, Icon }) {
  return (
    <div className="gh-card">
      <div className="gh-card-heading">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <strong>{value}</strong>
      <small>{description}</small>
    </div>
  );
}

function ImageGallery({ title, images, onPreview }) {
  return (
    <section className="gh-section">
      <h3>{title}</h3>

      <div className="gh-image-grid">
        {VIEWS.filter(
          (view) => view !== "back" || Boolean(images?.back)
        ).map((view) => {
          const image = images?.[view];
          const available =
            Boolean(image?.url) && image?.exists;

          return (
            <div className="gh-image-card" key={view}>
              <div className="gh-image-top">
                <strong>
                  {view.charAt(0).toUpperCase() +
                    view.slice(1)}
                </strong>

                <span>
                  {available ? "Available" : "Missing"}
                </span>
              </div>

              {available ? (
                <button
                  type="button"
                  className="gh-image-preview"
                  onClick={() =>
                    onPreview({
                      url: image.url,
                      title: `${title} · ${view}`,
                    })
                  }
                  aria-label={`Preview ${view} image`}
                >
                  <img
                    src={image.url}
                    alt={`${view} photograph`}
                    loading="lazy"
                  />
                </button>
              ) : (
                <div className="gh-image-missing">
                  <ImageIcon size={24} />
                  <span>Not available</span>
                </div>
              )}

              <div
                className="gh-image-path"
                title={image?.path || ""}
              >
                {image?.path || "No stored path"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function GenerationHistoryPanel({
  accessToken,
  onSessionExpired,
}) {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [listError, setListError] = useState("");
  const [detailsError, setDetailsError] = useState("");

  const [preview, setPreview] = useState(null);

  const pageSize = 20;
  const totalPages = Math.max(
    1,
    Math.ceil(total / pageSize),
  );

  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  const loadJobs = useCallback(
    async (signal) => {
      if (!accessToken) {
        onSessionExpired?.();
        return;
      }

      setLoading(true);
      setListError("");

      try {
        const response = await api.get(
          "/designs/management/generation-history",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            params: {
              page,
              page_size: pageSize,
              ...(status ? { status } : {}),
            },
            signal,
          },
        );

        if (signal?.aborted) return;

        if (
          response.data?.success !== true ||
          !Array.isArray(response.data.jobs)
        ) {
          throw new Error(
            "Invalid generation history response.",
          );
        }

        const nextJobs = response.data.jobs;

        setJobs(nextJobs);
        setTotal(Number(response.data.total) || 0);

        setSelectedId((previous) => {
          if (
            previous &&
            nextJobs.some((job) => job.id === previous)
          ) {
            return previous;
          }

          return nextJobs[0]?.id || null;
        });
      } catch (error) {
        if (
          signal?.aborted ||
          error.code === "ERR_CANCELED"
        ) {
          return;
        }

        if ([401, 403].includes(error.response?.status)) {
          onSessionExpired?.();
          return;
        }

        setListError(errorMessage(error));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [accessToken, onSessionExpired, page, status],
  );

  const loadDetails = useCallback(
    async (jobId, signal) => {
      if (!jobId || !accessToken) {
        setSelectedJob(null);
        return;
      }

      setDetailsLoading(true);
      setDetailsError("");
      setSelectedJob(null);

      try {
        const response = await api.get(
          `/designs/management/generation-history/${encodeURIComponent(
            jobId,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            signal,
          },
        );

        if (signal?.aborted) return;

        if (
          response.data?.success !== true ||
          !response.data?.job
        ) {
          throw new Error(
            "Invalid generation job response.",
          );
        }

        setSelectedJob(response.data.job);
      } catch (error) {
        if (
          signal?.aborted ||
          error.code === "ERR_CANCELED"
        ) {
          return;
        }

        if ([401, 403].includes(error.response?.status)) {
          onSessionExpired?.();
          return;
        }

        setDetailsError(errorMessage(error));
      } finally {
        if (!signal?.aborted) {
          setDetailsLoading(false);
        }
      }
    },
    [accessToken, onSessionExpired],
  );

  useEffect(() => {
    const controller = new AbortController();

    loadJobs(controller.signal);

    return () => controller.abort();
  }, [loadJobs]);

  useEffect(() => {
    const controller = new AbortController();

    loadDetails(selectedId, controller.signal);

    return () => controller.abort();
  }, [selectedId, loadDetails]);

  const visibleJobs = jobs.filter((job) =>
    job.id.toLowerCase().includes(
      search.trim().toLowerCase(),
    ),
  );

  const usage = selectedJob?.usage;
  const byView = usage?.by_view || {};
  const attempts = usage?.attempts || [];

  return (
    <div className="gh-root">
      <div className="gh-header">
        <div>
          <span className="gh-eyebrow">
            AI GENERATION MONITORING
          </span>

          <h2>Generation History & Cost</h2>

          <p>
            Inspect customer uploads, generated results,
            token consumption and estimated costs for
            each job.
          </p>
        </div>

        <button
          type="button"
          className="gh-refresh"
          disabled={loading}
          onClick={() => loadJobs()}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="gh-notice">
        <ShieldCheck size={17} />
        <span>
          Administrator-only generation records. Costs
          are estimates based on recorded AI usage,
          not official Google billing amounts.
        </span>
      </div>

      <div className="gh-layout">
        <aside className="gh-sidebar">
          <div className="gh-list-header">
            <div>
              <h3>Generation Jobs</h3>
              <small>
                {number(total)} total records
              </small>
            </div>
          </div>

          <div className="gh-filters">
            <label className="gh-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search job ID"
              />
            </label>

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              aria-label="Filter generation status"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
            </select>
          </div>

          {listError && (
            <p className="gh-error">{listError}</p>
          )}

          {loading ? (
            <div className="gh-loading">
              <LoaderCircle className="gh-spin" />
              Loading jobs...
            </div>
          ) : visibleJobs.length ? (
            <div className="gh-job-list">
              {visibleJobs.map((job) => (
                <button
                  type="button"
                  key={job.id}
                  className={`gh-job ${
                    selectedId === job.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setSelectedId(job.id)}
                >
                  <div className="gh-job-top">
                    <strong>
                      {job.id.slice(0, 8)}
                    </strong>

                    <span
                      className={`gh-status gh-${job.status}`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <small>{dateTime(job.created_at)}</small>

                  <div className="gh-job-bottom">
                    <span>
                      {number(job.progress)}% progress
                    </span>
                    <ChevronRight size={15} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="gh-empty">
              No matching jobs found.
            </div>
          )}

          <div className="gh-pagination">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={15} />
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </aside>

        <main className="gh-details">
          {detailsLoading ? (
            <div className="gh-loading">
              <LoaderCircle className="gh-spin" />
              Loading job details...
            </div>
          ) : detailsError ? (
            <div className="gh-error">
              <AlertCircle size={17} />
              {detailsError}
            </div>
          ) : selectedJob ? (
            <>
              <div className="gh-detail-header">
                <div>
                  <span className="gh-eyebrow">
                    SELECTED GENERATION
                  </span>

                  <h3>Job Details</h3>

                  <code>{selectedJob.id}</code>
                </div>

                <span
                  className={`gh-status gh-${selectedJob.status}`}
                >
                  {selectedJob.status}
                </span>
              </div>

              <div className="gh-metrics">
                <CostCard
                  label="Estimated Job Cost"
                  value={money(
                    usage?.estimated_cost_inr,
                  )}
                  description={
                    usage?.cost_status === "estimated"
                      ? "Calculated from tracked attempts"
                      : "Insufficient verified usage data"
                  }
                  Icon={Coins}
                />

                <CostCard
                  label="AI Requests"
                  value={number(usage?.tracked_requests)}
                  description="All logged attempts"
                  Icon={Activity}
                />

                <CostCard
                  label="Input Tokens"
                  value={number(usage?.input_tokens)}
                  description="Recorded input tokens"
                  Icon={ImageIcon}
                />

                <CostCard
                  label="API Duration"
                  value={
                    usage?.duration_ms == null
                      ? "—"
                      : `${(
                          usage.duration_ms / 1000
                        ).toFixed(2)} s`
                  }
                  description="Total logged API time"
                  Icon={Clock3}
                />
              </div>

              <section className="gh-section">
                <h3>Generation Information</h3>

                <div className="gh-info-grid">
                  <div>
                    <span>Created</span>
                    <strong>
                      {dateTime(selectedJob.created_at)}
                    </strong>
                  </div>

                  <div>
                    <span>Completed</span>
                    <strong>
                      {dateTime(selectedJob.completed_at)}
                    </strong>
                  </div>

                  <div>
                    <span>Successful requests</span>
                    <strong>
                      {number(usage?.successful_requests)}
                    </strong>
                  </div>

                  <div>
                    <span>Failed attempts</span>
                    <strong>
                      {number(usage?.failed_requests)}
                    </strong>
                  </div>
                </div>

                {selectedJob.error_message && (
                  <p className="gh-error">
                    {selectedJob.error_message}
                  </p>
                )}
              </section>

              <ImageGallery
                title="Customer Uploaded Images"
                images={selectedJob.uploaded_images}
                onPreview={setPreview}
              />

              <ImageGallery
                title="AI Generated Images"
                images={selectedJob.generated_images}
                onPreview={setPreview}
              />

              <section className="gh-section">
                <h3>Cost Breakdown by View</h3>

                <div className="gh-table-scroll">
                  <table className="gh-table">
                    <thead>
                      <tr>
                        <th>View</th>
                        <th>Attempts</th>
                        <th>Success</th>
                        <th>Failed</th>
                        <th>Estimated Cost</th>
                      </tr>
                    </thead>

                    <tbody>
                      {VIEWS.filter(
                        (view) => view !== "back" || Boolean(byView.back?.attempts)
                      ).map((view) => {
                        const entry = byView[view] || {};

                        return (
                          <tr key={view}>
                            <td className="gh-capitalize">
                              {view}
                            </td>
                            <td>{number(entry.attempts)}</td>
                            <td>
                              {number(
                                entry.successful_attempts,
                              )}
                            </td>
                            <td>
                              {number(
                                entry.failed_attempts,
                              )}
                            </td>
                            <td>
                              <strong>
                                {money(
                                  entry.estimated_cost_inr,
                                )}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="gh-section">
                <h3>Individual AI API Attempts</h3>

                {attempts.length ? (
                  <div className="gh-table-scroll">
                    <table className="gh-table">
                      <thead>
                        <tr>
                          <th>View</th>
                          <th>Attempt</th>
                          <th>Model</th>
                          <th>Status</th>
                          <th>Input</th>
                          <th>Image</th>
                          <th>Text</th>
                          <th>Thinking</th>
                          <th>Cost INR</th>
                        </tr>
                      </thead>

                      <tbody>
                        {attempts.map((attempt) => (
                          <tr key={attempt.id}>
                            <td>{attempt.view_name}</td>
                            <td>
                              {attempt.attempt_number}
                            </td>
                            <td>{attempt.model_name}</td>
                            <td>{attempt.status}</td>
                            <td>
                              {number(attempt.input_tokens)}
                            </td>
                            <td>
                              {number(
                                attempt.image_output_tokens,
                              )}
                            </td>
                            <td>
                              {number(
                                attempt.text_output_tokens,
                              )}
                            </td>
                            <td>
                              {number(attempt.thinking_tokens)}
                            </td>
                            <td>
                              {money(
                                attempt.estimated_cost
                                  ?.total_inr,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="gh-empty">
                    No job-linked AI usage records
                    are available. Older jobs may have
                    been created before tracking was enabled.
                  </div>
                )}
              </section>

              <div className="gh-footnote">
                Costs are estimates. Actual Google billing
                can differ. Incomplete token metadata is
                displayed as unavailable rather than ₹0.
              </div>
            </>
          ) : (
            <div className="gh-empty">
              Select a generation job to inspect its details.
            </div>
          )}
        </main>
      </div>

      {preview && (
        <div
          className="gh-modal"
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
        >
          <div className="gh-modal-content">
            <div className="gh-modal-header">
              <strong>{preview.title}</strong>

              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>

            <img
              src={preview.url}
              alt={preview.title}
            />
          </div>
        </div>
      )}

      <style>{STYLES}</style>
    </div>
  );
}

const STYLES = `
.gh-root {
  width: 100%;
  color: #18181b;
  font-family: inherit;
}

.gh-root * {
  box-sizing: border-box;
}

.gh-header,
.gh-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 19px;
}

.gh-eyebrow {
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.gh-header h2 {
  margin: 7px 0;
  font-size: 23px;
}

.gh-header p {
  color: #8b8b94;
  font-size: 12px;
  line-height: 1.6;
}

.gh-refresh,
.gh-pagination button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  padding: 9px 12px;
  background: white;
  color: #3f3f46;
  cursor: pointer;
}

.gh-refresh:disabled,
.gh-pagination button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.gh-notice {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  margin-bottom: 17px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
}

.gh-layout {
  display: grid;
  grid-template-columns: 285px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.gh-sidebar,
.gh-details,
.gh-section {
  min-width: 0;
  border: 1px solid #eaeaec;
  border-radius: 14px;
  background: white;
}

.gh-sidebar {
  padding: 13px;
}

.gh-details {
  padding: 20px;
}

.gh-list-header {
  margin-bottom: 12px;
}

.gh-list-header h3,
.gh-section h3 {
  margin: 0 0 7px;
  font-size: 15px;
}

.gh-list-header small {
  color: #a1a1aa;
}

.gh-filters {
  display: grid;
  gap: 8px;
  margin-bottom: 13px;
}

.gh-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
}

.gh-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 12px;
}

.gh-filters select {
  width: 100%;
  padding: 10px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: white;
  font-size: 12px;
}

.gh-job-list {
  display: grid;
  gap: 7px;
}

.gh-job {
  width: 100%;
  padding: 12px;
  border: 1px solid #eaeaec;
  border-radius: 10px;
  background: white;
  text-align: left;
  cursor: pointer;
}

.gh-job:hover,
.gh-job.selected {
  border-color: #fdba74;
  background: #fff7ed;
}

.gh-job-top,
.gh-job-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.gh-job strong {
  font-size: 12px;
}

.gh-job small,
.gh-job-bottom {
  color: #71717a;
  font-size: 10px;
}

.gh-job small {
  display: block;
  margin: 9px 0;
}

.gh-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  font-size: 11px;
}

.gh-status {
  display: inline-block;
  padding: 5px 8px;
  border-radius: 99px;
  background: #f4f4f5;
  color: #52525b;
  font-size: 10px;
  font-weight: 750;
  text-transform: capitalize;
}

.gh-completed {
  background: #dcfce7;
  color: #15803d;
}

.gh-failed {
  background: #fee2e2;
  color: #b91c1c;
}

.gh-processing {
  background: #dbeafe;
  color: #1d4ed8;
}

.gh-detail-header h3 {
  margin: 6px 0;
  font-size: 20px;
}

.gh-detail-header code {
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: #71717a;
  font-size: 11px;
}

.gh-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 11px;
  margin-bottom: 18px;
}

.gh-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid #eaeaec;
  border-radius: 12px;
}

.gh-card-heading {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #71717a;
  font-size: 10px;
}

.gh-card strong {
  display: block;
  margin-top: 14px;
  font-size: clamp(15px, 1.7vw, 22px);
  overflow-wrap: anywhere;
}

.gh-card small {
  display: block;
  margin-top: 7px;
  color: #a1a1aa;
  font-size: 10px;
}

.gh-section {
  padding: 16px;
  margin-bottom: 15px;
}

.gh-section h3 {
  margin-bottom: 16px;
}

.gh-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
}

.gh-info-grid > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.gh-info-grid span {
  color: #a1a1aa;
  font-size: 10px;
}

.gh-info-grid strong {
  font-size: 12px;
}

.gh-image-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.gh-image-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #eaeaec;
  border-radius: 10px;
}

.gh-image-top {
  display: flex;
  justify-content: space-between;
  gap: 5px;
  padding: 10px;
  font-size: 10px;
}

.gh-image-top span {
  color: #71717a;
}

.gh-image-preview,
.gh-image-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: clamp(220px, 24vw, 340px);
  border: 0;
  background: #f8f8fa;
  overflow: hidden;
}

.gh-image-preview {
  padding: 0;
  cursor: zoom-in;
}

.gh-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 6px;
  transition: transform .3s ease;
}

.gh-image-preview:hover img {
  transform: scale(1.035);
}

.gh-image-preview:focus-visible {
  outline: 2px solid #ea580c;
  outline-offset: -2px;
}

.gh-image-missing {
  flex-direction: column;
  gap: 8px;
  color: #a1a1aa;
  font-size: 10px;
}

.gh-image-path {
  padding: 9px;
  color: #71717a;
  font-size: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gh-table-scroll {
  overflow-x: auto;
}

.gh-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  white-space: nowrap;
}

.gh-table th,
.gh-table td {
  padding: 11px;
  border-bottom: 1px solid #f4f4f5;
  font-size: 11px;
}

.gh-table th {
  color: #71717a;
  font-weight: 700;
}

.gh-table td {
  color: #3f3f46;
}

.gh-capitalize {
  text-transform: capitalize;
}

.gh-footnote {
  padding: 12px;
  border-radius: 9px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

.gh-loading,
.gh-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
  min-height: 150px;
  padding: 20px;
  text-align: center;
  color: #a1a1aa;
  font-size: 12px;
}

.gh-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 14px;
  border-radius: 9px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 11px;
}

.gh-spin {
  animation: gh-spin .8s linear infinite;
}

.gh-modal {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background: rgba(0,0,0,.8);
}

.gh-modal-content {
  max-width: min(90vw, 850px);
  max-height: 90vh;
  overflow: auto;
  border-radius: 12px;
  background: #fff;
}

.gh-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  padding: 12px 16px;
}

.gh-modal-header button {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.gh-modal-content > img {
  display: block;
  width: 100%;
  max-height: 78vh;
  object-fit: contain;
}

@keyframes gh-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .gh-layout {
    grid-template-columns: 1fr;
  }

  .gh-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .gh-details {
    padding: 12px;
  }

  .gh-image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gh-info-grid {
    grid-template-columns: 1fr;
  }

  .gh-image-preview,
  .gh-image-missing {
    height: 230px;
  }
}

/* FF_HISTORY_REDESIGN_START */

/* Main section */
.gh-root {
  width: 100%;
  max-width: 100%;
  color: #242935;
}

.gh-header {
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.gh-header h2 {
  margin: 5px 0;
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 800;
  letter-spacing: -.65px;
}

.gh-header p {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #7a8598;
}

.gh-eyebrow {
  font-size: 10px;
  letter-spacing: 1.3px;
  color: #f06418;
}

.gh-refresh {
  padding: 9px 13px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 650;
  transition: all .2s ease;
}

.gh-refresh:hover:not(:disabled) {
  border-color: #fdba74;
  background: #fff7ed;
  color: #ea580c;
}

/* Informational note */
.gh-notice {
  margin-bottom: 14px;
  padding: 10px 13px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}

/* Main dashboard */
.gh-layout {
  display: grid;
  grid-template-columns: minmax(245px, 280px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.gh-sidebar,
.gh-details {
  min-width: 0;
  border: 1px solid #e6e9ef;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 5px 22px rgba(28, 39, 58, .035);
}

.gh-sidebar {
  padding: 14px;
  position: sticky;
  top: 14px;
}

.gh-details {
  padding: 17px;
}

/* Job list */
.gh-list-header {
  margin-bottom: 11px;
}

.gh-list-header h3 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 750;
}

.gh-list-header small {
  font-size: 11px;
  color: #8a94a6;
}

.gh-filters {
  gap: 8px;
  margin-bottom: 11px;
}

.gh-search,
.gh-filters select {
  min-height: 39px;
  border: 1px solid #e3e7ee;
  border-radius: 10px;
  background: #fafbfc;
}

.gh-search {
  padding: 8px 10px;
}

.gh-search:focus-within {
  border-color: #fb923c;
  background: white;
  box-shadow: 0 0 0 3px rgba(249, 115, 22, .08);
}

.gh-filters select {
  padding: 8px 10px;
  color: #435066;
}

.gh-job-list {
  display: grid;
  gap: 7px;
  max-height: min(480px, 55vh);
  overflow-y: auto;
  padding: 2px 3px 2px 1px;
  scrollbar-width: thin;
}

.gh-job {
  padding: 11px 12px;
  border: 1px solid #e8ebef;
  border-radius: 11px;
  background: #fff;
  transition:
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease,
    transform .18s ease;
}

.gh-job:hover {
  border-color: #fdba74;
  background: #fffaf5;
  transform: translateY(-1px);
}

.gh-job.selected {
  border-color: #fb923c;
  background: #fff7ed;
  box-shadow: inset 3px 0 0 #f97316;
}

.gh-job strong {
  font-size: 12px;
  color: #283448;
}

.gh-job small {
  margin: 6px 0;
  font-size: 10px;
}

.gh-job-bottom {
  font-size: 10px;
}

.gh-pagination {
  margin-top: 11px;
}

.gh-pagination button {
  padding: 7px;
  border-radius: 8px;
}

/* Selected job details */
.gh-detail-header {
  gap: 10px;
  margin-bottom: 15px;
  padding-bottom: 13px;
  border-bottom: 1px solid #edf0f3;
}

.gh-detail-header h3 {
  margin: 5px 0;
  font-size: 20px;
  letter-spacing: -.5px;
}

.gh-detail-header code {
  font-size: 10px;
  color: #7e889a;
  overflow-wrap: anywhere;
}

.gh-status {
  padding: 5px 9px;
  font-size: 10px;
  font-weight: 750;
  border-radius: 100px;
}

.gh-completed {
  color: #15803d;
  background: #e5f8ec;
}

.gh-failed {
  color: #b91c1c;
  background: #fee9e9;
}

/* Summary metrics */
.gh-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin-bottom: 13px;
}

.gh-card {
  padding: 12px;
  border: 1px solid #e9edf2;
  border-radius: 12px;
  background: #fafbfc;
  transition: border-color .2s ease, background .2s ease;
}

.gh-card:hover {
  border-color: #fed7aa;
  background: #fffaf5;
}

.gh-card-heading {
  gap: 6px;
  color: #718096;
  font-size: 10px;
}

.gh-card-heading svg {
  flex-shrink: 0;
  color: #f97316;
}

.gh-card strong {
  margin-top: 9px;
  color: #202b3d;
  font-size: clamp(15px, 1.5vw, 20px);
  letter-spacing: -.35px;
}

.gh-card small {
  margin-top: 5px;
  font-size: 9px;
  line-height: 1.4;
}

/* Details sections */
.gh-section {
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #e9edf2;
  border-radius: 13px;
}

.gh-section h3 {
  margin: 0 0 12px;
  color: #253044;
  font-size: 14px;
  font-weight: 750;
}

.gh-info-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.gh-info-grid > div {
  gap: 6px;
}

.gh-info-grid span {
  font-size: 10px;
  color: #8390a2;
}

.gh-info-grid strong {
  font-size: 11px;
  color: #344054;
  overflow-wrap: anywhere;
}

/* Compact image gallery */
.gh-image-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
}

.gh-image-card {
  border: 1px solid #e9edf2;
  border-radius: 11px;
  background: #fff;
}

.gh-image-top {
  padding: 9px;
  align-items: center;
  font-size: 10px;
}

.gh-image-top strong {
  color: #354055;
}

.gh-image-preview,
.gh-image-missing {
  height: clamp(135px, 15vw, 205px);
  background: #f5f6f9;
}

.gh-image-preview img {
  padding: 5px;
  object-fit: contain;
}

.gh-image-path {
  padding: 8px;
  font-size: 9px;
  color: #9aa3b2;
}

/* Cost and request tables */
.gh-table-scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid #e9edf2;
  border-radius: 10px;
}

.gh-table th {
  background: #f8fafc;
  color: #66758b;
  font-size: 10px;
  font-weight: 750;
}

.gh-table th,
.gh-table td {
  padding: 10px 11px;
  border-bottom: 1px solid #edf0f4;
}

.gh-table tbody tr:hover {
  background: #fffaf5;
}

.gh-table tbody tr:last-child td {
  border-bottom: 0;
}

/* Bottom notes */
.gh-footnote {
  padding: 11px 13px;
  border: 1px solid #e7edf5;
  border-radius: 10px;
  font-size: 10px;
}

/* Image lightbox */
.gh-modal {
  padding: 24px;
  background: rgba(15, 23, 42, .82);
  backdrop-filter: blur(7px);
}

.gh-modal-content {
  border-radius: 16px;
  box-shadow: 0 20px 65px rgba(0, 0, 0, .25);
}

.gh-modal-header {
  padding: 12px 16px;
}

/* Responsive */
@media (max-width: 1050px) {
  .gh-layout {
    grid-template-columns: 245px minmax(0, 1fr);
  }

  .gh-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gh-info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gh-image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .gh-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .gh-sidebar {
    position: static;
  }

  .gh-job-list {
    max-height: 300px;
  }

  .gh-details {
    padding: 12px;
  }

  .gh-image-preview,
  .gh-image-missing {
    height: clamp(150px, 38vw, 240px);
  }
}

@media (max-width: 450px) {
  .gh-header {
    align-items: flex-start;
  }

  .gh-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gh-info-grid {
    grid-template-columns: 1fr 1fr;
  }

  .gh-image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gh-card {
    padding: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gh-job,
  .gh-card {
    transition: none;
  }
}

/* FF_HISTORY_REDESIGN_END */
`;
