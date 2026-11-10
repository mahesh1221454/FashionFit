
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Shirt,
  UploadCloud,
  X,
} from "lucide-react";

import {
  getCategories,
  createCustomDesign,
} from "../services/api";

import Sidebar from "../components/Sidebar";
import "../styles/customDress.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SUPPORTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export default function CustomDressPage() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [dressName, setDressName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSelectFile = (selectedFile) => {
    setError("");

    if (!selectedFile) return;

    if (!SUPPORTED_TYPES.includes(selectedFile.type)) {
      setError("Please select a JPG, PNG or WebP image.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("Image size must be 10 MB or less.");
      return;
    }

    setFile(selectedFile);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    handleSelectFile(event.dataTransfer.files[0]);
  };

  const handleContinue = async () => {
    if (!file || uploading) {
      setError("Please upload your dress image.");
      return;
    }

    try {
      setUploading(true);
      setError("");

      const design = await createCustomDesign({
        file,
        name: dressName.trim() || "My Custom Dress",
      });

      if (!design?.id) {
        throw new Error("No design ID returned by server.");
      }

      navigate(`/design/${design.id}`);
    } catch (err) {
      console.error("Custom dress upload failed:", err);

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : err.message || "Unable to upload the dress."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="portal-layout">
      <Sidebar
        categories={categories}
        selectedCategory={null}
        onSelect={(category) =>
          navigate("/", {
            state: { categoryId: category.id },
          })
        }
      />

      <main className="portal-content custom-page-content">
        <button
          type="button"
          className="custom-back-link"
          onClick={() => navigate("/")}
        >
          <ArrowLeft size={17} />
          Back to collection
        </button>

        <header className="custom-page-header">
          <span className="custom-eyebrow">
            CREATE YOUR OWN STYLE
          </span>

          <h1>Upload Your Custom Dress</h1>

          <p>
            Have a dress design you love? Upload a clear
            photograph of your garment and use it for
            your personalized AI fashion try-on.
          </p>
        </header>

        <div className="custom-page-grid">
          <section className="custom-upload-panel">
            <div className="custom-panel-heading">
              <div className="custom-heading-icon">
                <Shirt size={22} />
              </div>

              <div>
                <h2>Your Dress Design</h2>
                <p>Select your own garment photograph.</p>
              </div>
            </div>

            <div className="custom-form-field">
              <label htmlFor="customDressName">
                Dress Name
              </label>

              <input
                id="customDressName"
                type="text"
                maxLength={100}
                value={dressName}
                onChange={(event) =>
                  setDressName(event.target.value)
                }
                placeholder="e.g. My Wedding Outfit"
              />
            </div>

            <label
              htmlFor="customDressFile"
              className={
                "custom-dropzone" +
                (dragging ? " dragging" : "") +
                (file ? " has-file" : "")
              }
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={handleDrop}
            >
              <input
                id="customDressFile"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  handleSelectFile(event.target.files[0]);
                  event.target.value = "";
                }}
              />

              {preview ? (
                <div className="custom-preview-container">
                  <img
                    src={preview}
                    alt="Custom dress preview"
                  />

                  <span className="custom-change-image">
                    <ImagePlus size={16} />
                    Change Image
                  </span>
                </div>
              ) : (
                <div className="custom-drop-content">
                  <div className="custom-drop-icon">
                    <UploadCloud size={31} />
                  </div>

                  <h3>Upload Your Dress Image</h3>

                  <p>
                    Drag and drop your image here
                    or click to browse.
                  </p>

                  <span className="custom-browse-button">
                    Browse Image
                  </span>

                  <small>
                    JPG, PNG or WebP · Maximum 10 MB
                  </small>
                </div>
              )}
            </label>

            {file && (
              <div className="custom-file-info">
                <CheckCircle2 size={18} />

                <span className="custom-file-name">
                  {file.name}
                </span>

                <button
                  type="button"
                  aria-label="Remove selected image"
                  onClick={() => {
                    setFile(null);
                    setError("");
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {error && (
              <div className="custom-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              className="custom-continue-button"
              disabled={!file || uploading}
              onClick={handleContinue}
            >
              {uploading ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="custom-spinner"
                  />
                  Uploading Dress...
                </>
              ) : (
                <>
                  Continue to Try-On
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </section>

          <aside className="custom-guide-panel">
            <div className="custom-guide-icon">
              <ImagePlus size={26} />
            </div>

            <h2>Get the Best Results</h2>

            <p>
              A high-quality garment reference helps
              the AI reproduce the original design
              more accurately.
            </p>

            <div className="custom-guide-list">
              <div>
                <CheckCircle2 size={18} />
                <span>
                  Use a clear, well-lit garment image.
                </span>
              </div>

              <div>
                <CheckCircle2 size={18} />
                <span>
                  Make sure the complete dress is visible.
                </span>
              </div>

              <div>
                <CheckCircle2 size={18} />
                <span>
                  Avoid blurry or heavily edited photos.
                </span>
              </div>

              <div>
                <CheckCircle2 size={18} />
                <span>
                  Prefer a simple background.
                </span>
              </div>
            </div>

            <div className="custom-next-step">
              <strong>What happens next?</strong>
              <p>
                After saving your dress, you'll upload
                four photographs of yourself. The AI
                will use your dress as the reference
                for the try-on results.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
