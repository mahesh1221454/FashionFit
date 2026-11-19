import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  Check,
  ImageIcon,
  ScanLine,
  Sparkles,
} from "lucide-react";

const VIEWS = [
  { key: "front", label: "Front View" },
  { key: "left", label: "Left View" },
  { key: "right", label: "Right View" },
];

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4];

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

/* ==============================================
   IMAGE PLACEHOLDER
============================================== */

function ImagePlaceholder({ active, failed }) {
  return (
    <div className="ffg-placeholder">
      {active ? (
        <>
          <span className="ffg-spinner" />
          <strong>Generating your outfit</strong>
          <small>Please wait...</small>
        </>
      ) : (
        <>
          <ImageIcon size={28} strokeWidth={1.5} />

          <small>
            {failed ? "Image unavailable" : "Waiting for image"}
          </small>
        </>
      )}
    </div>
  );
}

/* ==============================================
   FULL-SCREEN FABRIC VIEWER
============================================== */

function FabricViewer({
  images,
  selectedKey,
  onSelect,
  onClose,
}) {
  const dialogRef = useRef(null);
  const imageRef = useRef(null);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const available = images.filter(
    (image) => image.url && !image.error
  );

  const selectedIndex = available.findIndex(
    (image) => image.key === selectedKey
  );

  const current = available[selectedIndex] || available[0];

  useEffect(() => {
    const dialog = dialogRef.current;
    const oldOverflow = document.body.style.overflow;

    dialog?.showModal();
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = oldOverflow;

      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [selectedKey]);

  const limitPosition = (point, scale = zoom) => {
    const image = imageRef.current;
    const stage = stageRef.current;

    if (!image || !stage) {
      return { x: 0, y: 0 };
    }

    const maxX = Math.max(
      0,
      (image.offsetWidth * scale - stage.clientWidth) / 2
    );

    const maxY = Math.max(
      0,
      (image.offsetHeight * scale - stage.clientHeight) / 2
    );

    return {
      x: clamp(point.x, -maxX, maxX),
      y: clamp(point.y, -maxY, maxY),
    };
  };

  const updateZoom = (value) => {
    const nextZoom = clamp(value, 1, 4);

    setZoom(nextZoom);

    setPosition((previous) =>
      limitPosition(previous, nextZoom)
    );
  };

  const changeZoom = (direction) => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoom);

    const nextIndex = clamp(
      currentIndex + direction,
      0,
      ZOOM_LEVELS.length - 1
    );

    updateZoom(ZOOM_LEVELS[nextIndex]);
  };

  const reset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const moveView = (direction) => {
    if (available.length < 2) return;

    const nextIndex =
      (Math.max(0, selectedIndex) +
        direction +
        available.length) %
      available.length;

    onSelect(available[nextIndex].key);
  };

  const startDrag = (event) => {
    if (zoom === 1 || event.button !== 0) return;

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: position.x,
      startY: position.y,
    };

    setDragging(true);

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const moveDrag = (event) => {
    if (!dragRef.current) return;

    const start = dragRef.current;

    setPosition(
      limitPosition({
        x: start.startX + event.clientX - start.x,
        y: start.startY + event.clientY - start.y,
      })
    );
  };

  const stopDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveView(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveView(1);
    }

    if (event.key === "+" || event.key === "=") {
      changeZoom(1);
    }

    if (event.key === "-") {
      changeZoom(-1);
    }
  };

  if (!current) return null;

  return (
    <dialog
      ref={dialogRef}
      className="ffg-modal"
      aria-label="Fabric detail viewer"
      onKeyDown={handleKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="ffg-modal-content">
        <header className="ffg-modal-header">
          <div>
            <span className="ffg-kicker">
              FASHIONFIT STUDIO
            </span>

            <h2>Fabric Inspection</h2>

            <p>{current.label}</p>
          </div>

          <button
            type="button"
            className="ffg-icon-button"
            aria-label="Close viewer"
            onClick={onClose}
            autoFocus
          >
            <X size={21} />
          </button>
        </header>

        <div className="ffg-modal-body">
          <nav className="ffg-modal-thumbnails">
            {available.map((image) => (
              <button
                type="button"
                key={image.key}
                className={`ffg-thumb ${
                  current.key === image.key ? "selected" : ""
                }`}
                aria-pressed={current.key === image.key}
                onClick={() => onSelect(image.key)}
              >
                <div className="ffg-thumb-image">
                  <img
                    src={image.url}
                    alt={image.label}
                    draggable={false}
                  />
                </div>

                <span>{image.label}</span>
              </button>
            ))}
          </nav>

          <div
            ref={stageRef}
            className={`ffg-zoom-stage ${
              zoom > 1 ? "zoomed" : ""
            } ${dragging ? "dragging" : ""}`}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onLostPointerCapture={stopDrag}
          >
            <img
              ref={imageRef}
              src={current.url}
              alt={`${current.label} fabric details`}
              draggable={false}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              }}
            />

            <button
              type="button"
              className="ffg-modal-arrow previous"
              aria-label="Previous image"
              disabled={available.length < 2}
              onPointerDown={(event) =>
                event.stopPropagation()
              }
              onClick={() => moveView(-1)}
            >
              <ChevronLeft size={24} />
            </button>

            <button
              type="button"
              className="ffg-modal-arrow next"
              aria-label="Next image"
              disabled={available.length < 2}
              onPointerDown={(event) =>
                event.stopPropagation()
              }
              onClick={() => moveView(1)}
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        <div className="ffg-modal-toolbar">
          <span className="ffg-detail-label">
            <ScanLine size={17} />
            Fabric Details
          </span>

          <div className="ffg-zoom-controls">
            <button
              type="button"
              className="ffg-icon-button"
              disabled={zoom === 1}
              aria-label="Zoom out"
              onClick={() => changeZoom(-1)}
            >
              <ZoomOut size={19} />
            </button>

            {ZOOM_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                className={`ffg-zoom-level ${
                  zoom === level ? "selected" : ""
                }`}
                aria-pressed={zoom === level}
                onClick={() => updateZoom(level)}
              >
                {level * 100}%
              </button>
            ))}

            <button
              type="button"
              className="ffg-icon-button"
              disabled={zoom === 4}
              aria-label="Zoom in"
              onClick={() => changeZoom(1)}
            >
              <ZoomIn size={19} />
            </button>

            <button
              type="button"
              className="ffg-icon-button"
              aria-label="Reset zoom"
              onClick={reset}
            >
              <RotateCcw size={18} />
            </button>
          </div>
        </div>

        <p className="ffg-modal-note">
          Zoom and drag to inspect fabric, embroidery,
          patterns and stitching.
        </p>
      </div>
    </dialog>
  );
}

