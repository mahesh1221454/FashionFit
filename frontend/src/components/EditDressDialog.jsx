
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  FolderOpen,
  Image as ImageIcon,
  ImageOff,
  Info,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";

import api from "../services/api";

// =========================================================
// CONFIGURATION
// =========================================================

const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

// Optional client-side limit.
// Actual image limits are enforced by FastAPI.
const configuredMaxBytes = Number(
  import.meta.env.VITE_CUSTOM_DRESS_MAX_BYTES || 0
);

const CLIENT_MAX_BYTES =
  Number.isFinite(configuredMaxBytes) &&
  configuredMaxBytes > 0
    ? configuredMaxBytes
    : 0;

// =========================================================
// HELPERS
// =========================================================

function readError(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || "Invalid input")
      .join(", ");
  }

  if (typeof detail === "object" && detail !== null) {
    return detail.message || "Request failed.";
  }

  return (
    error?.message ||
    "An unexpected error occurred."
  );
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isAuthenticationError(error) {
  return (
    error?.response?.status === 401 ||
    error?.response?.status === 403
  );
}

function normaliseName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

// =========================================================
// EDIT DRESS DIALOG
// =========================================================

export default function EditDressDialog({
  dress,
  categories = [],
  accessToken,
  onClose,
  onSaved,
  onSessionExpired,
}) {
  // -------------------------------------------------------
  // CURRENT FORM DATA
  // -------------------------------------------------------

  const [name, setName] = useState(
    dress?.name || ""
  );

  const [categoryId, setCategoryId] = useState(
    String(dress?.category_id || "")
  );

  // Last confirmed values on the backend.
  // These are updated after a successful details request.
  const [savedName, setSavedName] = useState(
    dress?.name || ""
  );

  const [savedCategoryId, setSavedCategoryId] =
    useState(
      String(dress?.category_id || "")
    );

  const [savedCategoryName, setSavedCategoryName] =
    useState(
      categories.find(
        (category) =>
          String(category.id) ===
          String(dress?.category_id)
      )?.name || ""
    );

  const [currentImageUrl, setCurrentImageUrl] =
    useState(
      dress?.image_url || ""
    );

  // -------------------------------------------------------
  // IMAGE SELECTION
  // -------------------------------------------------------

  const [replacementFile, setReplacementFile] =
    useState(null);

  const [replacementPreview, setReplacementPreview] =
    useState("");

  const [dragActive, setDragActive] = useState(false);

  // -------------------------------------------------------
  // REQUEST STATE
  // -------------------------------------------------------

  const [saving, setSaving] = useState(false);

  const [saveStage, setSaveStage] = useState("");

  const [error, setError] = useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [detailsUpdated, setDetailsUpdated] =
    useState(false);

  const [imageUpdated, setImageUpdated] =
    useState(false);

  const [changesPersisted, setChangesPersisted] =
    useState(false);

  // -------------------------------------------------------
  // REFS
  // -------------------------------------------------------

  const nameInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const savingRef = useRef(false);

  const latestSavedRef = useRef({
    name: dress?.name || "",
    categoryId: String(
      dress?.category_id || ""
    ),
    categoryName:
      categories.find(
        (category) =>
          String(category.id) ===
          String(dress?.category_id)
      )?.name || "",
    imageUrl: dress?.image_url || "",
    detailsUpdated: false,
    imageUpdated: false,
    changed: false,
  });

  // -------------------------------------------------------
  // CATEGORY INFORMATION
  // -------------------------------------------------------

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) =>
          String(category.id) === categoryId
      ),
    [categories, categoryId]
  );

  const originalCategory = useMemo(
    () =>
      categories.find(
        (category) =>
          String(category.id) ===
          String(dress?.category_id)
      ),
    [categories, dress?.category_id]
  );

  // -------------------------------------------------------
  // CHANGE DETECTION
  // -------------------------------------------------------

  const cleanName = normaliseName(name);

  const nameChanged =
    cleanName !== savedName;

  const categoryChanged =
    categoryId !== savedCategoryId;

  const detailsChanged =
    nameChanged || categoryChanged;

  const imageChanged =
    replacementFile !== null;

  const hasChanges =
    detailsChanged || imageChanged;

  const validName =
    cleanName.length > 0 &&
    cleanName.length <= 150;

  const validCategory =
    Boolean(categoryId) &&
    Boolean(selectedCategory);

  const canSave =
    !saving &&
    validName &&
    validCategory &&
    hasChanges &&
    Boolean(accessToken);

  // -------------------------------------------------------
  // INITIAL FOCUS
  // -------------------------------------------------------

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // -------------------------------------------------------
  // IMAGE PREVIEW
  // -------------------------------------------------------

  useEffect(() => {
    if (!replacementFile) {
      setReplacementPreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(
      replacementFile
    );

    setReplacementPreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [replacementFile]);

  // -------------------------------------------------------
  // BUILD SAVED RESULT
  // -------------------------------------------------------

  const buildSavedResult = useCallback(() => {
    const latest = latestSavedRef.current;

    return {
      success: true,
      updated: latest.changed,
      design_id: dress.id,
      name: latest.name,
      category_id: latest.categoryId,
      category_name: latest.categoryName,
      image_url: latest.imageUrl,
      details_updated: latest.detailsUpdated,
      image_updated: latest.imageUpdated,
    };
  }, [dress.id]);

  // -------------------------------------------------------
  // CLOSE HANDLING
  // -------------------------------------------------------

  const handleClose = useCallback(() => {
    if (savingRef.current) return;

    // If one request succeeded and another failed,
    // notify HomePage of the persisted changes.
    if (latestSavedRef.current.changed) {
      onSaved?.(buildSavedResult());
      return;
    }

    onClose?.();
  }, [
    onClose,
    onSaved,
    buildSavedResult,
  ]);

  // -------------------------------------------------------
  // KEYBOARD
  // -------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event) => {
      if (
        event.key === "Escape" &&
        !savingRef.current
      ) {
        handleClose();
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown
      );
    };
  }, [handleClose]);

  // -------------------------------------------------------
  // FILE VALIDATION
  // -------------------------------------------------------

  function selectImage(file) {
    if (!file || savingRef.current) return;

    setError("");
    setSuccessMessage("");

    if (
      !ACCEPTED_IMAGE_TYPES.includes(file.type)
    ) {
      setError(
        "Please select a JPG, JPEG, PNG, or WebP image."
      );
      return;
    }

    if (file.size === 0) {
      setError("The selected image is empty.");
      return;
    }

    if (
      CLIENT_MAX_BYTES > 0 &&
      file.size > CLIENT_MAX_BYTES
    ) {
      setError(
        `Image size must be under ${formatSize(
          CLIENT_MAX_BYTES
        )}.`
      );
      return;
    }

    setReplacementFile(file);
  }

  function removeReplacement() {
    if (savingRef.current) return;

    setReplacementFile(null);
    setReplacementPreview("");
    setError("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // -------------------------------------------------------
  // DRAG AND DROP
  // -------------------------------------------------------

  function handleDragOver(event) {
    event.preventDefault();

    if (!savingRef.current) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();

    if (!event.currentTarget.contains(
      event.relatedTarget
    )) {
      setDragActive(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();

    setDragActive(false);

    if (savingRef.current) return;

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      selectImage(file);
    }
  }

  // -------------------------------------------------------
  // SAVE DETAILS
  // -------------------------------------------------------

  async function saveDetails() {
    setSaveStage("Updating dress details...");

    const response = await api.patch(
      `/designs/${encodeURIComponent(
        dress.id
      )}/details`,
      {
        name: cleanName,
        category_id: categoryId,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (response.data?.success !== true) {
      throw new Error(
        "The backend did not confirm the details update."
      );
    }

    const updatedName =
      response.data.name || cleanName;

    const updatedCategoryId = String(
      response.data.category_id ||
      categoryId
    );

    const updatedCategoryName =
      response.data.category_name ||
      selectedCategory?.name ||
      "";

    setSavedName(updatedName);
    setSavedCategoryId(updatedCategoryId);
    setSavedCategoryName(updatedCategoryName);

    latestSavedRef.current = {
      ...latestSavedRef.current,
      name: updatedName,
      categoryId: updatedCategoryId,
      categoryName: updatedCategoryName,
      detailsUpdated: true,
      changed: true,
    };

    setDetailsUpdated(true);
    setChangesPersisted(true);

    return response.data;
  }

  // -------------------------------------------------------
  // REPLACE IMAGE
  // -------------------------------------------------------

  async function saveReplacementImage() {
    setSaveStage("Uploading replacement image...");

    const formData = new FormData();

    formData.append(
      "file",
      replacementFile
    );

    const response = await api.post(
      `/designs/${encodeURIComponent(
        dress.id
      )}/replace-image`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (
      response.data?.success !== true ||
      !response.data?.image_url
    ) {
      throw new Error(
        "The backend did not confirm the image replacement."
      );
    }

    const newImageUrl =
      response.data.image_url;

    setCurrentImageUrl(newImageUrl);

    latestSavedRef.current = {
      ...latestSavedRef.current,
      imageUrl: newImageUrl,
      imageUpdated: true,
      changed: true,
    };

    setImageUpdated(true);
    setChangesPersisted(true);

    setReplacementFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    return response.data;
  }

  // -------------------------------------------------------
  // SAVE ALL CHANGES
  // -------------------------------------------------------

  async function handleSave(event) {
    event.preventDefault();

    if (
      savingRef.current ||
      !hasChanges
    ) {
      return;
    }

    if (!validName) {
      setError(
        "Please enter a valid dress name."
      );
      return;
    }

    if (!validCategory) {
      setError(
        "Please select a valid category."
      );
      return;
    }

    if (!accessToken) {
      setError(
        "Administrator session expired. Please log in again."
      );

      onSessionExpired?.();
      return;
    }

    savingRef.current = true;

    setSaving(true);
    setError("");
    setSuccessMessage("");

    const needsDetailsUpdate =
      detailsChanged;

    const needsImageUpdate =
      imageChanged;

    let completedDetails = false;

    try {
      // First save name/category.
      if (needsDetailsUpdate) {
        await saveDetails();
        completedDetails = true;
      }

      // Then replace the image.
      if (needsImageUpdate) {
        await saveReplacementImage();
      }

      setSaveStage("Changes saved successfully.");

      // Existing HomePage handler closes the dialog,
      // updates UI state and refreshes the gallery.
      onSaved?.(buildSavedResult());
    } catch (err) {
      const message = readError(err);

      if (isAuthenticationError(err)) {
        onSessionExpired?.();
      }

      // If details succeeded but image failed,
      // retain the successful details and allow
      // the administrator to retry just the image.
      if (
        completedDetails &&
        needsImageUpdate
      ) {
        setError(
          "Dress name/category were saved successfully, " +
          "but the replacement image could not be saved. " +
          `You can retry the image upload. ${message}`
        );
      } else if (
        latestSavedRef.current.changed
      ) {
        setError(
          "Some changes have already been saved. " +
          `The remaining operation failed: ${message}`
        );
      } else {
        setError(message);
      }

      setSaveStage("");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------

  if (!dress) {
    return null;
  }

  return (
    <div
      className="ed-overlay"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          handleClose();
        }
      }}
    >
      <div
        className="ed-dialog ed-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ed-dialog-title"
      >
        {/* Header */}

        <button
          type="button"
          className="ed-close"
          disabled={saving}
          onClick={handleClose}
          aria-label="Close editor"
        >
          <X size={18} />
        </button>

        <div className="ed-heading">
          <div className="ed-heading-icon">
            <Pencil size={21} />
          </div>

          <div>
            <span className="ed-eyebrow">
              COLLECTION MANAGEMENT
            </span>

            <h2 id="ed-dialog-title">
              Edit Dress Details
            </h2>
          </div>
        </div>

        <p className="ed-description">
          Update your design name, category or image
          while keeping its existing design ID and
          AI generation history.
        </p>

        {/* Dress identity */}

        <div className="ed-dress-identity">
          <div className="ed-identity-icon">
            <ImageIcon size={19} />
          </div>

          <div>
            <strong>{savedName}</strong>

            <span>
              {dress.design_code}
            </span>
          </div>

          <span className="ed-existing-badge">
            Existing Design
          </span>
        </div>

        <form onSubmit={handleSave}>
          {/* Current and replacement previews */}

          <div className="ed-section-heading">
            <div>
              <h3>Dress Image</h3>

              <p>
                Replace the photo without creating
                a new dress.
              </p>
            </div>
          </div>

          <div className="ed-image-comparison">
            {/* Current image */}

            <div className="ed-image-card">
              <span className="ed-image-label">
                CURRENT IMAGE
              </span>

              <div className="ed-image-preview">
                {currentImageUrl ? (
                  <img
                    src={currentImageUrl}
                    alt="Current dress"
                  />
                ) : (
                  <ImageOff size={28} />
                )}
              </div>

              <div className="ed-image-footer">
                <CheckCircle2 size={15} />

                <span>
                  Current Design
                </span>
              </div>
            </div>

            {/* Arrow */}

            <div className="ed-comparison-arrow">
              <ArrowRight size={20} />
            </div>

            {/* Replacement preview */}

            <div
              className={
                "ed-image-card ed-replacement-card" +
                (dragActive
                  ? " ed-drag-active"
                  : "") +
                (replacementFile
                  ? " ed-has-replacement"
                  : "")
              }
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="ed-image-label">
                NEW IMAGE
              </span>

              {replacementPreview ? (
                <div className="ed-image-preview">
                  <img
                    src={replacementPreview}
                    alt="New dress preview"
                  />

                  <button
                    type="button"
                    className="ed-remove-image"
                    disabled={saving}
                    onClick={removeReplacement}
                    aria-label="Remove selected image"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="ed-upload-preview"
                  disabled={saving}
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                >
                  <UploadCloud size={26} />

                  <strong>
                    Upload Image
                  </strong>

                  <span>
                    Click or drag here
                  </span>
                </button>
              )}

              <div className="ed-image-footer">
                {replacementFile ? (
                  <>
                    <CheckCircle2 size={15} />

                    <span>
                      Ready to Replace
                    </span>
                  </>
                ) : (
                  <>
                    <Info size={15} />

                    <span>
                      No image selected
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Hidden file input */}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="ed-hidden-input"
            disabled={saving}
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              if (file) {
                selectImage(file);
              }
            }}
          />

          {/* Image file detail */}

          {replacementFile ? (
            <div className="ed-file-detail">
              <div className="ed-file-icon">
                <ImageIcon size={17} />
              </div>

              <div>
                <strong>
                  {replacementFile.name}
                </strong>

                <span>
                  {formatSize(
                    replacementFile.size
                  )}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={saving}
              >
                Change
              </button>

              <button
                type="button"
                className="ed-file-remove"
                disabled={saving}
                onClick={removeReplacement}
                title="Remove replacement image"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <p className="ed-upload-hint">
              JPG, PNG or WebP. File dimensions
              and size are validated by the backend.
            </p>
          )}

          {/* Dress name */}

          <div className="ed-form-divider" />

          <div className="ed-section-heading">
            <div>
              <h3>Dress Information</h3>

              <p>
                Update the design's catalog details.
              </p>
            </div>
          </div>

          <label className="ed-field">
            <span>
              Dress Name
            </span>

            <input
              ref={nameInputRef}
              type="text"
              value={name}
              maxLength={150}
              required
              disabled={saving}
              placeholder="Enter dress name"
              onChange={(event) => {
                setName(event.target.value);
                setError("");
              }}
            />

            <small>
              {cleanName.length}/150 characters
            </small>
          </label>

          {/* Category */}

          <label className="ed-field">
            <span>
              Collection Category
            </span>

            <select
              value={categoryId}
              required
              disabled={saving}
              onChange={(event) => {
                setCategoryId(
                  event.target.value
                );

                setError("");
              }}
            >
              <option value="">
                Select category
              </option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          {/* Category change notice */}

          {categoryChanged && (
            <div className="ed-category-change">
              <FolderOpen size={16} />

              <span>
                This dress will move from{" "}
                <strong>
                  {savedCategoryName ||
                    originalCategory?.name ||
                    "Current Category"}
                </strong>{" "}
                to{" "}
                <strong>
                  {selectedCategory?.name ||
                    "Selected Category"}
                </strong>
                .
              </span>
            </div>
          )}

          {/* Security information */}

          <div className="ed-information">
            <ShieldCheck size={18} />

            <span>
              The design ID and linked AI history
              remain unchanged. The original image
              file is retained on the server.
            </span>
          </div>

          {/* Saved changes indicators */}

          {changesPersisted && (
            <div
              className="ed-saved-summary"
              role="status"
            >
              <CheckCircle2 size={17} />

              <div>
                <strong>
                  Changes already saved
                </strong>

                <span>
                  {[
                    detailsUpdated
                      ? "Dress details"
                      : null,
                    imageUpdated
                      ? "Dress image"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" and ")}
                </span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="ed-saved-summary">
              <CheckCircle2 size={17} />
              {successMessage}
            </div>
          )}

          {error && (
            <div
              className="ed-error"
              role="alert"
            >
              <AlertCircle size={18} />

              <span>{error}</span>
            </div>
          )}

          {saving && (
            <div className="ed-progress-status">
              <LoaderCircle
                size={16}
                className="ed-spin"
              />

              <span>
                {saveStage ||
                  "Saving changes..."}
              </span>
            </div>
          )}

          {/* Footer actions */}

          <div className="ed-actions">
            <button
              type="button"
              className="ed-button ed-button-secondary"
              disabled={saving}
              onClick={handleClose}
            >
              {changesPersisted
                ? "Close"
                : "Cancel"}
            </button>

            {replacementFile && (
              <button
                type="button"
                className="ed-button ed-button-reset"
                disabled={saving}
                onClick={removeReplacement}
              >
                <RotateCcw size={15} />
                Reset Image
              </button>
            )}

            <button
              type="submit"
              className="ed-button ed-button-primary"
              disabled={!canSave}
            >
              {saving ? (
                <LoaderCircle
                  size={16}
                  className="ed-spin"
                />
              ) : (
                <Save size={16} />
              )}

              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      <style>{EDIT_DRESS_STYLES}</style>
    </div>
  );
}

// =========================================================
// COMPONENT STYLES
// =========================================================

const EDIT_DRESS_STYLES = `
.ed-overlay {
  position: fixed;
  inset: 0;
  z-index: 450;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(24,24,27,.60);
  backdrop-filter: blur(5px);
}

.ed-overlay * {
  box-sizing: border-box;
}

.ed-dialog {
  position: relative;
  width: min(100%, 475px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 24px;
  border: 1px solid #e4e4e7;
  border-radius: 20px;
  background: #fff;
  color: #18181b;
  font-family: inherit;
  box-shadow: 0 25px 80px rgba(0,0,0,.20);
}

.ed-image-dialog {
  width: min(100%, 545px);
}

.ed-close {
  position: absolute;
  top: 15px;
  right: 15px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid #e4e4e7;
  border-radius: 9px;
  background: #fff;
  color: #71717a;
  cursor: pointer;
}

.ed-close:hover:not(:disabled) {
  background: #f4f4f5;
}

.ed-close:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.ed-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 35px;
}

.ed-heading-icon {
  display: grid;
  place-items: center;
  flex: 0 0 44px;
  height: 44px;
  border-radius: 12px;
  background: #fff7ed;
  color: #ea580c;
}

.ed-eyebrow {
  display: block;
  margin-bottom: 5px;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.1px;
}

.ed-heading h2 {
  margin: 0;
  color: #18181b;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.3;
}

.ed-description {
  margin: 14px 0 16px;
  color: #71717a;
  font-size: 12px;
  line-height: 1.65;
}

/* Dress identity */

.ed-dress-identity {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 19px;
  padding: 11px 12px;
  border: 1px solid #eaeaec;
  border-radius: 11px;
  background: #fafafa;
}

.ed-identity-icon {
  display: grid;
  place-items: center;
  flex: 0 0 39px;
  height: 39px;
  border-radius: 10px;
  background: #fff7ed;
  color: #ea580c;
}

.ed-dress-identity > div:nth-child(2) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ed-dress-identity strong {
  overflow: hidden;
  color: #27272a;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ed-dress-identity span {
  color: #a1a1aa;
  font-size: 10px;
}

.ed-existing-badge {
  padding: 6px 8px;
  border-radius: 20px;
  background: #f0fdf4;
  color: #15803d !important;
  font-size: 10px !important;
  font-weight: 700;
  white-space: nowrap;
}

/* Sections */

.ed-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.ed-section-heading h3 {
  margin: 0 0 4px;
  color: #27272a;
  font-size: 14px;
  font-weight: 800;
}

.ed-section-heading p {
  margin: 0;
  color: #a1a1aa;
  font-size: 11px;
  line-height: 1.5;
}

.ed-form-divider {
  height: 1px;
  margin: 19px 0;
  background: #eaeaec;
}

/* Image comparison */

.ed-image-comparison {
  display: grid;
  grid-template-columns: minmax(0,1fr) 25px minmax(0,1fr);
  align-items: center;
  gap: 10px;
}

.ed-image-card {
  min-width: 0;
  overflow: hidden;
  padding: 10px;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  background: #fafafa;
}

.ed-image-label {
  display: block;
  margin-bottom: 9px;
  color: #71717a;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1px;
}

.ed-image-preview,
.ed-upload-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 175px;
  width: 100%;
  overflow: hidden;
  border-radius: 9px;
  background: #fff;
}

.ed-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ed-upload-preview {
  flex-direction: column;
  gap: 8px;
  border: 1.5px dashed #fdba74;
  background: #fffaf5;
  color: #ea580c;
  cursor: pointer;
}

.ed-upload-preview:hover:not(:disabled) {
  border-color: #f97316;
  background: #fff7ed;
}

.ed-upload-preview strong {
  font-size: 11px;
}

.ed-upload-preview span {
  color: #a1a1aa;
  font-size: 10px;
}

.ed-replacement-card {
  border-color: #fed7aa;
}

.ed-drag-active {
  border-color: #f97316;
  background: #ffedd5;
}

.ed-has-replacement {
  border-color: #86efac;
}

.ed-comparison-arrow {
  display: grid;
  place-items: center;
  color: #a1a1aa;
}

.ed-image-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding-top: 10px;
  color: #71717a;
  font-size: 10px;
  font-weight: 650;
}

.ed-image-footer svg {
  color: #16a34a;
}

.ed-replacement-card:not(.ed-has-replacement)
.ed-image-footer svg {
  color: #a1a1aa;
}

.ed-remove-image {
  position: absolute;
  top: 7px;
  right: 7px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: rgba(255,255,255,.96);
  color: #dc2626;
  cursor: pointer;
}

.ed-hidden-input {
  display: none;
}

.ed-upload-hint {
  margin: 10px 0 0;
  color: #a1a1aa;
  font-size: 10px;
  line-height: 1.5;
}

/* File details */

.ed-file-detail {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 11px;
  padding: 10px;
  border: 1px solid #dcfce7;
  border-radius: 10px;
  background: #f0fdf4;
}

.ed-file-icon {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  height: 34px;
  border-radius: 9px;
  background: #dcfce7;
  color: #15803d;
}

.ed-file-detail > div:nth-child(2) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ed-file-detail strong {
  overflow: hidden;
  color: #166534;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ed-file-detail span {
  color: #65a30d;
  font-size: 10px;
}

.ed-file-detail > button {
  border: 0;
  background: transparent;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.ed-file-detail > .ed-file-remove {
  display: grid;
  place-items: center;
  color: #dc2626;
}

/* Fields */

.ed-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 15px;
}

.ed-field > span {
  color: #3f3f46;
  font-size: 12px;
  font-weight: 700;
}

.ed-field input,
.ed-field select {
  width: 100%;
  min-height: 43px;
  padding: 10px 12px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  outline: 0;
  background: #fafafa;
  color: #27272a;
  font-family: inherit;
  font-size: 13px;
}

.ed-field input:focus,
.ed-field select:focus {
  background: #fff;
  border-color: #fb923c;
  box-shadow: 0 0 0 3px rgba(249,115,22,.1);
}

.ed-field input:disabled,
.ed-field select:disabled {
  opacity: .65;
}

.ed-field small {
  align-self: flex-end;
  color: #a1a1aa;
  font-size: 10px;
}

/* Information */

.ed-category-change {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 14px;
  padding: 11px;
  border-radius: 9px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
  line-height: 1.6;
}

.ed-category-change svg {
  flex-shrink: 0;
}

.ed-information {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 0;
  padding: 11px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

.ed-information svg {
  flex-shrink: 0;
  color: #16a34a;
}

/* Status messages */

.ed-saved-summary {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 13px;
  padding: 11px;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  background: #f0fdf4;
  color: #166534;
  font-size: 11px;
  line-height: 1.55;
}

.ed-saved-summary svg {
  flex-shrink: 0;
}

.ed-saved-summary > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ed-saved-summary strong {
  font-size: 12px;
}

.ed-saved-summary span {
  color: #15803d;
}

.ed-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 13px;
  padding: 11px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.6;
}

.ed-error svg {
  flex-shrink: 0;
}

.ed-progress-status {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 13px;
  padding: 11px;
  border-radius: 10px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 650;
}

/* Footer */

.ed-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 20px;
}

.ed-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 41px;
  padding: 10px 15px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.ed-button-secondary {
  border-color: #e4e4e7;
  background: #fff;
  color: #52525b;
}

.ed-button-primary {
  background: #f97316;
  color: #fff;
}

.ed-button-primary:hover:not(:disabled) {
  background: #ea580c;
}

.ed-button-reset {
  border-color: #fed7aa;
  background: #fff7ed;
  color: #c2410c;
}

.ed-button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.ed-spin {
  animation: ed-spin .8s linear infinite;
}

@keyframes ed-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Responsive */

@media (max-width: 560px) {
  .ed-dialog {
    padding: 18px;
    border-radius: 16px;
  }

  .ed-heading h2 {
    font-size: 19px;
  }

  .ed-image-comparison {
    gap: 6px;
    grid-template-columns: minmax(0,1fr) 18px minmax(0,1fr);
  }

  .ed-image-card {
    padding: 7px;
  }

  .ed-image-preview,
  .ed-upload-preview {
    height: 145px;
  }

  .ed-upload-preview strong,
  .ed-image-footer {
    font-size: 9px;
  }

  .ed-file-detail {
    flex-wrap: wrap;
  }

  .ed-existing-badge {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ed-spin {
    animation: none;
  }
}
`;
