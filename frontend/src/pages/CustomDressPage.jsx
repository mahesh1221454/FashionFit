
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderPlus,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import Sidebar from "../components/Sidebar";

import {
  getCategories,
  createBulkCustomDesigns,
  createTemporaryGeneration,
} from "../services/api";

import "../styles/customDress.css";
import "../styles/temporaryTryOn.css";
import "../styles/selectedDressPremium.css";

const MAX_BYTES = Number(
  import.meta.env.VITE_CUSTOM_DRESS_MAX_BYTES
);

const ALLOWED_TYPES = (
  import.meta.env.VITE_CUSTOM_DRESS_ALLOWED_TYPES || ""
)
  .split(",")
  .map((type) => type.trim())
  .filter(Boolean);

const MAX_DRESS_NAME = Number(
  import.meta.env.VITE_CUSTOM_DRESS_NAME_MAX_LENGTH
);

const MAX_CATEGORY_NAME = Number(
  import.meta.env.VITE_CUSTOM_CATEGORY_MAX_LENGTH
);

const MAX_BULK_IMAGES = Number(
  import.meta.env.VITE_CUSTOM_BULK_MAX_IMAGES
);

const PHOTO_VIEWS = [
  { key: "front", label: "Front View" },
  { key: "left", label: "Left View" },
  { key: "right", label: "Right View" },
  { key: "back", label: "Back View" },
];

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || "Validation error")
      .join(", ");
  }

  return error?.message || "Something went wrong.";
}

function getNameFromFile(filename) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function createDressEntry(file) {
  return {
    id: crypto.randomUUID(),
    file,
    name: getNameFromFile(file.name).slice(
      0,
      MAX_DRESS_NAME || undefined
    ),
  };
}

function ImageField({
  label,
  file,
  onChange,
  description,
  disabled = false,
}) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="tryon-image-field">
      <div className="tryon-field-heading">
        <span>{label}</span>

        {file && !disabled && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={() => onChange(null)}
          >
            <X size={15} />
          </button>
        )}
      </div>

      <label className="tryon-image-drop">
        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          hidden
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.files?.[0] || null);
            event.target.value = "";
          }}
        />

        {preview ? (
          <img
            src={preview}
            alt={`${label} preview`}
            className="tryon-preview"
          />
        ) : (
          <div className="tryon-empty-preview">
            <ImagePlus size={24} />
            <span>Choose Image</span>
            {description && <small>{description}</small>}
          </div>
        )}
      </label>

      {file && (
        <span className="tryon-filename">
          {file.name}
        </span>
      )}
    </div>
  );
}


function DressPreview({ dress }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    const objectUrl = URL.createObjectURL(dress.file);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [dress.file]);

  return (
    <div className="ff-dress-preview">
      {url && !failed ? (
        <img
          src={url}
          alt={dress.name || dress.file.name}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="ff-preview-placeholder">
          <ImagePlus size={28} />
          <span>{failed ? "Preview unavailable" : "Loading preview"}</span>
        </div>
      )}
      <span className="ff-preview-ready">
        <CheckCircle2 size={13} />
        Ready
      </span>
    </div>
  );
}

