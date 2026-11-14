
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  Check,
  CheckSquare,
  CircleAlert,
  Eye,
  EyeOff,
  FolderInput,
  FolderOpen,
  ImageOff,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import api from "../services/api";

function messageFrom(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(", ");
  }

  return error?.message || "Operation failed.";
}

function protectedHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function runCollectionAction({
  operation,
  designs,
  categoryId,
  token,
  onProgress,
}) {
  const successful = [];
  const failed = [];
  let authExpired = false;

  for (let index = 0; index < designs.length; index++) {
    const design = designs[index];

    try {
      let endpoint;
      let body = null;

      if (operation === "move") {
        endpoint = `/designs/${design.id}/move`;
        body = { category_id: categoryId };
      } else if (
        operation === "hide" ||
        operation === "unhide"
      ) {
        endpoint = `/designs/${design.id}/${operation}`;
      } else {
        throw new Error("Unsupported collection action.");
      }

      const response = await api.post(
        endpoint,
        body,
        {
          headers: protectedHeaders(token),
        }
      );

      if (response.data?.success !== true) {
        throw new Error(
          "Backend did not confirm the operation."
        );
      }

      successful.push({
        design,
        result: response.data,
      });
    } catch (error) {
      failed.push({
        design,
        message: messageFrom(error),
      });

      if (
        error.response?.status === 401 ||
        error.response?.status === 403
      ) {
        authExpired = true;

        for (
          let remaining = index + 1;
          remaining < designs.length;
          remaining++
        ) {
          failed.push({
            design: designs[remaining],
            message:
              "Not attempted because administrator access expired.",
          });
        }

        break;
      }
    }

    onProgress?.({
      completed: index + 1,
      total: designs.length,
    });
  }

  return {
    successful,
    failed,
    authExpired,
  };
}

// =====================================================
// MOVE / HIDE CONFIRMATION
// =====================================================