/* ==============================================
   MAIN GENERATION GALLERY
============================================== */

export default function GenerationProgress({
  progress = 0,
  status = "Generating your look",
  job = null,
}) {
  const [selectedKey, setSelectedKey] = useState("front");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState({});

  const images = VIEWS.map((view) => {
    const url = job?.[`output_${view.key}_url`];

    return {
      ...view,
      url,
      error: Boolean(
        url && imageErrors[view.key] === url
      ),
    };
  });

  const available = images.filter(
    (image) => image.url && !image.error
  );

  const selected =
    images.find((image) => image.key === selectedKey) ||
    images[0];

  const readyCount = images.filter(
    (image) => Boolean(image.url)
  ).length;

  const complete = readyCount === VIEWS.length;
  const failed = job?.status === "failed";

  const started =
    readyCount > 0 ||
    job?.status === "processing" ||
    Number(progress) > 0;

  const activeKey =
    !failed && !complete && started
      ? images.find((image) => !image.url)?.key
      : null;

  const handleImageError = (image) => {
    setImageErrors((previous) => ({
      ...previous,
      [image.key]: image.url,
    }));
  };

  const moveView = (direction) => {
    if (available.length < 2) return;

    const index = available.findIndex(
      (image) => image.key === selectedKey
    );

    const nextIndex =
      index === -1
        ? 0
        : (index + direction + available.length) %
          available.length;

    setSelectedKey(available[nextIndex].key);
  };

  return (
    <section className="ffg-wrapper">
      <style>{STYLES}</style>

      {/* Page header */}

      <header className="ffg-header">
        <div className="ffg-title-group">
          <span className="ffg-header-icon">
            <Sparkles size={23} />
          </span>

          <div>
            <h2>AI Generation Analysis</h2>

            <p>
              {complete
                ? "Explore your virtual outfit"
                : failed
                  ? "Some images could not be generated"
                  : status}
            </p>
          </div>
        </div>

        <span
          className={`ffg-counter ${
            complete ? "complete" : ""
          }`}
        >
          {complete && <Check size={14} />}
          {readyCount}/{VIEWS.length} Ready
        </span>
      </header>

      {/* Generation progress */}

      <div
        className="ffg-progress"
        role="progressbar"
        aria-label="Generation progress"
        aria-valuemin={0}
        aria-valuemax={VIEWS.length}
        aria-valuenow={readyCount}
      >
        <div
          className={complete ? "complete" : ""}
          style={{
            width: `${(readyCount / VIEWS.length) * 100}%`,
          }}
        />
      </div>

      {/* Responsive image gallery */}

      <div className="ffg-gallery">
        <nav
          className="ffg-thumbnail-list"
          aria-label="Generated outfit views"
        >
          {images.map((image) => (
            <button
              key={image.key}
              type="button"
              className={`ffg-thumb ${
                selectedKey === image.key ? "selected" : ""
              }`}
              aria-pressed={selectedKey === image.key}
              onClick={() => setSelectedKey(image.key)}
            >
              <div className="ffg-thumb-image">
                {image.url && !image.error ? (
                  <>
                    <img
                      src={image.url}
                      alt={image.label}
                      draggable={false}
                      onError={() =>
                        handleImageError(image)
                      }
                    />

                    <span className="ffg-thumb-check">
                      <Check size={11} />
                    </span>
                  </>
                ) : activeKey === image.key ? (
                  <span className="ffg-spinner small" />
                ) : (
                  <ImageIcon
                    size={20}
                    strokeWidth={1.4}
                  />
                )}
              </div>

              <span>{image.label}</span>
            </button>
          ))}
        </nav>

        <div className="ffg-main-view">
          <div className="ffg-main-heading">
            <strong>{selected.label}</strong>

            <span>
              {VIEWS.findIndex(
                (view) => view.key === selectedKey
              ) + 1}{" "}
              / {VIEWS.length}
            </span>
          </div>

          <div className="ffg-main-stage">
          <div className="ffg-image-scroll" key={selectedKey}>
            {selected.url && !selected.error ? (
              <button
                type="button"
                className="ffg-hero-image-button"
                aria-label={`Inspect ${selected.label}`}
                onClick={() => setViewerOpen(true)}
              >
                <img
                  src={selected.url}
                  alt={`Generated ${selected.label}`}
                  draggable={false}
                  onError={() =>
                    handleImageError(selected)
                  }
                />
              </button>
            ) : (
              <ImagePlaceholder
                active={activeKey === selected.key}
                failed={failed || selected.error}
              />
            )}

            </div>

            {available.length > 1 && (
              <>
                <button
                  type="button"
                  className="ffg-gallery-arrow previous"
                  aria-label="Previous view"
                  onClick={() => moveView(-1)}
                >
                  <ChevronLeft size={22} />
                </button>

                <button
                  type="button"
                  className="ffg-gallery-arrow next"
                  aria-label="Next view"
                  onClick={() => moveView(1)}
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}

            {selected.url && !selected.error && (
              <button
                type="button"
                className="ffg-expand-button"
                aria-label="Open fabric inspection"
                title="Inspect fabric details"
                onClick={() => setViewerOpen(true)}
              >
                <Maximize size={17} />
              </button>
            )}
          </div>

          <div className="ffg-main-footer">
            <span>
              <ScanLine size={16} />
              Click image to inspect fabric details
            </span>

            {selected.url && !selected.error && (
              <span className="ffg-ready-label">
                <Check size={13} />
                Completed
              </span>
            )}
          </div>
        </div>
      </div>

      {viewerOpen && available.length > 0 && (
        <FabricViewer
          images={images}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </section>
  );
}

/* ==============================================
   RESPONSIVE STYLES
============================================== */

const STYLES = `
  .ffg-wrapper {
    --ffg-accent: #f97316;
    --ffg-text: #17243b;
    --ffg-muted: #64748b;
    --ffg-border: #e5e7eb;
    --ffg-surface: #ffffff;

    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 20px;
    border-radius: 20px;
    border: 1px solid var(--ffg-border);
    background: var(--ffg-surface);
    color: var(--ffg-text);
    box-shadow: 0 8px 32px rgba(15, 23, 42, .04);
  }

  .ffg-wrapper,
  .ffg-wrapper * {
    box-sizing: border-box;
  }

  .generation-page-inner:has(.ffg-wrapper) {
    width: 100%;
    max-width: 1480px;
  }

  /* Header */

  .ffg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .ffg-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ffg-header-icon {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    background: #fff1e7;
    color: var(--ffg-accent);
    border-radius: 12px;
    flex-shrink: 0;
  }

  .ffg-header h2 {
    margin: 0 0 4px;
    color: var(--ffg-text);
    font-size: clamp(17px, 2vw, 24px);
    font-weight: 750;
    line-height: 1.25;
  }

  .ffg-header p {
    margin: 0;
    color: var(--ffg-muted);
    font-size: 12px;
  }

  .ffg-counter {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 13px;
    border-radius: 30px;
    background: #fff1e7;
    color: #ea580c;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .ffg-counter.complete {
    background: #dcfce7;
    color: #15803d;
  }

  .ffg-progress {
    width: 100%;
    height: 4px;
    margin-bottom: 18px;
    border-radius: 10px;
    overflow: hidden;
    background: #edf0f4;
  }

  .ffg-progress > div {
    height: 100%;
    background: var(--ffg-accent);
    transition: width .35s ease;
  }

  .ffg-progress > div.complete {
    background: #16a34a;
  }

  /* Main gallery */

  .ffg-gallery {
    display: grid;
    grid-template-columns: 106px minmax(0, 1fr);
    align-items: stretch;
    gap: 18px;
  }

  .ffg-thumbnail-list,
  .ffg-modal-thumbnails {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .ffg-wrapper button {
    font-family: inherit;
  }

  .ffg-wrapper button:focus-visible {
    outline: 2px solid var(--ffg-accent);
    outline-offset: 2px;
  }

  .ffg-thumb {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding: 5px !important;
    gap: 5px;
    border: 2px solid #e5e7eb !important;
    border-radius: 11px;
    background: #fff !important;
    color: var(--ffg-muted) !important;
    cursor: pointer;
    box-shadow: none !important;
    transform: none !important;
    transition: border-color .2s, background .2s;
  }

  .ffg-thumb:hover {
    border-color: #fdba74 !important;
  }

  .ffg-thumb.selected {
    border-color: var(--ffg-accent) !important;
    background: #fff7ed !important;
    color: #ea580c !important;
  }

  .ffg-thumb-image {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: clamp(70px, 12vh, 112px);
    overflow: hidden;
    border-radius: 6px;
    background: #f8f9fa;
    color: #94a3b8;
  }

  .ffg-thumb-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: none !important;
    transform: none !important;
  }

  .ffg-thumb span:not(.ffg-thumb-check):not(.ffg-spinner) {
    font-size: 10px;
    line-height: 1.4;
    font-weight: 650;
    white-space: nowrap;
  }

  .ffg-thumb-check {
    position: absolute;
    right: 3px;
    top: 3px;
    width: 17px;
    height: 17px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #dcfce7;
    color: #15803d;
  }

  /* Large image */

  .ffg-main-view {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--ffg-border);
    border-radius: 15px;
    overflow: hidden;
  }

  .ffg-main-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    font-size: 14px;
    border-bottom: 1px solid var(--ffg-border);
  }

  .ffg-main-heading span {
    color: var(--ffg-muted);
    font-size: 12px;
  }

  .ffg-main-stage {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: clamp(360px, 58dvh, 780px);
    min-height: 0;
    overflow: hidden;
    background: #f7f8fa;
  }

  .ffg-hero-image-button {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    transform: none !important;
    cursor: pointer;
    overflow: hidden;
  }

  .ffg-hero-image-button img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
    filter: none !important;
    transform: none !important;
    opacity: 1 !important;
  }

  .ffg-wrapper button::before,
  .ffg-wrapper button::after {
    display: none !important;
  }

  .ffg-gallery-arrow,
  .ffg-modal-arrow,
  .ffg-expand-button,
  .ffg-icon-button {
    display: grid;
    place-items: center;
    width: 37px;
    height: 37px;
    padding: 0 !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 10px;
    background: #fff !important;
    color: #334155 !important;
    cursor: pointer;
    transform: none !important;
    box-shadow: 0 3px 12px #00000009 !important;
    flex-shrink: 0;
  }

  .ffg-gallery-arrow,
  .ffg-modal-arrow {
    position: absolute;
    top: calc(50% - 18px);
    z-index: 2;
    border-radius: 50%;
  }

  .ffg-gallery-arrow.previous,
  .ffg-modal-arrow.previous {
    left: 12px;
  }

  .ffg-gallery-arrow.next,
  .ffg-modal-arrow.next {
    right: 12px;
  }

  .ffg-expand-button {
    position: absolute;
    bottom: 14px;
    right: 14px;
  }

  .ffg-gallery-arrow:hover,
  .ffg-modal-arrow:hover,
  .ffg-expand-button:hover,
  .ffg-icon-button:hover {
    background: #fff7ed !important;
    border-color: var(--ffg-accent) !important;
    color: var(--ffg-accent) !important;
  }

  .ffg-main-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid var(--ffg-border);
    color: var(--ffg-muted);
    font-size: 11px;
  }

  .ffg-main-footer span {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ffg-ready-label {
    color: #15803d;
    white-space: nowrap;
  }

  /* Loading */

  .ffg-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: var(--ffg-muted);
  }

  .ffg-placeholder strong {
    color: var(--ffg-accent);
    font-size: 14px;
  }

  .ffg-placeholder small {
    font-size: 12px;
  }

  .ffg-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #ffedd5;
    border-top-color: var(--ffg-accent);
    border-radius: 50%;
    animation: ffg-spin .8s linear infinite;
  }

  .ffg-spinner.small {
    width: 22px;
    height: 22px;
  }

  @keyframes ffg-spin {
    to { transform: rotate(360deg); }
  }

  /* Fabric viewer */

  .ffg-modal {
    position: fixed;
    inset: 0;
    width: min(96vw, 1600px);
    max-width: none;
    max-height: 96dvh;
    padding: 0;
    margin: auto;
    border: 1px solid #e5e7eb;
    border-radius: 18px;
    background: #fff;
    color: var(--ffg-text);
    overflow: auto;
  }

  .ffg-modal::backdrop {
    background: rgba(8, 12, 20, .86);
    backdrop-filter: blur(5px);
  }

  .ffg-modal-content {
    padding: 16px;
  }

  .ffg-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }

  .ffg-kicker {
    color: var(--ffg-accent);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 2px;
  }

  .ffg-modal-header h2 {
    font-size: 23px;
    color: var(--ffg-text);
    margin: 4px 0;
    line-height: 1.2;
  }

  .ffg-modal-header p {
    font-size: 12px;
    color: var(--ffg-muted);
    margin: 0;
  }

  .ffg-modal-body {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 14px;
  }

  .ffg-zoom-stage {
    position: relative;
    display: grid;
    place-items: center;
    height: clamp(320px, 68dvh, 950px);
    overflow: hidden;
    background: #f7f8fa;
    border: 1px solid var(--ffg-border);
    border-radius: 12px;
    user-select: none;
  }

  .ffg-zoom-stage img {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transform-origin: center;
    user-select: none;
    pointer-events: none;
  }

  .ffg-zoom-stage.zoomed {
    cursor: grab;
    touch-action: none;
  }

  .ffg-zoom-stage.dragging {
    cursor: grabbing;
  }

  .ffg-modal-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 14px;
  }

  .ffg-detail-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 650;
  }

  .ffg-detail-label svg {
    color: var(--ffg-accent);
  }

  .ffg-zoom-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .ffg-zoom-level {
    padding: 8px 10px !important;
    border: 1px solid #e5e7eb !important;
    border-radius: 7px;
    background: white !important;
    color: #64748b !important;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transform: none !important;
    box-shadow: none !important;
  }

  .ffg-zoom-level.selected {
    border-color: var(--ffg-accent) !important;
    background: #fff7ed !important;
    color: #ea580c !important;
  }

  .ffg-modal-note {
    text-align: center;
    color: var(--ffg-muted);
    font-size: 11px;
    margin: 12px 0 0;
  }

  .ffg-wrapper button:disabled {
    opacity: .4;
    cursor: not-allowed;
  }

  /* Tablet */

  @media (max-width: 1024px) {
    .ffg-wrapper {
      padding: 15px;
    }

    .ffg-gallery {
      grid-template-columns: 85px minmax(0, 1fr);
      gap: 12px;
    }

    .ffg-main-stage {
      height: clamp(340px, 58dvh, 650px);
    }

    .ffg-thumb-image {
      height: 85px;
    }
  }

  /* Mobile */

  @media (max-width: 640px) {
    .ffg-wrapper {
      padding: 12px;
      border-radius: 14px;
    }

    .ffg-header-icon {
      width: 35px;
      height: 35px;
    }

    .ffg-header-icon svg {
      width: 18px;
    }

    .ffg-title-group {
      gap: 8px;
    }

    .ffg-header h2 {
      font-size: 16px;
    }

    .ffg-header p {
      font-size: 10px;
    }

    .ffg-counter {
      padding: 6px 8px;
      font-size: 10px;
    }

    .ffg-gallery,
    .ffg-modal-body {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    .ffg-main-view,
    .ffg-zoom-stage {
      grid-row: 1;
    }

    .ffg-thumbnail-list,
    .ffg-modal-thumbnails {
      grid-row: 2;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .ffg-thumb {
      width: 100%;
      padding: 3px !important;
      gap: 4px;
    }

    .ffg-thumb-image {
      height: clamp(65px, 22vw, 110px);
    }

    .ffg-thumb span:not(.ffg-thumb-check):not(.ffg-spinner) {
      font-size: 9px;
    }

    .ffg-main-stage {
      flex: none;
      height: clamp(300px, 54dvh, 550px);
    }

    .ffg-main-heading,
    .ffg-main-footer {
      padding: 10px;
      font-size: 10px;
    }

    .ffg-main-heading strong {
      font-size: 13px;
    }

    .ffg-main-footer span:first-child {
      line-height: 1.4;
    }

    .ffg-gallery-arrow,
    .ffg-modal-arrow,
    .ffg-expand-button {
      width: 30px;
      height: 30px;
    }

    .ffg-gallery-arrow.previous,
    .ffg-modal-arrow.previous {
      left: 6px;
    }

    .ffg-gallery-arrow.next,
    .ffg-modal-arrow.next {
      right: 6px;
    }

    .ffg-modal {
      width: 98vw;
      max-height: 98dvh;
      border-radius: 12px;
    }

    .ffg-modal-content {
      padding: 10px;
    }

    .ffg-zoom-stage {
      height: clamp(280px, 54dvh, 600px);
    }

    .ffg-modal-toolbar {
      justify-content: center;
    }

    .ffg-zoom-controls {
      justify-content: center;
    }

    .ffg-zoom-level {
      padding: 6px !important;
      font-size: 10px;
    }

    .ffg-icon-button {
      width: 32px;
      height: 32px;
    }
  }

  
  /* FIXED THUMBNAILS AND INDEPENDENT IMAGE SCROLL */

  .ffg-wrapper .ffg-gallery {
    align-items: start;
  }

  .ffg-wrapper .ffg-thumbnail-list {
    position: sticky;
    top: 16px;
    align-self: start;
  }

  .ffg-wrapper .ffg-main-view {
    min-height: 0;
    min-width: 0;
  }

  .ffg-wrapper .ffg-main-stage {
    position: relative;
    display: block;
    flex: none;
    min-height: 0;
    height: clamp(260px, calc(100dvh - 280px), 1000px);
    overflow: hidden;
  }

  .ffg-wrapper .ffg-image-scroll {
    width: 100%;
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 #f8fafc;
  }

  .ffg-wrapper .ffg-image-scroll .ffg-hero-image-button {
    display: block;
    width: 100%;
    height: auto !important;
    overflow: visible;
  }

  .ffg-wrapper .ffg-image-scroll .ffg-hero-image-button img {
    display: block;
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    object-fit: contain !important;
  }

  .ffg-wrapper .ffg-main-heading,
  .ffg-wrapper .ffg-main-footer {
    flex-shrink: 0;
  }

  .ffg-wrapper .ffg-thumbnail-list .ffg-thumb-image {
    height: clamp(42px, calc((100dvh - 375px) / 4), 112px);
  }

  @media (max-width: 640px) {

    .ffg-wrapper .ffg-thumbnail-list {
      position: static;
      grid-row: 1;
    }

    .ffg-wrapper .ffg-main-view {
      grid-row: 2;
    }

    .ffg-wrapper .ffg-thumbnail-list .ffg-thumb-image {
      height: clamp(52px, 17vw, 90px);
    }

    .ffg-wrapper .ffg-main-stage {
      height: clamp(230px, calc(100dvh - 340px), 600px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ffg-wrapper *,
    .ffg-modal * {
      animation: none !important;
      transition: none !important;
    }
  }
`;
