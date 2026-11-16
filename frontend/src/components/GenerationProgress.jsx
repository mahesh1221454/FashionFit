import React, { useEffect, useState } from "react";

const VIEWS = [
  { key: "front", label: "Front View" },
  { key: "left", label: "Left View" },
  { key: "right", label: "Right View" },
  { key: "back", label: "Back View" },
];

function PreviewCard({ view, job, activeKey, failed, onPreview }) {
  const [imageError, setImageError] = useState(false);
  const url = job?.[`output_${view.key}_url`] || null;

  useEffect(() => {
    setImageError(false);
  }, [url]);

  const ready = Boolean(url);
  const active = !ready && !failed && activeKey === view.key;

  const state = imageError
    ? "error"
    : ready
      ? "ready"
      : failed
        ? "error"
        : active
          ? "active"
          : "waiting";

  const statusText =
    state === "ready"
      ? "Completed"
      : state === "active"
        ? "Generating..."
        : state === "error"
          ? "Preview unavailable"
          : "Waiting";

  return (
    <article className={`ffg-card ffg-${state}`}>
      <div className="ffg-image-area">
        {ready && !imageError ? (
          <button
  type="button"
  className="ffg-clickable-image"
  aria-label={`Open ${view.label} image`}
  onClick={() =>
    onPreview({
      key: view.key,
      url,
      label: view.label,
    })
  }
>
  <img
    src={url}
    alt={`Generated ${view.label}`}
    loading="eager"
    decoding="async"
    onError={() => setImageError(true)}
  />
</button>
        ) : (
          <div className="ffg-placeholder">
            {active ? (
              <>
                <span className="ffg-spinner" />
                <strong>Generating your look</strong>
                <small>Creating {view.label.toLowerCase()}...</small>
              </>
            ) : (
              <>
                <span className="ffg-placeholder-icon">
                  {state === "error" ? "!" : "▧"}
                </span>
                <span>
                  {state === "error"
                    ? "Image unavailable"
                    : "Waiting for preview"}
                </span>
              </>
            )}
          </div>
        )}


      </div>

      <div className="ffg-card-info">
        <div>
          <h3>{view.label}</h3>
          <p className={`ffg-card-status ffg-text-${state}`}>
            {state === "ready" ? "✓ " : ""}
            {statusText}
          </p>
        </div>
        <span className={`ffg-state-indicator ffg-dot-${state}`}>
          {state === "ready"
            ? "✓"
            : state === "active"
              ? "↻"
              : state === "error"
                ? "!"
                : "○"}
        </span>
      </div>
    </article>
  );
}

