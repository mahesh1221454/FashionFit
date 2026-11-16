import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";

export default function ImageUploader({
  label,
  file,
  onChange,
  disabled = false,
}) {
  const inputRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageError, setImageError] = useState(false);

  // Stable object URL for each uploaded image.
  useEffect(() => {
    setImageError(false);

    if (!file) {
      setPreviewUrl(null);
      setPreviewOpen(false);
      return;
    }

    const url = URL.createObjectURL(file);

    setPreviewUrl(url);
    setZoom(1);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Close preview with Escape.
  useEffect(() => {
    if (!previewOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewOpen]);

  const selectFile = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleFile = (selectedFile) => {
    if (!selectedFile || disabled) return;

    if (!selectedFile.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    setPreviewOpen(false);
    onChange(selectedFile);
  };

  const handleInput = (event) => {
    handleFile(event.target.files?.[0]);

    // Allow selecting the same file again.
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);

    if (!disabled) {
      handleFile(event.dataTransfer.files?.[0]);
    }
  };

  const removeFile = (event) => {
    event.stopPropagation();

    if (disabled) return;

    setPreviewOpen(false);
    onChange(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const openPreview = (event) => {
    event.stopPropagation();

    setZoom(1);
    setPreviewOpen(true);
  };

  return (
    <>
      <style>{`
        .ff-upload-card {
          position: relative;
          width: 100%;
          min-width: 0;
          height: 220px;
          border: 1.5px dashed #dce1e8;
          border-radius: 16px;
          overflow: hidden;
          background: #fafbfc;
          transition: border-color .2s, box-shadow .2s;
        }

        .ff-upload-card:hover,
        .ff-upload-dragging {
          border-color: #f97316;
          box-shadow: 0 4px 18px rgba(249,115,22,.08);
        }

        .ff-upload-filled {
          border-style: solid;
          background: #ffffff;
        }

        .ff-upload-empty {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 10px;
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .ff-upload-plus {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #fff0e5;
          color: #f97316;
          font-size: 26px;
        }

        .ff-upload-empty strong {
          font-size: 14px;
          color: #17263c;
        }

        .ff-upload-empty small {
          font-size: 12px;
          color: #8796af;
        }

        .ff-upload-image-area {
          height: 174px;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          overflow: hidden;
        }

        .ff-upload-image-area img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          cursor: default;
        }

        .ff-upload-footer {
          height: 46px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 12px;
          background: white;
          border-top: 1px solid #edf0f4;
          gap: 6px;
        }

        .ff-upload-label {
          font-size: 12px;
          font-weight: 600;
          color: #17263c;
        }

        .ff-upload-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ff-upload-action {
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 7px;
          color: #475569;
          padding: 5px 9px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all .2s;
        }

        .ff-upload-action:hover {
          border-color: #f97316;
          color: #ea580c;
          background: #fff7ed;
        }

        .ff-upload-action:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .ff-upload-ready {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 5px 9px;
          border-radius: 20px;
          background: #ecfdf5;
          color: #15803d;
          font-size: 10px;
          font-weight: 600;
        }

        .ff-upload-remove {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 50%;
          background: #334155;
          color: white;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .ff-upload-remove:hover {
          background: #dc2626;
        }

        .ff-preview-modal {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(15,23,42,.88);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(8px);
        }

        .ff-preview-panel {
          width: min(780px, 95vw);
          height: min(780px, 90vh);
          background: white;
          border-radius: 18px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 80px rgba(0,0,0,.3);
        }

        .ff-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid #e5e7eb;
        }

        .ff-preview-title {
          font-size: 16px;
          font-weight: 700;
          color: #17263c;
        }

        .ff-preview-close {
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 50%;
          background: #f1f5f9;
          color: #334155;
          font-size: 22px;
          cursor: pointer;
        }

        .ff-preview-content {
          flex: 1;
          min-height: 0;
          overflow: auto;
          background: #f8fafc;
        }

        .ff-preview-content img {
          display: block;
          object-fit: contain;
          margin: auto;
          transform-origin: center;
        }

        .ff-preview-toolbar {
          padding: 12px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 12px;
          border-top: 1px solid #e5e7eb;
        }

        .ff-preview-toolbar button {
          padding: 7px 14px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          color: #334155;
          font-weight: 600;
          cursor: pointer;
        }

        .ff-preview-toolbar button:hover {
          color: #f97316;
          border-color: #f97316;
        }

        @media (max-width: 600px) {
          .ff-upload-card {
            height: 190px;
          }

          .ff-upload-image-area {
            height: 144px;
          }

          .ff-upload-footer {
            padding: 0 6px;
          }

          .ff-upload-action {
            padding: 5px 6px;
          }
        }
      `}</style>

      <div
        className={[
          "ff-upload-card",
          file ? "ff-upload-filled" : "",
          dragging ? "ff-upload-dragging" : "",
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();

          if (!disabled) {
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          disabled={disabled}
          onChange={handleInput}
        />

        {file ? (
          <>
            <div className="ff-upload-image-area">
              {previewUrl && !imageError ? (
                <img
                  src={previewUrl}
                  alt={label}
                  onClick={openPreview}
                  onError={() => setImageError(true)}
                />
              ) : (
                <small>
                  {imageError
                    ? "Preview unavailable for this format"
                    : "Preparing preview..."}
                </small>
              )}
            </div>

            <span className="ff-upload-ready">
              ✓ Selected
            </span>

            {!disabled && (
              <button
                type="button"
                className="ff-upload-remove"
                onClick={removeFile}
                aria-label={`Remove ${label}`}
                title="Remove image"
              >
                ×
              </button>
            )}

            <div className="ff-upload-footer">
              <span className="ff-upload-label">
                {label}
              </span>

              <div className="ff-upload-actions">
                <button
                  type="button"
                  className="ff-upload-action"
                  onClick={openPreview}
                  disabled={!previewUrl || imageError}
                >
                  Preview
                </button>

                <button
                  type="button"
                  className="ff-upload-action"
                  onClick={selectFile}
                  disabled={disabled}
                >
                  Replace
                </button>
              </div>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="ff-upload-empty"
            onClick={selectFile}
            disabled={disabled}
          >
            <span className="ff-upload-plus">+</span>

            <strong>{label}</strong>

            <small>Click or drag image</small>
          </button>
        )}
      </div>

      {previewOpen &&
        previewUrl &&
        createPortal(
          <div
            className="ff-preview-modal"
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="ff-preview-panel"
              role="dialog"
              aria-modal="true"
              aria-label={`${label} preview`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="ff-preview-header">
                <span className="ff-preview-title">
                  {label} — Customer Preview
                </span>

                <button
                  type="button"
                  className="ff-preview-close"
                  onClick={() => setPreviewOpen(false)}
                  aria-label="Close preview"
                >
                  ×
                </button>
              </div>

              <div className="ff-preview-content">
                <img
                  src={previewUrl}
                  alt={label}
                  style={{
                    width: `${zoom * 100}%`,
                    height: `${zoom * 100}%`,
                  }}
                />
              </div>

              <div className="ff-preview-toolbar">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((current) =>
                      Math.max(1, current - 0.25)
                    )
                  }
                >
                  −
                </button>

                <strong>{Math.round(zoom * 100)}%</strong>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((current) =>
                      Math.min(3, current + 0.25)
                    )
                  }
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => setZoom(1)}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}