export default function CustomDressPage() {
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState(null);

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] =
    useState(true);

  const [categoryMode, setCategoryMode] =
    useState("existing");

  const [categoryId, setCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] =
    useState("");

  const [dresses, setDresses] = useState([]);
  const [uploadProgress, setUploadProgress] =
    useState(null);

  const [dressFile, setDressFile] = useState(null);

  const [photos, setPhotos] = useState({
    front: null,
    left: null,
    right: null,
    back: null,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  useEffect(() => {
    let active = true;

    getCategories()
      .then((data) => {
        if (!active) return;

        const items = Array.isArray(data) ? data : [];

        setCategories(items);
        setCategoryId(items[0]?.id || "");

        if (!items.length) {
          setCategoryMode("new");
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Unable to load categories from the backend."
          );
        }
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const changeWorkflow = (next) => {
    if (saving) return;

    setWorkflow(next);
    setError("");
    setSuccessMessage("");
    setUploadProgress(null);
  };

  const validateFile = (file) => {
    if (!file) {
      throw new Error("Please select an image.");
    }

    if (
      !Number.isFinite(MAX_BYTES) ||
      MAX_BYTES <= 0 ||
      !ALLOWED_TYPES.length
    ) {
      throw new Error(
        "Upload settings are missing in frontend/.env."
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error(
        `${file.name}: Unsupported image format.`
      );
    }

    if (file.size > MAX_BYTES) {
      throw new Error(
        `${file.name}: Image exceeds ${
          Math.round(MAX_BYTES / 1024 / 1024)
        } MB.`
      );
    }

    return true;
  };

  const addDressFiles = (files) => {
    try {
      if (
        !Number.isInteger(MAX_BULK_IMAGES) ||
        MAX_BULK_IMAGES <= 0
      ) {
        throw new Error(
          "VITE_CUSTOM_BULK_MAX_IMAGES is missing or invalid in frontend/.env."
        );
      }

      const chosen = Array.from(files || []);

      if (!chosen.length) return;

      if (dresses.length + chosen.length > MAX_BULK_IMAGES) {
        throw new Error(
          `You can select a maximum of ${MAX_BULK_IMAGES} images.`
        );
      }

      chosen.forEach(validateFile);

      const entries = chosen.map(createDressEntry);

      setDresses((previous) => [
        ...previous,
        ...entries,
      ]);

      setError("");
      setSuccessMessage("");
      setUploadProgress(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const removeDress = (id) => {
    if (saving) return;

    setDresses((previous) =>
      previous.filter((dress) => dress.id !== id)
    );

    setError("");
    setSuccessMessage("");
  };

  const renameDress = (id, name) => {
    setDresses((previous) =>
      previous.map((dress) =>
        dress.id === id
          ? { ...dress, name }
          : dress
      )
    );
  };

  const updateFile = (setter, file) => {
    try {
      if (file) validateFile(file);
      setter(file);
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const updatePhoto = (view, file) => {
    try {
      if (file) validateFile(file);

      setPhotos((previous) => ({
        ...previous,
        [view]: file,
      }));

      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const savePermanentDresses = async () => {
    if (saving) return;

    try {
      if (!dresses.length) {
        throw new Error(
          "Please select at least one dress image."
        );
      }

      if (
        !Number.isInteger(MAX_BULK_IMAGES) ||
        dresses.length > MAX_BULK_IMAGES
      ) {
        throw new Error(
          "The selected image count exceeds the allowed limit."
        );
      }

      for (const dress of dresses) {
        validateFile(dress.file);

        if (!dress.name.trim()) {
          throw new Error(
            `Enter a name for ${dress.file.name}.`
          );
        }

        if (
          !Number.isInteger(MAX_DRESS_NAME) ||
          dress.name.trim().length > MAX_DRESS_NAME
        ) {
          throw new Error(
            `Invalid dress name length: ${dress.file.name}.`
          );
        }
      }

      if (categoryMode === "existing" && !categoryId) {
        throw new Error(
          "Select an existing category."
        );
      }

      if (
        categoryMode === "new" &&
        !newCategoryName.trim()
      ) {
        throw new Error(
          "Enter a new category name."
        );
      }

      if (
        categoryMode === "new" &&
        newCategoryName.trim().length > MAX_CATEGORY_NAME
      ) {
        throw new Error(
          "New category name is too long."
        );
      }

      setSaving(true);
      setError("");
      setSuccessMessage("");

      setUploadProgress({
        completed: 0,
        total: dresses.length,
        uploaded: 0,
        failed: 0,
        currentName: "",
      });

      const result = await createBulkCustomDesigns({
        dresses,
        categoryMode,
        categoryId,
        newCategoryName,
        onProgress: setUploadProgress,
      });

      // Do not send successful images again on retry.
      setDresses(result.failed.map((dress) => ({
        id: dress.id,
        file: dress.file,
        name: dress.name,
      })));

      if (result.categoryId) {
        // If a new category was created, switch to
        // existing mode for retrying failed images.
        setCategoryMode("existing");
        setCategoryId(result.categoryId);

        try {
          const refreshedCategories =
            await getCategories();

          if (Array.isArray(refreshedCategories)) {
            setCategories(refreshedCategories);
          }
        } catch {
          // Uploads remain saved even if category
          // refresh fails.
        }
      }

      if (result.failed.length) {
        setSuccessMessage(
          `${result.uploaded.length} image(s) uploaded successfully.`
        );

        setError(
          result.failed
            .map(
              (dress) =>
                `${dress.file.name}: ${dress.error}`
            )
            .join("\n")
        );

        return;
      }

      if (!result.categoryId) {
        throw new Error(
          "Backend did not return a category ID."
        );
      }

      navigate("/portal", {
        state: {
          categoryId: result.categoryId,
          designId:
            result.uploaded[0]?.design?.id || null,
        },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const startTemporaryTryOn = async () => {
    if (saving) return;

    try {
      validateFile(dressFile);

      for (const { key, label } of PHOTO_VIEWS) {
        if (!photos[key]) {
          throw new Error(
            `Upload your ${label} photograph.`
          );
        }

        validateFile(photos[key]);
      }

      setSaving(true);
      setError("");

      const result = await createTemporaryGeneration({
        dress: dressFile,
        ...photos,
      });

      if (!result?.job_id) {
        throw new Error(
          "Backend did not return a generation ID."
        );
      }

      navigate(`/generate/${result.job_id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="portal-layout">
      <Sidebar
        categories={categories}
        selectedCategory={null}
        onSelect={(category) =>
          navigate("/portal", {
            state: { categoryId: category.id },
          })
        }
      />

      <main className="portal-content custom-page-content">
        <div className="tryon-page">
          <button
            type="button"
            className="custom-back-link"
            disabled={saving}
            onClick={() =>
              workflow
                ? changeWorkflow(null)
                : navigate("/portal")
            }
          >
            <ArrowLeft size={17} />
            {workflow
              ? "Back to Upload Options"
              : "Back to Collection"}
          </button>

          <header className="tryon-page-header">
            <span className="custom-eyebrow">
              FASHION AI STUDIO
            </span>

            <h1>
              {workflow === "permanent"
                ? "Add Dresses to Portal"
                : workflow === "temporary"
                ? "Temporary AI Try-On"
                : "Upload Custom Dress"}
            </h1>

            <p>
              {workflow === "temporary"
                ? "Try your own dress using AI without saving it to the catalog."
                : workflow === "permanent"
                ? "Upload one or multiple dresses into a new or existing category."
                : "Choose whether you want to save your dress or try it once."}
            </p>
          </header>

          {!workflow && (
            <div className="tryon-choice-grid">
              <button
                type="button"
                className="tryon-choice-card"
                onClick={() =>
                  changeWorkflow("permanent")
                }
              >
                <div className="tryon-choice-icon">
                  <FolderPlus size={28} />
                </div>

                <h2>Add to Portal</h2>

                <p>
                  Save one or multiple dresses under
                  a new or existing category.
                </p>

                <span className="tryon-choice-footer">
                  Permanent Catalog
                  <ArrowRight size={18} />
                </span>
              </button>

              <button
                type="button"
                className="tryon-choice-card"
                onClick={() =>
                  changeWorkflow("temporary")
                }
              >
                <div className="tryon-choice-icon">
                  <Sparkles size={28} />
                </div>

                <h2>Try Once — Unsaved Dress</h2>

                <p>
                  Upload a dress and customer photos,
                  generate try-on results, and keep
                  the dress out of your catalog.
                </p>

                <span className="tryon-choice-footer">
                  Temporary Try-On
                  <ArrowRight size={18} />
                </span>
              </button>
            </div>
          )}

          {workflow === "permanent" && (
            <div className="tryon-form-card">
              <h2>Choose a Category</h2>

              <div className="tryon-mode-grid">
                <button
                  type="button"
                  disabled={
                    saving || categories.length === 0
                  }
                  className={
                    "tryon-mode-option" +
                    (categoryMode === "existing"
                      ? " active"
                      : "")
                  }
                  onClick={() => {
                    setCategoryMode("existing");
                    setError("");
                  }}
                >
                  <CheckCircle2 size={18} />
                  Existing Category
                </button>

                <button
                  type="button"
                  disabled={saving}
                  className={
                    "tryon-mode-option" +
                    (categoryMode === "new"
                      ? " active"
                      : "")
                  }
                  onClick={() => {
                    setCategoryMode("new");
                    setError("");
                  }}
                >
                  <FolderPlus size={18} />
                  Create New Category
                </button>
              </div>

              {categoryMode === "existing" ? (
                <div className="tryon-form-field">
                  <label htmlFor="existing-category">
                    Select Category
                  </label>

                  <select
                    id="existing-category"
                    value={categoryId}
                    disabled={
                      categoriesLoading || saving
                    }
                    onChange={(event) =>
                      setCategoryId(event.target.value)
                    }
                  >
                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="tryon-form-field">
                  <label htmlFor="new-category">
                    New Category Name
                  </label>

                  <input
                    id="new-category"
                    value={newCategoryName}
                    disabled={saving}
                    maxLength={
                      MAX_CATEGORY_NAME || undefined
                    }
                    placeholder="Enter new category name"
                    onChange={(event) =>
                      setNewCategoryName(
                        event.target.value
                      )
                    }
                  />
                </div>
              )}

              <div className="tryon-form-field">
                <label>
                  Dress Images
                </label>

                <label
                  className="tryon-image-drop"
                  style={{
                    display: "flex",
                    padding: 24,
                    cursor: saving
                      ? "not-allowed"
                      : "pointer",
                  }}
                >
                  <input
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    multiple
                    hidden
                    disabled={saving}
                    onChange={(event) => {
                      addDressFiles(
                        event.target.files
                      );
                      event.target.value = "";
                    }}
                  />

                  <div className="tryon-empty-preview">
                    <UploadCloud size={30} />
                    <strong>
                      Choose Multiple Dress Images
                    </strong>
                    <small>
                      Use Ctrl + Click or Shift + Click
                    </small>
                    <small>
                      Maximum {MAX_BULK_IMAGES} images
                    </small>
                  </div>
                </label>
              </div>



{dresses.length > 0 && (
  <section className="ff-selected-section">

    <div className="ff-selected-header">
      <div className="ff-selected-title">
        <strong>Selected Dresses</strong>
        <span className="ff-selected-count">
          {dresses.length} {dresses.length === 1 ? "image" : "images"}
        </span>
      </div>

      <button
        type="button"
        className="ff-clear-button"
        disabled={saving}
        onClick={() => {
          setDresses([]);
          setError("");
          setUploadProgress(null);
        }}
      >
        <RotateCcw size={14} />
        Clear All
      </button>
    </div>

    <div className="ff-table-container">
      <table className="ff-upload-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Image</th>
            <th>Dress Name</th>
            <th>File Size</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>

        <tbody>
          {dresses.map((dress, index) => (
            <tr key={dress.id}>

              <td className="ff-row-number">
                {index + 1}
              </td>

              <td>
                <div className="ff-table-thumbnail">
                  <DressPreview dress={dress} />
                </div>
              </td>

              <td className="ff-name-cell">
                <input
                  aria-label="Dress name"
                  value={dress.name}
                  disabled={saving}
                  maxLength={MAX_DRESS_NAME || undefined}
                  onChange={(event) =>
                    renameDress(dress.id, event.target.value)
                  }
                />

                <small title={dress.file.name}>
                  {dress.file.name}
                </small>
              </td>

              <td className="ff-size-cell">
                {(dress.file.size / 1024 / 1024).toFixed(2)} MB
              </td>

              <td>
                <span className="ff-table-status">
                  <CheckCircle2 size={12} />
                  Ready
                </span>
              </td>

              <td>
                <button
                  type="button"
                  className="ff-table-remove"
                  aria-label="Remove image"
                  title="Remove image"
                  disabled={saving}
                  onClick={() => removeDress(dress.id)}
                >
                  <X size={15} />
                </button>
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {dresses.length < MAX_BULK_IMAGES && (
      <label className="ff-table-add">
        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          multiple
          hidden
          disabled={saving}
          onChange={(event) => {
            addDressFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <ImagePlus size={17} />
        Add More Images
      </label>
    )}

  </section>
)}

<p className="tryon-helper-text">
                Every image will be saved as a separate
                dress in the selected category and can
                be used for future AI try-ons.
              </p>

              {uploadProgress && (
                <div
                  aria-live="polite"
                  style={{ marginTop: 16 }}
                >
                  <strong>
                    Uploaded {uploadProgress.uploaded}
                    {" / "}
                    {uploadProgress.total}
                  </strong>

                  <p>
                    Processed {uploadProgress.completed}
                    {" / "}
                    {uploadProgress.total}
                    {uploadProgress.currentName
                      ? ` — ${uploadProgress.currentName}`
                      : ""}
                  </p>

                  <progress
                    value={uploadProgress.completed}
                    max={uploadProgress.total}
                    style={{
                      width: "100%",
                      accentColor: "#f97316",
                    }}
                  />
                </div>
              )}

              <button
                type="button"
                className="tryon-primary-button"
                disabled={saving || !dresses.length}
                onClick={savePermanentDresses}
              >
                {saving ? (
                  <LoaderCircle
                    size={18}
                    className="custom-spinner"
                  />
                ) : (
                  <FolderPlus size={18} />
                )}

                {saving
                  ? "Uploading Dresses..."
                  : `Save ${dresses.length} Dress${
                      dresses.length === 1
                        ? ""
                        : "es"
                    } to Portal`}
              </button>
            </div>
          )}

          {workflow === "temporary" && (
            <div className="tryon-form-card">
              <div className="tryon-section-title">
                <h2>1. Upload Dress Reference</h2>
                <p>
                  This dress will not be saved to
                  the permanent catalog.
                </p>
              </div>

              <div className="tryon-dress-field">
                <ImageField
                  label="Your Dress"
                  file={dressFile}
                  disabled={saving}
                  onChange={(file) =>
                    updateFile(setDressFile, file)
                  }
                  description="JPG, PNG or WebP"
                />
              </div>

              <div className="tryon-section-title">
                <h2>2. Upload Customer Photographs</h2>
                <p>
                  Provide four views of the person
                  who will try on the dress.
                </p>
              </div>

              <div className="tryon-photo-grid">
                {PHOTO_VIEWS.map(({ key, label }) => (
                  <ImageField
                    key={key}
                    label={label}
                    file={photos[key]}
                    disabled={saving}
                    onChange={(file) =>
                      updatePhoto(key, file)
                    }
                  />
                ))}
              </div>

              <div className="tryon-temporary-notice">
                <Clock3 size={20} />

                <div>
                  <strong>Temporary Session</strong>
                  <p>
                    Your dress will not be published
                    in the portal. Download results
                    before the session expires.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="tryon-primary-button"
                disabled={saving}
                onClick={startTemporaryTryOn}
              >
                {saving ? (
                  <LoaderCircle
                    size={18}
                    className="custom-spinner"
                  />
                ) : (
                  <Sparkles size={18} />
                )}

                {saving
                  ? "Starting Generation..."
                  : "Generate AI Try-On"}

                {!saving && (
                  <ArrowRight size={18} />
                )}
              </button>

              <button
                type="button"
                className="tryon-reset-button"
                disabled={saving}
                onClick={() => {
                  setDressFile(null);
                  setPhotos({
                    front: null,
                    left: null,
                    right: null,
                    back: null,
                  });
                  setError("");
                }}
              >
                <RotateCcw size={15} />
                Clear Selected Images
              </button>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="tryon-helper-text"
              style={{ marginTop: 16 }}
            >
              <CheckCircle2
                size={17}
                style={{
                  display: "inline",
                  marginRight: 8,
                }}
              />
              {successMessage}
            </div>
          )}

          {error && (
            <div
              className="custom-error"
              role="alert"
              style={{ whiteSpace: "pre-line" }}
            >
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