export default function GenerationProgress({
  progress = 0,
  status = "Generating your look",
  job = null,
}) {
  const [preview, setPreview] = useState(null);

  const availablePreviews = VIEWS
    .map(({ key, label }) => ({
      key,
      label,
      url: job?.[`output_${key}_url`],
    }))
    .filter((item) => Boolean(item.url));

  const currentPreviewIndex = availablePreviews.findIndex(
    (item) => item.key === preview?.key
  );

  const movePreview = (direction) => {
    if (availablePreviews.length < 2) return;

    const nextIndex = (
      currentPreviewIndex +
      direction +
      availablePreviews.length
    ) % availablePreviews.length;

    setPreview(availablePreviews[nextIndex]);
  };

  const failed = job?.status === "failed";
  const readyCount = VIEWS.filter(
    ({ key }) => Boolean(job?.[`output_${key}_url`])
  ).length;

  const complete = readyCount === 4;
  const started =
    readyCount > 0 ||
    job?.status === "processing" ||
    Number(progress) > 0;

  const nextView = VIEWS.find(
    ({ key }) => !job?.[`output_${key}_url`]
  );

  const activeKey =
    !failed && !complete && started && nextView
      ? nextView.key
      : null;

  useEffect(() => {
    if (!preview) return;

    function handleEscape(event) {
      if (event.key === "Escape") {
        setPreview(null);
      }

      if (event.key === "ArrowLeft") {
        movePreview(-1);
      }

      if (event.key === "ArrowRight") {
        movePreview(1);
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [preview, job]);

  return (
    <div className="ffg-wrapper">
      <style>{`
        .generation-page-inner:has(.ffg-wrapper) {
          width: 100%;
          max-width: 1200px;
        }

        .ffg-wrapper,
        .ffg-wrapper * {
          box-sizing: border-box;
        }

        .ffg-wrapper {
          width: 100%;
          max-width: 1160px;
          margin: 0 auto;
          padding: 32px;
          border: 1px solid #e8ecf2;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 15px 45px rgba(22, 34, 55, .06);
          color: #17243b;
          text-align: left;
        }

        .ffg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 15px;
          margin-bottom: 24px;
        }

        .ffg-title-area {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .ffg-icon {
          display: grid;
          place-items: center;
          width: 52px;
          height: 52px;
          flex-shrink: 0;
          border-radius: 16px;
          background: #fff0e6;
          color: #fa590a;
          font-size: 28px;
        }

        .ffg-header h2 {
          margin: 0 0 5px;
          font-size: clamp(20px, 2.3vw, 28px);
          font-weight: 800;
          line-height: 1.25;
          color: #14213a;
        }

        .ffg-header p {
          margin: 0;
          color: #8190a5;
          font-size: 13px;
          line-height: 1.5;
        }

        .ffg-counter {
          padding: 10px 17px;
          border-radius: 30px;
          background: #fff1e9;
          color: #f65a08;
          font-size: 15px;
          font-weight: 800;
          white-space: nowrap;
        }

        .ffg-counter.done {
          background: #e9f8ef;
          color: #17934e;
        }

        .ffg-progress {
          height: 7px;
          margin-bottom: 26px;
          overflow: hidden;
          border-radius: 20px;
          background: #edf0f4;
        }

        .ffg-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #ff5808, #ff9b38);
          transition: width .45s ease;
        }

        .ffg-progress-fill.done {
          background: #23aa60;
        }

        .ffg-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
        }

        .ffg-card {
          min-width: 0;
          overflow: hidden;
          border: 1.5px solid #e2e8f0;
          border-radius: 19px;
          background: #fff;
          transition: border-color .2s, box-shadow .2s;
        }

        .ffg-card.ffg-ready {
          border-color: #4cc681;
          box-shadow: 0 6px 20px rgba(32, 170, 92, .07);
        }

        .ffg-card.ffg-active {
          border-color: #ff873b;
          box-shadow: 0 6px 22px rgba(255, 107, 21, .10);
        }

        .ffg-image-area {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: clamp(280px, 36vw, 440px);
          overflow: hidden;
          background: #f3f5f9;
        }

        .ffg-image-area img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          animation: ffg-reveal .5s ease;
        }

        .ffg-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 20px;
          color: #97a3b5;
          text-align: center;
          font-size: 13px;
        }

        .ffg-placeholder strong {
          color: #f56615;
          font-size: 15px;
        }

        .ffg-placeholder small {
          font-size: 12px;
          color: #9aa5b6;
        }

        .ffg-placeholder-icon {
          display: grid;
          place-items: center;
          width: 74px;
          height: 74px;
          border-radius: 19px;
          background: #e8edf4;
          color: #9ca8b8;
          font-size: 38px;
        }

        .ffg-spinner {
          width: 48px;
          height: 48px;
          border: 5px solid #ffdfca;
          border-top-color: #f65b0c;
          border-radius: 50%;
          animation: ffg-spin .8s linear infinite;
        }

        .ffg-preview-button {
          position: absolute;
          right: 14px;
          bottom: 14px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 15px;
          border: 0;
          border-radius: 11px;
          background: rgba(255,255,255,.96);
          color: #17243b;
          box-shadow: 0 4px 15px rgba(0,0,0,.12);
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          transition: transform .2s;
        }

        .ffg-preview-button:hover {
          transform: translateY(-2px);
          color: #f65b0c;
        }

        .ffg-card-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 17px 20px;
          gap: 12px;
        }

        .ffg-card-info h3 {
          margin: 0 0 6px;
          color: #1b2a42;
          font-size: 17px;
          font-weight: 800;
        }

        .ffg-card-status {
          margin: 0;
          font-size: 13px;
          font-weight: 650;
        }

        .ffg-text-ready { color: #199c54; }
        .ffg-text-active { color: #fa5f0b; }
        .ffg-text-waiting { color: #9aa5b5; }
        .ffg-text-error { color: #d64343; }

        .ffg-state-indicator {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: 50%;
          font-size: 19px;
        }

        .ffg-dot-ready {
          color: #159e52;
          background: #e1f7ea;
        }

        .ffg-dot-active {
          color: #f65b0c;
          background: #ffede1;
          animation: ffg-spin 1.8s linear infinite;
        }

        .ffg-dot-waiting {
          color: #95a1b4;
          background: #f0f2f5;
        }

        .ffg-dot-error {
          color: #d64343;
          background: #fdecec;
        }

        .ffg-footer-note {
          margin: 23px 0 0;
          color: #8794a8;
          font-size: 12px;
          text-align: center;
        }

        .ffg-modal {
          position: fixed;
          z-index: 99999;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(9, 17, 31, .88);
        }

        .ffg-modal-content {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: min(95vw, 900px);
          max-height: 95vh;
          color: white;
        }

        .ffg-modal-content img {
          max-width: 100%;
          max-height: 82vh;
          object-fit: contain;
          border-radius: 12px;
        }

        .ffg-modal-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          font-size: 17px;
          font-weight: 700;
        }

        .ffg-close-button {
          border: 1px solid rgba(255,255,255,.3);
          border-radius: 9px;
          background: rgba(255,255,255,.12);
          color: white;
          padding: 8px 14px;
          font-size: 13px;
          cursor: pointer;
        }

        @keyframes ffg-spin {
          to { transform: rotate(360deg); }
        }

        @keyframes ffg-reveal {
          from { opacity: 0; transform: scale(.97); }
          to { opacity: 1; transform: scale(1); }
        }

        @media (max-width: 650px) {
          .ffg-wrapper {
            padding: 18px 14px;
            border-radius: 17px;
          }

          .ffg-grid {
            gap: 13px;
          }

          .ffg-image-area {
            height: clamp(210px, 55vw, 330px);
          }

          .ffg-card-info {
            padding: 12px;
          }

          .ffg-card-info h3 {
            font-size: 14px;
          }

          .ffg-card-status {
            font-size: 11px;
          }

          .ffg-state-indicator {
            width: 28px;
            height: 28px;
            font-size: 15px;
          }

          .ffg-preview-button {
            right: 8px;
            bottom: 8px;
            padding: 8px 10px;
            font-size: 11px;
          }
        }

        @media (max-width: 420px) {
          .ffg-grid {
            grid-template-columns: 1fr;
          }

          .ffg-image-area {
            height: 360px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ffg-spinner,
          .ffg-dot-active,
          .ffg-image-area img {
            animation: none;
          }
        }


        .ffg-image-area img {
          cursor: default;
        }

        .ffg-modal-content {
          width: min(96vw, 1100px);
          max-height: 94vh;
          gap: 10px;
          overflow-y: auto;
          background: #ffffff;
          padding: 18px;
          border-radius: 20px;
          color: #17263c;
        }

        .ffg-modal-heading {
          color: #17263c;
          padding-bottom: 10px;
          border-bottom: 1px solid #e5e7eb;
        }

        .ffg-close-button {
          background: #f1f5f9;
          color: #334155;
          border-color: #e5e7eb;
        }

        .ffg-preview-stage {
          display: grid;
          grid-template-columns: 40px minmax(0, 1fr) 40px;
          align-items: center;
          gap: 10px;
        }

        .ffg-preview-stage img {
          display: block;
          width: 100%;
          height: min(62vh, 650px);
          object-fit: contain;
          background: white;
          cursor: default;
        }

        .ffg-preview-arrow {
          height: 40px;
          width: 40px;
          border: 1px solid #e5e7eb;
          border-radius: 50%;
          background: white;
          color: #f97316;
          font-size: 28px;
          cursor: pointer;
        }

        .ffg-preview-arrow:hover {
          background: #fff7ed;
          border-color: #f97316;
        }

        .ffg-preview-arrow:disabled {
          opacity: .4;
          cursor: not-allowed;
        }

        .ffg-preview-navigation {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ffg-preview-thumbnail {
          width: 80px;
          padding: 5px;
          border: 2px solid #e5e7eb;
          border-radius: 9px;
          background: white;
          cursor: pointer;
          color: #64748b;
          font-size: 10px;
        }

        .ffg-preview-thumbnail img {
          display: block;
          width: 100%;
          height: 64px;
          object-fit: contain;
        }

        .ffg-preview-thumbnail.active {
          border-color: #f97316;
          background: #fff7ed;
          color: #ea580c;
        }

        /* FASHIONFIT_COMPACT_RESULTS */

        .generation-page-inner:has(.ffg-wrapper) {
          max-width: 760px;
        }

        .ffg-wrapper {
          max-width: 760px;
          padding: 18px;
          border-radius: 16px;
        }

        .ffg-header {
          margin-bottom: 14px;
          gap: 10px;
        }

        .ffg-header h2 {
          font-size: 21px;
        }

        .ffg-header p {
          font-size: 11px;
        }

        .ffg-icon {
          width: 38px;
          height: 38px;
          font-size: 20px;
          border-radius: 10px;
        }

        .ffg-counter {
          padding: 6px 12px;
          font-size: 12px;
        }

        .ffg-progress {
          height: 5px;
          margin-bottom: 15px;
        }

        .ffg-grid {
          gap: 12px;
        }

        .ffg-card {
          border-radius: 12px;
        }

        .ffg-image-area {
          height: clamp(180px, 27vh, 280px);
          background: #ffffff;
        }

        .ffg-image-area img {
          object-fit: contain;
          cursor: default;
        }

        .ffg-card-info {
          padding: 9px 12px;
          gap: 8px;
        }

        .ffg-card-info h3 {
          font-size: 13px;
          margin: 0 0 3px;
        }

        .ffg-card-status {
          font-size: 10px;
        }

        .ffg-state-indicator {
          width: 24px;
          height: 24px;
          font-size: 12px;
        }

        .ffg-preview-button {
          right: 8px;
          bottom: 8px;
          padding: 6px 10px;
          font-size: 11px;
          border-radius: 7px;
        }

        .ffg-footer-note {
          margin-top: 12px;
          font-size: 11px;
        }

        @media (max-width: 600px) {
          .ffg-wrapper {
            padding: 12px;
          }

          .ffg-image-area {
            height: 200px;
          }
        }


        .ffg-clickable-image,
        .ffg-clickable-image:hover,
        .ffg-clickable-image:active {
          display: block;
          width: 100%;
          height: 100%;
          padding: 0;
          margin: 0;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none !important;
          cursor: pointer;
          transform: none !important;
        }

        .ffg-clickable-image img,
        .ffg-clickable-image:hover img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: pointer !important;
          opacity: 1 !important;
          filter: none !important;
          transform: none !important;
        }

        .ffg-clickable-image::before,
        .ffg-clickable-image::after {
          display: none !important;
          content: none !important;
        }

        .ffg-clickable-image:focus-visible {
          outline: 2px solid #f97316;
          outline-offset: -3px;
        }

`}</style>

      <div className="ffg-header">
        <div className="ffg-title-area">
          <span className="ffg-icon" aria-hidden="true">✦</span>
          <div>
            <h2>
              {complete
                ? "Your Fashion Preview Is Ready"
                : "Generating Your Fashion Preview"}
            </h2>
            <p>
              {failed
                ? "Generation stopped before all views were ready."
                : complete
                  ? "All four views have been generated."
                  : "Your AI-generated views appear one by one."}
            </p>
          </div>
        </div>

        <span className={`ffg-counter ${complete ? "done" : ""}`}>
          {readyCount} / 4 Ready
        </span>
      </div>

      <div
        className="ffg-progress"
        role="progressbar"
        aria-label="Generated views"
        aria-valuenow={readyCount}
        aria-valuemin={0}
        aria-valuemax={4}
      >
        <div
          className={`ffg-progress-fill ${complete ? "done" : ""}`}
          style={{ width: `${(readyCount / 4) * 100}%` }}
        />
      </div>

      <div className="ffg-grid">
        {VIEWS.map((view) => (
          <PreviewCard
            key={view.key}
            view={view}
            job={job}
            activeKey={activeKey}
            failed={failed}
            onPreview={setPreview}
          />
        ))}
      </div>

      <p className="ffg-footer-note" role="status">
        {complete
          ? "Your four-view fashion preview is complete."
          : failed
            ? "Some previews could not be generated."
            : "Each completed image appears automatically. Click any image to enlarge it."}
      </p>

      {preview && (
        <div
          className="ffg-modal"
          role="presentation"
          onClick={() => setPreview(null)}
        >
          <div
            className="ffg-modal-content"
            role="dialog"
            aria-modal="true"
            aria-label={`${preview.label} preview`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ffg-modal-heading">
              <span>{preview.label}</span>
              <button
                type="button"
                className="ffg-close-button"
                onClick={() => setPreview(null)}
              >
                ✕ Close
              </button>
            </div>
            <div className="ffg-preview-stage">
              <button
                type="button"
                className="ffg-preview-arrow"
                aria-label="Previous image"
                disabled={availablePreviews.length < 2}
                onClick={() => movePreview(-1)}
              >
                {"\u2039"}
              </button>

              <img
                src={preview.url}
                alt={preview.label}
                style={{
                  cursor: "default",
                  objectFit: "contain",
                }}
              />

              <button
                type="button"
                className="ffg-preview-arrow"
                aria-label="Next image"
                disabled={availablePreviews.length < 2}
                onClick={() => movePreview(1)}
              >
                {"\u203A"}
              </button>
            </div>

            <div className="ffg-preview-navigation">
              {availablePreviews.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={
                    "ffg-preview-thumbnail " +
                    (preview.key === item.key ? "active" : "")
                  }
                  aria-label={`Preview ${item.label}`}
                  aria-pressed={preview.key === item.key}
                  onClick={() => setPreview(item)}
                >
                  <img src={item.url} alt={item.label} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