export function CollectionActionDialog({
  operation,
  designs,
  categories,
  sourceCategoryId,
  token,
  onClose,
  onComplete,
  onSessionExpired,
}) {
  const [destinationId, setDestinationId] =
    useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);

  const processingRef = useRef(false);

  const destinations = useMemo(() => {
    return categories.filter(
      (category) =>
        String(category.id) !==
        String(sourceCategoryId)
    );
  }, [categories, sourceCategoryId]);

  const isMove = operation === "move";

  const close = useCallback(() => {
    if (!processingRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    const onEscape = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener(
        "keydown",
        onEscape
      );
    };
  }, [close]);

  async function submit() {
    if (processingRef.current || !designs.length) {
      return;
    }

    if (isMove && !destinationId) {
      setError("Select a destination category.");
      return;
    }

    processingRef.current = true;
    setProcessing(true);
    setError("");
    setProgress({
      completed: 0,
      total: designs.length,
    });

    try {
      const result = await runCollectionAction({
        operation,
        designs,
        categoryId: destinationId,
        token,
        onProgress: setProgress,
      });

      if (result.authExpired) {
        onSessionExpired?.();
      }

      onComplete(result);

      if (result.failed.length) {
        setError(
          result.failed
            .map(
              (item) =>
                `${item.design.name}: ${item.message}`
            )
            .join("\n")
        );
      } else {
        onClose();
      }
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  return (
    <div className="co-overlay">
      <div
        className="co-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-action-title"
      >
        <button
          type="button"
          className="co-close"
          onClick={close}
          disabled={processing}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="co-dialog-icon">
          {isMove ? (
            <FolderInput size={23} />
          ) : (
            <EyeOff size={23} />
          )}
        </div>

        <span className="co-overline">
          COLLECTION MANAGEMENT
        </span>

        <h2 id="co-action-title">
          {isMove
            ? "Move Dresses"
            : "Hide Selected Dresses"}
        </h2>

        <p className="co-description">
          {isMove
            ? `Move ${designs.length} selected ${
                designs.length === 1
                  ? "dress"
                  : "dresses"
              } to another collection category.`
            : `Hide ${designs.length} selected ${
                designs.length === 1
                  ? "dress"
                  : "dresses"
              } from the normal gallery. You can unhide them at any time.`}
        </p>

        {isMove && (
          <label className="co-field">
            <span>Destination Category</span>

            <select
              value={destinationId}
              disabled={processing}
              onChange={(event) =>
                setDestinationId(event.target.value)
              }
            >
              <option value="">
                Select a category
              </option>

              {destinations.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="co-preview">
          <div className="co-preview-title">
            <strong>Selected Dresses</strong>
            <span>{designs.length}</span>
          </div>

          <div className="co-preview-items">
            {designs.map((design) => (
              <div
                className="co-preview-item"
                key={design.id}
              >
                <div className="co-thumb">
                  {design.image_url ? (
                    <img
                      src={design.image_url}
                      alt=""
                    />
                  ) : (
                    <ImageOff size={18} />
                  )}
                </div>

                <div>
                  <strong>{design.name}</strong>
                  <span>{design.design_code}</span>
                </div>

                <Check size={15} />
              </div>
            ))}
          </div>
        </div>

        <div className="co-info">
          <ShieldCheck size={17} />
          <span>
            Images, dress IDs and AI generation history
            will remain unchanged.
          </span>
        </div>

        {progress && processing && (
          <div className="co-progress">
            <span>
              Processing {progress.completed} of{" "}
              {progress.total}
            </span>
            <progress
              value={progress.completed}
              max={progress.total}
            />
          </div>
        )}

        {error && (
          <div className="co-error" role="alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="co-dialog-actions">
          <button
            type="button"
            className="co-button co-secondary"
            onClick={close}
            disabled={processing}
          >
            Cancel
          </button>

          <button
            type="button"
            className="co-button co-primary"
            disabled={
              processing ||
              (isMove && !destinationId) ||
              (isMove && !destinations.length)
            }
            onClick={submit}
          >
            {processing ? (
              <LoaderCircle
                size={16}
                className="co-spin"
              />
            ) : isMove ? (
              <FolderInput size={16} />
            ) : (
              <EyeOff size={16} />
            )}

            {processing
              ? "Processing..."
              : isMove
              ? "Confirm Move"
              : "Confirm Hide"}
          </button>
        </div>

        <style>{COLLECTION_ACTION_STYLES}</style>
      </div>
    </div>
  );
}

// =====================================================
// ADMINISTRATOR HIDDEN DRESSES
// =====================================================

export function HiddenManagement({
  token,
  onBack,
  onSessionExpired,
  onBusyChange,
}) {
  const [records, setRecords] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmIds, setConfirmIds] = useState([]);

  const requestRef = useRef(0);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const request = ++requestRef.current;

    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        "/designs/management/hidden",
        {
          headers: protectedHeaders(token),
        }
      );

      if (request !== requestRef.current) return;

      if (!Array.isArray(response.data)) {
        throw new Error("Invalid hidden dresses response.");
      }

      setRecords(response.data);
      setSelected((previous) =>
        previous.filter((id) =>
          response.data.some(
            (dress) => String(dress.id) === String(id)
          )
        )
      );
    } catch (err) {
      if (request !== requestRef.current) return;

      if (
        err.response?.status === 401 ||
        err.response?.status === 403
      ) {
        onSessionExpired?.();
      }

      setError(messageFrom(err));
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
      }
    }
  }, [token, onSessionExpired]);

  useEffect(() => {
    load();

    return () => {
      ++requestRef.current;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((dress) =>
      [
        dress.name,
        dress.design_code,
        dress.category_name,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(term)
      )
    );
  }, [records, search]);

  const selectedSet = useMemo(
    () => new Set(selected.map(String)),
    [selected]
  );

  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((dress) =>
      selectedSet.has(String(dress.id))
    );

  function toggle(id) {
    setSelected((previous) =>
      previous.some(
        (value) => String(value) === String(id)
      )
        ? previous.filter(
            (value) => String(value) !== String(id)
          )
        : [...previous, id]
    );
  }

  function toggleAll() {
    const ids = filtered.map((dress) =>
      String(dress.id)
    );

    if (allVisibleSelected) {
      const excluded = new Set(ids);

      setSelected((previous) =>
        previous.filter(
          (id) => !excluded.has(String(id))
        )
      );
    } else {
      setSelected((previous) =>
        Array.from(
          new Set([...previous.map(String), ...ids])
        )
      );
    }
  }

  const confirmedDresses = records.filter(
    (dress) =>
      confirmIds.some(
        (id) => String(id) === String(dress.id)
      )
  );

  async function executeUnhide() {
    if (busyRef.current || !confirmedDresses.length) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setNotice("");

    try {
      const result = await runCollectionAction({
        operation: "unhide",
        designs: confirmedDresses,
        token,
      });

      const successIds = new Set(
        result.successful.map(
          (item) => String(item.design.id)
        )
      );

      setRecords((previous) =>
        previous.filter(
          (dress) =>
            !successIds.has(String(dress.id))
        )
      );

      setSelected((previous) =>
        previous.filter(
          (id) => !successIds.has(String(id))
        )
      );

      if (result.authExpired) {
        onSessionExpired?.();
      }

      if (result.successful.length) {
        setNotice(
          `${result.successful.length} ${
            result.successful.length === 1
              ? "dress is"
              : "dresses are"
          } now visible in the gallery.`
        );
      }

      if (result.failed.length) {
        setError(
          result.failed
            .map(
              (item) =>
                `${item.design.name}: ${item.message}`
            )
            .join("\n")
        );
      }

      setConfirmIds([]);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="co-hidden-page">
      <div className="co-hidden-top">
        <button
          type="button"
          className="co-back"
          disabled={busy}
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          Back to Collection
        </button>

        <span className="co-admin-label">
          <ShieldCheck size={15} />
          Administrator Access
        </span>
      </div>

      <div className="co-hidden-heading">
        <div>
          <span className="co-overline">
            COLLECTION MANAGEMENT
          </span>

          <h1>Hidden Dresses</h1>

          <p>
            Review hidden designs and make them visible
            in their original categories.
          </p>
        </div>

        <button
          type="button"
          className="co-button co-secondary"
          disabled={loading || busy}
          onClick={load}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="co-hidden-summary">
        <div className="co-summary-icon">
          <EyeOff size={21} />
        </div>

        <div>
          <strong>{records.length}</strong>
          <span>Hidden Dresses</span>
        </div>

        <div className="co-summary-separator" />

        <div>
          <strong>{selected.length}</strong>
          <span>Selected</span>
        </div>
      </div>

      {notice && (
        <div className="co-success" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}

      {error && (
        <div className="co-error" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="co-hidden-panel">
        <div className="co-panel-head">
          <div>
            <h2>Manage Hidden Collection</h2>
            <p>
              Unhide dresses individually or in bulk.
            </p>
          </div>

          <div className="co-search">
            <Search size={16} />

            <input
              type="search"
              value={search}
              placeholder="Search hidden dresses"
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="co-select-bar">
            <label>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                disabled={busy}
                onChange={toggleAll}
              />
              Select All Visible
            </label>

            <div>
              <span>{selected.length} selected</span>

              {selected.length > 0 && (
                <button
                  type="button"
                  className="co-button co-primary"
                  disabled={busy}
                  onClick={() =>
                    setConfirmIds([...selected])
                  }
                >
                  <Eye size={15} />
                  Unhide Selected
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="co-empty">
            <LoaderCircle
              size={27}
              className="co-spin"
            />
            Loading hidden dresses...
          </div>
        ) : filtered.length === 0 ? (
          <div className="co-empty">
            <Eye size={29} />
            <strong>
              {search
                ? "No matching hidden dresses"
                : "No hidden dresses"}
            </strong>
            <p>
              Hidden designs will appear here when
              you use Hide in Manage Collection.
            </p>
          </div>
        ) : (
          <div className="co-grid">
            {filtered.map((dress) => (
              <article
                className={
                  "co-card" +
                  (selectedSet.has(String(dress.id))
                    ? " co-card-selected"
                    : "")
                }
                key={dress.id}
              >
                <div className="co-card-image">
                  {dress.image_url ? (
                    <img
                      src={dress.image_url}
                      alt={dress.name}
                      loading="lazy"
                    />
                  ) : (
                    <ImageOff size={24} />
                  )}

                  <label className="co-card-check">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(
                        String(dress.id)
                      )}
                      disabled={busy}
                      onChange={() => toggle(dress.id)}
                      aria-label={`Select ${dress.name}`}
                    />
                  </label>

                  <span className="co-hidden-tag">
                    <EyeOff size={12} />
                    Hidden
                  </span>
                </div>

                <div className="co-card-body">
                  <h3 title={dress.name}>
                    {dress.name}
                  </h3>

                  <small>{dress.design_code}</small>

                  <div className="co-category">
                    <FolderOpen size={15} />
                    <span>{dress.category_name}</span>
                  </div>

                  <button
                    type="button"
                    className="co-unhide-button"
                    disabled={busy}
                    onClick={() =>
                      setConfirmIds([dress.id])
                    }
                  >
                    <Eye size={16} />
                    Unhide Dress
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {confirmIds.length > 0 && (
        <div className="co-overlay">
          <div
            className="co-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="co-unhide-title"
          >
            <div className="co-dialog-icon">
              <Eye size={22} />
            </div>

            <span className="co-overline">
              COLLECTION MANAGEMENT
            </span>

            <h2 id="co-unhide-title">
              Unhide {confirmedDresses.length}{" "}
              {confirmedDresses.length === 1
                ? "Dress"
                : "Dresses"}?
            </h2>

            <p className="co-description">
              These dresses will become visible in their
              original categories again.
            </p>

            <div className="co-preview">
              <div className="co-preview-items">
                {confirmedDresses.map((dress) => (
                  <div
                    className="co-preview-item"
                    key={dress.id}
                  >
                    <div className="co-thumb">
                      <img
                        src={dress.image_url}
                        alt=""
                      />
                    </div>

                    <div>
                      <strong>{dress.name}</strong>
                      <span>{dress.category_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="co-dialog-actions">
              <button
                type="button"
                className="co-button co-secondary"
                disabled={busy}
                onClick={() => setConfirmIds([])}
              >
                Cancel
              </button>

              <button
                type="button"
                className="co-button co-primary"
                disabled={busy}
                onClick={executeUnhide}
              >
                {busy ? (
                  <LoaderCircle
                    size={16}
                    className="co-spin"
                  />
                ) : (
                  <Eye size={16} />
                )}
                Confirm Unhide
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{COLLECTION_ACTION_STYLES}</style>
    </section>
  );
}

// =====================================================
// STYLES
// =====================================================

const COLLECTION_ACTION_STYLES = `
.co-overlay {
  position: fixed;
  inset: 0;
  z-index: 350;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(24,24,27,.6);
  backdrop-filter: blur(5px);
}

.co-dialog {
  box-sizing: border-box;
  position: relative;
  width: min(100%, 460px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 24px;
  border: 1px solid #e4e4e7;
  border-radius: 19px;
  background: #fff;
  box-shadow: 0 25px 70px rgba(0,0,0,.18);
}

.co-close {
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

.co-dialog-icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  margin-bottom: 15px;
  border-radius: 12px;
  background: #fff7ed;
  color: #ea580c;
}

.co-overline {
  display: block;
  color: #ea580c;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1.2px;
}

.co-dialog h2 {
  margin: 7px 0 0;
  color: #18181b;
  font-size: 21px;
  font-weight: 800;
}

.co-description {
  margin: 10px 0 18px;
  color: #71717a;
  font-size: 12px;
  line-height: 1.7;
}

.co-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.co-field span {
  color: #3f3f46;
  font-size: 12px;
  font-weight: 700;
}

.co-field select {
  width: 100%;
  min-height: 43px;
  padding: 10px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fafafa;
  color: #27272a;
  font-family: inherit;
  font-size: 13px;
}

.co-field select:focus {
  outline: 2px solid rgba(249,115,22,.2);
  border-color: #fb923c;
}

.co-preview {
  overflow: hidden;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
}

.co-preview-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  background: #fafafa;
  font-size: 12px;
}

.co-preview-title span {
  color: #ea580c;
  font-weight: 750;
}

.co-preview-items {
  max-height: min(190px, 29dvh);
  overflow-y: auto;
}

.co-preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border-top: 1px solid #f4f4f5;
}

.co-preview-item:first-child {
  border-top: 0;
}

.co-thumb {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 44px;
  overflow: hidden;
  border-radius: 7px;
  background: #f4f4f5;
  color: #a1a1aa;
}

.co-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.co-preview-item > div:nth-child(2) {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.co-preview-item strong,
.co-preview-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.co-preview-item strong {
  color: #27272a;
  font-size: 12px;
}

.co-preview-item span {
  color: #a1a1aa;
  font-size: 10px;
}

.co-preview-item > svg {
  flex-shrink: 0;
  color: #f97316;
}

.co-info {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 11px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 11px;
  line-height: 1.6;
}

.co-info svg {
  color: #16a34a;
  flex-shrink: 0;
}

.co-dialog-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 19px;
}

.co-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 9px 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.co-button:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.co-secondary {
  border-color: #e4e4e7;
  background: #fff;
  color: #52525b;
}

.co-primary {
  background: #f97316;
  color: #fff;
}

.co-primary:hover:not(:disabled) {
  background: #ea580c;
}

.co-progress {
  margin-top: 13px;
  font-size: 11px;
  color: #71717a;
}

.co-progress progress {
  display: block;
  width: 100%;
  margin-top: 7px;
  accent-color: #f97316;
}

.co-error,
.co-success {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 14px;
  padding: 11px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-line;
}

.co-error {
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.co-success {
  border: 1px solid #bbf7d0;
  background: #f0fdf4;
  color: #166534;
  margin-bottom: 17px;
}

.co-spin {
  animation: co-spin .8s linear infinite;
}

@keyframes co-spin {
  to { transform: rotate(360deg); }
}

/* Hidden view */

.co-hidden-page {
  padding-bottom: 45px;
  color: #18181b;
}

.co-hidden-page * {
  box-sizing: border-box;
}

.co-hidden-top,
.co-hidden-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.co-hidden-top {
  margin-bottom: 23px;
}

.co-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #52525b;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.co-admin-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  border: 1px solid #bbf7d0;
  border-radius: 30px;
  background: #f0fdf4;
  color: #15803d;
  font-size: 11px;
  font-weight: 700;
}

.co-hidden-heading {
  align-items: flex-end;
  margin-bottom: 22px;
}

.co-hidden-heading h1 {
  margin: 6px 0 8px;
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: -.7px;
}

.co-hidden-heading p {
  margin: 0;
  color: #71717a;
  font-size: 12px;
  line-height: 1.6;
}

.co-hidden-summary {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 15px 18px;
  margin-bottom: 23px;
  border: 1px solid #eaeaec;
  border-radius: 14px;
  background: #fff;
}

.co-summary-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 12px;
  background: #fff7ed;
  color: #ea580c;
}

.co-hidden-summary > div:not(.co-summary-icon):not(.co-summary-separator) {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.co-hidden-summary strong {
  font-size: 22px;
  line-height: 1.2;
}

.co-hidden-summary span {
  color: #71717a;
  font-size: 11px;
}

.co-summary-separator {
  height: 35px;
  width: 1px;
  background: #e4e4e7;
}

.co-hidden-panel {
  padding: 18px;
  border: 1px solid #eaeaec;
  border-radius: 16px;
  background: #fff;
}

.co-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 17px;
}

.co-panel-head h2 {
  margin: 0 0 5px;
  font-size: 17px;
}

.co-panel-head p {
  margin: 0;
  color: #a1a1aa;
  font-size: 11px;
}

.co-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(100%, 270px);
  padding: 0 11px;
  min-height: 40px;
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  background: #fafafa;
  color: #a1a1aa;
}

.co-search input {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #27272a;
  font: inherit;
  font-size: 12px;
}

.co-select-bar,
.co-select-bar > div {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.co-select-bar {
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 17px;
  border: 1px solid #ffedd5;
  border-radius: 10px;
  background: #fffaf5;
}

.co-select-bar label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #52525b;
  font-size: 12px;
  font-weight: 700;
}

.co-select-bar input,
.co-card-check input {
  width: 16px;
  height: 16px;
  accent-color: #f97316;
}

.co-select-bar > div > span {
  color: #9a3412;
  font-size: 11px;
}

.co-grid {
  display: grid;
  grid-template-columns: repeat(4,minmax(0,1fr));
  gap: 15px;
}

.co-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #eaeaec;
  border-radius: 13px;
  background: #fff;
}

.co-card-selected {
  border-color: #f97316;
  box-shadow: 0 0 0 1px #f97316;
}

.co-card-image {
  position: relative;
  height: clamp(145px,16vw,205px);
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #f4f4f5;
  color: #a1a1aa;
}

.co-card-image > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.co-card-check {
  position: absolute;
  top: 10px;
  left: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fff;
}

.co-hidden-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 9px;
  border-radius: 30px;
  background: rgba(255,255,255,.96);
  color: #71717a;
  font-size: 10px;
  font-weight: 700;
}

.co-card-body {
  padding: 13px;
}

.co-card-body h3 {
  overflow: hidden;
  margin: 0 0 4px;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.co-card-body small {
  display: block;
  overflow: hidden;
  color: #a1a1aa;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.co-category {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 13px 0;
  padding-top: 12px;
  border-top: 1px solid #f4f4f5;
  color: #71717a;
  font-size: 11px;
}

.co-category span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.co-unhide-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 38px;
  border: 1px solid #fed7aa;
  border-radius: 9px;
  background: #fff7ed;
  color: #c2410c;
  font-family: inherit;
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.co-unhide-button:hover:not(:disabled) {
  background: #ffedd5;
}

.co-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 230px;
  color: #a1a1aa;
  font-size: 12px;
  text-align: center;
}

.co-empty strong {
  color: #3f3f46;
  font-size: 15px;
}

.co-empty p {
  margin: 0;
  max-width: 290px;
  line-height: 1.6;
}

@media (max-width:1100px) {
  .co-grid {
    grid-template-columns: repeat(3,minmax(0,1fr));
  }
}

@media (max-width:800px) {
  .co-grid {
    grid-template-columns: repeat(2,minmax(0,1fr));
  }
}

@media (max-width:520px) {
  .co-hidden-panel {
    padding: 12px;
  }

  .co-search {
    width: 100%;
  }

  .co-grid {
    gap: 10px;
  }

  .co-card-image {
    height: 155px;
  }

  .co-dialog {
    padding: 19px;
  }
}

@media (max-width:380px) {
  .co-grid {
    grid-template-columns: 1fr;
  }
}
`;
