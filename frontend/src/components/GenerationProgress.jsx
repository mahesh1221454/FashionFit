import React, { useEffect, useState } from "react";

const VIEWS = [
  { key: "front", label: "Front View" },
  { key: "left", label: "Left View" },
  { key: "right", label: "Right View" },
  { key: "back", label: "Back View" },
];

const clamp = (value, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

function getViewProgress(view, job, overall) {
  const url = job?.[`output_${view}_url`];

  if (typeof url === "string" && url.trim()) {
    return 100;
  }

  const temporary = Boolean(job?.temporary) ||
    String(job?.id || "").startsWith("temp_");

  const checkpoints = temporary
    ? { front: [5, 25], left: [25, 50],
        right: [50, 75], back: [75, 95] }
    : { front: [10, 35], left: [35, 55],
        right: [55, 75], back: [75, 95] };

  const [start, end] = checkpoints[view];

  if (overall <= start) return 0;

  // Estimated progress. Never show 100 until
  // the backend returns the actual image URL.
  return clamp(
    Math.round(((overall - start) / (end - start)) * 95),
    0,
    99
  );
}

function PreviewCard({ view, job, overall, failed }) {
  const [imageError, setImageError] = useState(false);

  const url = job?.[`output_${view.key}_url`] || null;
  const percentage = getViewProgress(view.key, job, overall);
  const ready = percentage === 100;
  const active = !ready && percentage > 0;

  useEffect(() => {
    setImageError(false);
  }, [url]);

  const status = ready
    ? "Ready"
    : failed
      ? "Not completed"
      : active
        ? "Generating"
        : "Waiting";

  return (
    <article className="ff-live-card">
      <div className="ff-live-preview">
        {ready && !imageError ? (
          <img
            src={url}
            alt={`Generated ${view.label}`}
            loading="eager"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="ff-live-placeholder">
            {imageError ? (
              <>
                <span className="ff-live-symbol">!</span>
                <span>Unable to display preview</span>
              </>
            ) : active ? (
              <>
                <span className="ff-live-spinner" />
                <span>Creating your look...</span>
              </>
            ) : (
              <>
                <span className="ff-live-symbol">◷</span>
                <span>
                  {failed ? "Not completed" : "Waiting for view"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="ff-live-details">
        <div className="ff-live-card-heading">
          <strong>{view.label}</strong>
          <span className={ready ? "ff-ready" : ""}>
            {percentage}%
          </span>
        </div>

        <div className="ff-live-track">
          <div
            className={
              "ff-live-fill" + (ready ? " ff-complete" : "")
            }
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div
          className={
            "ff-live-status" + (ready ? " ff-ready" : "")
          }
        >
          {ready ? "✓ " : ""}
          {status}
          {active && !failed ? " · estimated" : ""}
        </div>
      </div>
    </article>
  );
}

export default function GenerationProgress({
  progress = 0,
  status = "Generating your look",
  job = null,
}) {
  const safeProgress = clamp(Number(progress) || 0);
  const failed = job?.status === "failed";

  const steps = [
    { label: "Preparing", value: 10 },
    { label: "Front View", value: 35 },
    { label: "Side Views", value: 65 },
    { label: "Back View", value: 85 },
    { label: "Complete", value: 100 },
  ];

  const readyCount = VIEWS.filter(
    ({ key }) => Boolean(job?.[`output_${key}_url`])
  ).length;

  return (
    <div className="generation-progress premium-generation-card">
      <style>{`
        .ff-live-section {
          width: 100%;
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid #e8eaf0;
          text-align: left;
        }

        .ff-live-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 15px;
        }

        .ff-live-heading h3 {
          margin: 0;
          font-size: 17px;
          font-weight: 750;
          color: #243044;
        }

        .ff-live-count {
          color: #f97316;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
        }

        .ff-live-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 11px;
        }

        .ff-live-card {
          min-width: 0;
          background: #fff;
          border: 1px solid #e7eaf0;
          border-radius: 13px;
          overflow: hidden;
        }

        .ff-live-preview {
          position: relative;
          aspect-ratio: 3 / 4;
          background: #f1f3f7;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .ff-live-preview img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          animation: ffImageReveal .5s ease both;
        }

        .ff-live-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 11px;
          padding: 8px;
          color: #8e99aa;
          text-align: center;
          font-size: 11px;
        }

        .ff-live-symbol {
          font-size: 27px;
          color: #a5adba;
        }

        .ff-live-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #ffdec6;
          border-top-color: #f97316;
          border-radius: 50%;
          animation: ffSpin .9s linear infinite;
        }

        .ff-live-details {
          padding: 10px 9px 12px;
        }

        .ff-live-card-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 5px;
          margin-bottom: 9px;
          color: #263044;
          font-size: 11px;
        }

        .ff-live-card-heading span {
          color: #f97316;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        .ff-live-card-heading .ff-ready {
          color: #169653;
        }

        .ff-live-track {
          height: 5px;
          background: #e8ebf0;
          border-radius: 99px;
          overflow: hidden;
        }

        .ff-live-fill {
          height: 100%;
          background: #f97316;
          border-radius: 99px;
          transition: width .45s ease;
        }

        .ff-live-fill.ff-complete {
          background: #19a35e;
        }

        .ff-live-status {
          margin-top: 7px;
          color: #8c97a6;
          font-size: 10px;
        }

        .ff-live-status.ff-ready {
          color: #169653;
          font-weight: 700;
        }

        .ff-live-note {
          margin: 15px 0 0;
          color: #8b95a5;
          font-size: 11px;
          text-align: center;
        }

        @keyframes ffSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes ffImageReveal {
          from { opacity: 0; transform: scale(.96); }
          to { opacity: 1; transform: scale(1); }
        }

        @media (max-width: 700px) {
          .ff-live-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ff-live-spinner,
          .ff-live-preview img {
            animation: none;
          }
        }
      `}</style>

      <div className="generation-orbit">
        <div className="generation-orbit-inner">AI</div>
      </div>

      <span className="generation-eyebrow">
        AI FASHION STUDIO
      </span>

      <h2>Creating Your Look</h2>

      <p className="generation-status">{status}</p>

      <div className="premium-progress-row">
        <span>Progress</span>
        <strong>{safeProgress}%</strong>
      </div>

      <div className="progress-track premium-progress-track">
        <div
          className="progress-bar"
          style={{ width: `${safeProgress}%` }}
        />
      </div>

      <div className="generation-step-list">
        {steps.map((step, index) => {
          const completed = safeProgress >= step.value;

          return (
            <div
              className={
                "generation-step" +
                (completed ? " completed" : "")
              }
              key={step.label}
            >
              <div className="generation-step-indicator">
                {completed ? "✓" : index + 1}
              </div>

              <span>{step.label}</span>
            </div>
          );
        })}
      </div>

      <section
        className="ff-live-section"
        aria-label="Live generated image previews"
      >
        <div className="ff-live-heading">
          <h3>Live Image Previews</h3>
          <span className="ff-live-count">
            {readyCount} / 4 Ready
          </span>
        </div>

        <div className="ff-live-grid">
          {VIEWS.map((view) => (
            <PreviewCard
              key={view.key}
              view={view}
              job={job}
              overall={safeProgress}
              failed={failed}
            />
          ))}
        </div>

        <p className="ff-live-note">
          Each completed view appears automatically.
          Loading percentages are estimates until ready.
        </p>
      </section>

      <div className="generation-hint">
        Please keep this page open while your
        four-view fashion preview is being generated.
      </div>
    </div>
  );
}