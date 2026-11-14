
import { useEffect, useRef, useState } from "react";
import { Check, Clock3, LoaderCircle, Sparkles } from "lucide-react";

const VIEWS = [
  { key: "front", label: "Front View" },
  { key: "left", label: "Left Side" },
  { key: "right", label: "Right Side" },
  { key: "back", label: "Back View" },
];

const EMPTY_VIEWS = {
  front: null,
  left: null,
  right: null,
  back: null,
};

/**
 * Required props:
 *
 * jobId: Existing generation job ID
 *
 * fetchJobStatus(jobId):
 *   Calls your existing FastAPI job-status endpoint.
 *
 * extractViews(response):
 *   Returns:
 *   {
 *     front: imageUrlOrNull,
 *     left: imageUrlOrNull,
 *     right: imageUrlOrNull,
 *     back: imageUrlOrNull
 *   }
 *
 * onComplete(response):
 *   Optional callback when all four images are ready.
 *
 * isJobFinished(response):
 *   Optional backend-specific completion check.
 */
export default function LiveTryOnProgress({
  jobId,
  fetchJobStatus,
  extractViews,
  onComplete,
  isJobFinished,
}) {
  const [images, setImages] = useState(EMPTY_VIEWS);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(true);
  const [failedImages, setFailedImages] = useState({});

  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setImages({ ...EMPTY_VIEWS });
    setFailedImages({});
    setError("");
    setPolling(true);
    completedRef.current = false;

    if (!jobId || typeof fetchJobStatus !== "function" ||
        typeof extractViews !== "function") {
      setError("Generation status is not configured.");
      setPolling(false);
      return;
    }

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const response = await fetchJobStatus(jobId);

        if (cancelled) return;

        const incoming = extractViews(response) || {};

        setImages((previous) => {
          const next = { ...previous };

          for (const { key } of VIEWS) {
            if (typeof incoming[key] === "string" &&
                incoming[key].trim()) {
              next[key] = incoming[key];
            }
          }

          return next;
        });

        setError("");

        const allReady = VIEWS.every(
          ({ key }) => Boolean(incoming[key])
        );

        const jobFinished =
          typeof isJobFinished === "function"
            ? isJobFinished(response)
            : allReady;

        if (jobFinished) {
          setPolling(false);

          if (!completedRef.current) {
            completedRef.current = true;
            onCompleteRef.current?.(response);
          }

          return;
        }

        // Stop if backend reports a terminal failure.
        if (
          response?.status === "failed" ||
          response?.status === "cancelled"
        ) {
          setError(
            response?.error ||
            "Generation could not be completed."
          );
          setPolling(false);
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.message || "Unable to refresh generation progress."
        );
      }

      if (!cancelled) {
        timer = window.setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [jobId, fetchJobStatus, extractViews, isJobFinished]);

  const readyCount = VIEWS.filter(
    ({ key }) => Boolean(images[key])
  ).length;

  const percentage = Math.round(
    (readyCount / VIEWS.length) * 100
  );

  return (
    <div className="live-tryon-page">
      <style>{`
        .live-tryon-page {
          min-height: 100vh;
          padding: 38px 20px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          background: #f5f6fa;
          font-family: inherit;
          color: #202b3d;
        }

        .live-tryon-panel {
          width: 100%;
          max-width: 850px;
          padding: 30px;
          border: 1px solid #eceef2;
          border-radius: 24px;
          background: #fff;
          box-shadow: 0 18px 55px rgba(28, 39, 58, .09);
        }

        .live-tryon-header {
          text-align: center;
          margin-bottom: 26px;
        }

        .live-tryon-icon {
          width: 54px;
          height: 54px;
          margin: 0 auto 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ff7417;
          background: #fff1e5;
          border-radius: 50%;
        }

        .live-tryon-eyebrow {
          color: #ff7417;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .live-tryon-header h2 {
          margin: 9px 0 5px;
          font-size: clamp(22px, 3vw, 30px);
          font-weight: 800;
        }

        .live-tryon-header p {
          margin: 0;
          color: #7c899f;
          font-size: 13px;
        }

        .live-tryon-progress-label {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 9px;
          font-size: 12px;
          color: #718096;
        }

        .live-tryon-progress-label strong {
          color: #ff7417;
        }

        .live-tryon-progress-track {
          height: 7px;
          border-radius: 999px;
          background: #e7e9ed;
          overflow: hidden;
          margin-bottom: 24px;
        }

        .live-tryon-progress-fill {
          height: 100%;
          background: #ff7417;
          border-radius: 999px;
          transition: width .5s ease;
        }

        .live-tryon-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .live-tryon-card {
          border: 1px solid #e9ebef;
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
          min-width: 0;
        }

        .live-tryon-image-area {
          width: 100%;
          aspect-ratio: 3 / 4;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f2f3f6;
          overflow: hidden;
        }

        .live-tryon-image-area img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          animation: liveTryonReveal .55s ease both;
        }

        .live-tryon-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          text-align: center;
          padding: 10px;
          color: #a1a9b6;
          font-size: 11px;
        }

        .live-tryon-spinning {
          animation: liveTryonSpin 1.3s linear infinite;
          color: #ff7417;
        }

        .live-tryon-card-footer {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 11px;
        }

        .live-tryon-card-footer strong {
          font-size: 12px;
        }

        .live-tryon-status {
          display: flex;
          gap: 5px;
          align-items: center;
          font-size: 11px;
          color: #9099a8;
        }

        .live-tryon-status.ready {
          color: #179653;
        }

        .live-tryon-note {
          padding-top: 22px;
          text-align: center;
          font-size: 12px;
          color: #8993a4;
        }

        .live-tryon-error {
          margin-top: 14px;
          color: #b42318;
          font-size: 12px;
          text-align: center;
        }

        @keyframes liveTryonSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes liveTryonReveal {
          from { opacity: 0; transform: scale(.96); }
          to { opacity: 1; transform: scale(1); }
        }

        @media (max-width: 700px) {
          .live-tryon-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .live-tryon-panel {
            padding: 20px 14px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .live-tryon-spinning,
          .live-tryon-image-area img {
            animation: none;
          }
        }
      `}</style>

      <div className="live-tryon-panel">
        <header className="live-tryon-header">
          <div className="live-tryon-icon">
            <Sparkles size={25} />
          </div>

          <span className="live-tryon-eyebrow">
            AI FASHION STUDIO
          </span>

          <h2>Creating Your Look</h2>

          <p>
            Your fashion previews appear as soon as they are ready.
          </p>
        </header>

        <div className="live-tryon-progress-label">
          <span>Generation progress</span>
          <strong>{readyCount} of 4 ready</strong>
        </div>

        <div
          className="live-tryon-progress-track"
          role="progressbar"
          aria-label="Ready image views"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={readyCount}
        >
          <div
            className="live-tryon-progress-fill"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div className="live-tryon-grid">
          {VIEWS.map(({ key, label }) => {
            const url = images[key];
            const hasError = Boolean(failedImages[key]);
            const ready = Boolean(url) && !hasError;

            return (
              <div className="live-tryon-card" key={key}>
                <div className="live-tryon-image-area">
                  {url && !hasError ? (
                    <img
                      src={url}
                      alt={`Generated ${label}`}
                      onError={() =>
                        setFailedImages((prev) => ({
                          ...prev,
                          [key]: true,
                        }))
                      }
                    />
                  ) : (
                    <div className="live-tryon-placeholder">
                      {hasError ? (
                        <span>Unable to display image</span>
                      ) : polling ? (
                        <>
                          <LoaderCircle
                            className="live-tryon-spinning"
                            size={24}
                          />
                          <span>Preparing view...</span>
                        </>
                      ) : (
                        <>
                          <Clock3 size={24} />
                          <span>Not available</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="live-tryon-card-footer">
                  <strong>{label}</strong>
                  <span
                    className={`live-tryon-status ${
                      ready ? "ready" : ""
                    }`}
                  >
                    {ready ? (
                      <>
                        <Check size={13} /> Ready
                      </>
                    ) : hasError ? (
                      "Display error"
                    ) : polling ? (
                      "Generating"
                    ) : (
                      "Pending"
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="live-tryon-error" role="alert">
            {error}
          </div>
        )}

        <p className="live-tryon-note">
          Keep this page open while your fashion previews
          are being prepared.
        </p>
      </div>
    </div>
  );
}
