
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  X,
  ZoomIn,
} from "lucide-react";

import DesignCard from "./DesignCard";
import "../styles/compactDressGallery.css";

export default function DesignGrid({
  designs = [],
  onDesignClick,
  manageMode = false,
  selectedIds = [],
  onToggleSelect,
}) {
  const [previewIndex, setPreviewIndex] = useState(null);
  const [imageError, setImageError] = useState(false);

  const list = Array.isArray(designs) ? designs : [];

  const selectedSet = new Set(
    selectedIds.map((id) => String(id))
  );

  const previewOpen =
    !manageMode &&
    previewIndex !== null &&
    previewIndex >= 0 &&
    previewIndex < list.length;

  const previewDesign = previewOpen
    ? list[previewIndex]
    : null;

  // Open full-image preview instead of immediately
  // navigating to the try-on page.
  const openPreview = (index) => {
    if (manageMode) return;

    setImageError(false);
    setPreviewIndex(index);
  };

  const closePreview = () => {
    setPreviewIndex(null);
    setImageError(false);
  };

  const previousDress = () => {
    setImageError(false);

    setPreviewIndex((index) => {
      if (index === null) return null;

      return (index - 1 + list.length) % list.length;
    });
  };

  const nextDress = () => {
    setImageError(false);

    setPreviewIndex((index) => {
      if (index === null) return null;

      return (index + 1) % list.length;
    });
  };

  const continueToTryOn = () => {
    if (!previewDesign) return;

    const design = previewDesign;

    closePreview();

    // Preserve original HomePage navigation.
    onDesignClick?.(design);
  };

  // Prevent background scrolling when preview is open.
  useEffect(() => {
    if (!previewOpen) return;

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = oldOverflow;
    };
  }, [previewOpen]);

  // Keyboard controls for image preview.
  useEffect(() => {
    if (!previewOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        previousDress();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        nextDress();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [previewOpen, list.length]);

  // Close preview when collection or manage mode changes.
  useEffect(() => {
    setPreviewIndex(null);
    setImageError(false);
  }, [manageMode, designs]);

  if (list.length === 0) {
    return (
      <div className="empty-state collection-grid-empty">
        <p>No dresses available in this collection.</p>
      </div>
    );
  }

  return (
    <>
      {/* ======================================
          COMPACT DRESS COLLECTION
         ====================================== */}

      <div
        className={
          "design-grid collection-design-grid compact-dress-grid" +
          (manageMode ? " is-managing" : "")
        }
      >
        {list.map((design, index) => (
          <DesignCard
            key={design.id}
            design={design}
            manageMode={manageMode}
            selected={selectedSet.has(String(design.id))}
            onSelect={() =>
              onToggleSelect?.(design.id)
            }
            onClick={() => openPreview(index)}
          />
        ))}
      </div>

      {/* ======================================
          FULL IMAGE PREVIEW POPUP
         ====================================== */}

      {previewOpen && previewDesign && (
        <div
          className="dress-preview-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              closePreview();
            }
          }}
        >
          <div
            className="dress-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewDesign.name}`}
          >
            {/* Header */}

            <div className="dress-preview-header">
              <div className="dress-preview-heading">
                <div className="dress-preview-icon">
                  <Eye size={18} />
                </div>

                <div>
                  <span className="dress-preview-eyebrow">
                    DESIGN PREVIEW
                  </span>

                  <h2>{previewDesign.name}</h2>
                </div>
              </div>

              <button
                type="button"
                className="dress-preview-close"
                onClick={closePreview}
                aria-label="Close preview"
              >
                <X size={21} />
              </button>
            </div>

            {/* Complete dress image */}

            <div className="dress-preview-image-area">
              {list.length > 1 && (
                <button
                  type="button"
                  className="dress-preview-arrow dress-preview-prev"
                  onClick={previousDress}
                  aria-label="Previous dress"
                >
                  <ArrowLeft size={20} />
                </button>
              )}

              <div className="dress-preview-image-box">
                {imageError ? (
                  <div className="dress-preview-image-error">
                    Image could not be loaded.
                  </div>
                ) : (
                  <img
                    key={previewDesign.id}
                    src={previewDesign.image_url}
                    alt={previewDesign.name}
                    className="dress-preview-full-image"
                    onError={() => setImageError(true)}
                  />
                )}
              </div>

              {list.length > 1 && (
                <button
                  type="button"
                  className="dress-preview-arrow dress-preview-next"
                  onClick={nextDress}
                  aria-label="Next dress"
                >
                  <ArrowRight size={20} />
                </button>
              )}
            </div>

            {/* Footer */}

            <div className="dress-preview-footer">
              <div className="dress-preview-details">
                <span className="dress-preview-design-code">
                  {previewDesign.design_code}
                </span>

                <strong>{previewDesign.name}</strong>

                <small>
                  Design {previewIndex + 1} of {list.length}
                </small>
              </div>

              <div className="dress-preview-actions">
                <button
                  type="button"
                  className="dress-preview-secondary-button"
                  onClick={closePreview}
                >
                  Close
                </button>

                <button
                  type="button"
                  className="dress-preview-primary-button"
                  onClick={continueToTryOn}
                >
                  Continue to Try-On
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
